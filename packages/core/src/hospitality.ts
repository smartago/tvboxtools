// The kiosk picker's data (docs/TASKS_HUB_PLAN.md §10, design session 23/9 "Kiosk Pick"): which
// app takes control of a box in a hotel, a BnB or a public place. Same shape as the launcher
// picker's rows, because the question is the same kind — "what opens on HOME" — with one more
// thing at the end: the lock.
//
// The rules carry over from launchers.ts, all of them load-bearing:
//   - Ours (the hotel launcher) is the one row the tool may fetch and install itself — in every
//     edition, because it is our APK from our manifest. On a copy that came from Google Play the
//     row goes to Play like everybody else (`canDirectInstall` decides, not this file).
//   - Nobody else's APK is ever fetched by us. A hospitality app the box does not have opens ITS
//     Play page on the television and the remote does the installing.
//   - Names in our own type, never their logos: the letter tile is a placeholder, the box's own
//     icon replaces it once the app is installed.
import { hotelTarget, type BrandConfig } from './brand.js';
import type { BoxCheck } from './check.js';
import { notALauncher, stockName, type LauncherRow } from './launchers.js';

export interface HospitalityApp {
  id: string;
  package: string;
  name: string;
  /** The letter on the placeholder tile, and its colour — until the box shows us the real icon. */
  letter: string;
  tint: string;
}

/**
 * The hospitality apps we name when they are NOT on the box, in the order shown. Package ids
 * checked against their Play listings on 23/9/2026 (com.zonesage.welcomescreen, nz.co.unix.iptv
 * answered 200). Smartiv Hospitality is NOT here: its package is unknown, and a row that cannot
 * open a Play page is a row that does nothing.
 */
export const HOSPITALITY_APPS: readonly HospitalityApp[] = [
  { id: 'viggo', package: 'com.viggo.viggoandroidtvlauncher', name: 'Viggo Hospitality', letter: 'V', tint: '#2563EB' },
  { id: 'smarthotel', package: 'com.smarthoteltv', name: 'Smart Hotel TV', letter: 'S', tint: '#0EA5E9' },
  { id: 'welcome', package: 'com.zonesage.welcomescreen', name: 'WelcomeScreen', letter: 'W', tint: '#10B981' },
  { id: 'betterstr', package: 'nz.co.unix.iptv', name: 'BetterSTR TV', letter: 'B', tint: '#F97316' },
];

/**
 * Its name on this screen: the Play listing's, shortened to one line. The target file says
 * "Hotel TV" — right in its own sentences and wrong next to four competitors listed by their
 * store names.
 */
export const HOTEL_LAUNCHER_NAME = 'Hotel TV Launcher';

/**
 * The kiosk picker's rows for this box: the hotel launcher (ours), the hospitality apps we know,
 * and whatever else the box can already open on HOME that is not a stock launcher — the "other
 * hotel TV solution" the person may already have. No "let the box ask" row: a locked box asks
 * nobody anything.
 *
 * `brand` is the edition that is running: `ours` is true only when the hotel launcher is ITS
 * launcher, because that is what the run's install/configure tasks address. `family` is true in
 * every edition — the tool may fetch the APK.
 */
export function hospitalityRows(brand: BrandConfig, check: BoxCheck | null): LauncherRow[] {
  const hotel = hotelTarget();
  const home = check?.homeApps ?? [];
  const installed = new Set(check?.installedPackages ?? []);
  const componentOf = (pkg: string) => home.find((h) => h.package === pkg)?.component ?? null;
  const isInstalled = (pkg: string) => installed.has(pkg) || home.some((h) => h.package === pkg);
  const currentPkg = check?.currentHome ? check.currentHome.split('/')[0] : null;

  const rows: LauncherRow[] = [
    {
      id: 'ours',
      kind: 'ours',
      package: hotel.launcherPackage,
      name: HOTEL_LAUNCHER_NAME,
      component: componentOf(hotel.launcherPackage) ?? hotel.launcherHomeComponent,
      installed: isInstalled(hotel.launcherPackage),
      current: currentPkg === hotel.launcherPackage,
      ours: brand.launcherPackage === hotel.launcherPackage,
      family: true,
      stock: false,
      play: true,
    },
  ];
  for (const a of HOSPITALITY_APPS) {
    rows.push({
      id: a.id,
      kind: 'known',
      package: a.package,
      name: a.name,
      component: componentOf(a.package),
      installed: isInstalled(a.package),
      current: currentPkg === a.package,
      ours: false,
      stock: false,
      play: true,
      tint: a.tint,
    });
  }
  // Anything else the box can open on HOME, minus the stock launchers (a kiosk is never the stock
  // home) and minus the OTHER edition's launcher — the consumer launcher is not a hotel solution.
  for (const h of home) {
    if (notALauncher(h.package)) continue;
    if (stockName(h.package) || h.package === check?.stockLauncher) continue;
    if (h.package === brand.launcherPackage && !rows[0]!.ours) continue;
    if (rows.some((r) => r.package === h.package)) continue;
    rows.push({
      id: h.package,
      kind: 'found',
      package: h.package,
      name: h.package,
      component: h.component,
      installed: true,
      current: currentPkg === h.package,
      ours: false,
      stock: false,
      play: false,
    });
  }
  return rows;
}

/** The Accounts screen ON the box — the only reliable way to remove a Google account without root. */
export const ACCOUNTS_INTENT = 'am start -a android.settings.SYNC_SETTINGS';
