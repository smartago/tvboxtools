// SHORT CODES — ο αριθμός που πληκτρολογεί κάποιος στον Downloader, και πώς γίνεται URL.
//
// Port του `data/ShortCodes.kt` του Downloader TV (Premium-Launcher-UI-Kotlin). Το πλήρες σύστημα
// — client, server, cache, ασφάλεια — είναι γραμμένο στο `docs/short-codes.md` εκείνου του repo·
// εδώ ζει μόνο ό,τι χρειάζεται το εργαλείο για να μετατρέψει έναν κωδικό σε διεύθυνση αρχείου.
//
// ΔΥΟ ΥΠΗΡΕΣΙΕΣ, ΕΝΑ ΚΟΥΤΑΚΙ: δικοί μας κωδικοί (sendtotvquick.com) και του AFTVnews. Τα παλιά app
// ρωτούσαν τον χρήστη με radio που έδειχνε «εμείς» — και σχεδόν κάθε κωδικός AFTVnews γύριζε
// «άκυρος». Ο πάροχος βγαίνει ΑΠΟ ΤΟΝ ΙΔΙΟ ΤΟΝ ΚΩΔΙΚΟ, πάνω σε δύο επαληθευμένα:
//
//   1. Το AFTVnews ταιριάζει κωδικούς ως ΣΥΜΒΟΛΟΣΕΙΡΕΣ — το `aftv.news/012345` ΔΕΝ λύνεται ενώ το
//      `/12345` λύνεται. Ένα αρχικό μηδέν δεν μπορεί ποτέ να συγκρουστεί με δικό τους.
//   2. Οι δικοί τους σε κυκλοφορία είναι 6-7 ψηφία· οι δικοί μας ήταν 1-3. Τίποτα κάτω από 1000
//      δεν λύνεται εκεί.
//
// Το αρχικό μηδέν είναι ΜΟΝΟ εμφάνιση: το κλειδί στη βάση είναι το row id και ο server το κόβει.

/** Μπαίνει μπροστά σε κάθε κωδικό που δίνουμε εμείς. */
export const SHORT_CODE_PREFIX = '0';
/** Ο μεγαλύτερος «γυμνός» κωδικός που είχαμε δώσει πριν μπει το πρόθεμα. */
export const SHORT_CODE_LEGACY_MAX = 999;
/** Πώς κλειδώνεται ένας κωδικός AFTVnews στον ΔΙΚΟ ΜΑΣ server (cache που τον λύνει μόνος του). */
export const SHORT_CODE_EXTERNAL_PREFIX = 'atf';
export const SHORT_CODE_API = 'https://api.sendtoquick.com/api/st/get-url-from-short-code';

/** Μόνο ψηφία — ο ίδιος έλεγχος «αυτό είναι κωδικός, όχι σύνδεσμος» με τα υπόλοιπα app μας. */
export function isShortCode(input: string): boolean {
  return /^[0-9]+$/.test(input.trim());
}

/** Δικός ΜΑΣ: με πρόθεμα («0245») ή παλιός γυμνός («245»). */
export function isOurShortCode(input: string): boolean {
  const t = input.trim();
  if (!isShortCode(t)) return false;
  if (t.startsWith(SHORT_CODE_PREFIX)) return true;
  return Number(t) <= SHORT_CODE_LEGACY_MAX;
}

/** Το κλειδί που ταξιδεύει στο API. ΩΣ ΚΕΙΜΕΝΟ: αριθμός θα έτρωγε το αρχικό μηδέν. */
export function shortCodeKey(input: string): string {
  const t = input.trim();
  return isOurShortCode(t) ? t : SHORT_CODE_EXTERNAL_PREFIX + t;
}

/** Η σελίδα του AFTVnews για έναν κωδικό — για να ανοίξει ΑΛΛΟΥ, όχι από εμάς. */
export function aftvPage(code: string): string {
  return `https://aftv.news/${code.trim()}`;
}

/**
 * ΔΕΙΧΝΕΙ ΣΕ ΑΡΧΕΙΟ APK Ή ΣΕ ΣΕΛΙΔΑ; Το ξεχωρίζουμε γιατί ένας κωδικός μπορεί κάλλιστα να λύνεται
 * σε σελίδα με ΠΟΛΛΑ αρχεία (ο `71893` πάει στο stremio.com/downloads, που δίνει ARM/ARM64/x86/
 * x86_64). Εκεί δεν έχουμε τι να κατεβάσουμε: ρωτάμε για απευθείας διεύθυνση αντί να μαντέψουμε.
 */
export function looksLikeApk(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.apk');
  } catch {
    return false;
  }
}

/** Δεκτή διεύθυνση για κατέβασμα: http(s) και τίποτα άλλο (όχι `file:`, όχι `javascript:`). */
export function isDownloadableUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export type ShortCodeResult =
  | { ok: true; url: string; ours: boolean }
  /** `notfound` = ο server δεν ξέρει τον κωδικό· `unreachable` = δεν απάντησε καθόλου. */
  | { ok: false; reason: 'invalid' | 'notfound' | 'unreachable' };

/**
 * Κωδικός → διεύθυνση, με ΜΙΑ κλήση. Ο server απαντά είτε από τη δική του εγγραφή (δικοί μας
 * κωδικοί) είτε λύνοντας ο ΙΔΙΟΣ τον κωδικό του AFTVnews και αποθηκεύοντάς τον· από εδώ τα δύο
 * είναι το ίδιο πράγμα.
 *
 * `getJson` δίνεται απ' έξω επίτηδες: στην Android όψη η κλήση ΔΕΝ μπορεί να φύγει από το WebView
 * (παγωμένο Chrome και CA list του 2022 σε κάθε παλιό box — `docs/tls-root-certificates.md`), οπότε
 * εκεί περνά από το σύστημα. Έτσι η λογική μένει καθαρή και δοκιμάσιμη χωρίς δίκτυο.
 */
export async function resolveShortCode(
  code: string,
  getJson: (url: string) => Promise<unknown>,
): Promise<ShortCodeResult> {
  const typed = code.trim();
  if (!isShortCode(typed)) return { ok: false, reason: 'invalid' };
  const ours = isOurShortCode(typed);
  let body: unknown;
  try {
    body = await getJson(`${SHORT_CODE_API}?shortCode=${encodeURIComponent(shortCodeKey(typed))}`);
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  const url = (body as { data?: { originalUrl?: unknown } } | null)?.data?.originalUrl;
  if (typeof url !== 'string' || !url.trim()) return { ok: false, reason: 'notfound' };
  return { ok: true, url: url.trim(), ours };
}
