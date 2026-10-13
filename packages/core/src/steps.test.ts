import { describe, expect, it } from 'vitest';
import { hotelTarget, loadBrand } from './brand.js';
import { autoRunOrder, expandComponent, renderCommand, STEPS, stepSucceeded, stepsFor, type StepContext } from './steps.js';
import { classifyCommand } from './gate.js';

const kiosk = hotelTarget(); // the hotel TARGET
const launcher = loadBrand('launcher');
const ctx = (over: Partial<StepContext> = {}): StepContext => ({ brand: kiosk, profile: 'kiosk', lang: 'en', stockLauncher: 'com.google.android.tvlauncher', ...over });

describe('steps', () => {
  it('renders the real component names, not the prototype placeholders', () => {
    const [dpc] = stepsFor({ task: 'profile' }, ctx());
    expect(renderCommand(dpc!, ctx())).toBe('dpm set-device-owner com.hotel.bnb.smart.hospitality.tv.launcher/com.premium.tv.launcher.ui.hotel.HotelDeviceAdminReceiver');
    // the kiosk road disables the stock launcher first, so the set step is found by id
    const setHome = stepsFor({ task: 'launcher', homeMethod: 'set-home-activity' }, ctx()).find((s) => s.id === 'home.setHomeActivity');
    expect(renderCommand(setHome!, ctx())).toBe('cmd package set-home-activity com.hotel.bnb.smart.hospitality.tv.launcher/com.premium.tv.launcher.ui.LauncherActivity');
  });

  it('PLUI has no kiosk profile: no device-admin receiver, no device-owner steps', () => {
    expect(stepsFor({ task: 'profile' }, ctx({ brand: launcher, profile: 'kiosk' }))).toEqual([]);
    const open = stepsFor({ task: 'profile' }, ctx({ brand: launcher, profile: 'open' }));
    expect(open.map((s) => s.id)).toEqual(['profile.broadcast']);
    expect(stepsFor({ task: 'launcher', homeMethod: 'device-owner' }, ctx({ brand: launcher, profile: 'open' }))).toEqual([]);
  });

  it('PLUI default launcher = disable stock AND set-home-activity, no question on the TV (§14)', () => {
    expect(launcher.homeMethods[0]).toBe('disable-stock');
    const c = ctx({ brand: launcher, profile: 'open' });
    const s = stepsFor({ task: 'launcher' }, c);
    expect(s.map((x) => x.id)).toEqual(['home.disableStockSilent', 'home.setHomeActivity', 'home.verify']);
    expect(s[0]!.humanAfter).toBeUndefined();
    expect(renderCommand(s[0]!, c)).toBe('pm disable-user --user 0 com.google.android.tvlauncher');
    expect(renderCommand(s[1]!, c)).toBe('cmd package set-home-activity com.premium.tv.launcher.ui/.LauncherActivity');
  });

  it('HOTELTV disable-stock stays the fallback that ends on the TV', () => {
    const s = stepsFor({ task: 'launcher', homeMethod: 'disable-stock' }, ctx());
    expect(s.map((x) => x.id)).toEqual(['home.disableStock']);
    expect(s[0]!.humanAfter).toBe('pickLauncher');
  });

  it('accessibility is granted only for the open profile of a brand that uses it', () => {
    const kiosk = stepsFor({ task: 'configure' }, ctx({ profile: 'kiosk' })).map((s) => s.id);
    expect(kiosk).not.toContain('cfg.acs');
    const open = stepsFor({ task: 'configure' }, ctx({ profile: 'open' })).map((s) => s.id);
    expect(open).toContain('cfg.acs');
    const pluiOpen = stepsFor({ task: 'configure' }, ctx({ brand: launcher, profile: 'open' })).map((s) => s.id);
    expect(pluiOpen).not.toContain('cfg.acs');
  });

  it('link only when a code is present, debug-off only when asked', () => {
    expect(stepsFor({ task: 'profile' }, ctx()).map((s) => s.id)).not.toContain('profile.link');
    expect(stepsFor({ task: 'profile' }, ctx({ linkCode: '1234-5678' })).map((s) => s.id)).toContain('profile.link');
    expect(stepsFor({ task: 'handover' }, ctx())).toEqual([]);
    expect(stepsFor({ task: 'handover' }, ctx({ debugOff: true })).map((s) => s.id)).toEqual(['handover.debugOff']);
  });

  it('every rendered step passes the gate (confirm or auto, never blocked)', () => {
    for (const task of ['profile', 'launcher', 'configure', 'test', 'handover', 'maintenance'] as const) {
      for (const method of kiosk.homeMethods) {
        for (const s of stepsFor({ task, homeMethod: method }, ctx({ profile: 'open', linkCode: 'x', pin: '1234', debugOff: true }))) {
          const cmd = renderCommand(s, ctx({ profile: 'open', linkCode: 'x', pin: '1234', debugOff: true }));
          expect(classifyCommand(cmd, { handoverLastStep: s.handoverLastStep }).verdict, cmd).not.toBe('blocked');
        }
      }
    }
  });

  it('judges output', () => {
    const dpc = stepsFor({ task: 'profile' }, ctx())[0]!;
    expect(stepSucceeded(dpc, 'Success: Device owner set to package ComponentInfo{…}\nActive admin set to component {…}')).toBe(true);
    expect(stepSucceeded(dpc, 'java.lang.IllegalStateException: Not allowed to set the device owner because there are already some accounts on the device')).toBe(false);
    const grant = stepsFor({ task: 'configure' }, ctx())[0]!;
    expect(stepSucceeded(grant, '')).toBe(true);
    expect(stepSucceeded(grant, 'Error: java.lang.SecurityException: …')).toBe(false);
  });

  it('auto run installs first — dpm and the broadcasts address the installed app', () => {
    expect(autoRunOrder(kiosk)).toEqual(['install', 'profile', 'launcher', 'configure', 'test', 'handover']);
    expect(autoRunOrder(launcher)).toEqual(['install', 'profile', 'launcher', 'configure', 'test', 'handover']);
  });
});

describe('configure — the hotel launcher gets every permission its wizard would ask for', () => {
  const ids = (c: StepContext) => stepsFor({ task: 'configure' }, c).map((s) => s.id);
  it('adds battery + photos for the brand whose launcher asks for everything, by the box API level', () => {
    const k33 = ids(ctx({ profile: 'open', sdk: 34 }));
    expect(k33).toContain('cfg.battery');
    expect(k33).toContain('cfg.photos');
    expect(k33).not.toContain('cfg.photosLegacy');
    const k28 = ids(ctx({ profile: 'open', sdk: 28 }));
    expect(k28).toContain('cfg.photosLegacy');
    expect(k28).not.toContain('cfg.photos');
  });
  it('leaves the consumer launcher alone — its wizard asks for two', () => {
    const l = ids(ctx({ brand: launcher, profile: 'open', sdk: 34 }));
    expect(l).not.toContain('cfg.battery');
    expect(l).not.toContain('cfg.photos');
    expect(l).not.toContain('cfg.photosLegacy');
  });
  it('renders the grants against the launcher the context names', () => {
    const c = ctx({ profile: 'open', sdk: 34 });
    const battery = STEPS.find((s) => s.id === 'cfg.battery')!;
    expect(renderCommand(battery, c)).toBe(`dumpsys deviceidle whitelist +${kiosk.launcherPackage}`);
  });
});

describe('PROVISION never cuts adb in the middle of a run', () => {
  it('every PROVISION broadcast carries keepAdb', () => {
    const provision = STEPS.filter((s) => /\.PROVISION\b/.test(s.cmd));
    expect(provision.length).toBeGreaterThan(0);
    for (const s of provision) expect(s.cmd).toContain('--ez keepAdb true');
  });
});

describe('the Install screen: extras and the ADB-only switches', () => {
  const ids = (c: StepContext) => stepsFor({ task: 'configure' }, c).map((s) => s.id);
  it('appends the extras to PROVISION, and nothing when there are none', () => {
    const p = STEPS.find((s) => s.id === 'profile.broadcast')!;
    expect(renderCommand(p, ctx({ provisionExtras: ' --es use bnb --ez adult false' }))).toMatch(/--ez keepAdb true --es use bnb --ez adult false$/);
    expect(renderCommand(p, ctx())).toMatch(/--ez keepAdb true$/);
  });
  it('grants WRITE_SECURE_SETTINGS and hides the stock launcher only when switched on', () => {
    expect(ids(ctx({ profile: 'open' }))).not.toContain('cfg.secure');
    expect(ids(ctx({ profile: 'open', grantSecureSettings: true }))).toContain('cfg.secure');
    expect(ids(ctx({ profile: 'open', hideStock: true }))).toContain('cfg.hideStock');
    // the kiosk road's launcher task already did it
    expect(ids(ctx({ profile: 'kiosk', hideStock: true }))).not.toContain('cfg.hideStock');
    expect(ids(ctx({ profile: 'open', hideStock: true, stockLauncher: null }))).not.toContain('cfg.hideStock');
  });
  it('drops the background whitelist when switched off', () => {
    expect(ids(ctx({ profile: 'open', sdk: 34 }))).toContain('cfg.battery');
    expect(ids(ctx({ profile: 'open', sdk: 34, keepBackground: false }))).not.toContain('cfg.battery');
  });
});

describe('the kiosk owns HOME: the stock launcher goes off first, and verify verifies', () => {
  it('kiosk chains the silent disable before set-home-activity', () => {
    const ids = stepsFor({ task: 'launcher', homeMethod: 'set-home-activity' }, ctx({ profile: 'kiosk' })).map((s) => s.id);
    expect(ids).toEqual(['home.disableStockSilent', 'home.setHomeActivity', 'home.verify']);
  });
  it('the open profile is left as it was', () => {
    const ids = stepsFor({ task: 'launcher', homeMethod: 'set-home-activity' }, ctx({ profile: 'open' })).map((s) => s.id);
    expect(ids).toEqual(['home.setHomeActivity', 'home.verify']);
  });
  it('a box with no stock launcher has nothing to switch off', () => {
    const ids = stepsFor({ task: 'launcher', homeMethod: 'set-home-activity' }, ctx({ profile: 'kiosk', stockLauncher: null })).map((s) => s.id);
    expect(ids).toEqual(['home.setHomeActivity', 'home.verify']);
  });
  it('verify fails when the box answers with somebody else — the bug of 25/9', () => {
    const c = ctx({ profile: 'kiosk' });
    const verify = STEPS.find((s) => s.id === 'home.verify')!;
    const expected = renderCommand({ ...verify, cmd: verify.expectRendered! }, c);
    expect(stepSucceeded(verify, 'com.google.android.tvlauncher/.MainActivity', expected)).toBe(false);
    expect(stepSucceeded(verify, `priority=0 ...
${expected}`, expected)).toBe(true);
  });
});

describe('home verify: ο resolver απαντά με ΠΛΗΡΕΣ όνομα κλάσης', () => {
  const verify = STEPS.find((s) => s.id === 'home.verify')!;

  it('δέχεται την απάντηση του ΑΛΗΘΙΝΟΥ box (pkg/pkg.Cls) σε ερώτηση με pkg/.Cls', () => {
    // Αυτό ακριβώς έβγαζε «το box δεν δέχτηκε την αλλαγή home» ενώ το HOME είχε αλλάξει: εμείς
    // ζητάμε τη σύντομη μορφή, ο resolver απαντά με την πλήρη, και η σύγκριση ήταν substring.
    const answer = 'com.premium.tv.launcher.ui/com.premium.tv.launcher.ui.LauncherActivity\n';
    expect(stepSucceeded(verify, answer, 'com.premium.tv.launcher.ui/.LauncherActivity')).toBe(true);
  });

  it('δέχεται και το αντίστροφο: σύντομη απάντηση σε ερώτηση με πλήρες όνομα', () => {
    expect(stepSucceeded(verify, 'com.x.y/.Main\n', 'com.x.y/com.x.y.Main')).toBe(true);
  });

  it('ΔΕΝ δέχεται άλλο launcher — η επαλήθευση παραμένει επαλήθευση', () => {
    const answer = 'com.google.android.tvlauncher/com.google.android.tvlauncher.MainActivity\n';
    expect(stepSucceeded(verify, answer, 'com.premium.tv.launcher.ui/.LauncherActivity')).toBe(false);
  });

  it('ΔΕΝ δέχεται το «No activity found» του box χωρίς home', () => {
    expect(stepSucceeded(verify, 'No activity found\n', 'com.x.y/.Main')).toBe(false);
  });

  it('expandComponent: μόνο η τελεία ανοίγει, τίποτα άλλο δεν πειράζεται', () => {
    expect(expandComponent('com.x/.A')).toBe('com.x/com.x.A');
    expect(expandComponent('com.x/com.y.A')).toBe('com.x/com.y.A');
    expect(expandComponent('com.x')).toBe('com.x');
  });
});
