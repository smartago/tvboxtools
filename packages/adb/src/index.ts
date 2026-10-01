// The transport contract every face implements (DESIGN_NOTES §13):
//   WebUsbTransport (browser) · NodeTransport (USB + TCP, desktop/CLI) · CapacitorTransport (Kotlin AdbSocket).
// Everything above this line (core, ui) sees only `AdbTransport` and `AdbDevice`.
import type { AdbShell } from '@tvlm/core';

export type DebugPath = 'usb' | 'tcp' | 'wireless';

export interface DeviceInfo {
  /** Stable id for the UI list: serial for USB, `host:port` for network. */
  id: string;
  name: string;
  /** What the list shows under the name: `USB · 7F3A9C12B04E` or `192.168.1.50:5555`. */
  addr: string;
  method: DebugPath;
  /** Found via mDNS `_adb-tls-connect._tcp` (Android 11+ wireless debugging). */
  tls?: boolean;
  /**
   * This is the machine the tool is running on. On a television the network scan always finds the
   * box's own adbd, and an installer must not be left guessing which of the addresses is the set
   * in front of them — the UI labels it "This device".
   */
  self?: boolean;
}

export type AuthState = 'authorized' | 'unauthorized' | 'offline';

export interface AdbDevice extends AdbShell {
  readonly info: DeviceInfo;
  readonly serial: string;
  /** Re-query the auth state; `unauthorized` = waiting for Allow on the TV. */
  authState(): Promise<AuthState>;
  screencap(): Promise<Uint8Array>;
  /**
   * Read one file off the box (`adb pull`). OPTIONAL: it exists where the transport speaks the
   * sync service — USB and TCP through Tango, and the Android app — and is absent on the bridge,
   * where the web page only has an RPC channel. The pages that need it ask first and say so.
   */
  pull?(path: string): Promise<Uint8Array>;
  reboot(): Promise<void>;
  close(): Promise<void>;
}

export interface DiscoverOptions {
  /** Which paths to try; default all the transport supports. */
  paths?: DebugPath[];
  /** Subnet scan range override, e.g. `192.168.1.0/24`. */
  subnet?: string;
  /** Abort. */
  signal?: AbortSignal;
  /** Progress: a device found. */
  onFound?: (d: DeviceInfo) => void;
}

export interface ConnectOptions {
  /** For `unauthorized`: keep retrying every 1.5–3 s until the user pressed Allow, or `signal` aborts. */
  waitForAuth?: boolean;
  signal?: AbortSignal;
  /** Called on each unauthorized retry (the UI shows the Allow screen and a hint after 3 tries). */
  onUnauthorized?: (attempt: number) => void;
}

export interface AdbTransport {
  readonly kind: 'mock' | 'webusb' | 'node' | 'capacitor' | 'bridge' | 'adb-server';
  readonly supports: DebugPath[];
  /** mDNS + subnet scan + USB enumeration, as the transport can. */
  discover(opts?: DiscoverOptions): Promise<DeviceInfo[]>;
  /** USB pick (WebUSB `requestDevice`) or `host:port`. */
  connect(target: DeviceInfo | string, opts?: ConnectOptions): Promise<AdbDevice>;
  /** Android 11+ wireless debugging: pairing code from the TV's screen. */
  pair?(hostPort: string, code: string): Promise<void>;
  /**
   * Open the host's own device chooser and return what the user picked (null if they dismissed it).
   * WebUSB only: a page never sees a USB device until the person grants it in Chrome's dialog, and
   * that dialog opens ONLY inside a user gesture — so scanning can never find a box on its own.
   */
  pick?(): Promise<DeviceInfo | null>;
}

export class UnauthorizedError extends Error {
  constructor(public readonly attempts: number) {
    super('unauthorized — press Allow on the TV');
    this.name = 'UnauthorizedError';
  }
}

export class NoDevicesError extends Error {
  constructor(public readonly hint: 'client-isolation' | 'usb-driver' | 'none') {
    super('no devices found');
    this.name = 'NoDevicesError';
  }
}

export { MockTransport, type MockScenario } from './mock.js';
