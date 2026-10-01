// electron-builder, ONE installer (27/9/2026: the kiosk edition is gone). Everything product-specific
// comes from brands/launcher.json (DESIGN_NOTES §15); `TVLM_BRAND` is kept only as the knob's name. Code signing comes from the environment only
// (CSC_LINK / CSC_KEY_PASSWORD, APPLE_ID…) — nothing in the repo.
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const brand = process.env.TVLM_BRAND ?? 'launcher';
const b = JSON.parse(readFileSync(join(repo, 'brands', `${brand}.json`), 'utf8'));
const webDist = join(repo, 'apps/web/dist', brand);

/** sharp lives in the workspace (Capacitor assets); it is not a dependency of this package. */
async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    const store = join(repo, 'node_modules/.pnpm');
    const dir = readdirSync(store).find((n) => n.startsWith('sharp@'));
    if (!dir) throw new Error('sharp not found in the workspace — install it or provide build/<brand>-icon.png');
    return (await import(pathToFileURL(join(store, dir, 'node_modules/sharp/lib/index.js')).toString())).default;
  }
}

/** electron-builder wants a ≥512 px PNG; the PLUI icon is an SVG → rasterize once into build/. */
/** Η έκδοση που βλέπει άνθρωπος: `1.26.10.01` από το apps/web/package.json (μία πηγή με την
 *  οθόνη «Σχετικά» και την τηλεμετρία). Το apps/desktop/package.json κρατά τη semver μορφή. */
function readVersion() {
  return JSON.parse(readFileSync(join(repo, 'apps/web/package.json'), 'utf8')).version;
}

async function icon() {
  const src = join(repo, 'brands/assets', b.logo.icon);
  if (!src.endsWith('.svg')) return src;
  const out = join(root, 'build', `${brand}-icon.png`);
  if (!existsSync(out)) {
    mkdirSync(dirname(out), { recursive: true });
    const sharp = await loadSharp();
    await sharp(src, { density: 384 }).resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(out);
  }
  return out;
}

export default async () => {
  if (!existsSync(join(webDist, 'index.html'))) throw new Error(`web bundle missing: run pnpm --filter @tvlm/web build:${brand} first`);
  return {
    appId: b.androidAppId,
    productName: b.desktopProductName,
    // ΤΟ ΟΝΟΜΑ ΤΩΝ ΑΡΧΕΙΩΝ ΠΑΙΡΝΕΙ ΤΗΝ ΑΝΑΓΝΩΣΙΜΗ ΕΚΔΟΣΗ, όχι το `${version}` του package.json:
    // εκείνο είναι semver (`1.26.1001`) επειδή το electron-builder διαλύει το τέταρτο μέρος, ενώ ο
    // κόσμος βλέπει παντού αλλού `1.26.10.01` (σχήμα οικοσυστήματος: major.έτος.μήνας.μέρα).
    buildVersion: readVersion(),
    copyright: `© ${new Date().getFullYear()} ${b.byline.replace(/^by\s+/i, '')}`,
    directories: { output: `release/${brand}`, buildResources: 'build' },
    files: ['dist/main/**/*', 'package.json'],
    extraResources: [{ from: webDist, to: 'web', filter: ['**/*'] }],
    // Το `homepage` το ζητά ο πακετοποιητής του deb («Please specify project homepage») και είναι
    // πεδίο ΤΟΥ ΠΑΚΕΤΟΥ, όχι του electron-builder: ούτε στη ρίζα του config ούτε μέσα στο `linux`
    // το δέχεται το schema. Εδώ είναι η θέση του.
    extraMetadata: { name: b.androidAppId, productName: b.desktopProductName, description: b.name,
                     homepage: 'https://tvboxtools.com' },
    asar: true,
    // The `usb` native module ships prebuilt N-API binaries — never rebuild.
    npmRebuild: false,
    nodeGypRebuild: false,
    buildDependenciesFromSource: false,
    icon: await icon(),
    forceCodeSigning: false,
    // ΔΥΟ αρχεία για Windows: ο installer ΚΑΙ ένα portable exe. Το portable δεν εγκαθιστά τίποτα και
    // δεν αφήνει τίποτα πίσω — τρέχει, το δοκιμάζεις, το σβήνεις. Είναι ο μόνος τρόπος να δεις τη
    // ΝΕΑ έκδοση χωρίς να πατήσεις την εγκατεστημένη, και ο μόνος που δίνεις σε κάποιον που δεν
    // θέλει (ή δεν μπορεί) να εγκαταστήσει.
    win: { target: ['nsis', 'portable'], artifactName: `${'${productName}'} Setup ${readVersion()}.${'${ext}'}` },
    nsis: { oneClick: false, allowToChangeInstallationDirectory: true, shortcutName: b.desktopProductName },
    // Το `artifactName` του `win` ισχύει και για τα δύο targets, οπότε ΧΩΡΙΣ αυτή τη γραμμή τα δύο
    // αρχεία παίρνουν το ΙΔΙΟ όνομα και το ένα πατά το άλλο.
    portable: { artifactName: `${'${productName}'} ${readVersion()} Portable.${'${ext}'}` },
    // macOS ships TWO files, one per architecture, and `${arch}` is in the name ON PURPOSE.
    // Without it both runs write `TV Launcher Manager <ver>.dmg` and the second silently overwrites
    // the first — or someone renames one by hand afterwards (that is how 0.2.2 was made, and a
    // release is not allowed to depend on anybody remembering which of two identical names was the
    // Apple Silicon one). Now the file says it: `-arm64.dmg`, `-x64.dmg`.
    mac: { target: ['dmg'], category: 'public.app-category.utilities', artifactName: `${'${productName}'} ${readVersion()}-${'${arch}'}.${'${ext}'}` },
    // tar.gz, NOT AppImage: an AppImage is built by making symlinks, and Windows only grants those
    // to an administrator or with Developer Mode on — electron-builder dies with EPERM halfway
    // through (27/9/2026, and again 29/9 because this line still said AppImage while the file we
    // publish has been a tar.gz since). Extract it and run the binary inside; the execute bits are
    // put back by TVBOXTOOLS/tools/fix_linux_tar_modes.py before the upload.
    // `executableName`: ΤΟ ΟΝΟΜΑ ΠΟΥ ΠΛΗΚΤΡΟΛΟΓΕΙ Ο ΚΟΣΜΟΣ. Χωρίς αυτό το εκτελέσιμο παίρνει το
    // `name` του package (= το applicationId), δηλαδή 38 χαρακτήρες μετά την αποσυμπίεση
    // (Jim, 29/9). Ο φάκελος ρυθμίσεων δεν κουνιέται: τον ορίζει το productName.
    // tar.gz ΚΑΙ deb — αλλά το deb ΜΟΝΟ όπου χτίζεται. Το tar.gz τρέχει σε κάθε διανομή και δεν
    // «εγκαθίσταται»: ούτε εικονίδιο στο μενού, ούτε απεγκατάσταση. Το deb τα δίνει με μία εντολή
    // σε Debian/Ubuntu/Mint. ΟΜΩΣ το φτιάχνει το `fpm`, εργαλείο Ruby που ΔΕΝ υπάρχει (ούτε
    // κατεβαίνει) σε Windows: εκεί το build πεθαίνει με `fpm process failed ENOENT` ΑΦΟΥ έχει ήδη
    // φτιάξει το tar.gz — χάνεις δηλαδή και το tar.gz για ένα deb που δεν γινόταν έτσι κι αλλιώς.
    // Ο στόχος εξαρτάται από το μηχάνημα που χτίζει, όχι από ευχή. Το deb απαιτεί ΚΑΙ maintainer
    // (ποιος το συντηρεί) ΚΑΙ homepage — το δεύτερο είναι στο extraMetadata πιο πάνω.
    linux: { target: process.platform === 'win32' ? ['tar.gz'] : ['tar.gz', 'deb'],
             category: 'Utility', executableName: 'tvboxtools',
             maintainer: 'Smartago LLC <support@smartago.net>',
             artifactName: `${'${productName}'} ${readVersion()}.${'${ext}'}` },
    // Το deb ΔΕΝ δέχεται κενά και κεφαλαία στο όνομα πακέτου — θέλει το δικό του σχήμα.
    deb: { artifactName: `tvboxtools_${readVersion()}_${'${arch}'}.${'${ext}'}` },
  };
};
