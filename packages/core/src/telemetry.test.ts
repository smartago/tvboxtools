import { describe, expect, it } from 'vitest';
import { activationPayload, actionPayload, appTypeFor, mapCpuArch, newVisitorId, shouldPulse, TELEMETRY_APP_CODE } from './telemetry.js';

const base = {
  face: 'android' as const,
  host: 'Android' as const,
  version: '0.2.3',
  deviceUID: 'a1b2c3',
  visitorId: '2609-2918-4523-7412',
  osVersion: '14',
  api: '34',
  cpu: 'arm64-v8a',
  fromStore: false,
};

describe('activation payload', () => {
  it('carries the five fields the server refuses to live without', () => {
    // `getRequestPayload(request, ['appCode','deviceUID','androidId','api','cpu'])` — a missing one
    // is a 400, and a 400 means the install was never counted.
    const p = activationPayload(base);
    for (const k of ['appCode', 'deviceUID', 'androidId', 'api', 'cpu']) {
      expect(p[k], k).toBeDefined();
    }
    expect(p.appCode).toBe(TELEMETRY_APP_CODE);
  });

  it('sends ram and storage as NUMBERS', () => {
    // The Kotlin PLUI stopped sending them and every activation threw "[body.ram] is undefined":
    // those devices were never logged. A string reads as missing just the same.
    const p = activationPayload({ ...base, ram: 1.87, storage: 5.8 });
    expect(typeof p.ram).toBe('number');
    expect(typeof p.storage).toBe('number');
    const empty = activationPayload(base);
    expect(empty.ram).toBe(0);
    expect(empty.storage).toBe(0);
  });

  it('web looks exactly like the sibling apps: WEB, web, empty androidId', () => {
    const p = activationPayload({ ...base, face: 'web', host: 'Web', cpu: 'NONE', api: '0' }, false);
    expect(p.appType).toBe('WEB');
    expect(p.binType).toBe('web');
    expect(p.androidId).toBe('');
    expect(p.isInstalledFromGooglePlay).toBe(false);
  });

  it('the desktop counts as TV, and says which machine it really is', () => {
    // Jim, 29/9: the product solves the Android TV box's problem; where the tool happens to run is
    // an implementation detail. Nothing is lost — `deviceInfo.host` keeps the truth.
    const p = activationPayload({ ...base, face: 'desktop', host: 'Windows' });
    expect(p.appType).toBe('TV');
    expect((p.deviceInfo as Record<string, unknown>).host).toBe('Windows');
    expect(p.binType).toBe('sideload');
  });

  it('the APK reports what the device is', () => {
    expect(appTypeFor('android', true)).toBe('TV');
    expect(appTypeFor('android', false)).toBe('Mobile');
  });
});

describe('send-action', () => {
  it('encodes the description, because that is how the admin reads it', () => {
    const p = actionPayload({ visitorId: 'v', group: 'STATISTICS', command: 'ACTIVATE_DEVICE', value: 'ok' });
    expect(typeof p.description).toBe('string');
    const decoded = JSON.parse(decodeURIComponent(p.description as string));
    expect(decoded.appCode).toBe(TELEMETRY_APP_CODE);
  });
});

describe('cooldown', () => {
  it('one hour on the same day — and the first launch of a new day always counts', () => {
    const t = new Date('2026-09-29T20:00:00').getTime();
    expect(shouldPulse(0, t)).toBe(true);
    expect(shouldPulse(t - 10 * 60_000, t)).toBe(false);
    expect(shouldPulse(t - 2 * 3_600_000, t)).toBe(true);
    // yesterday at 23:59 → today at 00:05 is under an hour but a different day
    const midnight = new Date('2026-09-30T00:05:00').getTime();
    expect(shouldPulse(new Date('2026-09-29T23:59:00').getTime(), midnight)).toBe(true);
  });
});

describe('visitor id', () => {
  it('keeps the family shape so our rows do not look foreign', () => {
    expect(newVisitorId(new Date('2026-09-29T18:45:23'))).toMatch(/^\d{4}-\d{4}-\d{4}-\d{4}$/);
    expect(newVisitorId(new Date('2026-09-29T18:45:23'), true)).toMatch(/^WEB:\d{4}-/);
  });
});

describe('cpu arch', () => {
  it('uses the hyphenated spelling', () => {
    expect(mapCpuArch('arm64_v8a')).toBe('arm64-v8a');
    expect(mapCpuArch('x86_64')).toBe('x86_64');
  });
});
