// The host hooks the UI needs for Install: fetch an APK as a stream, hash a stream, get the manifest.
// Real: fetch(brand.manifestUrl) + WebCrypto. Mock (no box, no site yet): a manifest shaped like the
// contract (docs/provision-contract.md §5) whose "APKs" are small deterministic byte streams with REAL
// sha256 values, so the engine's stream → hash → install path runs for real.
import { validateManifest, type BrandConfig, type Manifest } from '@tvlm/core';
import { appIcons, canSelfInstall, openSelfInstallPermission, openSystemSettings, selfInfo, selfUpdate, type SelfInfo, type SettingsScreen } from '@tvlm/adb/capacitor';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';

export interface Hooks {
  fetchApk: (url: string) => Promise<{ stream: ReadableStream<Uint8Array>; size?: number }>;
  sha256: (stream: ReadableStream<Uint8Array>) => Promise<string>;
  manifest: () => Promise<Manifest>;
  /**
   * ΕΝΑ JSON, ΧΩΡΙΣ ΤΟ WEBVIEW ΟΤΑΝ ΕΙΜΑΣΤΕ ΣΕ ΚΟΥΤΙ. Το ίδιο μάθημα με την κλήση της γλώσσας
   * κατά IP (main.ts, 29/9): μια τηλεόραση τρέχει το Chrome που πάγωσε ο κατασκευαστής της (101,
   * του 2022, στο κουτί του Jim) με τη λίστα ριζικών πιστοποιητικών εκείνης της χρονιάς, και το
   * `fetch` σκάει με σκέτο `TypeError` ενώ DNS, TCP και ρολόι είναι μια χαρά. Στο Android η
   * κλήση φεύγει από τη στοίβα ΤΟΥ ΣΥΣΤΗΜΑΤΟΣ, που έχει τις δικές του ρίζες και κανένα CORS.
   */
  getJson: (url: string) => Promise<unknown>;
  /**
   * ANDROID ONLY: η ΙΔΙΑ η εφαρμογή κατεβάζει το δικό της APK και το δίνει στον εγκαταστάτη
   * του συστήματος — σε τηλεόραση δεν υπάρχει browser να σταλεί κάποιος σε σελίδα λήψης.
   */
  selfUpdate: (url: string, onProgress?: (percent: number) => void) => Promise<boolean>;
  canSelfInstall: () => Promise<boolean>;
  openSelfInstallPermission: () => Promise<boolean>;
  /** Android only: this device's own name and developer switches (null = cannot tell). */
  selfInfo: () => Promise<SelfInfo | null>;
  /** Android only: open a settings screen on this device (About, Developer options, Wi-Fi). */
  openSettingsScreen: (screen: SettingsScreen) => Promise<boolean>;
  /** Android only: the rendered icons of apps on this device, as data URLs. */
  appIcons: (packages: string[]) => Promise<Record<string, string>>;
  /** What is on this device's clipboard — the paste button on the command console. */
  readClipboard: () => Promise<string>;
  /**
   * DESKTOP ONLY: open this box in a scrcpy window, when the computer has scrcpy. `undefined`
   * everywhere else — a browser cannot start a program, and the card is not drawn.
   */
  mirror?: (target: string) => Promise<{ ok: boolean; reason?: 'missing' | 'failed'; message?: string }>;
}

async function sha256Stream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Το JSON που δεν περνά από το WebView σε τηλεόραση. Στον browser και στο Electron το `fetch`
 * είναι το σωστό εργαλείο και μένει· μόνο μέσα στο Android app αλλάζει δρόμος.
 */
async function nativeGetJson(url: string): Promise<unknown> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url, connectTimeout: 15000, readTimeout: 15000, headers: { Accept: 'application/json' } });
    if (res.status < 200 || res.status > 299) throw new Error(`GET ${url} → ${res.status}`);
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  }
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
  return r.json();
}

/**
 * `manifestUrl` overrides the brand's published list — the `?manifest=` / `TVLM_MANIFEST` escape
 * hatch for walking the flow with a build that is not published yet (Jim, 23/9). It lives HERE and
 * not only in the session, because this hook is what actually goes to the network: a session that
 * knew a different address while the hook kept fetching the published one is how the tool quietly
 * installed the server's build while the log claimed otherwise.
 */
export function realHooks(brand: BrandConfig, manifestUrl = brand.manifestUrl): Hooks {
  // the desktop shell puts its API on `window.tvlm` (apps/desktop/src/preload.ts)
  const host = (window as unknown as { tvlm?: { mirror?: (t: string) => Promise<{ ok: boolean; reason?: 'missing' | 'failed'; message?: string }>; fetchFile?: (url: string) => Promise<{ ok: true; data: ArrayBuffer } | { ok: false; error: string }> } }).tvlm;
  return {
    ...(host?.mirror ? { mirror: (target: string) => host.mirror!(target) } : {}),
    fetchApk: async (url) => {
      // ΞΕΝΟΣ HOST = CORS. Το `fetch` εδώ τρέχει μέσα σε σελίδα: οι δικοί μας host στέλνουν
      // `Access-Control-Allow-Origin: *` και δούλευε, αλλά η οθόνη του short code υπόσχεται
      // ΟΠΟΙΑΔΗΠΟΤΕ διεύθυνση — και ένας σύνδεσμος Dropbox απαντά «Failed to fetch» (Jim, 3/10).
      // Στο desktop το κατέβασμα φεύγει από την κύρια διεργασία, που δεν έχει origin.
      if (host?.fetchFile) {
        const r = await host.fetchFile(url);
        if (!r.ok) throw new Error(r.error);
        const bytes = new Uint8Array(r.data);
        return {
          stream: new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(bytes);
              c.close();
            },
          }),
          size: bytes.byteLength,
        };
      }
      const r = await fetch(url);
      if (!r.ok || !r.body) throw new Error(`GET ${url} → ${r.status}`);
      const len = r.headers.get('content-length');
      return { stream: r.body as ReadableStream<Uint8Array>, size: len ? parseInt(len, 10) : undefined };
    },
    sha256: sha256Stream,
    getJson: nativeGetJson,
    selfUpdate,
    canSelfInstall,
    openSelfInstallPermission,
    manifest: async () => validateManifest(await (await fetch(manifestUrl)).json()),
    // Answer null / false anywhere but inside the Android app — the wizard then never asks a TV
    // about itself, which is exactly right on a desktop that is setting up a box across the room.
    selfInfo,
    openSettingsScreen: openSystemSettings,
    appIcons,
    // The native plugin on Android (and on a television that is the whole point); in a browser or
    // in Electron the plugin is not there and the web API answers instead.
    readClipboard: async () => {
      try {
        const r = await Clipboard.read();
        return (r.value ?? '').trim();
      } catch {
        try {
          return (await navigator.clipboard.readText()).trim();
        } catch {
          return '';
        }
      }
    },
  };
}

// ---- mock -----------------------------------------------------------------------------------------

const MOCK_APPS = (brand: BrandConfig) => [
  { pkg: brand.launcherPackage, name: brand.launcherName, versionName: '2.0', versionCode: 1002, size: '38 MB', required: true, role: ['owner', 'reseller'] as const },
  { pkg: 'tv.setup.suite', name: 'TVS · TV Setup Suite', versionName: '1.1', versionCode: 11, size: '6 MB', required: true, role: ['owner', 'reseller'] as const },
  { pkg: 'io.github.jqssun.airplay', name: 'AirPlay receiver', versionName: '0.0.31', versionCode: 31, size: '21 MB', required: true, role: ['owner', 'reseller'] as const, group: 'airplay', license: 'GPL-3.0' },
  { pkg: 'io.github.mazer666.phairplay', name: 'PhairPlay (beta)', versionName: '1.0.0-b1', versionCode: 1, size: '17 MB', required: false, role: [] as const, group: 'airplay', license: 'Apache-2.0' },
];

/** Deterministic fake APK bytes per package — 6 chunks so the stream path is exercised. */
function fakeApk(pkg: string, speed: number): { stream: ReadableStream<Uint8Array>; size: number } {
  const enc = new TextEncoder();
  const chunk = enc.encode(`PK ${pkg} `.repeat(64));
  const n = 6;
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      if (i >= n) return ctrl.close();
      i++;
      if (speed) await new Promise((r) => setTimeout(r, 120 * speed));
      ctrl.enqueue(chunk.slice());
    },
  });
  return { stream, size: chunk.byteLength * n };
}

/**
 * A mock television for `?tv=1&platform=android`: Developer options and debugging start off and
 * come on a beat after the matching button is pressed. The "set up this TV" gate can then be walked
 * in a browser exactly as on a real set, waiting included — the waiting is the part worth testing.
 */
function mockSelf(speed: number, playBuild = false, canPickFile = true): Pick<Hooks, 'selfInfo' | 'openSettingsScreen' | 'appIcons' | 'readClipboard'> {
  // `playBuild` is `?play=1`: the edition that came from Google Play, which never downloads an APK.
  // Without it the Play edition could only be seen by building and installing one.
  const tv: SelfInfo = { manufacturer: 'AOSP', model: 'TV on x86', sdk: 34, release: '14', home: 'com.google.android.tvlauncher', playBuild, canPickFile, developer: false, adb: false, wirelessAdb: false };
  return {
    selfInfo: async () => ({ ...tv }),
    openSettingsScreen: async (screen) => {
      if (screen === 'about') setTimeout(() => (tv.developer = true), 2500 * (speed || 1));
      if (screen === 'dev') setTimeout(() => (tv.adb = true), 2000 * (speed || 1));
      return true;
    },
    // One flat teal square per package, so the layout with real icons can be seen without a device.
    readClipboard: async () => {
      try {
        return (await navigator.clipboard.readText()).trim();
      } catch {
        return '';
      }
    },
    appIcons: async (packages) =>
      Object.fromEntries(
        packages.map((p) => [p, 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="20" fill="#00A1A9"/></svg>')]),
      ),
  };
}

// `canPickFile` is `?tv=1` upside down: a television is exactly the host that has no file
// picker, so the mock says so and the APK card can be seen disappearing without a real set.
export function mockHooks(brand: BrandConfig, speed: number, playBuild = false, canPickFile = true): Hooks {
  let manifest: Promise<Manifest> | null = null;
  const build = async (): Promise<Manifest> => {
    if (speed) await new Promise((r) => setTimeout(r, 400 * speed));
    const apps = [];
    for (const a of MOCK_APPS(brand)) {
      const sha256 = await sha256Stream(fakeApk(a.pkg, 0).stream);
      apps.push({ ...a, role: [...a.role], url: `https://${brand.domain}/dl/${a.pkg}.apk`, sha256 });
    }
    // Το `downloads.android` ΥΠΑΡΧΕΙ στον mock: χωρίς αυτό η αυτο-ενημέρωση του Android δεν
    // περπατιέται ποτέ χωρίς αληθινή τηλεόραση — και εκεί ακριβώς βρέθηκε ότι το κουμπί
    // καλούσε τον browser αντί να κατεβάσει (Jim, 3/10/2026).
    return validateManifest({ schema: 1, tool: { version: '0.1.0', minVersion: '0.1.0', downloads: { android: `https://${brand.domain}/dl/tool.apk` }, sha256: {} }, apps });
  };
  return {
    fetchApk: async (url) => {
      const pkg = /\/dl\/(.+)\.apk$/.exec(url)?.[1] ?? url;
      return fakeApk(pkg, speed);
    },
    sha256: sha256Stream,
    // Ο ΨΕΥΤΙΚΟΣ SERVER ΚΩΔΙΚΩΝ. Χωρίς αυτόν η διαδρομή «short code» δεν περπατιέται ποτέ χωρίς
    // δίκτυο — και ακριβώς εκεί βρέθηκαν τρία bug στη διαδρομή του APK (3/10). Απαντά ό,τι απαντά
    // και ο αληθινός: αρχείο για τον κωδικό του PLUI, ΣΕΛΙΔΑ για τον 71893 (stremio, πολλά
    // αρχεία), τίποτα για ό,τι άλλο.
    getJson: async (url) => {
      if (speed) await new Promise((r) => setTimeout(r, 500 * speed));
      // Η ΛΙΣΤΑ ΤΟΥ ADMIN, ψεύτικη: δύο γραμμές όπως τις γυρνά το get-lists, ώστε η οθόνη «What
      // should we install?» να περπατιέται με τύπους και εικονίδια χωρίς δίκτυο. Η δεύτερη είναι
      // `full` — φαίνεται μόνο στο Full, άρα ο εναλλάκτης των τύπων δοκιμάζεται κι αυτός.
      if (url.includes('/get-lists')) {
        return {
          resultCode: 200,
          data: [
            { comboId: '10', sortOrderId: 1, iconCode: '', body: 'TV Setup', subBody: 'Install apps and files on the box', tag: JSON.stringify({ pkg: 'tv.setup.suite', url: `https://${brand.domain}/dl/tv.setup.suite.apk`, install_type: 'typical', size: '6 MB' }) },
            { comboId: '11', sortOrderId: 2, iconCode: '', body: 'VLC', subBody: 'Plays every file', tag: JSON.stringify({ pkg: 'org.videolan.vlc', url: `https://${brand.domain}/dl/org.videolan.vlc.apk`, install_type: 'full', size: '41 MB', license: 'GPL-2.0' }) },
          ],
        };
      }
      const code = new URL(url).searchParams.get('shortCode') ?? '';
      const KNOWN: Record<string, string> = {
        atf1166520: 'https://smartago.net/us/downloads/com.premium.tv.launcher.ui.apk',
        atf2984172: 'https://smartago.net/us/downloads/com.hotel.bnb.smart.hospitality.tv.launcher.apk',
        atf2123033: 'https://tvboxtools.com/dl/tv-launcher-manager.apk',
        // Οι καθρέφτες των ξένων launchers (κωδικοί του Jim, 10/10/2026): προσυμπληρώνονται στο πεδίο.
        atf5530657: 'https://tvboxtools.com/dl/launchers/projectivy.apk',
        atf9923599: 'https://tvboxtools.com/dl/launchers/at4k.apk',
        atf9206454: 'https://tvboxtools.com/dl/launchers/monet.apk',
        atf4052099: 'https://tvboxtools.com/dl/launchers/arc.apk',
        atf71893: 'https://www.stremio.com/downloads',
        '0245': `https://${brand.domain}/dl/${brand.launcherPackage}.apk`,
      };
      return KNOWN[code] ? { resultCode: 200, data: { code, originalUrl: KNOWN[code] } } : { resultCode: 404, data: null };
    },
    manifest: () => (manifest ??= build()),
    // Η λήψη της ενημέρωσης, ψεύτικη αλλά με πρόοδο: χωρίς αυτό η μπάρα και τα μηνύματα
    // δεν περπατιούνται ποτέ χωρίς αληθινή τηλεόραση.
    selfUpdate: async (_url, onProgress) => {
      for (let p = 0; p <= 100; p += 10) {
        onProgress?.(p);
        if (speed) await new Promise((r) => setTimeout(r, 120 * speed));
      }
      return true;
    },
    canSelfInstall: async () => true,
    openSelfInstallPermission: async () => true,
    ...mockSelf(speed, playBuild, canPickFile),
  };
}
