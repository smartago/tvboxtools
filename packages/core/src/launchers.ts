// The launcher picker's data (docs/LAUNCHER_PICKER_PLAN.md): which app should open when the user
// presses HOME. The tool sets ANY launcher as home — ours is one entry in the list, not the point
// of it — so the list is built from what the BOX reports, and the names we know are only there so a
// box with nothing on it still has somewhere to go.
//
// Three rules from the plan, all of them load-bearing:
//   - We never fetch, host or push another developer's APK — not even in the sideload edition,
//     where we technically could (Jim, 23/9: "just open Play, so the responsibility is never
//     ours"). Their row opens THEIR Play listing on the television and the remote does the rest.
//     The `direct` field that used to hold "an official download, if they ever publish one" is
//     deleted rather than left empty: a field that exists is a field somebody fills in.
//   - We never show their logos. The name in our own type is nominative use; a logo is not.
//   - The last row is always "let the box ask": disable the stock launcher and stop, which is the
//     honest answer for a launcher we have never heard of.
import { siblingLaunchers } from './brand.js';
import type { BrandConfig } from './brand.js';
import type { BoxCheck, HomeApp } from './check.js';

export interface KnownLauncher {
  id: string;
  package: string;
  name: string;
  /** Play listing id; the picker opens `market://details?id=…` ON the box. */
  play: boolean;
}

/**
 * The launchers we name when they are NOT on the box. Order is the order shown. Fire TV launchers
 * are deliberately absent (the plan: Amazon closed that route in Oct 2025).
 * Package ids verified against Play listings, 21/9/2026.
 */
export const KNOWN_LAUNCHERS: readonly KnownLauncher[] = [
  { id: 'projectivy', package: 'com.spocky.projengmenu', name: 'Projectivy Launcher', play: true },
  { id: 'monet', package: 'com.klevico.monet', name: 'Monet Launcher', play: true },
  // ATV Launcher was here and Jim took it off the design on 21/9: five rows plus "other" fit the
  // screen without scrolling, and the list is "most popular", not "every launcher that exists".
  { id: 'at4k', package: 'com.overdevs.at4k', name: 'AT4K Launcher', play: true },
];

/** The launchers a box ships with — named, so the row is not a bare package name. */
const STOCK_NAMES: Record<string, string> = {
  'com.google.android.tvlauncher': 'Android TV Home',
  'com.google.android.apps.tv.launcherx': 'Google TV Home',
  'com.amazon.tv.launcher': 'Fire TV Home',
};

/** Home activities that are not launchers: the stub the system falls back to while booting. */
const NOT_A_LAUNCHER = [/^com\.android\.tv\.settings\b/, /^com\.android\.settings\b/, /FallbackHome$/];

export type LauncherKind = 'ours' | 'known' | 'found' | 'ask';

export interface LauncherRow {
  id: string;
  kind: LauncherKind;
  /** Empty for the `ask` row — it is a method, not an app. */
  package: string;
  name: string;
  /** `pkg/.Activity` to pass to `set-home-activity`. Only known for installed entries. */
  component: string | null;
  installed: boolean;
  /** This box opens it on HOME today. */
  current: boolean;
  ours: boolean;
  /** The launcher this box came with — the one the restore path puts back. */
  stock: boolean;
  play: boolean;
  /**
   * Made by us, whichever edition is running: the tool may fetch its APK from OUR manifest.
   * `ours` is narrower — the launcher THIS edition is about, the one the run installs, grants and
   * broadcasts to. The hotel launcher on the TV Box Tools edition is `family` and not `ours`.
   */
  family?: boolean;
  /** A colour for the letter tile while the row has no icon of its own (the kiosk picker). */
  tint?: string;
}

/** Not a launcher at all: the system's boot-time stub. Shared with the kiosk picker. */
export function notALauncher(pkg: string): boolean {
  return NOT_A_LAUNCHER.some((re) => re.test(pkg));
}
const blocked = notALauncher;
/** The name of a launcher a box ships with, when it is one. Shared with the kiosk picker. */
export function stockName(pkg: string): string | undefined {
  return STOCK_NAMES[pkg];
}

/**
 * The picker's rows for this box: ours, the names we know, whatever else the box can already open
 * on HOME, and finally "let the box ask".
 *
 * `check` may be null (nothing read yet) — then only the names we know show, all as not installed.
 */
export function launcherRows(brand: BrandConfig, check: BoxCheck | null): LauncherRow[] {
  const home: HomeApp[] = check?.homeApps ?? [];
  const installed = new Set(check?.installedPackages ?? []);
  const componentOf = (pkg: string) => home.find((h) => h.package === pkg)?.component ?? null;
  const isInstalled = (pkg: string) => installed.has(pkg) || home.some((h) => h.package === pkg);
  const current = check?.currentHome ?? null;
  const currentPkg = current ? current.split('/')[0] : null;

  const rows: LauncherRow[] = [
    {
      id: 'ours',
      kind: 'ours',
      package: brand.launcherPackage,
      name: brand.launcherName,
      // Ours is the one component we know without asking the box — it is in the brand file.
      component: componentOf(brand.launcherPackage) ?? brand.launcherHomeComponent,
      installed: isInstalled(brand.launcherPackage),
      current: currentPkg === brand.launcherPackage,
      ours: true,
      stock: false,
      play: false,
    },
  ];

  for (const k of KNOWN_LAUNCHERS) {
    if (k.package === brand.launcherPackage) continue;
    rows.push({
      id: k.id,
      kind: 'known',
      package: k.package,
      name: k.name,
      component: componentOf(k.package),
      installed: isInstalled(k.package),
      current: currentPkg === k.package,
      ours: false,
      stock: false,
      play: k.play,
    });
  }

  // Anything else the box itself says can be home — including the stock launcher, which is a real
  // answer ("leave it as it is") and the one the restore path puts back.
  const siblings = siblingLaunchers(brand);
  for (const h of home) {
    if (blocked(h.package)) continue;
    if (siblings.has(h.package)) continue; // the other target's launcher is not on offer here
    if (rows.some((r) => r.package === h.package)) continue;
    rows.push({
      id: h.package,
      kind: 'found',
      package: h.package,
      name: STOCK_NAMES[h.package] ?? h.package,
      component: h.component,
      installed: true,
      current: currentPkg === h.package,
      ours: false,
      stock: h.package === check?.stockLauncher || h.package in STOCK_NAMES,
      play: false,
    });
  }

  rows.push({ id: 'ask', kind: 'ask', package: '', name: '', component: null, installed: true, current: false, ours: false, stock: false, play: false });
  return rows;
}

/** Open a Play listing ON the box. `market://` goes straight to the Play app on a TV. */
export function playIntent(pkg: string): string {
  return `am start -a android.intent.action.VIEW -d market://details?id=${pkg}`;
}

/**
 * SEARCH Play on the box, for "some launcher, any launcher" — the row that names no package.
 *
 * The query is percent-encoded and `&` is never used: this string is handed to a shell on the box,
 * and the command gate refuses anything carrying a shell metacharacter (`market://search?q=…&c=apps`
 * would both split the command and be rejected). `q=` alone still lands on Play's app results on a
 * television.
 */
export function playSearchIntent(query: string): string {
  return `am start -a android.intent.action.VIEW -d market://search?q=${encodeURIComponent(query)}`;
}

/** What we search for when the person wants "another launcher" and has no name in mind. */
export const LAUNCHER_SEARCH = 'android tv launcher';
