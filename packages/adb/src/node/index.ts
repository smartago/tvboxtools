// `@tvlm/adb/node` — the Node transport (desktop main process + CLI/MCP): USB via the `usb` module,
// TCP/wireless via our own socket framing, mDNS + subnet discovery, and a running adb server as fallback.
import type { AdbDevice, AdbTransport, ConnectOptions, DebugPath, DeviceInfo, DiscoverOptions } from '../index.js';
import { NoDevicesError } from '../index.js';
import { NodeCredentialStore } from './credentials.js';
import { DEFAULT_ADB_PORT, discoverNetwork, type NetworkDiscoverOptions } from './discover.js';
import { AdbServerTransport } from './server.js';
import { NodeTcpTransport, parseHostPort, probeAdb } from './tcp.js';
import { NodeUsbTransport, UsbUnavailableError } from './usb.js';

export { NodeCredentialStore, ADB_KEY_PATH, GOOGLE_ADB_KEY_PATH, TVLM_DIR, publicKeyLine, selfSignedCertificate } from './credentials.js';
export * from './discover.js';
export { AdbServerTransport, AdbServerUnavailableError } from './server.js';
export { NodeTcpTransport, PairingUnavailableError, findPlatformToolsAdb, parseHostPort, probeAdb, socketToConnection } from './tcp.js';
export { NodeUsbTransport, UsbUnavailableError } from './usb.js';
export { TangoDevice, authenticateWithAllow } from '../tango-device.js';

export interface NodeTransportOptions {
  credentials?: NodeCredentialStore;
  /** Use a running adb server when the `usb` module cannot claim the device (Windows drivers). Default true. */
  adbServerFallback?: boolean;
  /** Discovery budget in ms (mDNS window + subnet scan). Default 4000. */
  discoverTimeoutMs?: number;
  /** ADB-over-TCP port to scan. Default 5555. */
  port?: number;
  tickMs?: number;
}

/** USB + network discovery together; `connect` routed by `DeviceInfo.method`; `pair` via platform-tools. */
export class NodeTransport implements AdbTransport {
  readonly kind = 'node' as const;
  readonly supports: DebugPath[] = ['usb', 'tcp', 'wireless'];
  readonly credentials: NodeCredentialStore;
  readonly usb: NodeUsbTransport;
  readonly tcp: NodeTcpTransport;
  readonly server: AdbServerTransport;
  /** Set after a discover/connect that found the `usb` module unusable — the UI's driver hint. */
  usbUnavailable: UsbUnavailableError | undefined;
  private readonly o: NodeTransportOptions;

  constructor(o: NodeTransportOptions = {}) {
    this.o = o;
    this.credentials = o.credentials ?? new NodeCredentialStore();
    this.usb = new NodeUsbTransport({ credentials: this.credentials, tickMs: o.tickMs });
    this.tcp = new NodeTcpTransport({ credentials: this.credentials, tickMs: o.tickMs });
    this.server = new AdbServerTransport({ tickMs: o.tickMs });
  }

  async discover(opts: DiscoverOptions = {}): Promise<DeviceInfo[]> {
    const paths = opts.paths ?? this.supports;
    const found = new Map<string, DeviceInfo>();
    const emit = (d: DeviceInfo) => {
      if (found.has(d.id)) return;
      found.set(d.id, d);
      opts.onFound?.(d);
    };
    const tasks: Promise<void>[] = [];
    if (paths.includes('usb')) {
      tasks.push(
        this.usb
          .discover()
          .then((list) => list.forEach(emit))
          .catch(async (e) => {
            if (e instanceof UsbUnavailableError) this.usbUnavailable = e;
            // The adb server sees USB devices its driver owns.
            if (this.o.adbServerFallback !== false) (await this.server.discover().catch(() => [])).filter((d) => d.method === 'usb').forEach(emit);
          }),
      );
    }
    if (paths.includes('tcp') || paths.includes('wireless')) {
      const net: NetworkDiscoverOptions = {
        subnet: opts.subnet,
        port: this.o.port ?? DEFAULT_ADB_PORT,
        timeoutMs: this.o.discoverTimeoutMs ?? 4000,
        signal: opts.signal,
        onFound: (d) => {
          if (paths.includes(d.method)) emit(d);
        },
        classify: async (host, port, signal) => {
          const p = await probeAdb(host, port, { timeoutMs: 1500, signal });
          if (!p) return null;
          if (p.kind === 'stls') return { method: 'wireless' };
          return { method: 'tcp', name: p.kind === 'cnxn' ? p.banner.model ?? p.banner.product ?? undefined : undefined };
        },
      };
      tasks.push(discoverNetwork(net).then(() => undefined));
    }
    await Promise.all(tasks);
    if (opts.signal?.aborted) return [...found.values()];
    if (found.size === 0) throw new NoDevicesError(paths.length === 1 && paths[0] === 'usb' ? 'usb-driver' : this.usbUnavailable && !paths.some((p) => p !== 'usb') ? 'usb-driver' : 'client-isolation');
    return [...found.values()];
  }

  async connect(target: DeviceInfo | string, opts: ConnectOptions = {}): Promise<AdbDevice> {
    const info = typeof target === 'string' ? guessInfo(target) : target;
    if (info.method === 'usb') {
      try {
        return await this.usb.connect(info, opts);
      } catch (e) {
        if (e instanceof UsbUnavailableError && this.o.adbServerFallback !== false && (await this.server.available())) {
          this.usbUnavailable = e;
          return this.server.connect(info, opts);
        }
        throw e;
      }
    }
    return this.tcp.connect(info, opts);
  }

  async pair(hostPort: string, code: string): Promise<void> {
    try {
      await this.tcp.pair(hostPort, code);
    } catch (e) {
      // No platform-tools binary, but maybe a server is already running (Android Studio, scrcpy…).
      if (await this.server.available()) return this.server.pair(hostPort, code);
      throw e;
    }
  }
}

/** `host[:port]` → tcp, anything else → a USB serial. */
export function guessInfo(target: string): DeviceInfo {
  const t = target.trim();
  if (/^[\w.-]+:\d+$/.test(t) || /^\d+\.\d+\.\d+\.\d+$/.test(t)) {
    const { host, port } = parseHostPort(t);
    const addr = `${host}:${port}`;
    return { id: addr, name: addr, addr, method: 'tcp' };
  }
  return { id: t, name: t, addr: `USB · ${t}`, method: 'usb' };
}

export function createNodeTransport(o: NodeTransportOptions = {}): NodeTransport {
  return new NodeTransport(o);
}
