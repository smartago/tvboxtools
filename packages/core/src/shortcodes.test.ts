import { describe, expect, it } from 'vitest';
import {
  aftvPage,
  isDownloadableUrl,
  isOurShortCode,
  isShortCode,
  looksLikeApk,
  resolveShortCode,
  shortCodeKey,
} from './shortcodes.js';

describe('ποιανού είναι ο κωδικός', () => {
  it('ψηφία και μόνο ψηφία', () => {
    expect(isShortCode('1166520')).toBe(true);
    expect(isShortCode(' 0245 ')).toBe(true);
    expect(isShortCode('https://x/y.apk')).toBe(false);
    expect(isShortCode('12a4')).toBe(false);
    expect(isShortCode('')).toBe(false);
  });

  it('αρχικό μηδέν = δικός μας, ό,τι κι αν ακολουθεί', () => {
    expect(isOurShortCode('0245')).toBe(true);
    expect(isOurShortCode('0')).toBe(true);
  });

  it('γυμνός ≤999 = δικός μας (οι παλιοί, πριν μπει το πρόθεμα)', () => {
    expect(isOurShortCode('245')).toBe(true);
    expect(isOurShortCode('999')).toBe(true);
    expect(isOurShortCode('1000')).toBe(false);
  });

  it('6-7 ψηφία = AFTVnews — ΚΑΙ ΤΟΥ PLUI Ο ΚΩΔΙΚΟΣ ΕΙΝΑΙ ΤΕΤΟΙΟΣ', () => {
    // 1166520 = ο κωδικός που έβγαλε ο Jim για το PLUI (21/9/2026). Αν αυτός διαβαζόταν ως
    // «δικός μας», το κλειδί θα έφευγε γυμνό και ο server θα απαντούσε NOT_FOUND — έτσι είναι
    // σχεδιασμένο: `?shortCode=1166520` → 404, `?shortCode=atf1166520` → το APK.
    expect(isOurShortCode('1166520')).toBe(false);
    expect(shortCodeKey('1166520')).toBe('atf1166520');
    expect(shortCodeKey('2123033')).toBe('atf2123033');
    expect(shortCodeKey('0245')).toBe('0245');
    expect(shortCodeKey(' 245 ')).toBe('245');
  });

  it('η σελίδα τους, για να ανοίξει ΑΛΛΟΥ', () => {
    expect(aftvPage(' 1166520 ')).toBe('https://aftv.news/1166520');
  });
});

describe('αρχείο ή σελίδα', () => {
  it('αρχείο .apk, με ή χωρίς query', () => {
    expect(looksLikeApk('https://tvboxtools.com/dl/tv-launcher-manager.apk')).toBe(true);
    expect(looksLikeApk('https://x/y/Z.APK?t=1#f')).toBe(true);
  });

  it('σελίδα με πολλά αρχεία = ΟΧΙ αρχείο (ο 71893 πάει στο stremio.com/downloads)', () => {
    expect(looksLikeApk('https://www.stremio.com/downloads')).toBe(false);
    expect(looksLikeApk('https://aftv.news/71893')).toBe(false);
    expect(looksLikeApk('όχι διεύθυνση')).toBe(false);
  });

  it('μόνο http(s) κατεβαίνει', () => {
    expect(isDownloadableUrl('https://x/y.apk')).toBe(true);
    expect(isDownloadableUrl('http://x/y.apk')).toBe(true);
    expect(isDownloadableUrl('file:///C:/y.apk')).toBe(false);
    expect(isDownloadableUrl('javascript:alert(1)')).toBe(false);
    expect(isDownloadableUrl('σκέτο κείμενο')).toBe(false);
  });
});

describe('η λύση του κωδικού', () => {
  const answer = (data: unknown) => async () => ({ resultCode: 200, data });

  it('δικός μας: το κλειδί φεύγει ΓΥΜΝΟ και ΩΣ ΚΕΙΜΕΝΟ (το αρχικό μηδέν δεν χάνεται)', async () => {
    let asked = '';
    const r = await resolveShortCode('0245', async (u) => {
      asked = u;
      return { data: { originalUrl: 'https://smartago.net/a.apk' } };
    });
    expect(asked).toContain('shortCode=0245');
    expect(r).toEqual({ ok: true, url: 'https://smartago.net/a.apk', ours: true });
  });

  it('AFTVnews: το κλειδί παίρνει το atf', async () => {
    let asked = '';
    const r = await resolveShortCode('1166520', async (u) => {
      asked = u;
      return { data: { originalUrl: 'https://smartago.net/us/downloads/com.premium.tv.launcher.ui.apk' } };
    });
    expect(asked).toContain('shortCode=atf1166520');
    expect(r.ok && r.ours).toBe(false);
  });

  it('άγνωστος κωδικός = notfound, ΟΧΙ σφάλμα δικτύου', async () => {
    expect(await resolveShortCode('9999999', answer({}))).toEqual({ ok: false, reason: 'notfound' });
    expect(await resolveShortCode('9999999', answer(null))).toEqual({ ok: false, reason: 'notfound' });
  });

  it('δεν απάντησε ο server = unreachable — ο χρήστης πρέπει να ξεχωρίσει τα δύο', async () => {
    const r = await resolveShortCode('0245', async () => {
      throw new Error('TypeError: Failed to fetch');
    });
    expect(r).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('ό,τι δεν είναι κωδικός δεν φτάνει καν στο δίκτυο', async () => {
    let called = false;
    const r = await resolveShortCode('https://x/y.apk', async () => {
      called = true;
      return {};
    });
    expect(called).toBe(false);
    expect(r).toEqual({ ok: false, reason: 'invalid' });
  });
});
