// The host hooks the UI needs for Install: fetch an APK as a stream, hash a stream, get the manifest.
// Real: fetch(brand.manifestUrl) + WebCrypto. Mock (no box, no site yet): a manifest shaped like the
// contract (docs/provision-contract.md §5) whose "APKs" are small deterministic byte streams with REAL
// sha256 values, so the engine's stream → hash → install path runs for real.
import { validateManifest, type BrandConfig, type Manifest } from '@tvlm/core';
import { appIcons, openSystemSettings, selfInfo, type SelfInfo, type SettingsScreen } from '@tvlm/adb/capacitor';
import { Clipboard } from '@capacitor/clipboard';

export interface Hooks {
  fetchApk: (url: string) => Promise<{ stream: ReadableStream<Uint8Array>; size?: number }>;
  sha256: (stream: ReadableStream<Uint8Array>) => Promise<string>;
  manifest: () => Promise<Manifest>;
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
 * `manifestUrl` overrides the brand's published list — the `?manifest=` / `TVLM_MANIFEST` escape
 * hatch for walking the flow with a build that is not published yet (Jim, 23/9). It lives HERE and
 * not only in the session, because this hook is what actually goes to the network: a session that
 * knew a different address while the hook kept fetching the published one is how the tool quietly
 * installed the server's build while the log claimed otherwise.
 */
export function realHooks(brand: BrandConfig, manifestUrl = brand.manifestUrl): Hooks {
  // the desktop shell puts its API on `window.tvlm` (apps/desktop/src/preload.ts)
  const host = (window as unknown as { tvlm?: { mirror?: (t: string) => Promise<{ ok: boolean; reason?: 'missing' | 'failed'; message?: string }> } }).tvlm;
  return {
    ...(host?.mirror ? { mirror: (target: string) => host.mirror!(target) } : {}),
    fetchApk: async (url) => {
      const r = await fetch(url);
      if (!r.ok || !r.body) throw new Error(`GET ${url} → ${r.status}`);
      const len = r.headers.get('content-length');
      return { stream: r.body as ReadableStream<Uint8Array>, size: len ? parseInt(len, 10) : undefined };
    },
    sha256: sha256Stream,
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
    return validateManifest({ schema: 1, tool: { version: '0.1.0', minVersion: '0.1.0', downloads: {}, sha256: {} }, apps });
  };
  return {
    fetchApk: async (url) => {
      const pkg = /\/dl\/(.+)\.apk$/.exec(url)?.[1] ?? url;
      return fakeApk(pkg, speed);
    },
    sha256: sha256Stream,
    manifest: () => (manifest ??= build()),
    ...mockSelf(speed, playBuild, canPickFile),
  };
}
