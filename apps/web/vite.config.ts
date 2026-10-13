import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// One bundle: `TVLM_BRAND=launcher vite build --outDir dist/launcher` (see package.json scripts).
// `base: './'` so the same bundle runs from file:// inside Electron and Capacitor.
const brand = process.env.TVLM_BRAND ?? 'launcher';
const root = fileURLToPath(new URL('../../', import.meta.url));

const pkgVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;
// Ο ΑΡΙΘΜΟΣ BUILD — Η ΜΟΝΗ ΣΥΓΚΡΙΣΗ ΠΟΥ ΔΟΥΛΕΥΕΙ (Jim, 3/10/2026). Το όνομα έκδοσης είναι
// ΗΜΕΡΗΣΙΟ: στις 2/10 βγήκαν ΔΥΟ builds, 1008 και 1009, και τα δύο «1.26.10.02». Ένας έλεγχος που
// συγκρίνει ονόματα δεν θα έβλεπε ΠΟΤΕ διαφορά. Ίδιος αριθμός με το build.mjs του desktop (πλήθος
// commit), ώστε τίτλος παραθύρου και έλεγχος ενημέρωσης να λένε το ίδιο πράγμα.
const buildNo = (() => {
  try {
    return execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '0'; // αντίγραφο πηγών χωρίς git: χτίζεται, απλώς δεν μετρά
  }
})();

export default defineConfig({
  base: './',
  // .env lives at the repo ROOT (one file for the workspace, gitignored there), not in apps/web.
  // Without this line the geo key never reached a build, and the web face silently stopped
  // suggesting a language — found by grepping the bundle for the key, 23/9.
  envDir: root,
  envPrefix: ['VITE_', 'TVLM_'],
  define: {
    'import.meta.env.TVLM_BRAND': JSON.stringify(brand),
    // Η έκδοση ΤΟΥ ΕΡΓΑΛΕΙΟΥ, από ΤΟ package.json — μία πηγή, αλλιώς η τηλεμετρία θα έλεγε
    // κάποια στιγμή άλλη έκδοση από αυτή που κατέβασε ο κόσμος.
    'import.meta.env.TVLM_VERSION': JSON.stringify(pkgVersion),
    'import.meta.env.TVLM_BUILD': JSON.stringify(buildNo),
  },
  plugins: [
    svelte(),
    // ΤΟ ΑΠΟΤΥΠΩΜΑ ΤΟΥ BUILD, ΣΕ ΑΡΧΕΙΟ. Ο ίδιος αριθμός μπαίνει και μέσα στο bundle (define, πιο
    // πάνω), αλλά εκεί είναι θαμμένος σε minified JS. Το `push_downloads.py` πρέπει να γράψει στο
    // manifest τον αριθμό ΤΩΝ ΑΡΧΕΙΩΝ ΠΟΥ ΑΝΕΒΑΖΕΙ, και αυτά χτίστηκαν σε άλλη στιγμή από το push:
    // αν διάβαζε το ζωντανό `git rev-list` θα έγραφε 202 ενώ τα exe/apk κουβαλούν 201, και κάθε
    // άνοιγμα του εργαλείου θα έλεγε «υπάρχει νεότερη έκδοση» για πάντα. Αυτό το αρχείο είναι η
    // απάντηση: ό,τι έγραψε το ΤΕΛΕΥΤΑΙΟ build, που είναι και ό,τι μπήκε στα πακέτα.
    {
      name: 'tvlm-build-stamp',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'build.json',
          source: JSON.stringify({ brand, version: pkgVersion, build: Number(buildNo) || 0 }) + '\n',
        });
      },
    },
  ],
  resolve: {
    dedupe: ['svelte'],
  },
  optimizeDeps: {
    // workspace sources (TS + .svelte) — compiled by Vite itself, not pre-bundled
    exclude: ['@tvlm/core', '@tvlm/adb', '@tvlm/ui'],
  },
  server: {
    port: 5177,
    strictPort: true,
    fs: { allow: [root] },
  },
  build: {
    outDir: `dist/${brand}`,
    emptyOutDir: true,
    // es2019, ΟΧΙ es2022 (9/10/2026): το bundle με class fields (es2022) δεν παρσάρεται σε Android
    // WebView κάτω από Chrome 72 και το app ανοίγει ΛΕΥΚΟ, χωρίς μήνυμα. Με es2019 το esbuild τα
    // ξαναγράφει (λίγα KB παραπάνω) και το πάτωμα γίνεται Chrome 67 — εκεί σταματά το BigInt που
    // χρειάζεται το Tango για την υπογραφή RSA, και από κάτω μιλά ο φύλακας του index.html.
    target: 'es2019',
    sourcemap: false,
  },
});
