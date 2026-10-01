// NodeUsbTransport: Tango's WebUSB daemon device manager over the `usb` package (node-usb-rs, N-API).
// `usb` is an OPTIONAL dependency with a native module: when it is missing (or the OS has no WinUSB
// driver for the box) every call reports `NoDevicesError('usb-driver')` so the UI can point at the fix.
import { Adb, AdbDaemonTransport } from '@yume-chan/adb';
import { AdbDaemonWebUsbDevice, AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb';

/** The WebUSB `USB` interface as Tango's manager declares it (the DOM lib has no WebUSB typings). */
type UsbManager = ConstructorParameters<typeof AdbDaemonWebUsbDeviceManager>[0];
import type { AdbDevice, AdbTransport, ConnectOptions, DebugPath, DeviceInfo } from '../index.js';
import { NoDevicesError } from '../index.js';
import { TangoDevice, authenticateWithAllow } from '../tango-device.js';
import { NodeCredentialStore } from './credentials.js';

export interface NodeUsbOptions {
  credentials?: NodeCredentialStore;
  tickMs?: number;
}

export class UsbUnavailableError extends NoDevicesError {
  constructor(readonly cause: unknown) {
    super('usb-driver');
    this.message = `USB is unavailable in this build: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

export class NodeUsbTransport implements AdbTransport {
  readonly kind = 'node' as const;
  readonly supports: DebugPath[] = ['usb'];
  readonly credentials: NodeCredentialStore;
  private manager: Promise<AdbDaemonWebUsbDeviceManager> | undefined;
  private readonly tickMs: number | undefined;

  constructor(o: NodeUsbOptions = {}) {
    this.credentials = o.credentials ?? new NodeCredentialStore();
    this.tickMs = o.tickMs;
  }

  /** Loads the native module lazily, once; a failure is remembered as `UsbUnavailableError`. */
  private async getManager(): Promise<AdbDaemonWebUsbDeviceManager> {
    this.manager ??= (async () => {
      try {
        const mod = (await import('usb')) as typeof import('usb');
        const WebUSB = mod.WebUSB ?? (mod as unknown as { default?: typeof import('usb') }).default?.WebUSB;
        if (!WebUSB) throw new Error('usb module has no WebUSB export');
        // The polyfill reads the string descriptors of EVERYTHING on the bus (usb 3.1.0 has no
        // filter option), and one gamepad whose driver answers "error 31" to that read (Jim's
        // Trust pad, 23/9) took the whole enumeration down with it — "getString error: unknown
        // (error 31)" on the Allow screen. `list()` below is where that is caught.
        return new AdbDaemonWebUsbDeviceManager(new WebUSB({ allowAllDevices: true }) as unknown as UsbManager);
      } catch (e) {
        throw new UsbUnavailableError(e);
      }
    })();
    return this.manager;
  }

  /**
   * The bus, as far as it can be read. An enumeration that throws (a device the driver will not
   * describe, a bus in a bad state) is reported as USB being unavailable — which is what it is
   * at that moment — so the caller falls back to the adb server instead of showing the driver's
   * error code to a person who plugged in nothing.
   */
  private async list(): Promise<AdbDaemonWebUsbDevice[]> {
    const manager = await this.getManager();
    try {
      return await manager.getDevices();
    } catch (e) {
      throw new UsbUnavailableError(e);
    }
  }

  /** Every attached USB device exposing the ADB interface (class 0xff / 0x42 / 1). */
  async discover(): Promise<DeviceInfo[]> {
    const devices = await this.list();
    return devices.map(toInfo);
  }

  async connect(target: DeviceInfo | string, opts: ConnectOptions = {}): Promise<AdbDevice> {
    const serial = typeof target === 'string' ? target : target.id;
    const devices = await this.list();
    const device = devices.find((d) => d.serial === serial) ?? (devices.length === 1 && serial === '' ? devices[0] : undefined);
    if (!device) throw new NoDevicesError(devices.length ? 'none' : 'usb-driver');
    const info = typeof target === 'string' ? toInfo(device) : target;
    await this.credentials.ensure();

    let connection: Awaited<ReturnType<AdbDaemonWebUsbDevice['connect']>> | undefined;
    const start = async () => {
      try {
        connection = await device.connect();
      } catch (e) {
        // Windows without a WinUSB driver, Linux without udev rules, or Google's adb server holding the interface.
        if (e instanceof AdbDaemonWebUsbDevice.DeviceBusyError || /NetworkError|LIBUSB_ERROR_ACCESS|LIBUSB_ERROR_NOT_SUPPORTED|NOT_SUPPORTED|busy/i.test(String((e as Error)?.message))) throw new UsbUnavailableError(e);
        throw e;
      }
      const transport = await AdbDaemonTransport.authenticate({ serial: device.serial, connection, credentialStore: this.credentials });
      return new Adb(transport);
    };
    const adb = await authenticateWithAllow(start, { ...opts, tickMs: this.tickMs }, async () => {
      try {
        await device.raw.close();
      } catch {
        /* already gone */
      }
    });
    const named: DeviceInfo = { ...info, name: info.name || adb.banner.model || serial };
    return new TangoDevice(named, adb);
  }
}

function toInfo(d: AdbDaemonWebUsbDevice): DeviceInfo {
  const serial = d.serial || d.raw.serialNumber || '';
  return { id: serial, name: d.name || d.raw.productName || serial, addr: `USB · ${serial}`, method: 'usb' };
}
