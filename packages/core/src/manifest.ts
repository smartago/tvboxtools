// `/dl/manifest.json` (contract §5): what to install, from the site, never hardcoded.

export type Role = 'owner' | 'reseller';
// `mac` is the Apple Silicon build and `mac-intel` the x86_64 one: two different files, so two
// keys. Everything else is one file per platform.
export type Platform = 'win' | 'mac' | 'mac-intel' | 'linux' | 'android';

/**
 * Hosts whose files are ours, served to us over TLS. For these the manifest's `sha256` is a record,
 * not a gate: HTTPS already proves the bytes came from us unchanged, and a hash frozen at publish
 * time only goes stale — on 23/9 it silently blocked EVERY install for every user, hours after
 * Premium TV Launcher was rebuilt (1285 → 1289) and the manifest still carried yesterday's digest.
 *
 * Anything NOT on this list is still refused on a mismatch. We verify what we do not control.
 */
export const OUR_HOSTS: readonly string[] = ['smartago.net', 'tvboxtools.com', 'hoteltvapp.com', 'pluitv.com', 'zukka.app'];

/** Is this URL one of ours, over TLS? Sub-domains count; plain http never does. */
export function ourFile(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && OUR_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export interface ManifestApp {
  pkg: string;
  name: string;
  url: string;
  sha256: string;
  versionCode: number;
  required: boolean;
  role: Role[];
  /** Exactly one app per group gets installed (the AirPlay receivers). */
  group?: string;
  /** The install types this app belongs to (`appsForType`). Absent = Typical + Full. */
  in?: InstallType[];
  /** One line under the name on the Install screen ("Guests cast from iPhone · PIN on"). */
  summary?: string;
  license?: string;
}

export interface Manifest {
  schema: 1;
  tool: {
    version: string;
    minVersion: string;
    /** The file OF THIS VERSION — an unchanging pair with `sha256`, which is what an update checks. */
    downloads: Partial<Record<Platform, string>>;
    /**
     * The same files under names that carry no version, so a link put on somebody else's site
     * keeps giving the newest build (Jim, 29/9). Absent in manifests written before that day —
     * a reader falls back to `downloads`.
     */
    latest?: Partial<Record<Platform, string>>;
    sha256: Partial<Record<Platform, string>>;
  };
  apps: ManifestApp[];
}

/**
 * The three install types of the Hotel TV setup (design 24/9, "Hotel TV Install"): Minimal = the
 * launcher alone, Typical = the launcher + the apps chosen for the use, Full = everything the admin
 * panel lists. Which app belongs where is DATA — the manifest's `in` — not a list in the tool.
 */
export type InstallType = 'min' | 'typ' | 'full';
export const INSTALL_TYPES: readonly InstallType[] = ['typ', 'min', 'full'];

/**
 * The apps an install type puts on the box. A required app is in every type; an app that says
 * nothing about types is in Typical and Full (the sensible default for "one of ours").
 */
export function appsForType<A extends ManifestApp>(apps: readonly A[], type: InstallType): A[] {
  const fits = apps.filter((a) => a.required || (a.in ?? ['typ', 'full']).includes(type));
  // "Exactly one app per group" (the AirPlay receivers): the required member if it fits, else the first.
  const oneOf = new Map<string, A>();
  for (const a of fits) if (a.group && (!oneOf.has(a.group) || (a.required && !oneOf.get(a.group)!.required))) oneOf.set(a.group, a);
  return fits.filter((a) => !a.group || oneOf.get(a.group) === a);
}

export function validateManifest(x: unknown): Manifest {
  if (!x || typeof x !== 'object') throw new Error('manifest: not an object');
  const m = x as Manifest;
  if (m.schema !== 1) throw new Error(`manifest: unsupported schema ${String((m as { schema?: unknown }).schema)}`);
  if (!m.tool || typeof m.tool.version !== 'string') throw new Error('manifest: tool.version missing');
  if (!Array.isArray(m.apps)) throw new Error('manifest: apps missing');
  for (const a of m.apps) {
    for (const k of ['pkg', 'name', 'url', 'sha256'] as const) {
      if (typeof a[k] !== 'string' || !a[k]) throw new Error(`manifest: app ${a.pkg ?? '?'} missing ${k}`);
    }
    if (!/^[0-9a-f]{64}$/i.test(a.sha256)) throw new Error(`manifest: app ${a.pkg} sha256 malformed`);
    if (typeof a.versionCode !== 'number') throw new Error(`manifest: app ${a.pkg} versionCode missing`);
    if (typeof a.required !== 'boolean') throw new Error(`manifest: app ${a.pkg} required missing`);
    if (!Array.isArray(a.role)) throw new Error(`manifest: app ${a.pkg} role missing`);
  }
  return m;
}

export interface PickOptions {
  role: Role;
  /** group → pkg the user explicitly chose (e.g. { airplay: 'com.github.mazer666.phairplay' }). */
  choices?: Record<string, string>;
  /** Already-installed pkg → versionCode, to skip up-to-date apps. */
  installed?: Map<string, number | null>;
  /**
   * An explicit list (the Install screen's type, the picker's one app): exactly these, optional or
   * not. Without it only required apps are picked — and "Full" could never put VLC on the box.
   */
  only?: string[];
}

export interface PickedApp extends ManifestApp {
  action: 'install' | 'update' | 'skip-current';
}

/** Which apps to install for this role, honouring "one per group" and skipping up-to-date ones. */
export function pickApps(m: Manifest, opts: PickOptions): PickedApp[] {
  const out: PickedApp[] = [];
  const groupsDone = new Set<string>();
  if (opts.only) return m.apps.filter((a) => opts.only!.includes(a.pkg)).map((a) => withAction(a, opts.installed));
  const byGroup = new Map<string, ManifestApp[]>();
  for (const a of m.apps) if (a.group) byGroup.set(a.group, [...(byGroup.get(a.group) ?? []), a]);

  for (const a of m.apps) {
    if (a.group) {
      if (groupsDone.has(a.group)) continue;
      const chosen = opts.choices?.[a.group];
      const members = byGroup.get(a.group)!;
      const pick = chosen ? members.find((x) => x.pkg === chosen) : members.find((x) => x.required && x.role.includes(opts.role));
      groupsDone.add(a.group);
      if (!pick) continue;
      out.push(withAction(pick, opts.installed));
      continue;
    }
    if (!a.required || !a.role.includes(opts.role)) continue;
    out.push(withAction(a, opts.installed));
  }
  return out;
}

function withAction(a: ManifestApp, installed?: Map<string, number | null>): PickedApp {
  const have = installed?.get(a.pkg);
  if (have === undefined) return { ...a, action: 'install' };
  if (have !== null && have >= a.versionCode) return { ...a, action: 'skip-current' };
  return { ...a, action: 'update' };
}

/** Semver-ish compare for the tool's self-update: returns true when `current` < `minVersion`. */
export function toolOutdated(current: string, minVersion: string): boolean {
  const a = current.split('.').map((n) => parseInt(n, 10) || 0);
  const b = minVersion.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
