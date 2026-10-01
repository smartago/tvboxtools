import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// One bundle: `TVLM_BRAND=launcher vite build --outDir dist/launcher` (see package.json scripts).
// `base: './'` so the same bundle runs from file:// inside Electron and Capacitor.
const brand = process.env.TVLM_BRAND ?? 'launcher';
const root = fileURLToPath(new URL('../../', import.meta.url));

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
    'import.meta.env.TVLM_VERSION': JSON.stringify(
      JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version,
    ),
  },
  plugins: [svelte()],
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
    target: 'es2022',
    sourcemap: false,
  },
});
