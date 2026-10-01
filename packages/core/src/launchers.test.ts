import { describe, expect, it } from 'vitest';
import { hotelTarget, loadBrand } from './brand.js';
import { buildCheck, CHECK_COMMANDS, parseHomeApps } from './check.js';
import { classifyCommand } from './gate.js';
import { KNOWN_LAUNCHERS, LAUNCHER_SEARCH, launcherRows, playIntent, playSearchIntent } from './launchers.js';
import { ACCOUNTS_INTENT, HOSPITALITY_APPS, hospitalityRows } from './hospitality.js';
import { renderCommand, STEPS, stepsFor, type StepContext } from './steps.js';

const launcher = loadBrand('launcher');
const kiosk = hotelTarget(); // the hotel TARGET (the kiosk brand is gone, 27/9/2026)

// Real output of `cmd package query-activities --components …` on an Android TV 14 emulator (21/9).
const COMPONENTS = `com.google.android.tvlauncher/.MainActivity
com.android.tv.settings/.system.FallbackHome
`;

// The same query without `--components`, which is what older boxes answer.
const VERBOSE = `2 activities found:
  Activity #0:
    priority=2 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=true
    ActivityInfo:
      name=com.google.android.tvlauncher.MainActivity
      packageName=com.google.android.tvlauncher
      enabled=true exported=true
      ApplicationInfo:
        name=com.google.android.tvlauncher.application.TvLauncherApplication
        packageName=com.google.android.tvlauncher
`;

describe('parseHomeApps', () => {
  it('reads the component list', () => {
    expect(parseHomeApps(COMPONENTS)).toEqual([
      { package: 'com.google.android.tvlauncher', component: 'com.google.android.tvlauncher/.MainActivity' },
      { package: 'com.android.tv.settings', component: 'com.android.tv.settings/.system.FallbackHome' },
    ]);
  });

  it('falls back to the verbose format when --components is not supported', () => {
    expect(parseHomeApps(VERBOSE)).toEqual([{ package: 'com.google.android.tvlauncher', component: 'com.google.android.tvlauncher/.MainActivity' }]);
  });

  it('invents nothing from an error', () => {
    expect(parseHomeApps('Unknown command: query-activities')).toEqual([]);
  });
});

describe('launcherRows', () => {
  const check = (over: Partial<Parameters<typeof buildCheck>[0]> = {}) =>
    buildCheck({ packages: 'package:com.spocky.projengmenu versionCode:120\n', homeApps: COMPONENTS + 'com.spocky.projengmenu/.MainActivity\n', home: 'com.google.android.tvlauncher/.MainActivity', ...over }, launcher.launcherPackage);

  it('puts ours first, then the names we know, then what the box found', () => {
    const rows = launcherRows(launcher, check());
    expect(rows[0]!.ours).toBe(true);
    expect(rows[0]!.installed).toBe(false);
    expect(rows.map((r) => r.id).slice(1, 1 + KNOWN_LAUNCHERS.length)).toEqual(KNOWN_LAUNCHERS.map((k) => k.id));
    expect(rows.at(-1)!.kind).toBe('ask');
  });

  it('marks what is installed, with the component the box reported', () => {
    const p = launcherRows(launcher, check()).find((r) => r.id === 'projectivy')!;
    expect(p.installed).toBe(true);
    expect(p.component).toBe('com.spocky.projengmenu/.MainActivity');
  });

  it('marks the launcher this box opens on HOME today, and keeps the stock one as a row', () => {
    const stock = launcherRows(launcher, check()).find((r) => r.package === 'com.google.android.tvlauncher')!;
    expect(stock.kind).toBe('found');
    expect(stock.current).toBe(true);
  });

  it('never offers the boot stub as a launcher', () => {
    expect(launcherRows(launcher, check()).some((r) => r.package.startsWith('com.android.tv.settings'))).toBe(false);
  });

  it('offers no direct download for anyone else (we never host their APK)', () => {
    // the field itself is gone (23/9): nobody else's APK can be fetched, by construction
    expect(KNOWN_LAUNCHERS.every((k) => !('direct' in k))).toBe(true);
  });

  it('works before anything has been read from the box', () => {
    const rows = launcherRows(kiosk, null);
    expect(rows.every((r) => r.kind === 'ask' || !r.installed)).toBe(true);
    expect(rows[0]!.package).toBe(kiosk.launcherPackage);
  });
});

describe('the picked launcher reaches the command', () => {
  const ctx = (over: Partial<StepContext> = {}): StepContext => ({ brand: launcher, profile: 'open', lang: 'en', stockLauncher: 'com.google.android.tvlauncher', ...over });
  const setHome = STEPS.find((s) => s.id === 'home.setHomeActivity')!;

  it('defaults to our own launcher', () => {
    expect(renderCommand(setHome, ctx())).toBe('cmd package set-home-activity com.premium.tv.launcher.ui/.LauncherActivity');
  });

  it('aims at the launcher the user picked', () => {
    expect(renderCommand(setHome, ctx({ homeTarget: 'com.spocky.projengmenu/.MainActivity' }))).toBe('cmd package set-home-activity com.spocky.projengmenu/.MainActivity');
  });

  it('"let the box ask" disables the stock launcher and stops there', () => {
    const ids = stepsFor({ task: 'launcher', homeMethod: 'disable-stock' }, ctx({ homeAsk: true })).map((s) => s.id);
    expect(ids).toEqual(['home.disableStock']);
    expect(STEPS.find((s) => s.id === 'home.disableStock')!.humanAfter).toBe('pickLauncher');
  });

  it('without it, the silent chain still runs for this brand', () => {
    const ids = stepsFor({ task: 'launcher', homeMethod: 'disable-stock' }, ctx()).map((s) => s.id);
    expect(ids).toEqual(['home.disableStockSilent', 'home.setHomeActivity', 'home.verify']);
  });

  it('the kiosk broadcast is skipped when the home is not ours', () => {
    const k = (over: Partial<StepContext>): StepContext => ({ brand: kiosk, profile: 'kiosk', lang: 'en', stockLauncher: null, ...over });
    expect(stepsFor({ task: 'launcher', homeMethod: 'device-owner' }, k({})).map((s) => s.id)).toEqual(['home.persistent']);
    expect(stepsFor({ task: 'launcher', homeMethod: 'device-owner' }, k({ homeTarget: 'com.spocky.projengmenu/.MainActivity' }))).toEqual([]);
  });
});

describe('the gate lets the picker read the box', () => {
  it('query-activities runs without asking anyone (it only reads)', () => {
    // It hung the whole check once: the command was not in the allowlist, so the engine sat waiting
    // for a confirmation the check screen never asks for.
    expect(classifyCommand(CHECK_COMMANDS.homeApps).verdict).toBe('auto');
  });
  it('opening a Play listing needs the click that asked for it, and nothing more', () => {
    // `am start -d <uri>` stays a `confirm` on purpose — a deep link is not a read. In the UI the
    // user's own press IS the confirmation (userInitiated), so it runs, and the report says why.
    const d = classifyCommand(playIntent('com.klevico.monet'));
    expect(d.verdict).toBe('confirm');
    expect(d.reason).toBe('am start with extras');
    expect(d.verdict).not.toBe('blocked');
  });
  it('searching Play passes the same gate as a listing', () => {
    // The search road exists for "another launcher" (Jim, 29/9). If the gate treated it differently
    // the button would sit there waiting for a confirmation the screen never asks for.
    const d = classifyCommand(playSearchIntent(LAUNCHER_SEARCH));
    expect(d.verdict).toBe('confirm');
    expect(d.verdict).not.toBe('blocked');
  });
});

describe('the box that is the tool', () => {
  it('does not reboot itself in the automatic run', () => {
    // Measured on the emulator: the reboot test restarted the tool half way through the run, and
    // everything after it — handover, the report, the screen saying what happened — was lost.
    const ctx = (over: Partial<StepContext> = {}): StepContext => ({ brand: launcher, profile: 'open', lang: 'en', stockLauncher: 'com.google.android.tvlauncher', ...over });
    expect(stepsFor({ task: 'test' }, ctx()).map((s) => s.id)).toContain('test.reboot');
    expect(stepsFor({ task: 'test' }, ctx({ selfBox: true })).map((s) => s.id)).not.toContain('test.reboot');
  });
});

describe('playSearchIntent', () => {
  it('encodes the query and carries no shell metacharacter', () => {
    const cmd = playSearchIntent(LAUNCHER_SEARCH);
    expect(cmd).toBe('am start -a android.intent.action.VIEW -d market://search?q=android%20tv%20launcher');
    // the box runs this in a shell: one `&` would split the command in two
    expect(cmd).not.toMatch(/[;&|`$]/);
  });
});

describe('playIntent', () => {
  it('opens the listing on the box, with nothing the gate has to think about', () => {
    expect(playIntent('com.klevico.monet')).toBe('am start -a android.intent.action.VIEW -d market://details?id=com.klevico.monet');
    expect(playIntent('x')).not.toMatch(/[;&|`$]/);
  });
});

describe("the other target's launcher (the hotel launcher on the home road)", () => {
  it('is never offered as a row, even when the box reports it as a home app', () => {
    const brand = loadBrand('launcher');
    const hotel = hotelTarget().launcherPackage;
    const check = buildCheck({ homeApps: `${hotel}/.LauncherActivity
com.google.android.tvlauncher/.MainActivity
`, packages: `package:${hotel}
package:com.google.android.tvlauncher
` }, brand.launcherPackage);
    const rows = launcherRows(brand, check);
    expect(rows.some((r) => r.package === hotel)).toBe(false);
    expect(rows.some((r) => r.package === 'com.google.android.tvlauncher')).toBe(true);
  });
});

describe('hospitalityRows (the kiosk picker)', () => {
  const hotel = hotelTarget().launcherPackage;
  const box = (over: Partial<Parameters<typeof buildCheck>[0]> = {}) =>
    buildCheck({ packages: `package:${hotel} versionCode:5\npackage:nz.co.unix.iptv versionCode:1\n`, homeApps: COMPONENTS + `${hotel}/.LauncherActivity\ncom.acme.hoteltv/.Main\ncom.premium.tv.launcher.ui/.LauncherActivity\n`, home: 'com.google.android.tvlauncher/.MainActivity', accounts: 'Accounts: 1\n  Account {name=someone@gmail.com, type=com.google}\n', ...over }, hotel);

  it('puts the hotel launcher first, in every edition, and marks it ours only in its own', () => {
    const k = hospitalityRows(kiosk, box())[0]!;
    const l = hospitalityRows(launcher, box())[0]!;
    expect(k.package).toBe(hotel);
    expect(l.package).toBe(hotel);
    expect(k.ours).toBe(true);
    expect(l.ours).toBe(false);
    expect(l.family).toBe(true); // the tool may still fetch its APK: it is ours
    expect(l.installed).toBe(true);
  });

  it('names the hospitality apps with their Play packages, installed or not', () => {
    const rows = hospitalityRows(launcher, box());
    const b = rows.find((r) => r.id === 'betterstr')!;
    expect(b.package).toBe('nz.co.unix.iptv');
    expect(b.installed).toBe(true);
    expect(b.play).toBe(true);
    expect(rows.find((r) => r.id === 'welcome')!.installed).toBe(false);
    expect(HOSPITALITY_APPS.every((a) => a.package && a.tint)).toBe(true);
  });

  it('offers what else the box can open on HOME, minus the stock launcher and the consumer launcher', () => {
    const pk = hospitalityRows(launcher, box()).map((r) => r.package);
    expect(pk).toContain('com.acme.hoteltv');
    expect(pk).not.toContain('com.google.android.tvlauncher');
    expect(pk).not.toContain('com.premium.tv.launcher.ui');
    expect(pk).not.toContain('com.android.tv.settings');
    expect(hospitalityRows(launcher, box()).some((r) => r.kind === 'ask')).toBe(false); // a locked box asks nobody
  });

  it('works before anything has been read from the box', () => {
    const rows = hospitalityRows(launcher, null);
    expect(rows[0]!.package).toBe(hotel);
    expect(rows.every((r) => !r.installed)).toBe(true);
  });

  it('opens Accounts on the TV by intent — no adb removes a Google account without root', () => {
    expect(ACCOUNTS_INTENT).toBe('am start -a android.settings.SYNC_SETTINGS');
    expect(classifyCommand(ACCOUNTS_INTENT).verdict).not.toBe('blocked');
  });
});
