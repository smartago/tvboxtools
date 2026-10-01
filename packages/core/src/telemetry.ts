// Το «γεια» προς το οικοσύστημα: πόσοι το εγκατέστησαν, τι μηχάνημα έχουν, και τι έσπασε.
//
// ΔΕΝ ΕΙΝΑΙ ΔΙΚΟ ΜΑΣ ΣΧΗΜΑ. Είναι ΑΚΡΙΒΩΣ το payload που στέλνουν ήδη τα αδέρφια του — UNI,
// REMAP, Send-to-TV-Quick — από το `app-template/stores/activation.ts` του getnowappstore, που
// είναι κι αυτά Capacitor. Ό,τι φτάνει στο `api.smartago.net/api/multi/activation-static` το
// διαβάζουν έτοιμα διαγράμματα του admin· μια «βελτίωση» στο σχήμα σημαίνει μια σειρά που δεν
// μετριέται πουθενά.
//
// ΤΕΣΣΕΡΙΣ ΠΑΓΙΔΕΣ, ΟΛΕΣ ΓΡΑΜΜΕΝΕΣ ΣΤΟΝ ΙΔΙΟ ΤΟΝ SERVER ΕΠΕΙΔΗ ΚΟΣΤΙΣΑΝ:
//  1. `ram`/`storage` είναι ΑΡΙΘΜΟΙ. Το Kotlin PLUI σταμάτησε να τα στέλνει και κάθε activation
//     του έσκαγε με «[body.ram] is undefined» — καμία συσκευή δεν γράφτηκε.
//  2. Υποχρεωτικά: `appCode`, `deviceUID`, `androidId`, `api`, `cpu`. Στο web ο `androidId` είναι
//     κενό string — ΥΠΑΡΚΤΟ και κενό, όχι απόν.
//  3. Χωρίς `appType` ο server μαντεύει από το όνομα του πακέτου (v1 clients). Το στέλνουμε ρητά.
//  4. Το `description` του send-action πάει `encodeURIComponent(JSON.stringify(...))`, όπως τα
//     αδέρφια — ο admin το αποκωδικοποιεί για να το δείξει.

/** Το κλειδί που ενώνει devices, orders και profiles σε όλο το οικοσύστημα: ΤΟ PACKAGE. */
export const TELEMETRY_APP_CODE = 'com.tv.launcher.manager.adb.tvboxtools';

/** Το σύντομο όνομα, όπως `plui` / `tvs` / `dwtv` — για τις ετικέτες του admin. */
export const TELEMETRY_SHORT_CODE = 'TVBOXTools';
export const TELEMETRY_APP_NAME = 'TV BOX Tools';

/** Ποια όψη του εργαλείου μιλά: το APK, το πρόγραμμα του υπολογιστή, ή η σελίδα. */
export type TelemetryFace = 'android' | 'desktop' | 'web';

/** Το μηχάνημα στο οποίο τρέχει ΤΟ ΕΡΓΑΛΕΙΟ — όχι το box που διαχειρίζεται. */
export type TelemetryHost = 'Windows' | 'macOS' | 'Linux' | 'Android' | 'Web';

export interface TelemetryFacts {
  face: TelemetryFace;
  host: TelemetryHost;
  /** Η έκδοση του εργαλείου. */
  version: string;
  /** Σταθερή ταυτότητα: ANDROID_ID στο Android, αλλιώς το uuid που κρατάμε εμείς. */
  deviceUID: string;
  /** Μία συσκευή = ένας επισκέπτης, κοινός με τα σφάλματα. Μορφή `YYMM-DDHH-IISS-RRRR`. */
  visitorId: string;
  /** Η έκδοση του ΛΕΙΤΟΥΡΓΙΚΟΥ («14», «10.0.22631», «15.5») ή του browser. */
  osVersion: string;
  /** Android SDK level· αλλού `'0'`, όπως στο web των αδερφών. */
  api: string;
  /** Αρχιτεκτονική με παύλες (`arm64-v8a`)· στο web `'NONE'`. */
  cpu: string;
  /** Ήρθε από κατάστημα; Στο desktop/web ποτέ. */
  fromStore: boolean;
  manufacturer?: string;
  model?: string;
  /** GiB, ΑΡΙΘΜΟΙ (παγίδα 1). */
  ram?: number;
  storage?: number;
  /** Η μηχανή που ζωγραφίζει το UI — WebView στο Android, Chromium στο desktop, ο browser στο web. */
  webview?: string;
  webviewPackage?: string;
  /** Το Android SDK ως αριθμός, για το deviceInfo. */
  sdk?: number;
}

export type TelemetryPayload = Record<string, unknown>;

/**
 * Ο τύπος συσκευής που βλέπει το διάγραμμα «Application by Device».
 *
 * ΤΟ DESKTOP ΛΕΕΙ `TV` (απόφαση Jim, 29/9/2026). Η ταξινόμηση του οικοσυστήματος είναι
 * Mobile/Tablet/TV/WEB και δεν έχει «Desktop»· το προϊόν όμως λύνει το πρόβλημα ΤΟΥ ANDROID TV
 * BOX, και το ότι το εργαλείο τυχαίνει να τρέχει σε υπολογιστή είναι λεπτομέρεια υλοποίησης.
 * Τίποτα δεν χάνεται: το αληθινό μηχάνημα γράφεται ολόκληρο στο `deviceInfo.host`.
 *
 * Οι άλλες δύο όψεις κρατούν ό,τι κάνουν ήδη τα αδέρφια: το APK λέει τι είναι η συσκευή, και η
 * σελίδα λέει `WEB` — γιατί εκεί ο admin ΗΔΗ ξέρει τι σημαίνει.
 */
export function appTypeFor(face: TelemetryFace, deviceIsTv: boolean): string {
  if (face === 'web') return 'WEB';
  if (face === 'desktop') return 'TV';
  return deviceIsTv ? 'TV' : 'Mobile';
}

/** `armeabi_v7a` → `armeabi-v7a`: ο server περιμένει τη γραφή με παύλες. */
export function mapCpuArch(arch: string): string {
  if (arch === 'armeabi_v7a') return 'armeabi-v7a';
  if (arch === 'arm64_v8a') return 'arm64-v8a';
  return arch;
}

export function bytesToGigabytes(bytes: number): number {
  return +(bytes / (1024 * 1024 * 1024)).toFixed(2);
}

/**
 * Το payload της εγκατάστασης/παλμού. Καθαρή συνάρτηση επίτηδες: το σχήμα είναι συμβόλαιο με
 * ζωντανό server, οπότε ελέγχεται με tests και όχι με δοκιμές πάνω στην παραγωγή.
 */
export function activationPayload(f: TelemetryFacts, deviceIsTv = true): TelemetryPayload {
  const native = f.face !== 'web';
  const uid = f.deviceUID || f.visitorId;
  return {
    appCode: TELEMETRY_APP_CODE,
    appType: appTypeFor(f.face, deviceIsTv),
    deviceUID: uid,
    backupDeviceUID: f.visitorId,
    // Κενό — αλλά ΥΠΑΡΚΤΟ — εκεί που δεν υπάρχει Android (παγίδα 2).
    androidId: f.face === 'android' ? uid : '',
    ver: f.osVersion || '???',
    api: f.api || '0',
    webview: f.webview || '???',
    webviewPackage: f.webviewPackage ?? '',
    cpu: f.cpu || 'NONE',
    ram: typeof f.ram === 'number' && Number.isFinite(f.ram) ? f.ram : 0,
    storage: typeof f.storage === 'number' && Number.isFinite(f.storage) ? f.storage : 0,
    binType: f.face === 'web' ? 'web' : f.fromStore ? 'googleplay' : 'sideload',
    isInstalledFromGooglePlay: native ? f.fromStore : false,
    appVersionName: f.version,
    appBuildNumber: 0,
    deviceInfo: {
      manufacturer: f.manufacturer ?? '',
      model: f.model ?? '',
      osVersion: f.osVersion || '',
      sdk: f.sdk ?? 0,
      deviceType: appTypeFor(f.face, deviceIsTv),
      // ΕΔΩ ζει η αλήθεια για το μηχάνημα, αφού το `appType` μιλά για το ΠΡΟΪΟΝ.
      host: f.host,
      face: f.face,
      toolVersion: f.version,
      webViewVersion: f.webview ?? '',
      webViewPackage: f.webviewPackage ?? '',
    },
  };
}

/**
 * Το payload ενός γεγονότος στο `send-action` — η ίδια γραμμή που γράφουν τα αδέρφια.
 * `STATISTICS`/`ACTIVATE_DEVICE` μετά από κάθε activation, `SYSTEM_ERRORS` για ό,τι έσπασε.
 */
export function actionPayload(o: {
  visitorId: string;
  group: 'SYSTEM_ERRORS' | 'STATISTICS';
  command: string;
  value: string;
  description?: Record<string, unknown>;
}): TelemetryPayload {
  return {
    visitorId: o.visitorId,
    group: o.group,
    command: o.command,
    value: o.value.slice(0, 500),
    // Παγίδα 4: κωδικοποιημένο JSON, όχι σκέτο — έτσι το περιμένει ο admin.
    description: encodeURIComponent(
      JSON.stringify({ appCode: TELEMETRY_APP_CODE, ...(o.description ?? {}), datetime: new Date().toLocaleString() }, null, 2),
    ).slice(0, 8000),
  };
}

/**
 * Πέρασε αρκετή ώρα για δεύτερο παλμό; Ο κανόνας είναι του Capacitor app και τον κρατούν όλα:
 * μία ώρα ΤΗΝ ΙΔΙΑ ΜΕΡΑ — δηλαδή η πρώτη εκκίνηση κάθε μέρας μετράει πάντα.
 */
export function shouldPulse(lastRun: number, now: number): boolean {
  if (!lastRun) return true;
  const a = new Date(lastRun);
  const b = new Date(now);
  const sameDay = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  return !sameDay || now - lastRun >= 3_600_000;
}

/**
 * Η ταυτότητα του επισκέπτη, στη ΜΟΡΦΗ που παράγουν τα αδέρφια (`YYMM-DDHH-IISS-RRRR`) ώστε μια
 * σειρά μας να μη φαίνεται ξένη δίπλα στις δικές τους. Η σελίδα παίρνει πρόθεμα `WEB:`.
 */
export function newVisitorId(now = new Date(), web = false): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const id =
    `${p(now.getFullYear() % 100)}${p(now.getMonth() + 1)}-${p(now.getDate())}${p(now.getHours())}` +
    `-${p(now.getMinutes())}${p(now.getSeconds())}-${Math.floor(Math.random() * 9000) + 1000}`;
  return web ? `WEB:${id}` : id;
}
