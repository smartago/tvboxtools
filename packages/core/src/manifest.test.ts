import { describe, expect, it } from 'vitest';
import { appsForType, pickApps, toolOutdated, validateManifest, type Manifest, ourFile } from './manifest.js';

const SHA = 'a'.repeat(64);
const M: Manifest = {
  schema: 1,
  tool: { version: '0.2.0', minVersion: '0.1.0', downloads: {}, sha256: {} },
  apps: [
    { pkg: 'com.hotel.bnb.smart.hospitality.tv.launcher', name: 'HOTELTV', url: 'u', sha256: SHA, versionCode: 1002, required: true, role: ['owner', 'reseller'] },
    { pkg: 'com.tv.setup.suite', name: 'TVS', url: 'u', sha256: SHA, versionCode: 1069, required: true, role: ['owner', 'reseller'] },
    { pkg: 'io.github.jqssun.airplay', name: 'AirPlay', url: 'u', sha256: SHA, versionCode: 31, required: true, role: ['owner', 'reseller'], group: 'airplay' },
    { pkg: 'com.github.mazer666.phairplay', name: 'PhairPlay', url: 'u', sha256: SHA, versionCode: 1, required: false, role: [], group: 'airplay' },
  ],
};

describe('manifest', () => {
  it('validates', () => {
    expect(() => validateManifest(M)).not.toThrow();
    expect(() => validateManifest({ ...M, schema: 2 })).toThrow(/schema/);
    expect(() => validateManifest({ ...M, apps: [{ ...M.apps[0], sha256: 'zz' }] })).toThrow(/sha256/);
  });

  it('installs one receiver per group, the required one by default', () => {
    const picked = pickApps(M, { role: 'reseller' });
    expect(picked.map((a) => a.pkg)).toEqual(['com.hotel.bnb.smart.hospitality.tv.launcher', 'com.tv.setup.suite', 'io.github.jqssun.airplay']);
  });

  it('honours an explicit group choice', () => {
    const picked = pickApps(M, { role: 'owner', choices: { airplay: 'com.github.mazer666.phairplay' } });
    expect(picked.map((a) => a.pkg)).toContain('com.github.mazer666.phairplay');
    expect(picked.map((a) => a.pkg)).not.toContain('io.github.jqssun.airplay');
  });

  it('marks up-to-date apps as skip and older ones as update', () => {
    const installed = new Map<string, number | null>([
      ['com.tv.setup.suite', 1069],
      ['com.hotel.bnb.smart.hospitality.tv.launcher', 1001],
    ]);
    const picked = pickApps(M, { role: 'owner', installed });
    expect(picked.find((a) => a.pkg === 'com.tv.setup.suite')?.action).toBe('skip-current');
    expect(picked.find((a) => a.pkg === 'com.hotel.bnb.smart.hospitality.tv.launcher')?.action).toBe('update');
    expect(picked.find((a) => a.pkg === 'io.github.jqssun.airplay')?.action).toBe('install');
  });

  it('compares tool versions', () => {
    expect(toolOutdated('0.1.0', '0.1.0')).toBe(false);
    expect(toolOutdated('0.1.0', '0.2.0')).toBe(true);
    expect(toolOutdated('1.0', '0.9.9')).toBe(false);
  });
});

describe('ourFile', () => {
  it('trusts our own hosts over TLS, and nothing else', () => {
    expect(ourFile('https://smartago.net/us/downloads/com.premium.tv.launcher.ui.apk')).toBe(true);
    expect(ourFile('https://dl.tvboxtools.com/x.apk')).toBe(true);
    // http is not a proof of anything, and a look-alike host is the whole point of the check
    expect(ourFile('http://smartago.net/x.apk')).toBe(false);
    expect(ourFile('https://smartago.net.evil.com/x.apk')).toBe(false);
    expect(ourFile('https://play.google.com/x.apk')).toBe(false);
    expect(ourFile('not a url')).toBe(false);
  });
});

describe('appsForType', () => {
  const app = (pkg: string, over: Record<string, unknown> = {}) => ({ pkg, name: pkg, url: 'u', sha256: 'a'.repeat(64), versionCode: 1, required: false, role: ['owner'], ...over }) as never;
  const apps = [app('launcher', { required: true }), app('tvs'), app('vlc', { in: ['full'] }), app('kodi', { in: ['full'] })];
  it('Minimal = the required app alone', () => {
    expect(appsForType(apps, 'min').map((a: { pkg: string }) => a.pkg)).toEqual(['launcher']);
  });
  it('Typical = required + apps without a type list', () => {
    expect(appsForType(apps, 'typ').map((a: { pkg: string }) => a.pkg)).toEqual(['launcher', 'tvs']);
  });
  it('one app per group: the required member wins', () => {
    const g = [app('launcher', { required: true }), app('beta', { group: 'airplay' }), app('main', { group: 'airplay', required: true })];
    expect(appsForType(g, 'typ').map((a: { pkg: string }) => a.pkg)).toEqual(['launcher', 'main']);
  });
  it('Full = everything that says full', () => {
    expect(appsForType(apps, 'full').map((a: { pkg: string }) => a.pkg)).toEqual(['launcher', 'tvs', 'vlc', 'kodi']);
  });
});

describe('pickApps with an explicit list', () => {
  it('installs exactly the listed apps, optional ones included', () => {
    const m = { schema: 1, tool: { version: '1', minVersion: '1', downloads: {}, sha256: {} }, apps: [
      { pkg: 'launcher', name: 'L', url: 'u', sha256: SHA, versionCode: 1, required: true, role: ['owner'] },
      { pkg: 'vlc', name: 'V', url: 'u', sha256: SHA, versionCode: 1, required: false, role: [] },
    ] } as Manifest;
    expect(pickApps(m, { role: 'owner' }).map((a) => a.pkg)).toEqual(['launcher']);
    expect(pickApps(m, { role: 'owner', only: ['vlc'] }).map((a) => a.pkg)).toEqual(['vlc']);
  });
});
