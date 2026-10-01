// The one place the Electron IPC contract lives. The main process and the preload import the VALUES
// (channel names); the renderer-side transport (packages/adb/src/electron.ts) imports only the TYPES.
// Plain TypeScript — no `electron` import — so both tsconfigs can compile it.
import type { AuthState, DebugPath, DeviceInfo } from '@tvlm/adb';

export const TVLM_IPC = {
  brand: 'tvlm:brand',
  discover: 'tvlm:discover',
  /** main → renderer: `{ token, device }` while a discover runs. */
  discoverFound: 'tvlm:discover:found',
  connect: 'tvlm:connect',
  /** main → renderer: `{ token, attempt }` while waiting for Allow. */
  connectUnauthorized: 'tvlm:connect:unauthorized',
  /** renderer → main (fire-and-forget): abort a discover/connect by token. */
  abort: 'tvlm:abort',
  pair: 'tvlm:pair',
  shell: 'tvlm:shell',
  authState: 'tvlm:authState',
  screencap: 'tvlm:screencap',
  reboot: 'tvlm:reboot',
  close: 'tvlm:close',
  installBegin: 'tvlm:install:begin',
  installChunk: 'tvlm:install:chunk',
  installEnd: 'tvlm:install:end',
  usbHint: 'tvlm:usbHint',
  /** config.json next to the exe: what this computer remembers between runs. */
  config: 'tvlm:config',
  configSet: 'tvlm:config:set',
  /** scrcpy, if this computer has it: see the television in a window. */
  mirror: 'tvlm:mirror',
} as const;

export interface IpcDiscoverArgs {
  token: number;
  paths?: DebugPath[];
  subnet?: string;
}
export interface IpcConnectArgs {
  token: number;
  target: DeviceInfo | string;
  waitForAuth?: boolean;
}
export interface IpcConnectResult {
  handle: number;
  info: DeviceInfo;
  serial: string;
}
/** Errors cross IPC as plain objects; `name` tells the renderer which class to rebuild. */
export interface IpcError {
  name: 'UnauthorizedError' | 'NoDevicesError' | 'Error';
  message: string;
  attempts?: number;
  hint?: 'client-isolation' | 'usb-driver' | 'none';
}
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: IpcError };

/** `window.tvlm` — what the preload exposes with contextBridge. */
export interface TvlmApi {
  /** `{ brand: 'launcher', version }` baked in at build time — one product. */
  brand(): Promise<{ brand: string; version: string }>;
  /** Everything this computer remembers (config.json). Strings only. */
  config(): Promise<Record<string, string>>;
  /** Merge into config.json; `null` forgets a key. Nothing waits for the answer. */
  configSet(patch: Record<string, string | null>): void;
  discover(args: IpcDiscoverArgs): Promise<IpcResult<DeviceInfo[]>>;
  onDiscoverFound(cb: (token: number, device: DeviceInfo) => void): () => void;
  connect(args: IpcConnectArgs): Promise<IpcResult<IpcConnectResult>>;
  onUnauthorized(cb: (token: number, attempt: number) => void): () => void;
  abort(token: number): void;
  pair(hostPort: string, code: string): Promise<IpcResult<void>>;
  shell(handle: number, cmd: string): Promise<IpcResult<string>>;
  authState(handle: number): Promise<IpcResult<AuthState>>;
  screencap(handle: number): Promise<IpcResult<Uint8Array>>;
  reboot(handle: number): Promise<IpcResult<void>>;
  close(handle: number): Promise<IpcResult<void>>;
  installBegin(handle: number, opts: { size?: number; name?: string }): Promise<IpcResult<number>>;
  installChunk(job: number, chunk: Uint8Array): Promise<IpcResult<void>>;
  installEnd(job: number): Promise<IpcResult<string>>;
  /**
   * Open the box in a scrcpy window. `{ ok: false, reason: 'missing' }` when scrcpy is not on
   * this computer — we never bundle it (its own licence, its own adb server, 40 MB a platform).
   */
  mirror(target: string): Promise<{ ok: boolean; reason?: 'missing' | 'failed'; message?: string }>;
  /** Why USB is unavailable (missing native module / driver), or null. */
  usbHint(): Promise<string | null>;
}
