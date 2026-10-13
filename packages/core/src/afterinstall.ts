// ΜΕΤΑ ΤΗΝ ΕΓΚΑΤΑΣΤΑΣΗ (Jim, 11/10/2026, για το AirPlay του Hotel TV): «να δίνει το TV Box Tools την
// άδεια από adb και μετά να το τρέχει, ώστε να ενεργοποιηθεί» — και, την ίδια μέρα: «βάλε το permission
// και το run στα json data του app στο list item, ώστε αν στο μέλλον συμπληρώσουμε νέα apps να μη
// χρειάζεται νέα έκδοση του TV Box Tools».
//
// Γιατί το AirPlay Receiver (jqssun) θέλει και τα δύο, μετρημένο στον κώδικά του:
//   - Το service του ξεκινά στο boot (BootReceiver), ΑΛΛΑ το Android δεν στέλνει BOOT_COMPLETED σε
//     εφαρμογή που δεν άνοιξε ποτέ (stopped state). Το service δεν είναι exported και το
//     BOOT_COMPLETED είναι προστατευμένο — ο μόνος δρόμος από το shell είναι η ίδια η οθόνη του.
//   - Όταν συνδεθεί iPhone, φέρνει μπροστά την οθόνη του από το παρασκήνιο· από Android 10 αυτό θέλει
//     «Εμφάνιση πάνω από άλλες εφαρμογές».
//
// ΤΙ ΓΡΑΦΕΙ Η ΓΡΑΜΜΗ ΤΗΣ ΛΙΣΤΑΣ (`after` στο JSON του tag):
//   {"appops": ["SYSTEM_ALERT_WINDOW"], "grant": ["POST_NOTIFICATIONS"], "open": true}
// ή η σύντομη μορφή ["overlay", "open"] (overlay = appops SYSTEM_ALERT_WINDOW).
//
// ΕΥΕΛΙΚΤΟ ΑΛΛΑ ΟΧΙ ΕΛΕΥΘΕΡΟ: ο server διαλέγει ΟΝΟΜΑΤΑ (ποια appop, ποια άδεια, αν θα ανοίξει), ποτέ
// εντολή. Κάθε όνομα περνά από αυστηρό σχήμα (κεφαλαία/τελείες — κανένα κενό, κανένα `;`), οπότε η
// εντολή που φτιάχνεται είναι πάντα μία από τις τρεις μορφές πιο κάτω. Λίγα ονόματα που θα έδιναν σε
// ξένη εφαρμογή τον έλεγχο του κουτιού απορρίπτονται ρητά.
//
// ΚΑΝΟΝΑΣ (μνήμη no-silent-permissions-for-third-party-apps, «ΔΕΥΤΕΡΗ ΕΞΑΙΡΕΣΗ»): ισχύει ΜΟΝΟ για ό,τι
// ζητά ρητά η γραμμή της λίστας, μόνο σε αντίγραφο που ΜΟΛΙΣ εγκατέστησε το εργαλείο (ποτέ σε ό,τι
// βρήκε στο κουτί). Από 12/10/2026 και από το αντίγραφο Play του εργαλείου, και χωρίς δήλωση στην οθόνη
// (Jim: ο reseller δεν βλέπει τεχνικά — η απόφαση ζει στο admin).

/** Τι θα γίνει μετά την εγκατάσταση. Κενό σχέδιο = τίποτα. */
export interface AfterPlan {
  /** `appops set <pkg> <OP> allow` — π.χ. SYSTEM_ALERT_WINDOW. */
  appops: string[];
  /** `pm grant <pkg> <permission>` — πλήρες όνομα (android.permission.X). */
  grant: string[];
  /** Άνοιγμα μία φορά, ώστε να βγει από το stopped state και να σηκώσει ό,τι σηκώνει. */
  open: boolean;
}

/** Πόσο αφήνουμε την εφαρμογή ανοιχτή πριν γυρίσουμε: αρκεί για να σηκώσει το service της. */
export const OPEN_SETTLE_MS = 6000;

/** Όριο ανά λίστα — μια γραμμή που ζητά 30 άδειες δεν είναι γραμμή, είναι λάθος. */
const MAX_PER_KIND = 8;

const APPOP_RE = /^[A-Z][A-Z0-9_]{2,63}$/;
const PERM_RE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;

/**
 * Ονόματα που ΔΕΝ δίνονται από τη λίστα, ό,τι κι αν γράφει: κάνουν μια ξένη εφαρμογή διαχειριστή του
 * κουτιού (ρυθμίσεις συστήματος, logs όλων των εφαρμογών, εγκαταστάσεις). Αν κάποτε χρειαστεί ένα από
 * αυτά, είναι απόφαση με όνομα — όχι γραμμή στο admin.
 */
const DENY_PERMS = new Set([
  'android.permission.WRITE_SECURE_SETTINGS',
  'android.permission.READ_LOGS',
  'android.permission.DUMP',
  'android.permission.INSTALL_PACKAGES',
  'android.permission.DELETE_PACKAGES',
  'android.permission.MANAGE_DEVICE_ADMINS',
  'android.permission.INTERACT_ACROSS_USERS',
  'android.permission.INTERACT_ACROSS_USERS_FULL',
]);
const DENY_APPOPS = new Set(['REQUEST_INSTALL_PACKAGES', 'REQUEST_DELETE_PACKAGES', 'MANAGE_EXTERNAL_STORAGE']);

/** Οι σύντομες λέξεις της πρώτης μορφής (πίνακας). */
const SHORT: Record<string, (p: AfterPlan) => void> = {
  overlay: (p) => void p.appops.push('SYSTEM_ALERT_WINDOW'),
  open: (p) => void (p.open = true),
};

export const emptyPlan = (): AfterPlan => ({ appops: [], grant: [], open: false });
export const planIsEmpty = (p: AfterPlan | undefined): boolean => !p || (!p.appops.length && !p.grant.length && !p.open);

const uniq = (a: string[]) => [...new Set(a)];

/**
 * Το `after` της γραμμής → σχέδιο. Ό,τι δεν στέκει γυρνά στο `problems` (μπαίνει στις απορρίψεις της
 * λίστας ΜΕ ΛΟΓΟ) — η γραμμή όμως μένει: το app εγκαθίσταται, απλώς χωρίς το βήμα που δεν στέκει.
 */
export function parseAfter(v: unknown): { plan: AfterPlan; problems: string[] } {
  const plan = emptyPlan();
  const problems: string[] = [];
  if (v === undefined || v === null || v === '') return { plan, problems };

  if (Array.isArray(v)) {
    for (const x of v) {
      const w = typeof x === 'string' ? x.trim().toLowerCase() : '';
      if (SHORT[w]) SHORT[w](plan);
      else problems.push(`after: "${String(x)}" is not one of ${Object.keys(SHORT).join(', ')}`);
    }
  } else if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) if (!['appops', 'grant', 'open'].includes(k)) problems.push(`after: unknown key "${k}"`);
    const list = (key: string): string[] => {
      const raw = o[key];
      if (raw === undefined) return [];
      if (!Array.isArray(raw)) {
        problems.push(`after.${key} must be a list`);
        return [];
      }
      return raw.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
    };
    for (const op of list('appops')) {
      const up = op.toUpperCase();
      if (!APPOP_RE.test(up)) problems.push(`after.appops: "${op}" is not an appop name`);
      else if (DENY_APPOPS.has(up)) problems.push(`after.appops: ${up} is never granted from the list`);
      else plan.appops.push(up);
    }
    for (const g of list('grant')) {
      // σύντομο όνομα = της πλατφόρμας: POST_NOTIFICATIONS → android.permission.POST_NOTIFICATIONS
      const full = g.includes('.') ? g : `android.permission.${g.toUpperCase()}`;
      if (!PERM_RE.test(full)) problems.push(`after.grant: "${g}" is not a permission name`);
      else if (DENY_PERMS.has(full)) problems.push(`after.grant: ${full} is never granted from the list`);
      else plan.grant.push(full);
    }
    if (o.open !== undefined) {
      if (typeof o.open === 'boolean') plan.open = o.open;
      else problems.push('after.open must be true or false');
    }
  } else {
    problems.push('after must be a list or an object');
  }

  plan.appops = uniq(plan.appops);
  plan.grant = uniq(plan.grant);
  if (plan.appops.length > MAX_PER_KIND) {
    problems.push(`after.appops: more than ${MAX_PER_KIND} — the rest ignored`);
    plan.appops = plan.appops.slice(0, MAX_PER_KIND);
  }
  if (plan.grant.length > MAX_PER_KIND) {
    problems.push(`after.grant: more than ${MAX_PER_KIND} — the rest ignored`);
    plan.grant = plan.grant.slice(0, MAX_PER_KIND);
  }
  return { plan, problems };
}

// -- ΕΝΤΟΛΕΣ: οι μόνες μορφές που βγαίνουν από ένα σχέδιο --

export function appopCommand(pkg: string, op: string): string {
  return `appops set ${pkg} ${op} allow`;
}

export function grantCommand(pkg: string, perm: string): string {
  return `pm grant ${pkg} ${perm}`;
}

/**
 * Η οθόνη που ανοίγει η εφαρμογή, όπως τη δηλώνει. Πρώτα η τηλεοπτική (LEANBACK), μετά η κανονική.
 * Το πακέτο στο τέλος περιορίζει την απάντηση σε αυτό — χωρίς αυτό θα απαντούσε όποια άλλη εφαρμογή.
 */
export function resolveLaunchCommand(pkg: string, tv: boolean): string {
  return `cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.${tv ? 'LEANBACK_LAUNCHER' : 'LAUNCHER'} ${pkg}`;
}

/** Η τελευταία γραμμή `pkg/.Cls` της απάντησης του `resolve-activity --brief`, μόνο αν ανήκει στο πακέτο. */
export function parseLaunchComponent(output: string, pkg: string): string | null {
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[\w.]+\/[\w.$]+$/.test(l));
  const last = lines.pop();
  return last && last.startsWith(pkg + '/') ? last : null;
}

/** `pkg/.Activity` → `am start -n …`. Το component το δίνει το ίδιο το κουτί, δεν το μαντεύουμε. */
export function startCommand(component: string): string {
  return `am start -n ${component}`;
}

/** Μετά το άνοιγμα, πίσω στην αρχική — το κουτί δεν μένει στην οθόνη μιας εφαρμογής που δεν διάλεξε κανείς. */
export const HOME_COMMAND = 'input keyevent KEYCODE_HOME';
