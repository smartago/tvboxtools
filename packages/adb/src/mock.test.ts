import { describe, expect, it } from 'vitest';
import { hotelTarget, loadBrand, ProvisionEngine, SessionReport, TOOL_VERSION, type Manifest } from '@tvlm/core';
import { MockTransport, NoDevicesError, UnauthorizedError } from './index.js';

const report = () => new SessionReport({ brand: 'hotel', tool: 'tvlm', version: TOOL_VERSION, startedAt: Date.now() });

describe('mock transport', () => {
  it('discovers per scenario', async () => {
    const t = new MockTransport({ speed: 0 });
    const list = await t.discover();
    expect(list.map((d) => d.method)).toEqual(['usb', 'tcp', 'wireless']);
    await expect(new MockTransport({ speed: 0, scenario: 'nodevices' }).discover()).rejects.toBeInstanceOf(NoDevicesError);
  });

  it('authorizes on the third try, never in the unauthorized scenario', async () => {
    const t = new MockTransport({ speed: 0 });
    const tries: number[] = [];
    const d = await t.connect('192.168.1.50:5555', { waitForAuth: true, onUnauthorized: (n) => tries.push(n) });
    expect(tries).toEqual([1, 2]);
    expect(d.serial).toBe('7F3A9C12B04E');
    await expect(new MockTransport({ speed: 0, scenario: 'unauthorized' }).connect('x', { waitForAuth: false })).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('runs the whole hotel road (kiosk profile) through the engine', async () => {
    const t = new MockTransport({ speed: 0 });
    const dev = await t.connect('192.168.1.50:5555', { waitForAuth: true });
    const brand = hotelTarget();
    const r = report();
    const engine = new ProvisionEngine({
      brand,
      shell: dev,
      report: r,
      confirm: async () => true,
      human: async () => {},
      fetchApk: async () => ({ stream: new Blob([new Uint8Array(10)]).stream(), size: 10 }),
      // A real host hashes the whole stream; a tee branch must be CONSUMED, not cancelled —
      // `cancel()` on one tee branch only settles once the other branch is cancelled too.
      sha256: async (s) => {
        const r = s.getReader();
        while (!(await r.read()).done);
        return 'a'.repeat(64);
      },
    });
    const before = await engine.check();
    expect(before.launcherInstalled).toBe(false);
    expect(before.accounts).toEqual([]);
    expect(before.platform).toBe('androidtv');

    const manifest: Manifest = {
      schema: 1,
      tool: { version: '0.1.0', minVersion: '0.1.0', downloads: {}, sha256: {} },
      apps: [{ pkg: brand.launcherPackage, name: 'HOTELTV', url: 'u', sha256: 'a'.repeat(64), versionCode: 1002, required: true, role: ['owner', 'reseller'] }],
    };
    const res = await engine.autoRun({ brand, profile: 'kiosk', lang: 'en', stockLauncher: before.stockLauncher, debugOff: true }, manifest, 'reseller');
    expect(res).toMatchObject({ profile: true, install: true, launcher: true, configure: true, test: true, handover: true });

    const after = await engine.check();
    expect(after.launcherInstalled).toBe(true);
    expect(after.deviceOwner).toBe(brand.launcherDeviceAdminReceiver);
    expect(after.currentHome).toBe(brand.launcherHomeComponent);
    expect(after.adbEnabled).toBe(false);
    expect(t.box.broadcasts.some((b) => b.includes('.PROVISION') && b.includes('--es profile kiosk'))).toBe(true);
    // install ran before dpm (the mock refuses an unknown admin, as a real box does)
    const cmds = r.entries.filter((e) => e.kind === 'cmd').map((e) => e.text);
    expect(cmds.findIndex((c) => c.startsWith('install -r'))).toBeLessThan(cmds.findIndex((c) => c.startsWith('dpm set-device-owner')));
    expect(t.box.secure['enabled_accessibility_services']).toBeUndefined(); // kiosk: no accessibility
    expect(r.entries.filter((e) => e.kind === 'cmd').length).toBeGreaterThan(10);
    expect(r.toText()).toContain('dpm set-device-owner');
  });

  it('accounts scenario: device owner refused, as on a real box', async () => {
    const t = new MockTransport({ speed: 0, scenario: 'accounts' });
    const dev = await t.connect('x', { waitForAuth: true });
    const brand = hotelTarget();
    const engine = new ProvisionEngine({ brand, shell: dev, report: report(), confirm: async () => true });
    const c = await engine.check();
    expect(c.accounts).toEqual(['someone@gmail.com']);
    const ok = await engine.runTask('profile', { brand, profile: 'kiosk', lang: 'el', stockLauncher: c.stockLauncher });
    expect(ok).toBe(false);
  });

  it('PLUI flow: no profile task, disable stock + set home', async () => {
    const t = new MockTransport({ speed: 0, box: 'googletv', launcherPackage: 'com.premium.tv.launcher.ui' });
    const dev = await t.connect('x', { waitForAuth: true });
    const brand = loadBrand('launcher');
    const engine = new ProvisionEngine({ brand, shell: dev, report: report(), confirm: async () => true, human: async () => {} });
    const c = await engine.check();
    expect(c.platform).toBe('googletv');
    t.box.packages.set(brand.launcherPackage, 284);
    const ok = await engine.runTask('launcher', { brand, profile: 'open', lang: 'en', stockLauncher: c.stockLauncher });
    expect(ok).toBe(true);
    expect(t.box.disabled).toEqual(['com.google.android.apps.tv.launcherx']);
    // the default PLUI method already set home by command — the TV was never asked
    expect(t.box.home).toBe(brand.launcherHomeComponent);
  });
});
