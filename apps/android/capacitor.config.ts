import type { CapacitorConfig } from '@capacitor/cli';

// ONE Capacitor project, ONE product (27/9/2026: the kiosk brand is gone; README, docs/SIGNING.md).
// `TVLM_BRAND` is kept as the knob's name — only `launcher` exists:
//   TVLM_BRAND=launcher npx cap sync android  → com.tv.launcher.manager.adb.tvboxtools, apps/web/dist/launcher
// The gradle flavours (android/app/build.gradle) carry the SAME ids — appId here only feeds
// `cap sync` (capacitor.config.json in assets) and `cap add`; the APK's applicationId comes
// from the brand flavour. Keep the two in step.
const brands = {
  launcher: { appId: 'com.tv.launcher.manager.adb.tvboxtools', appName: 'TV Launcher Manager', webDir: '../web/dist/launcher' },
} as const;

type BrandId = keyof typeof brands;
const requested = process.env.TVLM_BRAND ?? 'launcher';
if (!(requested in brands)) throw new Error(`TVLM_BRAND must be one of ${Object.keys(brands).join(', ')} (got "${requested}")`);
const brand = brands[requested as BrandId];

const config: CapacitorConfig = {
  appId: brand.appId,
  appName: brand.appName,
  webDir: brand.webDir,
  android: {
    // The app talks to the box over raw sockets through the AdbSocket plugin, never through the
    // WebView, so nothing needs cleartext or mixed content. No `server` block: the bundle is
    // served from the APK assets (https://localhost) — that keeps WebCrypto (Tango's RSA key)
    // available, which a plain-http origin would lose.
    allowMixedContent: false,
  },
};

export default config;
