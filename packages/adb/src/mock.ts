// The mock transport = the prototype's scenarios (happy / unauthorized / accounts / nodevices),
// so the UI runs end-to-end in a browser with no box, and the CLI/MCP have a deterministic test bed.
import type { AdbDevice, AdbTransport, AuthState, ConnectOptions, DebugPath, DeviceInfo, DiscoverOptions } from './index.js';
import { NoDevicesError, UnauthorizedError } from './index.js';

export type MockScenario = 'happy' | 'unauthorized' | 'accounts' | 'nodevices';

export interface MockOptions {
  scenario?: MockScenario;
  /** Which box the prototype pretends to be. */
  box?: 'googletv' | 'androidtv' | 'xiaomi' | 'other' | 'firetv';
  /** Speed factor: 0 = instant (tests), 1 = prototype timings. */
  speed?: number;
  /** The launcher package the "installed" check should report (after install). */
  launcherPackage?: string;
  /**
   * Add the box the tool is running on to the results — what really happens on a television, where
   * the scan reaches this device's own adbd (`DeviceInfo.self`).
   */
  self?: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MockTransport implements AdbTransport {
  readonly kind = 'mock' as const;
  readonly supports: DebugPath[] = ['usb', 'tcp', 'wireless'];
  private readonly o: Required<MockOptions>;
  /** Mutable box state shared by every device this transport hands out. */
  readonly box: MockBoxState;

  constructor(o: MockOptions = {}) {
    this.o = { scenario: 'happy', box: 'xiaomi', speed: 1, launcherPackage: 'com.hotel.bnb.smart.hospitality.tv.launcher', self: false, ...o };
    this.box = new MockBoxState(this.o);
  }

  private wait(ms: number) {
    return this.o.speed ? sleep(ms * this.o.speed) : Promise.resolve();
  }

  devices(paths: readonly string[] = this.supports): DeviceInfo[] {
    const list: DeviceInfo[] = [];
    if (paths.includes('usb')) list.push({ id: '7F3A9C12B04E', name: 'Xiaomi Mi Box S', addr: 'USB · 7F3A9C12B04E', method: 'usb' });
    const gtv: DeviceInfo = { id: '192.168.1.73:5555', name: 'Chromecast with Google TV', addr: '192.168.1.73:5555', method: 'wireless', tls: true };
    const mi: DeviceInfo = { id: '192.168.1.50:5555', name: 'Xiaomi Mi Box S · MIBOX4', addr: '192.168.1.50:5555', method: 'tcp' };
    const net = this.o.box === 'googletv' ? [gtv, mi] : [mi, gtv];
    for (const d of net) if (paths.includes(d.method)) list.push(d);
    if (this.o.self && paths.includes('tcp')) {
      list.unshift({ id: '10.0.2.15:5555', name: this.box.props['ro.product.model'] ?? 'This box', addr: '10.0.2.15:5555', method: 'tcp', self: true });
    }
    return list;
  }

  async discover(opts: DiscoverOptions = {}): Promise<DeviceInfo[]> {
    await this.wait(1800);
    if (opts.signal?.aborted) return [];
    if (this.o.scenario === 'nodevices') throw new NoDevicesError(opts.paths?.includes('usb') && opts.paths.length === 1 ? 'usb-driver' : 'client-isolation');
    const list = this.devices(opts.paths ?? this.supports);
    for (const d of list) opts.onFound?.(d);
    return list;
  }

  /** Stands in for Chrome's chooser: one device, as if the person had granted it. */
  async pick(): Promise<DeviceInfo | null> {
    await this.wait(600);
    return this.devices(['usb'])[0] ?? null;
  }

  async connect(target: DeviceInfo | string, opts: ConnectOptions = {}): Promise<AdbDevice> {
    const info: DeviceInfo = typeof target === 'string' ? { id: target, name: target, addr: target, method: 'tcp' } : target;
    let attempt = 0;
    // The prototype: authorized on the 3rd retry in the happy path, never in `unauthorized`.
    for (;;) {
      attempt++;
      await this.wait(1500);
      if (opts.signal?.aborted) throw new Error('aborted');
      const ok = this.o.scenario !== 'unauthorized' && attempt >= 3;
      if (ok) break;
      opts.onUnauthorized?.(attempt);
      if (!opts.waitForAuth) throw new UnauthorizedError(attempt);
      if (attempt >= 40) throw new UnauthorizedError(attempt);
    }
    return new MockDevice(info, this.box, this.wait.bind(this));
  }

  async pair(_hostPort: string, code: string): Promise<void> {
    await this.wait(800);
    if (!/^\d{6}$/.test(code)) throw new Error('pairing failed: wrong code');
  }
}

export class MockBoxState {
  accounts: string[];
  packages: Map<string, number | null>;
  home: string;
  deviceOwner: string | null = null;
  adbEnabled = true;
  appops: string[] = [];
  grants: string[] = [];
  secure: Record<string, string> = {};
  /** `settings put global|system` — the Screen page writes font_scale, the clock reads ntp_server */
  settings: Record<string, string> = {};
  /** what `wm size` / `wm density` answer: the panel, and the override on top of it (null = none) */
  sizeOverride: string | null = null;
  densityOverride: number | null = null;
  broadcasts: string[] = [];
  disabled: string[] = [];
  readonly stock: string;

  constructor(private readonly o: Required<MockOptions>) {
    this.accounts = o.scenario === 'accounts' ? ['someone@gmail.com'] : [];
    this.stock = o.box === 'googletv' ? 'com.google.android.apps.tv.launcherx' : o.box === 'firetv' ? 'com.amazon.tv.launcher' : 'com.google.android.tvlauncher';
    this.packages = new Map([
      [this.stock, 1],
      ['com.android.settings', 1],
      // What a television actually has in it. Three packages made every list on every page look
      // empty; this is the ordinary bag an Android TV box ships with, so the Debloat judgement, the
      // backup list and the free-space page can be walked without a box in hand.
      ['com.google.android.youtube.tv', 1],
      ['com.google.android.katniss', 1],
      ['com.google.android.apps.mediashell', 1],
      ['com.google.android.tvrecommendations', 1],
      ['com.google.android.backdrop', 1],
      ['com.google.android.tts', 1],
      ['com.google.android.videos', 1],
      ['com.google.android.play.games', 1],
      ['com.netflix.ninja', 1],
      ['com.spotify.tv.android', 1],
      ...(this.o.box === 'xiaomi'
        ? ([
            ['com.xiaomi.mitv.tvrecommendation', 1],
            ['com.xiaomi.mitv.smartshare', 1],
            ['com.xiaomi.mitv.payment', 1],
          ] as Array<[string, number | null]>)
        : []),
      ...(this.o.box === 'firetv'
        ? ([
            ['com.amazon.venezia', 1],
            ['com.amazon.tv.forcedotaupdater.v2', 1],
            ['com.amazon.tv.alexadetection', 1],
          ] as Array<[string, number | null]>)
        : []),
    ]);
    this.home = `${this.stock}/.MainActivity`;
  }

  /**
   * What the panel IS, before any override. The two newer boxes of the set are 4K and the two old
   * ones are 1080p — which is the whole point of the Screen page: the 4K box is the one that gets
   * quicker when it is told to draw 1080p.
   */
  get physicalSize(): string {
    return this.o.box === 'googletv' || this.o.box === 'androidtv' ? '3840x2160' : '1920x1080';
  }
  get physicalDensity(): number {
    return this.o.box === 'googletv' || this.o.box === 'androidtv' ? 640 : 320;
  }
  get props(): Record<string, string> {
    const byBox = {
      googletv: { model: 'Chromecast', manufacturer: 'Google', brand: 'google', device: 'sabrina', release: '12', sdk: '31' },
      androidtv: { model: 'ADT-3', manufacturer: 'Askey', brand: 'Android', device: 'adt3', release: '11', sdk: '30' },
      xiaomi: { model: 'MIBOX4', manufacturer: 'Xiaomi', brand: 'Xiaomi', device: 'once', release: '9', sdk: '28' },
      other: { model: 'X96 Max', manufacturer: 'Amlogic', brand: 'Amlogic', device: 'p212', release: '9', sdk: '28' },
      firetv: { model: 'AFTKA', manufacturer: 'Amazon', brand: 'Amazon', device: 'kara', release: '9', sdk: '28' },
    }[this.o.box];
    return {
      'ro.product.model': byBox.model,
      'ro.product.manufacturer': byBox.manufacturer,
      'ro.product.brand': byBox.brand,
      'ro.product.device': byBox.device,
      'ro.serialno': '7F3A9C12B04E',
      'ro.build.version.release': byBox.release,
      'ro.build.version.sdk': byBox.sdk,
      'ro.build.characteristics': 'tv',
    };
  }

  /** A small, faithful `adb shell` for the commands the tool actually uses. */
  run(cmd: string): string {
    const c = cmd.trim().replace(/\s+/g, ' ');
    const a = c.split(' ');
    if (c === 'getprop') return Object.entries(this.props).map(([k, v]) => `[${k}]: [${v}]`).join('\n') + '\n';
    if (a[0] === 'getprop' && a[1]) return (this.props[a[1]] ?? '') + '\n';
    if (c === 'dumpsys account') return `User UserInfo{0:Owner:c13}:\n  Accounts: ${this.accounts.length}\n${this.accounts.map((n) => `    Account {name=${n}, type=com.google}`).join('\n')}\n`;
    if (c.startsWith('df')) return 'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/block/dm-0 5806852 2214436 3576032 39% /data\n';
    if (c.startsWith('pm list packages')) {
      // Faithful to a real box: `-d` is what is switched OFF, `-3` is what somebody installed
      // themselves. The mock used to ignore both and answer everything, which made every Debloat
      // row read "off" and put system apps in the backup list.
      const preinstalled = /^(com\.google\.|com\.android\.|com\.xiaomi\.|com\.mitv\.|com\.amazon\.|android$)/;
      let list = [...this.packages].filter(([p]) => (c.includes(' -d') ? this.disabled.includes(p) : true));
      if (c.includes(' -3')) list = list.filter(([p]) => !preinstalled.test(p) && p !== this.stock);
      if (c.includes(' -e')) list = list.filter(([p]) => !this.disabled.includes(p));
      return list.map(([p, v]) => `package:${p}${c.includes('--show-versioncode') && v !== null ? ` versionCode:${v}` : ''}`).join('\n') + '\n';
    }
    if (c === 'settings get global development_settings_enabled') return '1\n';
    if (c === 'settings get global adb_enabled') return `${this.adbEnabled ? 1 : 0}\n`;
    if (a[0] === 'settings' && a[1] === 'get' && a[3]) return (this.settings[`${a[2]}.${a[3]}`] ?? 'null') + '\n';
    if (a[0] === 'settings' && a[1] === 'put' && (a[2] === 'global' || a[2] === 'system') && a[3] && c !== 'settings put global adb_enabled 0') {
      this.settings[`${a[2]}.${a[3]}`] = a.slice(4).join(' ');
      return '';
    }
    if (c.startsWith('settings put secure ')) {
      this.secure[a[3]!] = a.slice(4).join(' ');
      return '';
    }
    if (c === 'settings put global adb_enabled 0') {
      this.adbEnabled = false;
      return '';
    }
    if (c.startsWith('cmd package resolve-activity')) {
      // Faithful to a real box (measured on an Android TV 14 emulator): WITHOUT the MAIN action the
      // resolver answers "No activity found". The tool shipped that mistake for a day because this
      // mock was lenient — a mock that is kinder than the device hides exactly this class of bug.
      if (!c.includes('-a android.intent.action.MAIN')) return 'No activity found\n';
      // ΚΑΙ ΜΕ ΠΛΗΡΕΣ ΟΝΟΜΑ ΚΛΑΣΗΣ, όπως το αληθινό box: εμείς ζητάμε `com.x/.Main`, ο resolver
      // απαντά `com.x/com.x.Main`. Όσο ο mock επέστρεφε ό,τι του δώσαμε, η επαλήθευση του HOME
      // περνούσε εδώ και έσκαγε στη συσκευή με «το box δεν δέχτηκε την αλλαγή home».
      const [pkg, cls] = this.home.split('/');
      return `${pkg}/${cls?.startsWith('.') ? pkg + cls : cls}\n`;
    }
    // Which apps on this box can be the home screen — the list the launcher picker is built from.
    if (c.startsWith('cmd package query-activities')) {
      const homes = [...new Set([this.stock, this.home.split('/')[0]!])].filter((p) => this.packages.has(p));
      return homes.map((p) => `  Activity #0:\n      name=${p}.MainActivity\n      packageName=${p}`).join('\n') + '\n';
    }
    if (c.startsWith('cmd package set-home-activity ')) {
      const comp = a[3]!;
      const pkg = comp.split('/')[0]!;
      if (!this.packages.has(pkg)) return `Error: Component ${comp} not found\n`;
      this.home = comp;
      return '';
    }
    // One package's record: version, who installed it, when. The kiosk app screen reads these
    // three and shows nothing it did not get an answer for.
    if (a[0] === 'dumpsys' && a[1] === 'package' && a[2]) {
      if (!this.packages.has(a[2])) return `Unable to find package: ${a[2]}\n`;
      const play = !/^com\.(viggo|smarthoteltv|zonesage)/.test(a[2]);
      return `Packages:\n  Package [${a[2]}]:\n    versionName=${this.packages.get(a[2]) === null ? '1.0' : '3.4.2'}\n    installerPackageName=${play ? 'com.android.vending' : 'null'}\n    firstInstallTime=2026-08-14 21:03:11\n`;
    }
    if (c === 'dumpsys device_policy') return this.deviceOwner ? `Current Device Policy Manager state:\n  Device Owner: \n    admin=ComponentInfo{${this.deviceOwner}}\n` : 'Current Device Policy Manager state:\n  Enabled Device Admins (User 0, provisioningState: 0):\n';
    if (c.startsWith('dpm set-device-owner ')) {
      // As on a real box: the admin component must exist (the APK installed) and no account may be present.
      const pkg = a[2]!.split('/')[0]!;
      if (!this.packages.has(pkg)) return `java.lang.IllegalArgumentException: Unknown admin: ComponentInfo{${a[2]}}\n`;
      if (this.accounts.length) return 'java.lang.IllegalStateException: Not allowed to set the device owner because there are already some accounts on the device\n';
      this.deviceOwner = a[2]!;
      return `Success: Device owner set to package ComponentInfo{${a[2]}}\nActive admin set to component {${a[2]}}\n`;
    }
    if (c.startsWith('appops set ')) {
      this.appops.push(`${a[2]} ${a[3]}`);
      return '';
    }
    if (c.startsWith('pm grant ')) {
      this.grants.push(`${a[2]} ${a[3]}`);
      return '';
    }
    if (c.startsWith('cmd notification allow_listener ')) return '';
    if (c.startsWith('am broadcast ')) {
      this.broadcasts.push(c);
      return 'Broadcasting: Intent { … }\nBroadcast completed: result=0\n';
    }
    if (c.startsWith('am start ')) return 'Starting: Intent { … }\n';
    if (c.startsWith('pm disable-user ')) {
      const p = a[a.length - 1]!;
      this.disabled.push(p);
      return `Package ${p} new state: disabled\n`;
    }
    if (c.startsWith('pm enable ')) return `Package ${a[2]} new state: enabled\n`;
    if (c.startsWith('input keyevent')) return '';
    if (c.startsWith('input text ')) return '';
    // Free space: the trim answers nothing on a real box, and `pm clear` answers Success.
    if (c.startsWith('pm trim-caches')) return '';
    // Where an app lives — the first half of a backup. A real box answers one line per APK, and
    // a modern app is a base plus its splits.
    if (a[0] === 'pm' && a[1] === 'path' && a[2]) {
      if (!this.packages.has(a[2])) return '';
      return `package:/data/app/~~${a[2]}/base.apk\n`;
    }
    if (c.startsWith('pm clear ')) return 'Success\n';
    // The Screen page: a panel with an override on top of it, and both `reset`s.
    if (c === 'wm size') return `Physical size: ${this.physicalSize}\n` + (this.sizeOverride ? `Override size: ${this.sizeOverride}\n` : '');
    if (c.startsWith('wm size ')) {
      this.sizeOverride = a[2] === 'reset' ? null : (a[2] ?? null);
      return '';
    }
    if (c === 'wm density') return `Physical density: ${this.physicalDensity}\n` + (this.densityOverride ? `Override density: ${this.densityOverride}\n` : '');
    if (c.startsWith('wm density ')) {
      this.densityOverride = a[2] === 'reset' ? null : Number(a[2]) || null;
      return '';
    }
    // The Device page: the clock this box thinks it is, and how long it has been up.
    if (c === 'date' || c.startsWith('date +')) return `${Math.floor(Date.now() / 1000)}\n`;
    if (c === 'uptime') return ' up 3 days, 4:21, 0 users, load average: 1.20 0.98 0.81\n';
    if (c.startsWith('screencap')) return '';
    if (c === 'reboot') return '';
    if (c.startsWith('echo ')) return c.slice(5) + '\n';
    return `/system/bin/sh: ${a[0]}: inaccessible or not found\n`;
  }
}

class MockDevice implements AdbDevice {
  readonly serial = '7F3A9C12B04E';
  constructor(
    readonly info: DeviceInfo,
    private readonly box: MockBoxState,
    private readonly wait: (ms: number) => Promise<void>,
  ) {}
  async authState(): Promise<AuthState> {
    return 'authorized';
  }
  async shell(cmd: string): Promise<string> {
    await this.wait(120);
    return this.box.run(cmd);
  }
  async install(apk: ReadableStream<Uint8Array>, opts: { size?: number; name?: string } = {}): Promise<string> {
    let bytes = 0;
    const reader = apk.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
    }
    await this.wait(900);
    if (opts.name) this.box.packages.set(opts.name, (this.box.packages.get(opts.name) ?? 0)! + 1);
    return `Performing Streamed Install\nSuccess (${bytes} bytes)\n`;
  }
  /** A file of plausible size, so the Backup page can be walked end to end with no box. */
  async pull(path: string): Promise<Uint8Array> {
    await this.wait(400);
    const n = 1024 * 1024 * (path.includes('base.apk') ? 12 : 1);
    return new Uint8Array(n);
  }

  async screencap(): Promise<Uint8Array> {
    await this.wait(300);
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // "PNG" — the UI shows a placeholder for the mock
  }
  async reboot(): Promise<void> {
    await this.wait(200);
  }
  async close(): Promise<void> {}
}
