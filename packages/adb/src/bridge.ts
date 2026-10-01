// The §12 bridge, browser side: a page on hoteltvapp.com/pluitv.com cannot open TCP sockets, so `tvlm bridge`
// runs a WebSocket server on ws://127.0.0.1:15555 (apps/cli/src/bridge.ts) that owns the real Node transport;
// this file is the `AdbTransport` the web app uses to talk to it. JSON-RPC 2.0 over text frames, APK bytes
// over binary frames. No `node:` imports here; the server imports only the types from this file.
import type { AdbDevice, AdbTransport, AuthState, ConnectOptions, DebugPath, DeviceInfo, DiscoverOptions } from './index.js';
import { NoDevicesError, UnauthorizedError } from './index.js';

export const BRIDGE_PORT = 15555;
export const BRIDGE_URL = `ws://127.0.0.1:${BRIDGE_PORT}`;
export const BRIDGE_PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------- wire protocol (shared with the server)

export interface BridgeRequest {
  jsonrpc: '2.0';
  id: number;
  method: BridgeMethod;
  params?: unknown;
}
export interface BridgeResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
/** Server → client notifications (no id). */
export type BridgeEvent =
  | { jsonrpc: '2.0'; method: 'found'; params: { id: number; device: DeviceInfo } }
  | { jsonrpc: '2.0'; method: 'unauthorized'; params: { id: number; attempt: number } }
  | { jsonrpc: '2.0'; method: 'hello'; params: { version: number; tool: string; brand?: string } };

export type BridgeMethod = 'hello' | 'discover' | 'abort' | 'connect' | 'pair' | 'shell' | 'install' | 'screencap' | 'reboot' | 'authState' | 'close';

export interface BridgeConnectResult {
  handle: number;
  info: DeviceInfo;
  serial: string;
}

/**
 * Binary frame = 4-byte little-endian request id + payload bytes. An empty payload (4 bytes only) ends the
 * stream. The `install` response (with the same id) arrives after the last binary frame.
 */
export function encodeBinaryFrame(id: number, chunk: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + chunk.byteLength);
  new DataView(out.buffer).setUint32(0, id, true);
  out.set(chunk, 4);
  return out;
}
export function decodeBinaryFrame(frame: Uint8Array): { id: number; chunk: Uint8Array } {
  if (frame.byteLength < 4) throw new Error('bridge: short binary frame');
  const id = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(0, true);
  return { id, chunk: frame.subarray(4) };
}

export const BridgeErrorCode = { unauthorized: 4001, noDevices: 4002, notFound: 4004, internal: 5000 } as const;

// ---------------------------------------------------------------- client

export class BridgeUnavailableError extends Error {
  constructor(readonly url: string) {
    super(`no bridge at ${url} — run \`tvlm bridge\` on this computer`);
    this.name = 'BridgeUnavailableError';
  }
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  onFound?: (d: DeviceInfo) => void;
  onUnauthorized?: (attempt: number) => void;
}

export interface BridgeOptions {
  url?: string;
  /** Test seam: a WebSocket constructor. */
  WebSocketImpl?: typeof WebSocket;
}

export class BridgeTransport implements AdbTransport {
  readonly kind = 'bridge' as const;
  readonly supports: DebugPath[] = ['tcp', 'wireless', 'usb'];
  readonly url: string;
  private readonly WS: typeof WebSocket;
  private ws: WebSocket | undefined;
  private opening: Promise<WebSocket> | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  /** From the server's `hello`. */
  hello: { version: number; tool: string; brand?: string } | undefined;

  constructor(o: BridgeOptions = {}) {
    this.url = o.url ?? BRIDGE_URL;
    this.WS = o.WebSocketImpl ?? (typeof WebSocket !== 'undefined' ? WebSocket : (undefined as unknown as typeof WebSocket));
    if (!this.WS) throw new Error('no WebSocket in this environment');
  }

  /** Cheap "is the bridge running?" — resolves false instead of throwing. */
  async available(): Promise<boolean> {
    try {
      await this.socket();
      return true;
    } catch {
      return false;
    }
  }

  private socket(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === this.ws.OPEN) return Promise.resolve(this.ws);
    this.opening ??= new Promise<WebSocket>((resolve, reject) => {
      const ws = new this.WS(this.url);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        this.ws = ws;
        this.opening = undefined;
        resolve(ws);
      };
      ws.onerror = () => {
        this.opening = undefined;
        reject(new BridgeUnavailableError(this.url));
      };
      ws.onclose = () => {
        this.ws = undefined;
        this.opening = undefined;
        for (const p of this.pending.values()) p.reject(new BridgeUnavailableError(this.url));
        this.pending.clear();
      };
      ws.onmessage = (ev: MessageEvent) => this.onMessage(ev.data);
    });
    return this.opening;
  }

  private onMessage(data: unknown): void {
    if (typeof data !== 'string') return; // the client never receives binary frames
    let msg: BridgeResponse | BridgeEvent;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if ('method' in msg) {
      if (msg.method === 'hello') this.hello = msg.params;
      else if (msg.method === 'found') this.pending.get(msg.params.id)?.onFound?.(msg.params.device);
      else if (msg.method === 'unauthorized') this.pending.get(msg.params.id)?.onUnauthorized?.(msg.params.attempt);
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (msg.error) {
      const e = msg.error;
      if (e.code === BridgeErrorCode.unauthorized) p.reject(new UnauthorizedError(Number((e.data as { attempts?: number })?.attempts ?? 0)));
      else if (e.code === BridgeErrorCode.noDevices) p.reject(new NoDevicesError(((e.data as { hint?: string })?.hint as NoDevicesError['hint']) ?? 'none'));
      else p.reject(Object.assign(new Error(e.message), { code: e.code, data: e.data }));
    } else p.resolve(msg.result);
  }

  private async call<T>(method: BridgeMethod, params?: unknown, hooks: Pick<Pending, 'onFound' | 'onUnauthorized'> = {}, signal?: AbortSignal): Promise<T> {
    const ws = await this.socket();
    const id = this.nextId++;
    const req: BridgeRequest = { jsonrpc: '2.0', id, method, params };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, ...hooks });
      signal?.addEventListener('abort', () => ws.send(JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method: 'abort', params: { id } } satisfies BridgeRequest)), { once: true });
      ws.send(JSON.stringify(req));
    });
  }

  async discover(opts: DiscoverOptions = {}): Promise<DeviceInfo[]> {
    return this.call<DeviceInfo[]>('discover', { paths: opts.paths, subnet: opts.subnet }, { onFound: opts.onFound }, opts.signal);
  }

  async connect(target: DeviceInfo | string, opts: ConnectOptions = {}): Promise<AdbDevice> {
    const r = await this.call<BridgeConnectResult>('connect', { target, waitForAuth: opts.waitForAuth ?? false }, { onUnauthorized: opts.onUnauthorized }, opts.signal);
    return new BridgeDevice(this, r);
  }

  async pair(hostPort: string, code: string): Promise<void> {
    await this.call<void>('pair', { hostPort, code });
  }

  /** @internal */
  async rpc<T>(method: BridgeMethod, params: unknown): Promise<T> {
    return this.call<T>(method, params);
  }

  /** @internal — request + binary frames + response. */
  async installViaFrames(handle: number, apk: ReadableStream<Uint8Array>, opts: { size?: number; name?: string }): Promise<string> {
    const ws = await this.socket();
    const id = this.nextId++;
    const done = new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    });
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method: 'install', params: { handle, size: opts.size, name: opts.name } } satisfies BridgeRequest));
    const reader = apk.getReader();
    try {
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        ws.send(encodeBinaryFrame(id, value));
        // Back-pressure: the browser buffers; keep it under ~4 MB.
        while (ws.bufferedAmount > 4 * 1024 * 1024) await new Promise((r) => setTimeout(r, 20));
      }
      ws.send(encodeBinaryFrame(id, new Uint8Array(0)));
    } catch (e) {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method: 'abort', params: { id } } satisfies BridgeRequest));
      throw e;
    }
    return done;
  }

  close(): void {
    this.ws?.close();
    this.ws = undefined;
  }
}

class BridgeDevice implements AdbDevice {
  readonly info: DeviceInfo;
  readonly serial: string;
  private readonly handle: number;
  constructor(
    private readonly t: BridgeTransport,
    r: BridgeConnectResult,
  ) {
    this.info = r.info;
    this.serial = r.serial;
    this.handle = r.handle;
  }
  authState(): Promise<AuthState> {
    return this.t.rpc<AuthState>('authState', { handle: this.handle });
  }
  shell(cmd: string): Promise<string> {
    return this.t.rpc<string>('shell', { handle: this.handle, cmd });
  }
  install(apk: ReadableStream<Uint8Array>, opts: { size?: number; name?: string } = {}): Promise<string> {
    return this.t.installViaFrames(this.handle, apk, opts);
  }
  async screencap(): Promise<Uint8Array> {
    const b64 = await this.t.rpc<string>('screencap', { handle: this.handle });
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  reboot(): Promise<void> {
    return this.t.rpc<void>('reboot', { handle: this.handle });
  }
  close(): Promise<void> {
    return this.t.rpc<void>('close', { handle: this.handle });
  }
}
