// ΕΝΑ APK ΑΝΑ ΑΡΧΙΤΕΚΤΟΝΙΚΗ (Jim, 12/10/2026, για το VLC και το Kodi της λίστας του Hotel TV).
//
// Τα armeabi-v7a APK τρέχουν στα περισσότερα κουτιά — και στα arm64 με 32-bit userspace — αλλά σε
// συσκευές ΜΟΝΟ-64-bit (νεότερα SoC) η εγκατάσταση σκάει με INSTALL_FAILED_NO_MATCHING_ABIS, και σε x86
// δεν μπαίνει κανένα. Η γραμμή της λίστας λέει λοιπόν ποιο αρχείο είναι για ποιο ABI:
//   "abis": {"arm64-v8a": "https://…/vlc-arm64.apk", "armeabi-v7a": "https://…/vlc.apk"}
// και το `url` μένει το αρχείο «για όλους» — ό,τι δεν ξέρει το `abis` συνεχίζει να δουλεύει.
//
// ΠΟΙΟ ΔΙΑΛΕΓΟΥΜΕ: το ΠΡΩΤΟ ABI της λίστας του κουτιού (`ro.product.cpu.abilist`) που υπάρχει στο
// `abis`. Η σειρά του abilist είναι η προτίμηση του ίδιου του κουτιού — arm64 πρώτα όπου υπάρχει,
// και ένα κουτί με 32-bit userspace δεν το αναφέρει καν. Κανένα ταίρι → `url`.

/** Η εντολή που ρωτά το κουτί (allowlist: getprop). */
export const ABILIST_COMMAND = 'getprop ro.product.cpu.abilist';
/** Παλιά κουτιά (Android < 5) δεν έχουν abilist — μόνο το ένα ABI τους. */
export const ABI_FALLBACK_COMMAND = 'getprop ro.product.cpu.abi';

/** `arm64-v8a,armeabi-v7a,armeabi` → ['arm64-v8a', 'armeabi-v7a', 'armeabi']. */
export function parseAbiList(output: string): string[] {
  return output
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9_-]+$/.test(s));
}

/** Το `abis` της γραμμής: μόνο ονόματα ABI → https. Άγνωστα ABI απλώς περνούν (δεν τα κρίνουμε). */
export function parseAbis(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [abi, url] of Object.entries(v as Record<string, unknown>)) {
    const k = abi.trim().toLowerCase();
    const u = typeof url === 'string' ? url.trim() : '';
    if (/^[a-z0-9_-]+$/.test(k) && /^https:\/\//i.test(u)) out[k] = u;
  }
  return Object.keys(out).length ? out : undefined;
}

export interface ApkChoice {
  url: string;
  /** Το ABI που ταίριαξε, ή null όταν πήραμε το `url`. */
  abi: string | null;
  /** Μία πρόταση για την αναφορά: ποιο αρχείο και γιατί. */
  why: string;
}

/** Το αρχείο για αυτό το κουτί. Χωρίς `abis`, ή χωρίς ταίρι, ή χωρίς γνωστό abilist → `url`. */
export function pickApkUrl(app: { url: string; abis?: Record<string, string> }, boxAbis: readonly string[]): ApkChoice {
  if (!app.abis) return { url: app.url, abi: null, why: 'one file for every box' };
  if (!boxAbis.length) return { url: app.url, abi: null, why: 'the box did not say its ABIs — default file' };
  for (const abi of boxAbis) {
    const u = app.abis[abi];
    if (u) return { url: u, abi, why: `box ABIs ${boxAbis.join(',')} → ${abi}` };
  }
  return { url: app.url, abi: null, why: `box ABIs ${boxAbis.join(',')} — none in the list (${Object.keys(app.abis).join(',')}) — default file` };
}
