// The web face: read the query, pick brand + transport + hooks, mount <App>. Kept tiny on purpose.
import { mount } from 'svelte';
import { resolveBrand } from '@tvlm/core';
import { App, hasLang, hydratePrefs } from '@tvlm/ui';
import '@tvlm/ui/styles.css';
import './app.css';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { isAndroidTv } from '@tvlm/adb/capacitor';
import { connectBridge, createTransport, detectPlatform } from './transport.js';
import { mockHooks, realHooks } from './hooks.js';
import { pulse, reportError } from './telemetry.js';
import Tweaks from './Tweaks.svelte';

const q = Object.fromEntries(new URLSearchParams(location.search)) as Record<string, string>;
const pick = <T extends string>(v: string | undefined, allowed: readonly T[], dflt: T): T => (allowed.includes(v as T) ? (v as T) : dflt);

const brand = resolveBrand(q.brand ?? import.meta.env.TVLM_BRAND);

// ---- THE LANGUAGE, when this page is served by the website --------------------------------------
// The site asks it once, in the address (`/el/setup/`, the Lunona pattern) and remembers the answer
// under its own key. Asking again on the app's first screen would be us doubting a choice the
// person made one click earlier (Jim, 22/9), so when the site has an answer we take it and skip the
// screen. Nothing changes for the desktop app or the APK: nobody asked there, so the screen stays.
const SITE_LANGS = ['en', 'el'];
const pathLang = SITE_LANGS.includes(location.pathname.split('/').filter(Boolean)[0] ?? '') ? location.pathname.split('/').filter(Boolean)[0] : '';
const siteLang = (() => {
  try {
    const v = localStorage.getItem('tvboxtools.lang');
    return v && SITE_LANGS.includes(v) ? v : '';
  } catch {
    return '';
  }
})();
// The site's own order of preference (assets/js/lang.js): the address wins, then what it
// remembered, then the browser. The app follows the same order so the two never disagree — and on
// the web face the answer is final, because the site is the place that asks.
const browserLang = (navigator.languages ?? [navigator.language ?? '']).map((t) => t.slice(0, 2).toLowerCase()).find((t) => hasLang(t)) ?? '';
// What the person answered IN the app, the last time they were here — below the address and the
// site's own memory, above the browser. Without it, accepting "switch to Greek" lasted until the
// next reload, which is a promise broken in the most visible way possible.
const ownLang = (() => {
  try {
    const v = localStorage.getItem('tvlm.lang');
    return v && hasLang(v) ? v : '';
  } catch {
    return '';
  }
})();
const fromSite = q.lang || pathLang || siteLang || ownLang || browserLang;
const platform = pick(q.platform, ['desktop', 'web', 'android'] as const, detectPlatform());
const scenario = pick(q.scenario, ['happy', 'unauthorized', 'accounts', 'nodevices'] as const, 'happy');
const box = pick(q.box, ['googletv', 'androidtv', 'xiaomi', 'other', 'firetv'] as const, 'xiaomi');
const startIn = pick(q.startIn, ['wizard', 'workspace'] as const, 'wizard');
const speed = q.speed !== undefined && !Number.isNaN(Number(q.speed)) ? Number(q.speed) : 1;
// dev server = the mock (walk the wizard with no box); a built bundle = the real host transport.
const kind = q.transport ?? (import.meta.env.DEV ? 'mock' : 'auto');

// `?tv=1` is a television standing in for a real one, so the mock scan must find itself there too.
const transport = createTransport({ scenario, box, speed, launcherPackage: brand.launcherPackage, kind, self: q.self === '1' || q.tv === '1' });
const hooks = transport.kind === 'mock' ? mockHooks(brand, speed, q.play === '1', q.tv !== '1') : realHooks(brand, q.manifest || brand.manifestUrl);
// Wi-Fi from a browser needs the local bridge. With the mock there is nothing to connect to, so the
// dev/demo path hands back the mock transport after a beat; a real page polls the real bridge.
const bridge = transport.kind === 'mock'
  ? () => new Promise<typeof transport>((r) => setTimeout(() => r(transport), 1200 * (speed || 1)))
  : connectBridge;

document.title = brand.name;
document.getElementById('favicon')?.setAttribute('href', `./brand/${brand.logo.icon}`);

void (async () => {
  // Ask the host whether this is a television before mounting: the whole canvas is scaled for it,
  // so finding out afterwards would resize the app in the viewer's face. `?tv=1` forces it on for
  // testing in a browser. The native answer is one IPC round trip, behind the splash screen.
  const tv = q.tv === '1' ? true : q.tv === '0' ? false : await isAndroidTv();
  // What this computer already answered (config.json on the desktop, localStorage elsewhere) has to
  // be in hand BEFORE the first screen draws: the language question is asked once, and a wizard
  // that opens asking it again has already got it wrong.
  const tvlm = (window as unknown as { tvlm?: { config(): Promise<Record<string, string>>; configSet(p: Record<string, string | null>): void } }).tvlm;
  await hydratePrefs(tvlm ? { get: () => tvlm.config(), set: (patch) => tvlm.configSet(patch) } : null);
  document.documentElement.classList.toggle('tv', tv);

  const app = mount(App, { target: document.getElementById('app')!, props: { brand, transport, platform, version: import.meta.env.TVLM_VERSION as string, lang: fromSite || undefined, langLocked: platform === 'web', manifestOverride: q.manifest, startIn, tv, ...hooks, connectBridge: bridge, assetBase: './brand/' } });
  // ---- WHICH LANGUAGE, ASKED BY IP -------------------------------------------------------------
  // The ecosystem's geo endpoint answers from the request's IP — the same call PLUI makes at boot
  // and the same ORDER ZUKKA uses: where the person is beats how the device is configured. A Greek
  // user whose phone is set to US English is the case that matters, and the device would answer
  // "English" with confidence.
  //
  // It stays a QUESTION and nothing switches by itself: on a phone the answer opens the dialog
  // (LangAsk) with that language pre-selected, everywhere else it raises the suggestion bar. Asked
  // once — `tvlm.lang` remembers what was answered.
  void (async () => {
    const S = app.session();
    // The key is configuration (.env, see .env.example), not code. Without it there is no IP
    // answer, and every face falls back to the device's own language.
    const geoKey = (import.meta.env.VITE_GEO_API_KEY as string | undefined) ?? '';
    if (!geoKey) {
      S.geoLang(null);
      return;
    }
    const url = `https://api.smartago.net/api/multi/get-suggested-language-v2?apiKey=${encodeURIComponent(geoKey)}&apiBuild=1`;
    try {
      // NOT THROUGH THE WEBVIEW ON A BOX (Jim, 29/9: «γιατί δεν επιλέγεις το gr βάσει ip αφού
      // network υπάρχει;»). The tool's own console answered it: `no answer (TypeError)` — the
      // fetch never completed. The network was fine (TCP to :443 answers from the box, DNS
      // resolves, the clock is right): the WebView is not. A television runs whatever Chrome its
      // vendor froze in — 101, from 2022, on this image — with the root store and the TLS of that
      // year (memory: tls-root-certificates). So on Android the request goes through the SYSTEM's
      // HTTP stack instead, which has the platform's own roots and no CORS of its own. Everywhere
      // else `fetch` is the right tool and stays.
      let payload: { data?: { languageCode?: string; countryCode?: string } };
      if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.get({ url, connectTimeout: 8000, readTimeout: 8000 });
        payload = (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as typeof payload;
      } else {
        payload = (await (await fetch(url, { signal: AbortSignal.timeout(8000) })).json()) as typeof payload;
      }
      const tag = (payload.data?.languageCode ?? '').slice(0, 2).toLowerCase() || null;
      // in the tool's own console, so \"why is it in English?\" has an answer on the screen
      S.log('info', tag ? `region: ${payload.data?.countryCode ?? '?'} \u2192 ${tag}` : 'region: the endpoint answered without a language');
      S.geoLang(tag);
    } catch (e) {
      S.log('warn', `region: no answer (${e instanceof Error ? e.name : 'error'}) \u2014 the language stays as this box has it`);
      S.geoLang(null);
    }
  })();

  // ---- ΠΟΣΟΙ ΤΟ ΕΧΟΥΝ, ΚΑΙ ΤΙ ΕΣΠΑΣΕ -----------------------------------------------------
  // Ο ίδιος αγωγός με UNI / REMAP / Send-to-TV-Quick, ώστε το εργαλείο να μετριέται δίπλα τους
  // στον admin. Ποτέ στον dev server: μια δοκιμή δεν είναι εγκατάσταση.
  if (!import.meta.env.DEV) {
    const self = await hooks.selfInfo?.().catch(() => null);
    void pulse(String(import.meta.env.TVLM_VERSION ?? ''), {
      isTv: tv,
      manufacturer: self?.manufacturer,
      model: self?.model,
      release: self?.release,
      sdk: self?.sdk,
      playBuild: self?.playBuild,
    });
    // Ό,τι σκάει χωρίς να το πιάσει κανείς. Το φρένο των 5 δευτερολέπτων είναι μέσα στο
    // reportError — ένας βρόχος σφαλμάτων γεμίζει τον πίνακα σε ένα λεπτό.
    window.addEventListener('error', (e) => reportError('WINDOW_ERROR', e.message || 'error', { file: e.filename, line: e.lineno }));
    window.addEventListener('unhandledrejection', (e) => {
      const r: unknown = (e as PromiseRejectionEvent).reason;
      reportError('UNHANDLED_REJECTION', r instanceof Error ? r.message : String(r));
    });
  }

  if (import.meta.env.DEV) {
    mount(Tweaks, { target: document.body, props: { q } });
    // dev only: the state machine on the console (`__tvlm.goStep(5)`, `__tvlm.task = 'inst'` …) — the prototype's jump bar
    (window as unknown as { __tvlm: unknown }).__tvlm = app.session();
  }
})();
