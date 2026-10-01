import { describe, expect, it } from 'vitest';
import { loadBrand } from '@tvlm/core';
import { runCli } from './main.js';
import type { Io } from './session.js';

function capture(): { io: Partial<Io>; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s), isTTY: false, ask: async () => '' }, out, err };
}

describe('tvlm (mock transport)', () => {
  it('check --mock --json prints one BoxCheck object', async () => {
    const c = capture();
    const code = await runCli(['check', '--mock', '--json', '--target', 'hotel'], c.io);
    expect(code).toBe(0);
    expect(c.out).toHaveLength(1);
    const j = JSON.parse(c.out[0]!);
    expect(j).toMatchObject({ model: 'MIBOX4', manufacturer: 'Xiaomi', platform: 'androidtv', isTv: true, launcherInstalled: false, accounts: [], adbEnabled: true, developerOptions: true, brand: 'hotel' });
    expect(typeof j.sdk).toBe('number');
    expect(Array.isArray(j.installedPackages)).toBe(true);
    expect(j.stockLauncher).toBe('com.google.android.tvlauncher');
  });

  it('check --mock prints a human table', async () => {
    const c = capture();
    expect(await runCli(['check', '--mock', '--box', 'googletv'], c.io)).toBe(0);
    expect(c.out.join('\n')).toMatch(/platform\s+googletv/);
    expect(c.out.join('\n')).toMatch(/launcher\s+not installed/);
  });

  it('provision --mock --profile kiosk --yes completes every task', async () => {
    const c = capture();
    const code = await runCli(['provision', '--mock', '--target', 'hotel', '--profile', 'kiosk', '--yes', '--json'], c.io);
    expect(code).toBe(0);
    const j = JSON.parse(c.out.at(-1)!);
    expect(j.ok).toBe(true);
    expect(j.tasks).toMatchObject({ profile: true, install: true, launcher: true, configure: true, test: true, handover: true });
    // the reboot is the one thing the run cannot do alone: it asks for a pair of eyes on the TV
    expect(j.humanActions.map((h: { what: string }) => h.what)).toContain('reboot');
  });

  it('provision --mock accounts: kiosk refused, exit 1', async () => {
    const c = capture();
    const code = await runCli(['provision', '--mock', 'accounts', '--target', 'hotel', '--profile', 'kiosk', '--yes', '--json'], c.io);
    expect(code).toBe(1);
    const j = JSON.parse(c.out.at(-1)!);
    expect(j.ok).toBe(false);
    // core order: install first (the launcher must exist before dpm/PROVISION), then profile is refused
    expect(j.tasks.install).toBe(true);
    expect(j.tasks.profile).toBe(false);
    expect(j.tasks.launcher).toBeNull();
  });

  it('provision --stop-before test keeps the session alive (no reboot)', async () => {
    const c = capture();
    expect(await runCli(['provision', '--mock', '--target', 'hotel', '--yes', '--json', '--stop-before', 'test'], c.io)).toBe(0);
    const j = JSON.parse(c.out.at(-1)!);
    expect(j.tasks.test).toBeNull();
    expect(j.tasks.configure).toBe(true);
  });

  it('the launcher target: the profile task is only the open broadcast; install → launcher', async () => {
    const c = capture();
    expect(await runCli(['provision', '--mock', '--brand', 'launcher', '--yes', '--json'], c.io)).toBe(0);
    const j = JSON.parse(c.out.at(-1)!);
    // PLUI's profile task is only the PROVISION broadcast (open profile) — never device owner
    expect(j.tasks.install).toBe(true);
    expect(j.tasks.profile).toBe(true);
    expect(j.tasks.launcher).toBe(true);
    // one product (27/9): the tool MAY lock a box — what keeps PLUI out of the kiosk profile is
    // PLUI itself, which has no device-admin receiver
    expect(loadBrand('launcher').never).not.toContain('kiosk');
    expect(loadBrand('launcher').launcherDeviceAdminReceiver).toBeNull();
  });

  it('discover --mock --json lists the three prototype boxes; nodevices → []', async () => {
    const c = capture();
    expect(await runCli(['discover', '--mock', '--json'], c.io)).toBe(0);
    const list = JSON.parse(c.out[0]!);
    expect(list.map((d: { method: string }) => d.method)).toEqual(['usb', 'tcp', 'wireless']);
    const n = capture();
    expect(await runCli(['discover', '--mock', 'nodevices', '--json'], n.io)).toBe(0);
    expect(JSON.parse(n.out[0]!)).toEqual([]);
  });

  it('unauthorized scenario: connect fails with a JSON error and exit 1', async () => {
    const c = capture();
    const code = await runCli(['check', '--mock', 'unauthorized', '--json', '--timeout', '1'], c.io);
    expect(code).toBe(1);
    expect(JSON.parse(c.out[0]!).kind).toBe('unauthorized');
  }, 20_000);

  it('non-TTY without --yes: confirm-level steps are skipped, not run', async () => {
    const c = capture();
    const code = await runCli(['launcher', '--mock', '--json'], c.io);
    expect(code).toBe(1);
    expect(c.err.some((l) => /skipped \(needs confirmation/.test(l))).toBe(true);
  });

  it('usage errors exit 2', async () => {
    const c = capture();
    expect(await runCli(['nope'], c.io)).toBe(2);
    expect(await runCli(['link', '--mock', '--json'], c.io)).toBe(2);
  });
});
