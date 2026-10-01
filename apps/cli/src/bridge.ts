// `tvlm bridge` — the §12 local bridge: a WebSocket server on 127.0.0.1:15555 that owns the real Node
// transport so the web app (packages/adb/src/bridge.ts) can reach Wi-Fi/USB boxes. JSON-RPC 2.0 over text
// frames; APK bytes over binary frames (4-byte LE request id + chunk, empty chunk = end).
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { NoDevicesError, UnauthorizedError, type AdbDevice, type AdbTransport } from '@tvlm/adb';
import { BRIDGE_PORT, BRIDGE_PROTOCOL_VERSION, BridgeErrorCode, decodeBinaryFrame, type BridgeEvent, type BridgeRequest, type BridgeResponse } from '@tvlm/adb/bridge';

export interface BridgeServerOptions {
  port?: number;
  host?: string;
  transport: AdbTransport;
  brand?: string;
  version: string;
  log?: (m: string) => void;
  /** Extra origins to accept (host names). */
  origins?: string[];
}

const DEFAULT_ORIGINS = ['localhost', '127.0.0.1', 'hoteltvapp.com', 'www.hoteltvapp.com', 'pluitv.com', 'www.pluitv.com'];

export function originAllowed(origin: string | undefined, extra: string[] = []): boolean {
  if (!origin || origin === 'null' || origin.startsWith('file://') || origin.startsWith('tvlm://')) return true; // Electron / file
  try {
    const host = new URL(origin).hostname;
    return [...DEFAULT_ORIGINS, ...extra].includes(host);
  } catch {
    return false;
  }
}

interface InstallJob {
  controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  queue: Uint8Array[];
  wake: (() => void) | undefined;
  ended: boolean;
}

export async function runBridge(o: BridgeServerOptions): Promise<{ port: number; close: () => Promise<void> }> {
  const port = o.port ?? BRIDGE_PORT;
  const host = o.host ?? '127.0.0.1';
  const log = o.log ?? (() => {});
  const wss = new WebSocketServer({ host, port });
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', () => resolve());
    wss.once('error', reject);
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    if (!originAllowed(req.headers.origin, o.origins)) {
      log(`refused origin ${req.headers.origin}`);
      ws.close(1008, 'origin not allowed');
      return;
    }
    log(`client connected (${req.headers.origin ?? 'no origin'})`);
    const devices = new Map<number, AdbDevice>();
    const aborts = new Map<number, AbortController>();
    const installs = new Map<number, InstallJob>();
    let nextHandle = 1;

    const send = (m: BridgeResponse | BridgeEvent) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
    };
    const reply = (id: number, result: unknown) => send({ jsonrpc: '2.0', id, result });
    const replyError = (id: number, e: unknown) => {
      if (e instanceof UnauthorizedError) send({ jsonrpc: '2.0', id, error: { code: BridgeErrorCode.unauthorized, message: e.message, data: { attempts: e.attempts } } });
      else if (e instanceof NoDevicesError) send({ jsonrpc: '2.0', id, error: { code: BridgeErrorCode.noDevices, message: e.message, data: { hint: e.hint } } });
      else send({ jsonrpc: '2.0', id, error: { code: BridgeErrorCode.internal, message: e instanceof Error ? e.message : String(e) } });
    };
    const device = (p: { handle?: number }): AdbDevice => {
      const d = devices.get(p.handle ?? -1);
      if (!d) throw Object.assign(new Error('unknown device handle'), { code: BridgeErrorCode.notFound });
      return d;
    };

    send({ jsonrpc: '2.0', method: 'hello', params: { version: BRIDGE_PROTOCOL_VERSION, tool: o.version, brand: o.brand } });

    const handle = async (r: BridgeRequest) => {
      const p = (r.params ?? {}) as Record<string, unknown>;
      switch (r.method) {
        case 'hello':
          return reply(r.id, { version: BRIDGE_PROTOCOL_VERSION, tool: o.version, brand: o.brand });
        case 'abort': {
          const id = Number(p['id']);
          aborts.get(id)?.abort(new Error('aborted by client'));
          const job = installs.get(id);
          if (job) {
            job.ended = true;
            job.controller?.error(new Error('aborted by client'));
            job.wake?.();
            installs.delete(id);
          }
          return reply(r.id, true);
        }
        case 'discover': {
          const ac = new AbortController();
          aborts.set(r.id, ac);
          try {
            const list = await o.transport.discover({ paths: p['paths'] as never, subnet: p['subnet'] as string | undefined, signal: ac.signal, onFound: (d) => send({ jsonrpc: '2.0', method: 'found', params: { id: r.id, device: d } }) });
            reply(r.id, list);
          } finally {
            aborts.delete(r.id);
          }
          return;
        }
        case 'connect': {
          const ac = new AbortController();
          aborts.set(r.id, ac);
          try {
            const d = await o.transport.connect(p['target'] as never, { waitForAuth: Boolean(p['waitForAuth']), signal: ac.signal, onUnauthorized: (n) => send({ jsonrpc: '2.0', method: 'unauthorized', params: { id: r.id, attempt: n } }) });
            const h = nextHandle++;
            devices.set(h, d);
            reply(r.id, { handle: h, info: d.info, serial: d.serial });
          } finally {
            aborts.delete(r.id);
          }
          return;
        }
        case 'pair':
          if (!o.transport.pair) throw new Error('this transport cannot pair');
          await o.transport.pair(String(p['hostPort']), String(p['code']));
          return reply(r.id, true);
        case 'shell':
          return reply(r.id, await device(p).shell(String(p['cmd'])));
        case 'authState':
          return reply(r.id, await device(p).authState());
        case 'screencap':
          return reply(r.id, Buffer.from(await device(p).screencap()).toString('base64'));
        case 'reboot':
          await device(p).reboot();
          return reply(r.id, true);
        case 'close': {
          const d = device(p);
          devices.delete(Number(p['handle']));
          await d.close();
          return reply(r.id, true);
        }
        case 'install': {
          const d = device(p);
          const job: InstallJob = { controller: undefined, queue: [], wake: undefined, ended: false };
          installs.set(r.id, job);
          const stream = new ReadableStream<Uint8Array>({
            start(c) {
              job.controller = c;
            },
            async pull(c) {
              for (;;) {
                const chunk = job.queue.shift();
                if (chunk) {
                  if (chunk.byteLength === 0) {
                    c.close();
                    return;
                  }
                  c.enqueue(chunk);
                  return;
                }
                if (job.ended) {
                  c.close();
                  return;
                }
                await new Promise<void>((resolve) => (job.wake = resolve));
                job.wake = undefined;
              }
            },
          });
          try {
            const out = await d.install(stream, { size: p['size'] as number | undefined, name: p['name'] as string | undefined });
            reply(r.id, out);
          } finally {
            installs.delete(r.id);
          }
          return;
        }
        default:
          throw new Error(`unknown method ${String(r.method)}`);
      }
    };

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        const { id, chunk } = decodeBinaryFrame(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
        const job = installs.get(id);
        if (!job) return;
        job.queue.push(new Uint8Array(chunk)); // copy: ws reuses buffers
        if (chunk.byteLength === 0) job.ended = true;
        job.wake?.();
        return;
      }
      let r: BridgeRequest;
      try {
        r = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (typeof r.id !== 'number' || typeof r.method !== 'string') return;
      handle(r).catch((e) => replyError(r.id, e));
    });

    ws.on('close', () => {
      for (const ac of aborts.values()) ac.abort(new Error('client gone'));
      for (const d of devices.values()) d.close().catch(() => {});
      devices.clear();
      log('client disconnected');
    });
  });

  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const c of wss.clients) c.terminate();
        wss.close(() => resolve());
      }),
  };
}
