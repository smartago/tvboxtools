// WebUsbTransport — the browser face (Chrome, HTTPS): USB straight from the page, no driver, one "Allow" in
// Chrome's picker plus the TV's own Allow. Wi-Fi is NOT possible from a browser (DESIGN_NOTES §12) — that is
// `./bridge.ts`. No `node:` imports in this file.
import { Adb, AdbDaemonTransport, type AdbCredentialStore } from '@yume-chan/adb';
import AdbWebCredentialStore from '@yume-chan/adb-credential-web';
import { AdbDaemonWebUsbDevice, AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb';
import type { AdbDevice, AdbTransport, ConnectOptions, DebugPath, DeviceInfo } from './index.js';
import { NoDevicesError } from './index.js';
import { TangoDevice, authenticateWithAllow } from './tango-device.js';

export interface WebUsbOptions {
  /** IndexedDB key name; default `tvlm`. Same key → the TV asks Allow once per browser profile. */
  appName?: string;
  credentials?: AdbCredentialStore;
  manager?: AdbDaemonWebUsbDeviceManager;
  tickMs?: number;
}

export function webUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator && AdbDaemonWebUsbDeviceManager.BROWSER !== undefined;
}

export class WebUsbTransport implements AdbTransport {
  readonly kind = 'webusb' as const;
  readonly supports: DebugPath[] = ['usb'];
  readonly credentials: AdbCredentialStore;
  private readonly manager: AdbDaemonWebUsbDeviceManager;
  private readonly tickMs: number | undefined;

  constructor(o: WebUsbOptions = {}) {
    const manager = o.manager ?? AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) throw new NoDevicesError('usb-driver');
    this.manager = manager;
    this.credentials = o.credentials ?? new AdbWebCredentialStore(o.appName ?? 'tvlm');
    this.tickMs = o.tickMs;
  }

  /** Devices the user already granted to this origin (no picker). */
  async discover(): Promise<DeviceInfo[]> {
    const devices = await this.manager.getDevices();
    return devices.map(toInfo);
  }

  /**
   * Chrome's own chooser. Must be called from a click: the browser refuses `requestDevice` outside a
   * user gesture, which is why "Scan" alone can never find a box that was never granted.
   *
   * It asks with NO filters on purpose. The manager's own `requestDevice` filters on the ADB
   * interface (class 0xFF / subclass 0x42), so a box whose USB port carries no ADB gets a chooser
   * with nothing in it, which Chrome closes at once — from the outside that is indistinguishable
   * from a broken button (Jim, 23/9: "it comes up instantly, no scan, no dialog"). Unfiltered, the
   * person sees what is really plugged in and the honest answer comes after.
   *
   *   null  → nothing was picked (dialog closed, or Chrome had nothing to show)
   *   throw → a device was granted but nothing on it speaks ADB
   */
  async pick(): Promise<DeviceInfo | null> {
    // `@types/w3c-web-usb` is not in this package's lib, and one call does not earn a dependency:
    // the shape we use is two fields wide.
    const usb = (navigator as unknown as { usb: { requestDevice(o: { filters: unknown[] }): Promise<{ serialNumber?: string }> } }).usb;
    let granted: { serialNumber?: string };
    try {
      granted = await usb.requestDevice({ filters: [] });
    } catch (e) {
      // NotFoundError is "no device selected" — a cancel, not a failure worth a stack trace.
      if (e instanceof Error && e.name === 'NotFoundError') return null;
      throw e;
    }
    const match = (await this.manager.getDevices()).find((d) => d.serial === granted.serialNumber);
    if (!match) throw new NoDevicesError('usb-driver');
    return toInfo(match);
  }

  /**
   * A string/`DeviceInfo` matching a granted device connects to it; otherwise (or `''`) Chrome's picker opens —
   * `requestDevice` must run inside a user gesture (the "Connect" click).
   */
  async connect(target: DeviceInfo | string, opts: ConnectOptions = {}): Promise<AdbDevice> {
    const serial = typeof target === 'string' ? target : target.id;
    let device: AdbDaemonWebUsbDevice | undefined = (await this.manager.getDevices()).find((d) => d.serial === serial);
    if (!device) {
      device = await this.manager.requestDevice();
      if (!device) throw new NoDevicesError('none');
    }
    const picked = device;
    const info: DeviceInfo = typeof target === 'string' || target.id !== picked.serial ? toInfo(picked) : target;

    const start = async () => {
      let connection;
      try {
        connection = await picked.connect();
      } catch (e) {
        if (e instanceof AdbDaemonWebUsbDevice.DeviceBusyError) throw new Error("the device is busy — close Google's adb server (`adb kill-server`) and try again");
        throw e;
      }
      const transport = await AdbDaemonTransport.authenticate({ serial: picked.serial, connection, credentialStore: this.credentials });
      return new Adb(transport);
    };
    const adb = await authenticateWithAllow(start, { ...opts, tickMs: this.tickMs }, async () => {
      try {
        await picked.raw.close();
      } catch {
        /* already closed */
      }
    });
    return new TangoDevice({ ...info, name: info.name || adb.banner.model || info.id }, adb);
  }
}

function toInfo(d: AdbDaemonWebUsbDevice): DeviceInfo {
  return { id: d.serial, name: d.name || d.serial, addr: `USB · ${d.serial}`, method: 'usb' };
}
