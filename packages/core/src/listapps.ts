// ΕΦΑΡΜΟΓΕΣ ΑΠΟ ΛΙΣΤΑ ΤΟΥ SMRT ADMIN (Jim, 8/10/2026: «μαζί με το install του hoteltv app να βάζεις
// και μερικά άλλα apps ανάλογα το είδος του install, και αυτά θα τα παίρνεις από τη λίστα
// HOTELTV_APPS_INCLUDE_SETUP»). Μελέτη: C:\DEV\AI\HOTELTV_INCLUDE_APPS_STUDY.md.
//
// Η οθόνη «What should we install?» ξέρει ήδη να δείχνει πολλά apps με τύπους — ζωγραφίζει
// `ManifestApp[]` και το `in` λέει σε ποιους τύπους ανάβει το τικ. Εδώ ΜΟΝΟ η μετατροπή: μια γραμμή
// λίστας (`get-lists`) γίνεται `ManifestApp`, ή πετιέται ΜΕ ΛΟΓΟ. Ποτέ σιωπηλά: η παγίδα «row πετιέται
// σιωπηλά» του WALLPAPERS_V2 καταγράφηκε ήδη μία φορά.
//
// Η γραμμή: `body` = όνομα, `subBody` = η γραμμή κάτω από το όνομα, `iconCode` = εικονίδιο — και τα
// τρία ΜΕΤΑΦΡΑΣΜΕΝΑ από τον server (ζητάμε `lag`, πέφτει στο US). Το `tag` = JSON με ό,τι δεν είναι
// κείμενο: `pkg`, `url`, `install_type`, και προαιρετικά `size`, `sha256`, `versionCode`, `role`,
// `use`, `group`, `license`. Ίδια ονόματα με το manifest, ώστε η μετατροπή να είναι αντιγραφή.
import { parseAbis } from './abi.js';
import { parseAfter, planIsEmpty } from './afterinstall.js';
import type { InstallType, ManifestApp, Role } from './manifest.js';

/** Το κλειδί της λίστας, ΟΠΩΣ ΕΙΝΑΙ στη βάση — με το τυπογραφικό (INLCUDE). Ένα rename σπάει ό,τι το έχει. */
export const HOTEL_APPS_LIST_KEY = 'HOTELTV_APPS_INLCUDE_SETUP';

/** Μία γραμμή όπως τη γυρνά το `get-lists` (μόνο ό,τι διαβάζουμε). */
export interface ListRow {
  comboId?: string;
  sortOrderId?: number;
  iconCode?: string;
  body?: string;
  subBody?: string;
  tag?: string;
}

/** Οι τέσσερις τιμές του admin. `none` = φαίνεται, δεν τικάρεται πουθενά — το χέρι το ανάβει. */
export type ListInstallType = 'all' | 'typical' | 'full' | 'none';
export const LIST_INSTALL_TYPES: readonly ListInstallType[] = ['all', 'typical', 'full', 'none'];

/** `install_type` της λίστας → το `in` του manifest. */
export function installTypeToIn(t: ListInstallType): InstallType[] {
  switch (t) {
    case 'all':
      return ['min', 'typ', 'full'];
    case 'full':
      return ['full'];
    case 'none':
      return [];
    default:
      return ['typ', 'full'];
  }
}

/** Ένα app από τη λίστα — ManifestApp, συν ό,τι χρειάζεται η οθόνη και ο ήχος της προέλευσης. */
export interface ListApp extends ManifestApp {
  /** Από τη λίστα, όχι από το manifest: το εικονίδιο έρχεται από `iconCode`, όχι από `launchers/<pkg>.png`. */
  fromList: true;
  /** Το εικονίδιο, ήδη πλήρης διεύθυνση (δες `iconUrl`). Κενό = γράμμα. */
  icon: string;
  /** Σε ποιες ΧΡΗΣΕΙΣ εμφανίζεται (bnb/hotel/reseller). Κενό = σε όλες. */
  use: string[];
  size?: string;
}

/**
 * Το Icon Code του admin, όπως το διαβάζει ο ίδιος ο admin (`processIconCode`): πλήρης διεύθυνση
 * μένει ως έχει, διαδρομή `/…` ανήκει στο smartago.net. Κενό = κανένα εικονίδιο.
 */
export function iconUrl(iconCode: string | undefined): string {
  const s = (iconCode ?? '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  return `https://smartago.net${s.startsWith('/') ? '' : '/'}${s}`;
}

export interface ListConversion {
  apps: ListApp[];
  /** Μία γραμμή ανά απόρριψη, για την κονσόλα του εργαλείου: «γραμμή 10: tag δεν είναι JSON». */
  rejected: string[];
}

interface TagJson {
  pkg?: unknown;
  url?: unknown;
  install_type?: unknown;
  size?: unknown;
  sha256?: unknown;
  versionCode?: unknown;
  role?: unknown;
  use?: unknown;
  group?: unknown;
  license?: unknown;
  after?: unknown;
  abis?: unknown;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().toLowerCase()).filter(Boolean) : []);

/**
 * Γραμμές της λίστας → apps για την οθόνη. Όσα δεν στέκουν πετιούνται ΜΕ ΛΟΓΟ.
 *
 * Το `sha256` μένει ΚΕΝΟ όταν λείπει: η μηχανή αποφασίζει τι σημαίνει αυτό (ours over HTTPS →
 * εγκατάσταση χωρίς έλεγχο· ξένος host → άρνηση). Εδώ ΔΕΝ κρίνουμε την προέλευση — μόνο το σχήμα.
 */
export function appsFromList(rows: readonly ListRow[]): ListConversion {
  const apps: ListApp[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = row.comboId ? `row ${row.comboId}` : 'row';
    let j: TagJson;
    try {
      const parsed: unknown = JSON.parse(row.tag ?? '');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      j = parsed as TagJson;
    } catch {
      rejected.push(`${id} (${row.body ?? '?'}): tag is not a JSON object`);
      continue;
    }
    const pkg = str(j.pkg);
    const url = str(j.url);
    if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(pkg)) {
      rejected.push(`${id} (${row.body ?? '?'}): pkg missing or not a package name`);
      continue;
    }
    if (!/^https:\/\//i.test(url)) {
      rejected.push(`${id} (${row.body ?? '?'}): url missing or not https`);
      continue;
    }
    if (seen.has(pkg)) {
      rejected.push(`${id} (${row.body ?? '?'}): ${pkg} appears twice — first row wins`);
      continue;
    }
    seen.add(pkg);
    const rawType = str(j.install_type).toLowerCase();
    const type: ListInstallType = (LIST_INSTALL_TYPES as readonly string[]).includes(rawType) ? (rawType as ListInstallType) : 'typical';
    if (rawType && type !== rawType) rejected.push(`${id} (${row.body ?? '?'}): install_type "${rawType}" unknown — using typical`);
    const sha = str(j.sha256).toLowerCase();
    const role = strList(j.role).filter((r): r is Role => r === 'owner' || r === 'reseller');
    const vc = typeof j.versionCode === 'number' && Number.isFinite(j.versionCode) ? Math.trunc(j.versionCode) : 0;
    // ΜΕΤΑ ΤΗΝ ΕΓΚΑΤΑΣΤΑΣΗ: ό,τι δεν στέκει αναφέρεται, η γραμμή μένει (εγκαθίσταται χωρίς αυτό το βήμα)
    const after = parseAfter(j.after);
    for (const p of after.problems) rejected.push(`${id} (${row.body ?? '?'}): ${p}`);
    apps.push({
      pkg,
      name: (row.body ?? '').trim() || pkg,
      url,
      sha256: /^[0-9a-f]{64}$/.test(sha) ? sha : '',
      versionCode: vc,
      required: false,
      role: role.length ? role : ['owner', 'reseller'],
      in: installTypeToIn(type),
      summary: (row.subBody ?? '').trim() || undefined,
      group: str(j.group) || undefined,
      license: str(j.license) || undefined,
      size: typeof j.size === 'number' ? humanSize(j.size) : str(j.size) || undefined,
      after: planIsEmpty(after.plan) ? undefined : after.plan,
      abis: parseAbis(j.abis),
      use: strList(j.use),
      icon: iconUrl(row.iconCode),
      fromList: true,
    });
  }
  return { apps, rejected };
}

/** Bytes από το admin (`"size": 25866040`) → «24.7 MB» για την οθόνη. Κείμενο μένει όπως είναι. */
function humanSize(n: number): string | undefined {
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Το URL του `get-lists` για αυτή τη λίστα, στη γλώσσα του εργαλείου (ο server πέφτει στο US). */
export function hotelAppsListUrl(lang: string): string {
  const lag = (lang || 'en').slice(0, 2).toUpperCase().replace(/^EN$/, 'US');
  return `https://api.smartago.net/api/multi/get-lists?lag=${encodeURIComponent(lag)}&listKey=${encodeURIComponent(HOTEL_APPS_LIST_KEY)}&lastTimestamp=0&apiBuild=1`;
}
