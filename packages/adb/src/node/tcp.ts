// NodeTcpTransport: adb daemon on host:port (`adb tcpip 5555`) and Android 11+ wireless debugging (TLS).
// A raw net.Socket is wrapped into Web Streams, framed with Tango's AdbPacket struct, then either handed to
// `AdbDaemonTransport.authenticate` (plain) or, for TLS, we do the CNXN → STLS → TLS handshake → CNXN dance
// ourselves and construct the transport directly (over TLS the daemon sends CNXN on its own and must NOT get
// a second one — that would take the transport offline again).
import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { connect as netConnect, type Socket } from 'node:net';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { promisify } from 'node:util';
import {
  Adb,
  AdbBanner,
  AdbCommand,
  AdbDaemonTransport,
  AdbFeature,
  AdbPacket,
  AdbPacketSerializeStream,
  ADB_DAEMON_DEFAULT_FEATURES,
  calculateChecksum,
  decodeUtf8,
  encodeUtf8,
  type AdbDaemonConnection,
  type AdbPacketData,
  type AdbPacketInit,
} from '@yume-chan/adb';
import { Consumable, MaybeConsumable, PushReadableStream, StructDeserializeStream, pipeFrom, tryClose } from '@yume-chan/stream-extra';
import type { AdbDevice, AdbTransport, ConnectOptions, DebugPath, DeviceInfo } from '../index.js';
import { UnauthorizedError } from '../index.js';
import { TangoDevice, authenticateWithAllow } from '../tango-device.js';
import { NodeCredentialStore, TVLM_DIR } from './credentials.js';

/** `STLS` — not in Tango's AdbCommand table. */
export const ADB_COMMAND_STLS = 0x534c5453;
const ADB_STLS_VERSION = 0x01000000;
const ADB_VERSION = 0x01000001;
const ADB_MAX_PAYLOAD = 1024 * 1024;

/** Features we advertise. Delayed ack stays off — our socket writer acks synchronously. */
const OUR_FEATURES: readonly AdbFeature[] = ADB_DAEMON_DEFAULT_FEATURES.filter((f) => f !== AdbFeature.DelayedAck);

function bannerFor(features: readonly string[] = OUR_FEATURES): Uint8Array {
  return encodeUtf8(`host::features=${features.join(',')}`);
}

export function parseHostPort(text: string, defaultPort = 5555): { host: string; port: number } {
  const m = /^\[?([^\]]+?)\]?(?::(\d+))?$/.exec(text.trim());
  if (!m) throw new Error(`bad address: ${text}`);
  return { host: m[1]!, port: m[2] ? parseInt(m[2], 10) : defaultPort };
}

// ---------------------------------------------------------------- socket ⇄ Tango connection

export interface SocketConnection extends AdbDaemonConnection {
  socket: Socket;
  closed: Promise<void>;
  destroy(): void;
}

/** Wrap a connected socket (plain or TLS) into Tango's packet-level duplex. */
export function socketToConnection(socket: Socket): SocketConnection {
  socket.setNoDelay(true);
  const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
  const bytes = new PushReadableStream<Uint8Array>((controller) => {
    controller.abortSignal.addEventListener('abort', () => socket.destroy());
    socket.on('data', (data: Buffer) => {
      if (controller.abortSignal.aborted) return;
      socket.pause();
      void controller
        .enqueue(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
        .then(() => socket.resume())
        .catch(() => socket.destroy());
    });
    socket.once('end', () => tryClose(controller));
    socket.once('close', () => tryClose(controller));
    socket.once('error', (e) => {
      try {
        controller.error(e);
      } catch {
        /* already closed */
      }
    });
  });
  const readable = bytes.pipeThrough(new StructDeserializeStream(AdbPacket)) as unknown as AdbDaemonConnection['readable'];
  const rawWritable = new MaybeConsumable.WritableStream<Uint8Array>({
    write: (chunk) =>
      new Promise<void>((resolve, reject) => {
        if (socket.destroyed) return reject(new Error('socket closed'));
        socket.write(chunk, (e) => (e ? reject(e) : resolve()));
      }),
    close: () => {
      socket.end();
    },
    abort: () => {
      socket.destroy();
    },
  });
  const writable = pipeFrom(rawWritable, new AdbPacketSerializeStream()) as unknown as AdbDaemonConnection['writable'];
  return {
    socket,
    readable,
    writable,
    closed,
    destroy: () => socket.destroy(),
  };
}

function openSocket(host: string, port: number, timeoutMs: number, signal?: AbortSignal): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = netConnect({ host, port });
    const fail = (e: Error) => {
      s.destroy();
      reject(e);
    };
    s.setTimeout(timeoutMs, () => fail(new Error(`connect timeout ${host}:${port}`)));
    s.once('error', fail);
    s.once('connect', () => {
      s.setTimeout(0);
      s.removeListener('error', fail);
      resolve(s);
    });
    signal?.addEventListener('abort', () => fail(new Error('aborted')), { once: true });
  });
}

async function sendPacket(conn: AdbDaemonConnection, init: AdbPacketData): Promise<void> {
  const writer = conn.writable.getWriter();
  try {
    const full: AdbPacketInit = { ...init, checksum: calculateChecksum(init.payload), magic: init.command ^ 0xffffffff };
    await Consumable.WritableStream.write(writer, full);
  } finally {
    writer.releaseLock();
  }
}

async function readPacket(conn: AdbDaemonConnection, timeoutMs: number): Promise<AdbPacketData> {
  const reader = conn.readable.getReader();
  let timer: NodeJS.Timeout | undefined;
  try {
    const r = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('no ADB reply (is this really an adb port?)')), timeoutMs);
      }),
    ]);
    if (r.done) throw new Error('connection closed before the ADB handshake');
    return r.value;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export type ProbeResult = { kind: 'cnxn'; banner: AdbBanner; version: number; maxPayloadSize: number } | { kind: 'auth' } | { kind: 'stls' };

/**
 * Send CNXN and look at the first reply: CNXN (no auth needed), AUTH (RSA / Allow) or STLS (Android 11+
 * wireless debugging). CNXN does not trigger the Allow dialog, so it is safe for discovery.
 */
export async function probeAdb(host: string, port: number, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<ProbeResult | null> {
  const timeoutMs = opts.timeoutMs ?? 1500;
  let socket: Socket;
  try {
    socket = await openSocket(host, port, timeoutMs, opts.signal);
  } catch {
    return null;
  }
  const conn = socketToConnection(socket);
  try {
    await sendPacket(conn, { command: AdbCommand.Connect, arg0: ADB_VERSION, arg1: ADB_MAX_PAYLOAD, payload: bannerFor() });
    const p = await readPacket(conn, timeoutMs);
    if (p.command === AdbCommand.Connect) return { kind: 'cnxn', banner: AdbBanner.parse(decodeUtf8(p.payload)), version: Math.min(ADB_VERSION, p.arg0), maxPayloadSize: Math.min(ADB_MAX_PAYLOAD, p.arg1) };
    if (p.command === AdbCommand.Auth) return { kind: 'auth' };
    if (p.command === ADB_COMMAND_STLS) return { kind: 'stls' };
    return null;
  } catch {
    return null;
  } finally {
    conn.destroy();
  }
}

// ---------------------------------------------------------------- pairing (Android 11+): Google's adb

const ADB_EXE = process.platform === 'win32' ? 'adb.exe' : 'adb';

async function exists(p: string): Promise<boolean> {
  try {
    await access(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** `~/.tvlm/platform-tools/adb`, then `$ANDROID_HOME`/`$ANDROID_SDK_ROOT`, the default SDK spots, then PATH. */
export async function findPlatformToolsAdb(): Promise<string | null> {
  const candidates = [join(TVLM_DIR, 'platform-tools', ADB_EXE)];
  for (const root of [process.env['ANDROID_HOME'], process.env['ANDROID_SDK_ROOT']]) if (root) candidates.push(join(root, 'platform-tools', ADB_EXE));
  if (process.platform === 'win32' && process.env['LOCALAPPDATA']) candidates.push(join(process.env['LOCALAPPDATA'], 'Android', 'Sdk', 'platform-tools', ADB_EXE));
  if (process.platform === 'darwin') candidates.push(join(homedir(), 'Library', 'Android', 'sdk', 'platform-tools', ADB_EXE));
  if (process.platform === 'linux') candidates.push(join(homedir(), 'Android', 'Sdk', 'platform-tools', ADB_EXE));
  for (const dir of (process.env['PATH'] ?? '').split(delimiter)) if (dir) candidates.push(join(dir, ADB_EXE));
  for (const c of candidates) if (await exists(c)) return c;
  return null;
}

export class PairingUnavailableError extends Error {
  constructor() {
    super(
      "Wireless-debugging pairing (SPAKE2) is done by Google's adb: put platform-tools in ~/.tvlm/platform-tools or on PATH, or pair once with `adb pair host:port code`. Boxes with plain ADB over TCP (Settings › Developer options › Network debugging / `adb tcpip 5555`) need no pairing.",
    );
    this.name = 'PairingUnavailableError';
  }
}

// ---------------------------------------------------------------- the transport

export interface NodeTcpOptions {
  credentials?: NodeCredentialStore;
  connectTimeoutMs?: number;
  /** Seconds between "still waiting for Allow" ticks. */
  tickMs?: number;
}

export class NodeTcpTransport implements AdbTransport {
  readonly kind = 'node' as const;
  readonly supports: DebugPath[] = ['tcp', 'wireless'];
  readonly credentials: NodeCredentialStore;
  private readonly connectTimeoutMs: number;
  private readonly tickMs: number | undefined;

  constructor(o: NodeTcpOptions = {}) {
    this.credentials = o.credentials ?? new NodeCredentialStore();
    this.connectTimeoutMs = o.connectTimeoutMs ?? 4000;
    this.tickMs = o.tickMs;
  }

  /** This transport does not enumerate by itself — `discoverNetwork` (mDNS + scan) does; see node/index.ts. */
  async discover(): Promise<DeviceInfo[]> {
    return [];
  }

  async connect(target: DeviceInfo | string, opts: ConnectOptions = {}): Promise<AdbDevice> {
    const info: DeviceInfo = typeof target === 'string' ? { id: target, name: target, addr: target, method: 'tcp' } : target;
    const { host, port } = parseHostPort(info.addr || info.id);
    await this.credentials.ensure();

    // Which kind of port is this? mDNS told us for `tls`; otherwise one cheap CNXN probe decides.
    let tls = info.tls === true;
    if (!tls) {
      const probe = await probeAdb(host, port, { timeoutMs: this.connectTimeoutMs, signal: opts.signal });
      if (!probe) throw new Error(`${host}:${port}: no ADB daemon answered`);
      tls = probe.kind === 'stls';
    }
    const adb = tls ? await this.connectTls(host, port, info, opts) : await this.connectPlain(host, port, info, opts);
    const resolved: DeviceInfo = { ...info, name: info.name === info.addr || info.name === info.id ? adb.banner.model ?? adb.banner.product ?? info.name : info.name, method: tls ? 'wireless' : 'tcp', ...(tls ? { tls: true } : {}) };
    return new TangoDevice(resolved, adb);
  }

  private async connectPlain(host: string, port: number, info: DeviceInfo, opts: ConnectOptions): Promise<Adb> {
    let current: SocketConnection | undefined;
    const start = async () => {
      current = socketToConnection(await openSocket(host, port, this.connectTimeoutMs, opts.signal));
      const transport = await AdbDaemonTransport.authenticate({ serial: info.id, connection: current, credentialStore: this.credentials, features: OUR_FEATURES, initialDelayedAckBytes: 0 });
      return new Adb(transport);
    };
    return authenticateWithAllow(start, { ...opts, tickMs: this.tickMs }, () => current?.destroy());
  }

  /**
   * CNXN → STLS → (our STLS) → TLS 1.3 with a client cert over the paired/allowed key → the daemon sends
   * CNXN itself. A key adbd does not know fails the handshake: that is "unauthorized" here (pair first).
   */
  private async connectTls(host: string, port: number, info: DeviceInfo, opts: ConnectOptions): Promise<Adb> {
    const identities = await this.credentials.tlsIdentities();
    let lastError: unknown;
    let attempt = 0;
    for (const id of identities) {
      if (opts.signal?.aborted) throw new Error('aborted');
      const raw = await openSocket(host, port, this.connectTimeoutMs, opts.signal);
      try {
        const plain = socketToConnection(raw);
        await sendPacket(plain, { command: AdbCommand.Connect, arg0: ADB_VERSION, arg1: ADB_MAX_PAYLOAD, payload: bannerFor() });
        const first = await readPacket(plain, this.connectTimeoutMs);
        if (first.command !== ADB_COMMAND_STLS) {
          plain.destroy();
          throw new Error(`${host}:${port} did not offer TLS (got 0x${first.command.toString(16)}) — connect it as a plain tcp target`);
        }
        await sendPacket(plain, { command: ADB_COMMAND_STLS, arg0: ADB_STLS_VERSION, arg1: 0, payload: new Uint8Array(0) });
        // Detach our reader from the raw socket before TLS takes it over; nothing else arrives in plaintext.
        raw.removeAllListeners('data');
        raw.pause();
        const secure = await new Promise<TLSSocket>((resolve, reject) => {
          const t = tlsConnect({ socket: raw, key: id.key, cert: id.cert, rejectUnauthorized: false, minVersion: 'TLSv1.3' }, () => resolve(t));
          t.once('error', reject);
        });
        const conn = socketToConnection(secure as unknown as Socket);
        const cnxn = await readPacket(conn, this.connectTimeoutMs);
        if (cnxn.command !== AdbCommand.Connect) throw new Error(`unexpected packet after TLS: 0x${cnxn.command.toString(16)}`);
        const transport = new AdbDaemonTransport({
          serial: info.id,
          connection: conn,
          version: Math.min(ADB_VERSION, cnxn.arg0),
          maxPayloadSize: Math.min(ADB_MAX_PAYLOAD, cnxn.arg1),
          banner: decodeUtf8(cnxn.payload),
          features: OUR_FEATURES,
          initialDelayedAckBytes: 0,
        });
        return new Adb(transport);
      } catch (e) {
        raw.destroy();
        lastError = e;
        attempt++;
        opts.onUnauthorized?.(attempt);
        if (!/tls|handshake|certificate|ECONNRESET|closed|EPIPE/i.test(e instanceof Error ? e.message : String(e))) throw e;
      }
    }
    if (identities.length === 0) throw new UnauthorizedError(0);
    throw Object.assign(new UnauthorizedError(attempt), { cause: lastError, hint: 'not paired — run pair() with the code from Settings › Developer options › Wireless debugging' });
  }

  /** Android 11+ wireless debugging pairing via Google's adb (SPAKE2 is out of scope here). */
  async pair(hostPort: string, code: string): Promise<void> {
    if (!/^\d{6}$/.test(code)) throw new Error('pairing code is 6 digits');
    const adb = await findPlatformToolsAdb();
    if (!adb) throw new PairingUnavailableError();
    const { stdout, stderr } = await promisify(execFile)(adb, ['pair', hostPort, code], { timeout: 30_000, windowsHide: true }).catch((e: Error & { stdout?: string; stderr?: string }) => ({ stdout: e.stdout ?? '', stderr: e.stderr ?? e.message }));
    const out = `${stdout}\n${stderr}`;
    if (!/Successfully paired/i.test(out)) throw new Error(`pairing failed: ${out.trim() || 'no output'}`);
  }
}
