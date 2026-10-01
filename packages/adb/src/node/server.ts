// AdbServerTransport: talk to a running Google adb server (127.0.0.1:5037) — the fallback that covers
// Windows USB drivers the `usb` module cannot claim, and `adb pair`/`adb connect` done by the user.
import { Adb, AdbServerClient } from '@yume-chan/adb';
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp';
import type { AdbDevice, AdbTransport, ConnectOptions, DebugPath, DeviceInfo } from '../index.js';
import { NoDevicesError, UnauthorizedError } from '../index.js';
import { TangoDevice } from '../tango-device.js';

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

export class AdbServerUnavailableError extends Error {
  constructor(readonly host: string, readonly port: number) {
    super(`no adb server on ${host}:${port} (start it with \`adb start-server\`)`);
    this.name = 'AdbServerUnavailableError';
  }
}

export interface AdbServerOptions {
  host?: string;
  port?: number;
  tickMs?: number;
}

export class AdbServerTransport implements AdbTransport {
  readonly kind = 'adb-server' as const;
  readonly supports: DebugPath[] = ['usb', 'tcp', 'wireless'];
  readonly client: AdbServerClient;
  readonly host: string;
  readonly port: number;
  private readonly tickMs: number;

  constructor(o: AdbServerOptions = {}) {
    this.host = o.host ?? '127.0.0.1';
    this.port = o.port ?? 5037;
    this.tickMs = o.tickMs ?? 2000;
    this.client = new AdbServerClient(new AdbServerNodeTcpConnector({ host: this.host, port: this.port }));
  }

  /** Is a server listening? Never throws. */
  async available(): Promise<boolean> {
    try {
      await this.client.getVersion();
      return true;
    } catch {
      return false;
    }
  }

  async discover(): Promise<DeviceInfo[]> {
    if (!(await this.available())) return [];
    const list = await this.client.getDevices(['device', 'unauthorized', 'offline']);
    return list.map(toInfo);
  }

  async connect(target: DeviceInfo | string, opts: ConnectOptions = {}): Promise<AdbDevice> {
    if (!(await this.available())) throw new AdbServerUnavailableError(this.host, this.port);
    const serial = typeof target === 'string' ? target : target.id;
    if (serial.includes(':')) {
      // `adb connect host:port` — idempotent on the server side.
      try {
        await this.client.wireless.connect(serial);
      } catch (e) {
        if (!(e instanceof AdbServerClient.AlreadyConnectedError)) throw e;
      }
    }
    let attempt = 0;
    for (;;) {
      if (opts.signal?.aborted) throw new Error('aborted');
      const devices = await this.client.getDevices(['device', 'unauthorized', 'offline']);
      const d = devices.find((x) => x.serial === serial) ?? (serial === '' && devices.length === 1 ? devices[0] : undefined);
      if (!d) throw new NoDevicesError(devices.length ? 'none' : 'usb-driver');
      if (d.state === 'device') {
        const adb: Adb = await this.client.createAdb({ serial: d.serial });
        const info: DeviceInfo = typeof target === 'string' ? toInfo(d) : { ...target, name: target.name || d.model || d.serial };
        return new TangoDevice(info, adb);
      }
      attempt++;
      opts.onUnauthorized?.(attempt);
      if (!opts.waitForAuth || attempt >= 90) throw new UnauthorizedError(attempt);
      await sleep(this.tickMs, opts.signal);
    }
  }

  /** `adb pair host:port code` through the server (it speaks SPAKE2 for us). */
  async pair(hostPort: string, code: string): Promise<void> {
    if (!(await this.available())) throw new AdbServerUnavailableError(this.host, this.port);
    await this.client.wireless.pair(hostPort, code);
  }
}

function toInfo(d: AdbServerClient.Device): DeviceInfo {
  const net = d.serial.includes(':');
  return {
    id: d.serial,
    name: d.model?.replace(/_/g, ' ') || d.product || d.serial,
    addr: net ? d.serial : `USB · ${d.serial}`,
    method: net ? 'tcp' : 'usb',
  };
}
