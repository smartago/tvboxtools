// CapacitorTransport — the Android face (DESIGN_NOTES §13): Tango speaks the ADB protocol here in
// the WebView, over raw sockets that the Kotlin `AdbSocket` plugin opens on the phone
// (apps/android/android/app/src/main/java/tv/launcher/manager/AdbSocketPlugin.kt).
//
// What the plugin does natively — and nothing more: TCP connect, the STARTTLS upgrade with a
// persistent client certificate (Android 11+ Wireless debugging), SPAKE2 pairing (Kadb), and the
// discovery (TCP scan of the /24 + mDNS). Packet framing, AUTH, the multiplexed streams, shell,
// install, everything else is Tango (@yume-chan/adb) as on every other face.
//
// Handshake, both flavours of a box, one loop:
//   CNXN →  ┬ AUTH  → RSA token / signature / public key (Tango's authenticators; the "Allow"
//           │         prompt on the TV; the key lives in the WebView's IndexedDB)
//           ├ STLS  → reply STLS, plugin.startTls() on the same socket, then wait for CNXN again
//           └ CNXN  → banner: online
// The daemon on the Wireless-debugging port authenticates the TLS client certificate against the
// keys it learned at pairing — an unpaired phone gets the connection closed right after the TLS
// handshake, which surfaces here as `NotPairedError`.
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  Adb,
  AdbAuthType,
  AdbAuthenticationProcessor,
  AdbCommand,
  AdbDaemonTransport,
  AdbPacketSerializeStream,
  ADB_DAEMON_DEFAULT_FEATURES,
  ADB_DAEMON_DEFAULT_INITIAL_PAYLOAD_SIZE,
  ADB_DEFAULT_AUTHENTICATORS,
  calculateChecksum,
  decodeBase64,
  decodeUtf8,
  encodeBase64,
  encodeUtf8,
  type AdbCredentialStore,
  type AdbDaemonConnection,
  type AdbFeature,
  type AdbPacketData,
  type AdbPacketInit,
} from '@yume-chan/adb';
import AdbWebCredentialStore from '@yume-chan/adb-credential-web';
import { PackageManager } from '@yume-chan/android-bin';
import { Consumable, MaybeConsumable, ReadableStream, pipeFrom, type WritableStream } from '@yume-chan/stream-extra';
import type { AdbDevice, AdbTransport, AuthState, ConnectOptions, DebugPath, DeviceInfo, DiscoverOptions } from './index.js';
import { NoDevicesError, UnauthorizedError } from './index.js';

// ------------------------------------------------------------------ the plugin's contract

export interface DiscoveredHost {
  host: string;
  port: number;
  /** `scan` = answered a TCP connect on the ADB port; `mdns` = announced itself; `self` = loopback. */
  source: 'scan' | 'mdns' | 'self';
  /** mDNS only: `adb-tls-connect` (Wireless debugging), `adb-tls-pairing` (pairing dialog open), `adb`. */
  service?: 'adb-tls-connect' | 'adb-tls-pairing' | 'adb' | string;
  /** mDNS only: the instance name (`adb-<serial>-<random>` on Android 11+). */
  name?: string;
}

/** Typings of the Kotlin plugin. Read model is PULL: `read` blocks natively until data / EOF / timeout. */
export interface AdbSocketPlugin {
  connect(o: { host: string; port: number; timeoutMs?: number }): Promise<{ id: string }>;
  /** STARTTLS on an open socket (after the STLS exchange), presenting the phone's persistent client certificate. */
  startTls(o: { id: string }): Promise<{ protocol: string; peerFingerprint: string }>;
  write(o: { id: string; data: string }): Promise<void>;
  read(o: { id: string; max?: number; timeoutMs?: number }): Promise<{ data: string; eof: boolean }>;
  close(o: { id: string }): Promise<void>;
  /** Android 11+ Wireless debugging: the pairing port + 6-digit code from the TV's dialog (Kadb, SPAKE2). */
  pair(o: { host: string; port: number; code: string; name?: string }): Promise<{ fingerprint: string }>;
  identity(): Promise<{ fingerprint: string; notAfter: number }>;
  /**
   * What the app is running on. `isTv` switches the UI to D-pad mode; `ips` flags "this device";
   * the three switches are what the "set up this TV" step waits for. The flags are absent on an
   * older build of the plugin — `selfInfo()` turns that into "cannot tell" rather than "off".
   */
  deviceInfo(): Promise<{ isTv: boolean; model: string; manufacturer: string; sdk: number; release?: string; home?: string; playBuild?: boolean; ips?: string[]; developer?: boolean; adb?: boolean; wirelessAdb?: boolean; canPickFile?: boolean }>;
  /** Open a system settings screen on THIS device. `opened: false` = nothing answered the intent. */
  openSettings(o: { screen: SettingsScreen }): Promise<{ opened: boolean; target?: string }>;
  /** Rendered icons (base64 PNG) of apps installed on THIS device, keyed by package. */
  appIcons(o: { packages: string[] }): Promise<{ icons: Record<string, string> }>;
  discover(o: { subnet?: string; port?: number; timeoutMs?: number; scan?: boolean; mdns?: boolean }): Promise<{ hosts: DiscoveredHost[]; subnet?: string; localIps?: string[] }>;
}

/** The settings screens the wizard sends the installer to, on the device it is running on. */
export type SettingsScreen = 'about' | 'dev' | 'wifi' | 'settings';

/** This device's own name and developer switches, as `deviceInfo` reports them. */
export interface SelfInfo {
  manufacturer: string;
  model: string;
  sdk: number;
  /** `Build.VERSION.RELEASE` — "14", the number a human recognises, next to the API level. */
  release: string;
  /** The package whose activity answers HOME here: what kind of box this is, in one string. */
  home: string;
  /** This copy of the tool came from Google Play (flavour or installer) — it fetches no APKs. */
  playBuild: boolean;
  developer: boolean;
  adb: boolean;
  wirelessAdb: boolean;
  /** Does THIS device have an app that can open a file picker? A television usually does not. */
  canPickFile?: boolean;
}

export const AdbSocket = registerPlugin<AdbSocketPlugin>('AdbSocket');

/** True inside the Android app (the plugin exists); false in a browser, where this transport is useless. */
export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Is the app running on a television? Answers false anywhere else (browser, desktop) instead of
 * throwing, so the caller can simply `await` it at boot.
 */
export async function isAndroidTv(): Promise<boolean> {
  if (!isCapacitorNative()) return false;
  try {
    return (await AdbSocket.deviceInfo()).isTv;
  } catch {
    return false;
  }
}

/**
 * What this device says about itself, or null when there is no answer to be had: outside the
 * Android app, or on a plugin build that predates the switches. Null means "cannot tell", and the
 * wizard must never treat that as "off" — it would block a step on a condition it cannot observe.
 */
export async function selfInfo(): Promise<SelfInfo | null> {
  if (!isCapacitorNative()) return null;
  try {
    const i = await AdbSocket.deviceInfo();
    if (typeof i.developer !== 'boolean') return null;
    return { manufacturer: i.manufacturer ?? '', model: i.model ?? '', sdk: i.sdk ?? 0, release: i.release ?? '', home: i.home ?? '', playBuild: !!i.playBuild, developer: i.developer, adb: !!i.adb, wirelessAdb: !!i.wirelessAdb,
      // Left UNDEFINED when an older build of the plugin does not answer: "nobody asked" and
      // "no picker here" must not read the same, and only an explicit `false` hides the road.
      canPickFile: typeof i.canPickFile === 'boolean' ? i.canPickFile : undefined };
  } catch {
    return null;
  }
}

/**
 * The real icons of apps on THIS device, as `data:` URLs. Empty anywhere else — and empty is a fine
 * answer: the picker falls back to a letter tile rather than showing someone else's logo from
 * anywhere but the device itself.
 */
export async function appIcons(packages: string[]): Promise<Record<string, string>> {
  if (!isCapacitorNative() || !packages.length) return {};
  try {
    const { icons } = await AdbSocket.appIcons({ packages });
    return Object.fromEntries(Object.entries(icons ?? {}).map(([k, v]) => [k, `data:image/png;base64,${v}`]));
  } catch {
    return {};
  }
}

/** Open a settings screen on THIS device. False = nothing answered, or we are not on Android. */
export async function openSystemSettings(screen: SettingsScreen): Promise<boolean> {
  if (!isCapacitorNative()) return false;
  try {
    return (await AdbSocket.openSettings({ screen })).opened;
  } catch {
    return false;
  }
}

/** The TV closed the TLS connection right after the handshake: this phone's key is not paired with it. */
export class NotPairedError extends Error {
  constructor(public readonly hostPort: string) {
    super(`not paired with ${hostPort} — pair with the code on the TV's Wireless debugging screen`);
    this.name = 'NotPairedError';
  }
}

// ------------------------------------------------------------------ packets over the plugin socket

const ADB_COMMAND_STLS = 0x534c5453; // 'STLS'
const ADB_STLS_VERSION = 0x01000000;
const HEADER_SIZE = 24;
const EMPTY = new Uint8Array(0);

/** An `AdbDaemonConnection` (packets in, packets out) over one plugin socket. */
class CapacitorAdbConnection implements AdbDaemonConnection {
  readonly readable: ReadableStream<AdbPacketData>;
  readonly writable: WritableStream<Consumable<AdbPacketInit>>;
  #buffer: Uint8Array = EMPTY;
  #closed = false;

  constructor(
    private readonly plugin: AdbSocketPlugin,
    readonly id: string,
  ) {
    this.readable = new ReadableStream<AdbPacketData>(
      {
        pull: async (controller) => {
          const packet = await this.#readPacket();
          if (packet) controller.enqueue(packet);
          else controller.close();
        },
        cancel: () => this.close(),
      },
      { highWaterMark: 0 },
    );
    this.writable = pipeFrom(
      new MaybeConsumable.WritableStream<Uint8Array>({
        write: async (chunk) => {
          if (this.#closed) return;
          await this.plugin.write({ id: this.id, data: decodeUtf8(encodeBase64(chunk)) });
        },
        close: () => this.close(),
        abort: () => this.close(),
      }),
      new AdbPacketSerializeStream(),
    );
  }

  get closed(): boolean {
    return this.#closed;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.plugin.close({ id: this.id }).catch(() => undefined);
  }

  /** Exactly `n` bytes, or undefined at EOF. Timeouts (no data yet) just ask again. */
  async #readExactly(n: number): Promise<Uint8Array | undefined> {
    while (this.#buffer.length < n) {
      if (this.#closed) return undefined;
      const { data, eof } = await this.plugin.read({ id: this.id, max: Math.max(n - this.#buffer.length, 256 * 1024) });
      if (data) {
        const chunk = decodeBase64(data);
        if (this.#buffer.length === 0) {
          this.#buffer = chunk;
        } else {
          const merged = new Uint8Array(this.#buffer.length + chunk.length);
          merged.set(this.#buffer);
          merged.set(chunk, this.#buffer.length);
          this.#buffer = merged;
        }
      } else if (eof) {
        return undefined;
      }
    }
    const out = this.#buffer.subarray(0, n);
    this.#buffer = this.#buffer.subarray(n);
    return out;
  }

  async #readPacket(): Promise<AdbPacketData | undefined> {
    const header = await this.#readExactly(HEADER_SIZE);
    if (!header) return undefined;
    const view = new DataView(header.buffer, header.byteOffset, HEADER_SIZE);
    const command = view.getUint32(0, true);
    const arg0 = view.getUint32(4, true);
    const arg1 = view.getUint32(8, true);
    const payloadLength = view.getUint32(12, true);
    const magic = view.getUint32(20, true);
    if (magic !== (command ^ 0xffffffff) >>> 0) {
      throw new Error(`ADB framing lost (command ${command.toString(16)}, magic ${magic.toString(16)})`);
    }
    let payload: Uint8Array = EMPTY;
    if (payloadLength > 0) {
      const p = await this.#readExactly(payloadLength);
      if (!p) return undefined;
      // Copy: the buffer behind `subarray` is reused by the next read.
      payload = p.slice();
    }
    return { command, arg0, arg1, payload };
  }
}

// ------------------------------------------------------------------ the handshake

interface Negotiated {
  version: number;
  maxPayloadSize: number;
  banner: string;
  features: readonly AdbFeature[];
  tls: boolean;
}

interface HandshakeHooks {
  /** Our public key went to the TV: from now on it is showing "Allow USB debugging?". */
  onPublicKeySent(): void;
}

class ConnectionClosedError extends Error {
  constructor(
    message: string,
    readonly afterTls: boolean,
  ) {
    super(message);
    this.name = 'ConnectionClosedError';
  }
}

/**
 * Mirrors `AdbDaemonTransport.authenticate` (CNXN + AUTH) and adds the STLS branch Tango does not
 * have. Returns what the transport constructor needs; the connection stays open and unlocked.
 */
async function handshake(conn: CapacitorAdbConnection, plugin: AdbSocketPlugin, store: AdbCredentialStore, hooks: HandshakeHooks): Promise<Negotiated> {
  const features = ADB_DAEMON_DEFAULT_FEATURES;
  let version = 0x01000001;
  let maxPayloadSize = 1024 * 1024;
  let tls = false;
  const writer = conn.writable.getWriter();
  const reader = conn.readable.getReader();
  const auth = new AdbAuthenticationProcessor(ADB_DEFAULT_AUTHENTICATORS, store);
  const send = (p: AdbPacketData) =>
    // Always with checksum during the handshake: we do not yet know whether the daemon skips it.
    Consumable.WritableStream.write(writer, { ...p, checksum: calculateChecksum(p.payload), magic: (p.command ^ 0xffffffff) >>> 0 });
  try {
    await send({ command: AdbCommand.Connect, arg0: version, arg1: maxPayloadSize, payload: encodeUtf8(`host::features=${features.join(',')}`) });
    for (;;) {
      const { value: packet, done } = await reader.read();
      if (done) throw new ConnectionClosedError(tls ? 'the TV closed the TLS connection' : 'the TV closed the connection', tls);
      switch (packet.command) {
        case AdbCommand.Connect:
          version = Math.min(version, packet.arg0);
          maxPayloadSize = Math.min(maxPayloadSize, packet.arg1);
          return { version, maxPayloadSize, banner: decodeUtf8(packet.payload), features, tls };
        case AdbCommand.Auth: {
          const response = await auth.process(packet);
          await send(response);
          if (response.arg0 === AdbAuthType.PublicKey) hooks.onPublicKeySent();
          break;
        }
        case ADB_COMMAND_STLS:
          await send({ command: ADB_COMMAND_STLS, arg0: ADB_STLS_VERSION, arg1: 0, payload: EMPTY });
          await plugin.startTls({ id: conn.id });
          tls = true;
          break;
        default:
          // Leftovers of a previous client still in the box's buffer — ignore, as Tango does.
          break;
      }
    }
  } finally {
    auth.dispose();
    writer.releaseLock();
    reader.releaseLock();
  }
}

// ------------------------------------------------------------------ the device

class CapacitorDevice implements AdbDevice {
  #online = true;
  constructor(
    readonly info: DeviceInfo,
    private readonly adb: Adb,
  ) {
    void adb.disconnected.then(() => {
      this.#online = false;
    });
  }

  get serial(): string {
    return this.adb.serial;
  }

  async authState(): Promise<AuthState> {
    return this.#online ? 'authorized' : 'offline';
  }

  async shell(cmd: string): Promise<string> {
    // `exec:` service — no pty, so binary-safe and no CRLF mangling on old boxes. ONE argv element:
    // a string would go through Tango's splitCommand + join, which strips the quotes our
    // `am broadcast --es key "a b"` steps rely on.
    return this.adb.subprocess.noneProtocol.spawnWaitText([cmd]);
  }

  async install(apk: globalThis.ReadableStream<Uint8Array>, opts: { size?: number; name?: string } = {}): Promise<string> {
    const pm = new PackageManager(this.adb);
    const stream = apk as unknown as ReadableStream<MaybeConsumable<Uint8Array>>;
    if (opts.size && opts.size > 0) {
      // Streamed `cmd package install -S <size>` (Android 7+; Tango falls back to push + install
      // by itself on older boxes). Resolves void, throws with the installer's message on failure.
      await pm.installStream(opts.size, stream);
      return 'Success';
    }
    return pm.pushAndInstallStream(stream);
  }

  /** `adb pull` over the sync service — one file, into memory (an APK is tens of megabytes). */
  async pull(path: string): Promise<Uint8Array> {
    const sync = await this.adb.sync();
    try {
      const chunks: Uint8Array[] = [];
      const reader = (sync.read(path) as unknown as ReadableStream<Uint8Array>).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const size = chunks.reduce((n, c) => n + c.byteLength, 0);
      const out = new Uint8Array(size);
      let at = 0;
      for (const c of chunks) {
        out.set(c, at);
        at += c.byteLength;
      }
      return out;
    } finally {
      await sync.dispose();
    }
  }

  async screencap(): Promise<Uint8Array> {
    // `adb exec-out screencap -p` — the PNG bytes straight from the box.
    return this.adb.subprocess.noneProtocol.spawnWait(['screencap', '-p']);
  }

  async reboot(): Promise<void> {
    await this.adb.power.reboot();
  }

  async close(): Promise<void> {
    this.#online = false;
    await this.adb.close();
  }
}

// ------------------------------------------------------------------ the transport

export interface CapacitorTransportOptions {
  /** Default: Tango's WebCrypto store (RSA key in the WebView's IndexedDB) — the key the TV's "Allow" dialog remembers. */
  credentialStore?: AdbCredentialStore;
  /** Test seam. */
  plugin?: AdbSocketPlugin;
  /** mDNS browse + scan budget, ms. Default 3000. */
  discoverTimeoutMs?: number;
}

const MAX_AUTH_ATTEMPTS = 40; // × ~2 s ≈ 80 s of "press Allow on the TV"
const UNAUTHORIZED_TICK_MS = 2000;
const NO_ANSWER_MS = 15_000; // a socket that accepts but never says CNXN/AUTH/STLS
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function splitHostPort(s: string): { host: string; port: number } {
  const m = /^\[?([^\]]+?)\]?(?::(\d+))?$/.exec(s.trim());
  if (!m || !m[1]) throw new Error(`bad address "${s}" — want host or host:port`);
  return { host: m[1], port: m[2] ? Number(m[2]) : 5555 };
}

export class CapacitorTransport implements AdbTransport {
  readonly kind = 'capacitor' as const;
  readonly supports: DebugPath[] = ['tcp', 'wireless'];
  /** `_adb-tls-pairing._tcp` announcements seen by the last `discover()`: the TV has its pairing dialog open. */
  pairingHosts: DiscoveredHost[] = [];
  readonly #plugin: AdbSocketPlugin;
  readonly #store: AdbCredentialStore;
  readonly #discoverTimeoutMs: number;
  /** This device's own model, shown instead of a bare IP on the entry that is this very box. */
  #selfName: string | undefined;

  constructor(o: CapacitorTransportOptions = {}) {
    this.#plugin = o.plugin ?? AdbSocket;
    this.#store = o.credentialStore ?? new AdbWebCredentialStore('TV Launcher Manager');
    this.#discoverTimeoutMs = o.discoverTimeoutMs ?? 3000;
  }

  async discover(opts: DiscoverOptions = {}): Promise<DeviceInfo[]> {
    const paths = opts.paths ?? this.supports;
    this.#selfName ??= await this.#plugin
      .deviceInfo()
      .then((d) => d.model || undefined)
      .catch(() => undefined);
    const r = await this.#plugin.discover({
      subnet: opts.subnet,
      timeoutMs: this.#discoverTimeoutMs,
      scan: paths.includes('tcp'),
      mdns: paths.includes('wireless') || paths.includes('tcp'),
    });
    if (opts.signal?.aborted) return [];
    this.pairingHosts = r.hosts.filter((h) => h.service === 'adb-tls-pairing');
    // The scan reaches this device's own adbd — on a TV that is the set the installer is looking at.
    const mine = new Set([...(r.localIps ?? []), '127.0.0.1', 'localhost']);
    const list: DeviceInfo[] = [];
    // This device can answer twice — on its own address AND on loopback — and two rows for one set
    // is a choice nobody can make. The first one wins: mDNS, then the subnet scan, then loopback.
    let haveSelf = false;
    for (const h of r.hosts) {
      if (h.service === 'adb-tls-pairing') continue;
      const tls = h.service === 'adb-tls-connect';
      const method: DebugPath = tls ? 'wireless' : 'tcp';
      if (!paths.includes(method)) continue;
      const addr = `${h.host}:${h.port}`;
      if (list.some((d) => d.id === addr)) continue;
      const self = mine.has(h.host);
      if (self && haveSelf) continue;
      haveSelf ||= self;
      const d: DeviceInfo = { id: addr, name: self ? (this.#selfName ?? h.host) : h.host, addr, method, ...(tls ? { tls: true } : {}), ...(self ? { self: true } : {}) };
      list.push(d);
      opts.onFound?.(d);
    }
    if (list.length === 0) throw new NoDevicesError(r.subnet ? 'client-isolation' : 'none');
    return list;
  }

  /** The TV's pairing dialog announces itself on mDNS while open — this finds it, so the user only types the code. */
  async discoverPairing(timeoutMs = this.#discoverTimeoutMs): Promise<DiscoveredHost[]> {
    const r = await this.#plugin.discover({ timeoutMs, scan: false, mdns: true });
    this.pairingHosts = r.hosts.filter((h) => h.service === 'adb-tls-pairing');
    return this.pairingHosts;
  }

  async connect(target: DeviceInfo | string, opts: ConnectOptions = {}): Promise<AdbDevice> {
    const info: DeviceInfo = typeof target === 'string' ? { id: target, name: splitHostPort(target).host, addr: target, method: 'tcp' } : target;
    const { host, port } = splitHostPort(info.addr || info.id);
    let attempt = 0;
    for (;;) {
      if (opts.signal?.aborted) throw new Error('aborted');
      const { id } = await this.#plugin.connect({ host, port, timeoutMs: 5000 });
      const conn = new CapacitorAdbConnection(this.#plugin, id);
      let publicKeySent = false;
      let gaveUp = false;
      let noAnswer = false;
      const startedAt = Date.now();
      const onAbort = () => void conn.close();
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      const ticker = setInterval(() => {
        if (publicKeySent) {
          // The TV is showing "Allow USB debugging?" — count, report, give up when told to.
          attempt++;
          opts.onUnauthorized?.(attempt);
          if (!opts.waitForAuth || attempt >= MAX_AUTH_ATTEMPTS) {
            gaveUp = true;
            void conn.close();
          }
        } else if (Date.now() - startedAt > NO_ANSWER_MS) {
          noAnswer = true;
          void conn.close();
        }
      }, UNAUTHORIZED_TICK_MS);
      try {
        const n = await handshake(conn, this.#plugin, this.#store, {
          onPublicKeySent: () => {
            publicKeySent = true;
          },
        });
        clearInterval(ticker);
        opts.signal?.removeEventListener('abort', onAbort);
        const transport = new AdbDaemonTransport({
          serial: info.id,
          connection: conn,
          version: n.version,
          maxPayloadSize: n.maxPayloadSize,
          banner: n.banner,
          features: n.features,
          initialDelayedAckBytes: ADB_DAEMON_DEFAULT_INITIAL_PAYLOAD_SIZE,
        });
        const adb = new Adb(transport);
        // The list showed the address; now the box can say what it is.
        const model = (await adb.getProp('ro.product.model').catch(() => '')).trim();
        const named: DeviceInfo = {
          ...info,
          name: info.name && info.name !== host && info.name !== info.id ? info.name : model || info.name || host,
          method: n.tls ? 'wireless' : info.method === 'wireless' ? 'tcp' : info.method,
          ...(n.tls ? { tls: true } : {}),
        };
        return new CapacitorDevice(named, adb);
      } catch (e) {
        clearInterval(ticker);
        opts.signal?.removeEventListener('abort', onAbort);
        await conn.close();
        if (opts.signal?.aborted) throw new Error('aborted');
        if (gaveUp) throw new UnauthorizedError(attempt);
        if (noAnswer) throw new Error(`${host}:${port} accepted the connection but never answered as ADB`);
        if (e instanceof ConnectionClosedError) {
          if (e.afterTls) throw new NotPairedError(`${host}:${port}`);
          if (publicKeySent && opts.waitForAuth) {
            // Deny pressed, or the TV's dialog timed out: the prompt comes back on reconnect.
            attempt++;
            opts.onUnauthorized?.(attempt);
            if (attempt >= MAX_AUTH_ATTEMPTS) throw new UnauthorizedError(attempt);
            await sleep(UNAUTHORIZED_TICK_MS);
            continue;
          }
          if (publicKeySent) throw new UnauthorizedError(Math.max(attempt, 1));
        }
        throw e;
      }
    }
  }

  /** Android 11+ Wireless debugging: `hostPort` is the PAIRING address on the TV's dialog (not :5555), `code` its 6 digits. */
  async pair(hostPort: string, code: string): Promise<void> {
    const { host, port } = splitHostPort(hostPort);
    if (!/^\d{6}$/.test(code.trim())) throw new Error('pairing failed: the code is the 6 digits on the TV');
    await this.#plugin.pair({ host, port, code: code.trim() });
  }
}
