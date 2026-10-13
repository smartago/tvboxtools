// XAPK / APKS / APKM — ΕΝΑ ΑΡΧΕΙΟ ΠΟΥ ΕΙΝΑΙ ΠΟΛΛΑ APK (Jim, 7/10/2026: «βάλε εδώ δυνατότητα να
// δίνω και xapk»).
//
// Από τη στιγμή που το Google Play δίνει app bundles, το APK που κατεβάζει ο κόσμος από τα
// γνωστά site δεν είναι ΕΝΑ αρχείο: είναι ένα zip με το base και τα κομμάτια του (`config.arm64_v8a`,
// `config.xxhdpi`, `config.el`…) και, σπάνια, τα δεδομένα OBB. Η κατάληξη αλλάζει ανά site —
// `.xapk` (APKPure), `.apks` (bundletool), `.apkm` (APKMirror) — το ΣΧΗΜΑ είναι το ίδιο: zip.
//
// ΓΙΑΤΙ ΔΕΝ ΦΤΑΝΕΙ ΝΑ ΒΑΛΕΙΣ ΜΟΝΟ ΤΟ BASE: το Android απορρίπτει ένα base που δηλώνει splits
// («INSTALL_FAILED_MISSING_SPLIT») ή, χειρότερα, το δέχεται και η εφαρμογή σκάει στην πρώτη οθόνη
// που ζητά πόρο από κομμάτι που λείπει. Μπαίνουν ΟΛΑ ΜΑΖΙ, σε μία συνεδρία του `pm`.
//
// ΧΩΡΙΣ ΒΙΒΛΙΟΘΗΚΗ: ο φυλλομετρητής ξέρει ήδη να ξεφουσκώνει (`DecompressionStream('deflate-raw')`,
// Chrome 103+/Electron/WebView των κινητών — ΟΧΙ το παγωμένο WebView του κουτιού, αλλά αυτή η
// σελίδα τρέχει στον υπολογιστή του εγκαταστάτη, όχι στην τηλεόραση). Διαβάζουμε μόνο τον κατάλογο
// του zip και ανοίγουμε ένα ρεύμα ανά κομμάτι: ένα XAPK 300 MB δεν μπαίνει ΠΟΤΕ ολόκληρο στη μνήμη.

/** Ένα αρχείο μέσα στο zip, έτοιμο να διαβαστεί με ρεύμα. */
export interface ZipEntry {
  name: string;
  /** Μέγεθος ΞΕΦΟΥΣΚΩΜΕΝΟ — αυτό θέλει το `pm install-write -S`. */
  size: number;
  compressed: boolean;
  /** Ένα ρεύμα με τα αληθινά bytes του αρχείου. Διαβάζεται μία φορά. */
  open(): Promise<ReadableStream<Uint8Array>>;
}

/** Τι βρέθηκε μέσα στο πακέτο, χωρισμένο κατά χρήση. */
export interface XapkParts {
  /** Το base πρώτο, μετά τα κομμάτια — με αυτή τη σειρά πάνε στη συνεδρία. */
  apks: ZipEntry[];
  /** `Android/obb/<pkg>/*.obb` — δεδομένα, ΟΧΙ κώδικας: πάνε με sync, όχι με install. */
  obb: Array<ZipEntry & { target: string }>;
  /** Από το `manifest.json` του XAPK, όταν υπάρχει. Μόνο για να το πούμε στον άνθρωπο. */
  pkg?: string;
  label?: string;
}

const LE = (b: Uint8Array, at: number, n: 2 | 4): number => {
  let v = 0;
  for (let i = n - 1; i >= 0; i--) v = v * 256 + (b[at + i] ?? 0);
  return v;
};

/**
 * Είναι η κατάληξη πακέτο-με-πολλά-apk;
 *
 * ΚΑΙ ΤΟ ΣΚΕΤΟ `.zip` (Jim, 7/10): τα site δίνουν τα κομμάτια και ως απλό zip — στον φάκελό του
 * κάθονταν δίπλα-δίπλα `com.spocky.projengmenu.xapk` και `splits.zip`, το ίδιο πράγμα με άλλο
 * όνομα. Ένα zip χωρίς apk μέσα το λέμε καθαρά («Το αρχείο δεν έχει APK μέσα»), οπότε δεν
 * χάνουμε τίποτα δεχόμενοι την κατάληξη.
 */
export function isMultiApk(name: string): boolean {
  return /\.(xapk|apks|apkm|zip)$/i.test(name);
}

/**
 * Η ΣΕΙΡΑ ΤΩΝ ΚΟΜΜΑΤΙΩΝ: το base πρώτο, τα υπόλοιπα μετά — από εκεί παίρνει το `pm` το όνομα του
 * πακέτου και την έκδοση. Αναγνωρίζεται με τρεις τρόπους, κατά σειρά βεβαιότητας: το όνομα του
 * bundletool (`base-master`/`base.apk`), το αρχείο ΧΩΡΙΣ «config.» μέσα του, αλλιώς το μεγαλύτερο.
 * Ζει εδώ γιατί την ίδια απάντηση θέλει και το zip ΚΑΙ ο φάκελος που διαλέγει ο άνθρωπος.
 */
export function orderApkParts<T extends { name: string; size: number }>(parts: T[]): T[] {
  const score = (e: T): number => {
    const n = e.name.toLowerCase();
    if (/(^|\/)base-master\.apk$|(^|\/)base\.apk$/.test(n)) return 0;
    if (/config\.|split_|\.config\./.test(n)) return 2;
    return 1;
  };
  return [...parts].sort((a, b) => score(a) - score(b) || b.size - a.size);
}

/**
 * Ο κατάλογος του zip, από το ΤΕΛΟΣ του αρχείου (EOCD → central directory). Δεν διαβάζουμε ούτε
 * byte από τα περιεχόμενα: μόνο τις θέσεις τους, ώστε κάθε κομμάτι να ανοίγει μετά με `blob.slice`.
 */
export async function readZip(file: Blob): Promise<ZipEntry[]> {
  // Το EOCD είναι στα τελευταία 22 bytes, συν έως 65535 σχόλιο. Διαβάζουμε την ουρά και ψάχνουμε.
  const tailLen = Math.min(file.size, 66_000);
  const tail = new Uint8Array(await file.slice(file.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip');
  let count = LE(tail, eocd + 10, 2);
  let cdSize = LE(tail, eocd + 12, 4);
  let cdOff = LE(tail, eocd + 16, 4);
  // ZIP64: πάνω από 4 GB ή πάνω από 65535 αρχεία — ο δείκτης είναι 0xffffffff και η αλήθεια
  // κάθεται σε δικό του record λίγο πιο πριν. Ένα XAPK 5 GB δεν είναι συνηθισμένο, αλλά υπάρχει.
  if (cdOff === 0xffffffff || count === 0xffff || cdSize === 0xffffffff) {
    const locAt = tail.lastIndexOf(0x50, eocd);
    let loc = -1;
    for (let i = eocd - 20; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x06 && tail[i + 3] === 0x07) {
        loc = i;
        break;
      }
    }
    void locAt;
    if (loc < 0) throw new Error('zip64 end of central directory not found');
    const z64Off = LE(tail, loc + 8, 4) + LE(tail, loc + 12, 4) * 2 ** 32;
    const z64 = new Uint8Array(await file.slice(z64Off, z64Off + 56).arrayBuffer());
    count = LE(z64, 32, 4) + LE(z64, 36, 4) * 2 ** 32;
    cdSize = LE(z64, 40, 4) + LE(z64, 44, 4) * 2 ** 32;
    cdOff = LE(z64, 48, 4) + LE(z64, 52, 4) * 2 ** 32;
  }
  const cd = new Uint8Array(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const out: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    if (!(cd[p] === 0x50 && cd[p + 1] === 0x4b && cd[p + 2] === 0x01 && cd[p + 3] === 0x02)) break;
    const method = LE(cd, p + 10, 2);
    let compSize = LE(cd, p + 20, 4);
    let size = LE(cd, p + 24, 4);
    const nameLen = LE(cd, p + 28, 2);
    const extraLen = LE(cd, p + 30, 2);
    const cmtLen = LE(cd, p + 32, 2);
    let local = LE(cd, p + 42, 4);
    const name = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nameLen));
    // Τα πεδία που «ξεχείλισαν» ζουν στο extra field 0x0001, με ΑΥΤΗ τη σειρά και μόνο όσα χρειάζονται.
    if (size === 0xffffffff || compSize === 0xffffffff || local === 0xffffffff) {
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e + 4 <= end) {
        const id = LE(cd, e, 2);
        const len = LE(cd, e + 2, 2);
        if (id === 0x0001) {
          let q = e + 4;
          if (size === 0xffffffff) {
            size = LE(cd, q, 4) + LE(cd, q + 4, 4) * 2 ** 32;
            q += 8;
          }
          if (compSize === 0xffffffff) {
            compSize = LE(cd, q, 4) + LE(cd, q + 4, 4) * 2 ** 32;
            q += 8;
          }
          if (local === 0xffffffff) local = LE(cd, q, 4) + LE(cd, q + 4, 4) * 2 ** 32;
          break;
        }
        e += 4 + len;
      }
    }
    p += 46 + nameLen + extraLen + cmtLen;
    if (name.endsWith('/')) continue; // φάκελος
    const compressed = method === 8;
    if (method !== 0 && method !== 8) continue; // ούτε store ούτε deflate: δεν το αγγίζουμε
    out.push({
      name,
      size,
      compressed,
      async open() {
        // Η τοπική κεφαλίδα έχει ΔΙΚΑ ΤΗΣ μήκη ονόματος/extra — δεν ταυτίζονται πάντα με του
        // καταλόγου, και ένα λάθος εδώ δίνει «σκουπίδια» αντί για apk.
        const head = new Uint8Array(await file.slice(local, local + 30).arrayBuffer());
        const data = local + 30 + LE(head, 26, 2) + LE(head, 28, 2);
        const raw = file.slice(data, data + compSize).stream() as unknown as ReadableStream<Uint8Array>;
        if (!compressed) return raw;
        // Οι δύο δηλώσεις (DOM lib vs ReadableStream<Uint8Array>) δεν ταυτίζονται στα generics· τα
        // bytes είναι τα ίδια. Το cast γεφυρώνει ΜΟΝΟ τις δηλώσεις.
        const inflate = new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
        return raw.pipeThrough(inflate);
      },
    });
  }
  return out;
}

/**
 * Τι από όλα αυτά είναι εγκατάσταση. Η ΣΕΙΡΑ μετράει: το base πρώτο, γιατί από εκεί παίρνει το
 * `pm` το όνομα του πακέτου και την έκδοση· τα υπόλοιπα κομμάτια ακολουθούν.
 */
export async function readXapk(file: Blob): Promise<XapkParts> {
  const entries = await readZip(file);
  const apks = entries.filter((e) => /\.apk$/i.test(e.name) && !e.name.startsWith('__MACOSX/'));
  const ordered = orderApkParts(apks);
  apks.length = 0;
  apks.push(...ordered);
  const obb = entries
    .filter((e) => /\.obb$/i.test(e.name))
    .map((e) => ({
      ...e,
      // Μέσα στο XAPK ζουν ως `Android/obb/<pkg>/main.1.<pkg>.obb` — εκεί ακριβώς πάνε και στο κουτί.
      target: `/sdcard/${e.name.replace(/^.*?(Android\/obb\/)/i, 'Android/obb/')}`,
    }));
  const out: XapkParts = { apks, obb };
  const mf = entries.find((e) => e.name === 'manifest.json' || e.name === 'info.json');
  if (mf) {
    try {
      const txt = await new Response(await mf.open()).text();
      const j = JSON.parse(txt) as { package_name?: string; name?: string; label?: string; pname?: string; app_name?: string };
      out.pkg = j.package_name ?? j.pname;
      out.label = j.name ?? j.label ?? j.app_name;
    } catch {
      /* χαλασμένο manifest: το πακέτο μπαίνει έτσι κι αλλιώς, απλώς δεν ξέρουμε το όνομά του */
    }
  }
  return out;
}
