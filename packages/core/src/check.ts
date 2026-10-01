// `--check` (wizard step 8, DESIGN_NOTES §1): read-only facts about the box, parsed from shell output.

export interface BoxCheck {
  model: string;
  manufacturer: string;
  brand: string;
  device: string;
  serial: string;
  androidVersion: string;
  sdk: number;
  /** Google TV / Android TV / Fire TV / other, from ro.* properties. */
  platform: 'googletv' | 'androidtv' | 'firetv' | 'other';
  isTv: boolean;
  accounts: string[];
  freeBytes: number | null;
  totalBytes: number | null;
  /**
   * Whether the Play store is ON THIS BOX (`com.android.vending`). Everything the picker offers
   * for somebody else's launcher goes through Play — so a box without it cannot be sent there,
   * and saying so before the press is the difference between a plan and a dead end.
   */
  hasPlay: boolean;
  launcherInstalled: boolean;
  launcherVersionCode: number | null;
  installedPackages: string[];
  developerOptions: boolean;
  adbEnabled: boolean;
  stockLauncher: string | null;
  currentHome: string | null;
  /** Every app on this box that can open on HOME — the picker's list. */
  homeApps: HomeApp[];
  deviceOwner: string | null;
}

/** Commands the check runs, in order. All on the gate's allowlist. */
export const CHECK_COMMANDS = {
  getprop: 'getprop',
  accounts: 'dumpsys account',
  df: 'df /data',
  packages: 'pm list packages --show-versioncode',
  devSettings: 'settings get global development_settings_enabled',
  adbEnabled: 'settings get global adb_enabled',
  home: 'cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME',
  // Everything that CAN be home, not just what is. The picker is built from this: the box writes
  // the list, we never maintain one (docs/LAUNCHER_PICKER_PLAN.md).
  homeApps: 'cmd package query-activities --components -a android.intent.action.MAIN -c android.intent.category.HOME',
  deviceOwner: 'dumpsys device_policy',
} as const;

export type CheckOutputs = Partial<Record<keyof typeof CHECK_COMMANDS, string>>;

export function parseGetprop(out: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const m = /^\[([^\]]+)\]:\s*\[(.*)\]\s*$/.exec(line.trim());
    if (m) props[m[1]!] = m[2]!;
  }
  return props;
}

/**
 * `dumpsys window policy` → the package whose window has focus, or null.
 *
 * Measured on a Mi Box 4 (23/9): `am start` for a Play listing answers "Starting: Intent…" and
 * exits 0 whatever happens next — Play can then show its own error screen, or Google can take over
 * to ask for the password again, and the tool would still report that it sent the user to Play.
 * Four kilobytes of window policy say who actually came to the front.
 */
export function parseFocusedPackage(out: string): string | null {
  const m = /mFocusedWindow=Window\{[^}]*\s([A-Za-z0-9_.]+)\//.exec(out) ?? /mFocusedApp=.*?\s([A-Za-z0-9_.]+)\//.exec(out);
  return m ? m[1]! : null;
}

/** `dumpsys account` → account names (e.g. `someone@gmail.com`), Google + others. */
export function parseAccounts(out: string): string[] {
  const names = new Set<string>();
  for (const line of out.split('\n')) {
    const m = /Account\s*\{name=([^,}]+),\s*type=([^}]+)\}/.exec(line);
    if (m) names.add(m[1]!.trim());
  }
  return [...names];
}

/** `df /data` → { free, total } in bytes. Android's toybox prints 1K blocks by default. */
export function parseDf(out: string): { free: number | null; total: number | null } {
  const lines = out.trim().split('\n');
  const data = lines.find((l, i) => i > 0 && /\/data\b|\/data$/.test(l)) ?? lines[1];
  if (!data) return { free: null, total: null };
  const cols = data.trim().split(/\s+/);
  // Filesystem 1K-blocks Used Available Use% Mounted on  |  or with a size unit (G/M) when -h
  const total = toBytes(cols[1]);
  const free = toBytes(cols[3]);
  return { free, total };
}

function toBytes(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^(\d+(?:\.\d+)?)([KMGT]?)$/i.exec(v);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  const unit = (m[2] ?? '').toUpperCase();
  const mult = unit === '' ? 1024 : unit === 'K' ? 1024 : unit === 'M' ? 1024 ** 2 : unit === 'G' ? 1024 ** 3 : 1024 ** 4;
  return Math.round(n * mult);
}

/** `pm list packages --show-versioncode` → { pkg → versionCode | null }. */
export function parsePackages(out: string): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const line of out.split('\n')) {
    const m = /^package:(\S+?)(?:\s+versionCode:(\d+))?\s*$/.exec(line.trim());
    if (m) map.set(m[1]!, m[2] ? parseInt(m[2], 10) : null);
  }
  return map;
}

/** `cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME` → the component line. */
export function parseResolvedHome(out: string): string | null {
  const line = out
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /^[\w.]+\/[\w.$]+$/.test(l));
  return line ?? null;
}

/** `dumpsys device_policy` → the device owner package, if any. */
export function parseDeviceOwner(out: string): string | null {
  const m = /Device Owner:\s*\n?\s*admin=ComponentInfo\{([^}]+)\}/.exec(out) ?? /Device Owner:[^\n]*\n\s*(?:admin=)?ComponentInfo\{([^}]+)\}/.exec(out);
  if (m) return m[1]!;
  const m2 = /Device Owner:\s*\n?\s*(?:package|admin)=([\w.]+)/.exec(out);
  return m2 ? m2[1]! : null;
}

/** An app that can open on HOME: `com.example/.MainActivity`, split for convenience. */
export interface HomeApp {
  package: string;
  component: string;
}

/**
 * `cmd package query-activities --components …` → one `pkg/.Activity` per line. `--components` is
 * not on every Android, so the verbose format (ActivityInfo blocks) is read as well: same list,
 * same order, and nothing invented when neither shape is there.
 */
export function parseHomeApps(out: string): HomeApp[] {
  const found: HomeApp[] = [];
  const add = (pkg: string, cls: string) => {
    const component = cls.startsWith('.') || !cls.includes('.') ? `${pkg}/${cls.startsWith('.') ? cls : '.' + cls}` : `${pkg}/${cls}`;
    if (!found.some((f) => f.package === pkg)) found.push({ package: pkg, component });
  };
  for (const raw of out.split('\n')) {
    const line = raw.trim();
    const m = /^([a-zA-Z][\w.]*[\w])\/([\w.$]+)$/.exec(line);
    if (m) add(m[1]!, m[2]!);
  }
  if (found.length) return found;
  // verbose fallback: `name=<class>` then `packageName=<pkg>` inside each ActivityInfo block
  let cls: string | null = null;
  for (const raw of out.split('\n')) {
    const line = raw.trim();
    const n = /^name=([\w.$]+)$/.exec(line);
    if (n) {
      cls = n[1]!;
      continue;
    }
    const p = /^packageName=([\w.]+)$/.exec(line);
    if (p && cls) {
      add(p[1]!, cls.startsWith(p[1]! + '.') ? cls.slice(p[1]!.length) : cls);
      cls = null;
    }
  }
  return found;
}

export const STOCK_LAUNCHERS: Record<string, string> = {
  googletv: 'com.google.android.apps.tv.launcherx',
  androidtv: 'com.google.android.tvlauncher',
  firetv: 'com.amazon.tv.launcher',
};

export function detectPlatform(props: Record<string, string>, packages: Iterable<string>): BoxCheck['platform'] {
  const pk = new Set(packages);
  if (props['ro.product.manufacturer']?.toLowerCase() === 'amazon' || pk.has('com.amazon.tv.launcher')) return 'firetv';
  if (pk.has('com.google.android.apps.tv.launcherx')) return 'googletv';
  if (pk.has('com.google.android.tvlauncher')) return 'androidtv';
  return 'other';
}

export function buildCheck(outputs: CheckOutputs, launcherPackage: string): BoxCheck {
  const props = parseGetprop(outputs.getprop ?? '');
  const packages = parsePackages(outputs.packages ?? '');
  const platform = detectPlatform(props, packages.keys());
  const df = parseDf(outputs.df ?? '');
  const features = props['ro.build.characteristics'] ?? '';
  return {
    model: props['ro.product.model'] ?? '',
    manufacturer: props['ro.product.manufacturer'] ?? '',
    brand: props['ro.product.brand'] ?? '',
    device: props['ro.product.device'] ?? '',
    serial: props['ro.serialno'] ?? props['ro.boot.serialno'] ?? '',
    androidVersion: props['ro.build.version.release'] ?? '',
    sdk: parseInt(props['ro.build.version.sdk'] ?? '0', 10) || 0,
    platform,
    isTv: /tv/.test(features) || platform !== 'other',
    accounts: parseAccounts(outputs.accounts ?? ''),
    freeBytes: df.free,
    totalBytes: df.total,
    hasPlay: packages.has('com.android.vending'),
    launcherInstalled: packages.has(launcherPackage),
    launcherVersionCode: packages.get(launcherPackage) ?? null,
    installedPackages: [...packages.keys()],
    developerOptions: (outputs.devSettings ?? '').trim() === '1',
    adbEnabled: (outputs.adbEnabled ?? '').trim() === '1',
    stockLauncher: STOCK_LAUNCHERS[platform] ?? null,
    currentHome: parseResolvedHome(outputs.home ?? ''),
    homeApps: parseHomeApps(outputs.homeApps ?? ''),
    deviceOwner: parseDeviceOwner(outputs.deviceOwner ?? ''),
  };
}
