import { describe, expect, it } from 'vitest';
import { buildCheck, parseAccounts, parseDeviceOwner, parseDf, parseFocusedPackage, parseGetprop, parsePackages, parseResolvedHome } from './check.js';

const GETPROP = `[ro.build.version.release]: [11]
[ro.build.version.sdk]: [30]
[ro.product.model]: [MIBOX4]
[ro.product.manufacturer]: [Xiaomi]
[ro.product.brand]: [Xiaomi]
[ro.product.device]: [once]
[ro.serialno]: [7F3A9C12B04E]
[ro.build.characteristics]: [tv]
`;

describe('check parsers', () => {
  it('parses getprop', () => {
    const p = parseGetprop(GETPROP);
    expect(p['ro.product.model']).toBe('MIBOX4');
    expect(p['ro.build.version.sdk']).toBe('30');
  });

  it('parses accounts', () => {
    const out = `User UserInfo{0:Owner:c13}:
  Accounts: 2
    Account {name=someone@gmail.com, type=com.google}
    Account {name=Netflix, type=com.netflix.mediaclient}
`;
    expect(parseAccounts(out)).toEqual(['someone@gmail.com', 'Netflix']);
    expect(parseAccounts('  Accounts: 0\n')).toEqual([]);
  });

  it('parses df in 1K blocks and with units', () => {
    expect(parseDf('Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/block/dm-0 5806852 2214436 3576032 39% /data\n')).toEqual({ free: 3576032 * 1024, total: 5806852 * 1024 });
    expect(parseDf('Filesystem Size Used Avail Use% Mounted on\n/dev/block/dm-0 5.5G 2.1G 3.4G 39% /data\n').free).toBe(Math.round(3.4 * 1024 ** 3));
  });

  it('parses packages with version codes', () => {
    const m = parsePackages('package:com.hotel.bnb.smart.hospitality.tv.launcher versionCode:1002\npackage:com.google.android.tvlauncher versionCode:1234\n');
    expect(m.get('com.hotel.bnb.smart.hospitality.tv.launcher')).toBe(1002);
    expect(m.has('com.google.android.tvlauncher')).toBe(true);
  });

  it('parses the resolved HOME and the device owner', () => {
    expect(parseResolvedHome('priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=false\ncom.google.android.tvlauncher/.MainActivity\n')).toBe('com.google.android.tvlauncher/.MainActivity');
    expect(parseResolvedHome('No activity found')).toBeNull();
    expect(parseDeviceOwner('Current Device Policy Manager state:\n  Device Owner: \n    admin=ComponentInfo{com.hotel.bnb.smart.hospitality.tv.launcher/com.premium.tv.launcher.ui.hotel.HotelDeviceAdminReceiver}\n    name=\n')).toBe('com.hotel.bnb.smart.hospitality.tv.launcher/com.premium.tv.launcher.ui.hotel.HotelDeviceAdminReceiver');
    expect(parseDeviceOwner('Current Device Policy Manager state:\n  Enabled Device Admins (User 0, provisioningState: 0):\n')).toBeNull();
  });

  it('builds a full check', () => {
    const c = buildCheck(
      {
        getprop: GETPROP,
        accounts: '  Accounts: 0\n',
        df: 'Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/block/dm-0 5806852 2214436 3576032 39% /data\n',
        packages: 'package:com.google.android.tvlauncher versionCode:1\npackage:com.hotel.bnb.smart.hospitality.tv.launcher versionCode:1002\n',
        devSettings: '1\n',
        adbEnabled: '1\n',
        home: 'com.google.android.tvlauncher/.MainActivity\n',
        deviceOwner: '',
      },
      'com.hotel.bnb.smart.hospitality.tv.launcher',
    );
    expect(c.platform).toBe('androidtv');
    expect(c.stockLauncher).toBe('com.google.android.tvlauncher');
    expect(c.launcherInstalled).toBe(true);
    expect(c.launcherVersionCode).toBe(1002);
    expect(c.accounts).toEqual([]);
    expect(c.developerOptions).toBe(true);
    expect(c.sdk).toBe(30);
    expect(c.isTv).toBe(true);
  });
});

describe('parseFocusedPackage', () => {
  it('names the app in front, from a real Mi Box dump', () => {
    const out = '    mFocusedWindow=Window{9f60c01 u0 com.google.android.gms/com.google.android.gms.auth.uiflows.minutemaid.MinuteMaidActivity}\n';
    expect(parseFocusedPackage(out)).toBe('com.google.android.gms');
  });
  it('falls back to the focused app when no window line is there', () => {
    const out = '    mFocusedApp=Token{cb5dc91 ActivityRecord{479c6b8 u0 com.android.vending/.AssetBrowserActivity t126}}\n';
    expect(parseFocusedPackage(out)).toBe('com.android.vending');
  });
  it('answers null rather than guessing', () => {
    expect(parseFocusedPackage('')).toBe(null);
  });
});
