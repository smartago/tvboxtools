// ElectronTransport — the renderer side of the desktop app. The web bundle runs in Chromium with
// contextIsolation; the real `createNodeTransport()` lives in the main process. Every call here goes
// through `window.tvlm.*` (exposed by apps/desktop/src/preload.mts); the channel names and DTOs are the
// types in apps/desktop/src/ipc.ts. Type-only import: nothing from `electron` or `node:` reaches the bundle.
import type { IpcError, IpcResult, TvlmApi } from '../../../apps/desktop/src/ipc.js';
import type { AdbDevice, AdbTransport, AuthState, ConnectOptions, DebugPath, DeviceInfo, DiscoverOptions } from './index.js';
import { NoDevicesError, UnauthorizedError } from './index.js';

declare global {
  interface Window {
    tvlm?: TvlmApi;
  }
}

export function electronAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.tvlm === 'object' && window.tvlm !== null;
}

/**
 * Electron's IPC carries structured-cloneable values only, and the device the UI hands us is a
 * Svelte 5 `$state` object — which is a Proxy. Sending it throws "An object could not be cloned",
 * a DOMException with no stack that points anywhere useful; on the first real box this showed up as
 * a wizard waiting for ever on "try 0" (Jim, 23/9). Everything that crosses the bridge is copied
 * into a plain object here, at the one place that knows the shape.
 */
function plain(target: DeviceInfo | string): DeviceInfo | string {
  if (typeof target === 'string') return target;
  // every field of DeviceInfo, by hand: a spread of a Proxy is still a Proxy's contents, and the
  // optional ones (tls, self) decide how the main process connects.
  return { id: target.id, name: target.name, addr: target.addr, method: target.method, ...(target.tls ? { tls: true } : {}), ...(target.self ? { self: true } : {}) };
}

function rebuild(e: IpcError): Error {
  if (e.name === 'UnauthorizedError') return new UnauthorizedError(e.attempts ?? 0);
  if (e.name === 'NoDevicesError') return new NoDevicesError(e.hint ?? 'none');
  return new Error(e.message);
}

function unwrap<T>(r: IpcResult<T>): T {
  if (r.ok) return r.value;
  throw rebuild(r.error);
}

let nextToken = 1;

export class ElectronTransport implements AdbTransport {
  readonly kind = 'node' as const;
  readonly supports: DebugPath[] = ['usb', 'tcp', 'wireless'];
  private readonly api: TvlmApi;

  constructor(api: TvlmApi | undefined = typeof window !== 'undefined' ? window.tvlm : undefined) {
    if (!api) throw new Error('window.tvlm is missing — not running inside the desktop app');
    this.api = api;
  }

  brand(): Promise<{ brand: string; version: string }> {
    return this.api.brand();
  }

  usbHint(): Promise<string | null> {
    return this.api.usbHint();
  }

  async discover(opts: DiscoverOptions = {}): Promise<DeviceInfo[]> {
    const token = nextToken++;
    const off = opts.onFound ? this.api.onDiscoverFound((t, d) => t === token && opts.onFound?.(d)) : () => {};
    opts.signal?.addEventListener('abort', () => this.api.abort(token), { once: true });
    try {
      return unwrap(await this.api.discover({ token, paths: opts.paths, subnet: opts.subnet }));
    } finally {
      off();
    }
  }

  async connect(target: DeviceInfo | string, opts: ConnectOptions = {}): Promise<AdbDevice> {
    const token = nextToken++;
    const off = opts.onUnauthorized ? this.api.onUnauthorized((t, n) => t === token && opts.onUnauthorized?.(n)) : () => {};
    opts.signal?.addEventListener('abort', () => this.api.abort(token), { once: true });
    try {
      const r = unwrap(await this.api.connect({ token, target: plain(target), waitForAuth: opts.waitForAuth }));
      return new ElectronDevice(this.api, r.handle, r.info, r.serial);
    } finally {
      off();
    }
  }

  async pair(hostPort: string, code: string): Promise<void> {
    unwrap(await this.api.pair(hostPort, code));
  }
}

class ElectronDevice implements AdbDevice {
  constructor(
    private readonly api: TvlmApi,
    private readonly handle: number,
    readonly info: DeviceInfo,
    readonly serial: string,
  ) {}
  async authState(): Promise<AuthState> {
    return unwrap(await this.api.authState(this.handle));
  }
  async shell(cmd: string): Promise<string> {
    return unwrap(await this.api.shell(this.handle, cmd));
  }
  /** Streams the APK through IPC in chunks so the renderer never holds the whole file. */
  async install(apk: ReadableStream<Uint8Array>, opts: { size?: number; name?: string } = {}): Promise<string> {
    const job = unwrap(await this.api.installBegin(this.handle, opts));
    const reader = apk.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      unwrap(await this.api.installChunk(job, value));
    }
    return unwrap(await this.api.installEnd(job));
  }
  async screencap(): Promise<Uint8Array> {
    return unwrap(await this.api.screencap(this.handle));
  }
  async reboot(): Promise<void> {
    unwrap(await this.api.reboot(this.handle));
  }
  async close(): Promise<void> {
    unwrap(await this.api.close(this.handle));
  }
}
