import { describe, expect, it } from 'vitest';
import { appSafety } from './knownapps.js';

// The judgement the other tool sells as PRO (docs/COMPETITOR_TASKS_STUDY.md). It must never say
// "safe" about something the television needs, and it must say NOTHING about a package it does not
// recognise — a wrong sentence here is worse than no sentence at all.
describe('app safety', () => {
  it('names the consequence for the packages we know', () => {
    expect(appSafety('com.google.android.apps.mediashell')).toEqual({ level: 'care', effect: 'cast' });
    expect(appSafety('com.google.android.katniss')).toEqual({ level: 'care', effect: 'voice' });
    expect(appSafety('com.amazon.venezia')).toEqual({ level: 'care', effect: 'store' });
    expect(appSafety('com.netflix.ninja')).toEqual({ level: 'safe' });
  });

  it('says nothing about a package it does not recognise', () => {
    expect(appSafety('com.acme.somethingunknown')).toBeNull();
  });

  it('trusts the box over a pattern: an app somebody installed can be installed again', () => {
    expect(appSafety('com.acme.somethingunknown', { userInstalled: true })).toEqual({ level: 'safe', effect: 'yours' });
    // ...but a name we KNOW still wins over "the user installed it": disabling the Play store hurts
    // the same whoever put it there.
    expect(appSafety('com.amazon.venezia', { userInstalled: true })).toEqual({ level: 'care', effect: 'store' });
  });

  it('reads the vendor packages no list can name', () => {
    expect(appSafety('com.tcl.fota')).toEqual({ level: 'care', effect: 'updates' });
    expect(appSafety('com.sony.dtv.retaildemo')).toEqual({ level: 'safe' });
    expect(appSafety('com.philips.tv.appstore')).toEqual({ level: 'care', effect: 'store' });
    expect(appSafety('com.mediatek.widevine')).toEqual({ level: 'keep', effect: 'media' });
  });

  it('never calls something safe that the television needs', () => {
    for (const p of ['com.android.settings', 'com.mediatek.widevine', 'com.google.android.gsf']) {
      expect(appSafety(p)?.level, p).not.toBe('safe');
    }
  });
});
