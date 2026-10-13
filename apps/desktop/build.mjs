// Bundle the Electron main + preload with esbuild. Why a bundler: the workspace packages export TypeScript
// sources and `@tvlm/core` imports brands/*.json without attributes — plain Node/Electron cannot load
// that. Only `electron` and the native `usb` module stay external.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const brand = process.env.TVLM_BRAND ?? 'launcher';
// The brands folder is the list — a new brand is a JSON file, never an edit here.
const brandFile = join(root, '../../brands', `${brand}.json`);
const brandCfg = await readFile(brandFile, 'utf8').then(JSON.parse).catch(() => {
  throw new Error(`TVLM_BRAND "${brand}" has no brands/${brand}.json`);
});
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const out = join(root, 'dist/main');
await mkdir(out, { recursive: true });

await build({
  entryPoints: [join(root, 'src/main/index.ts')],
  outfile: join(out, 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['electron', 'usb'],
  sourcemap: true,
  loader: { '.json': 'json' },
  // CJS deps inside an ESM bundle need a real `require`.
  banner: { js: "import { createRequire as __tvlmCreateRequire } from 'node:module'; const require = __tvlmCreateRequire(import.meta.url);" },
  logLevel: 'info',
});

await build({
  entryPoints: [join(root, 'src/preload.ts')],
  outfile: join(out, 'preload.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron'],
  logLevel: 'info',
});

// The window title comes from the brand, so main/ never has to know the brand names — and it
// carries WHICH build this is (Jim, 25/9): the title bar is the one place visible in every
// screenshot, so "which exe am I looking at?" must be answerable from it alone.
// `build` = commits on this branch, so it grows by itself; `builtAt` = the minute, MM-DD-YY-HH-mm.
const buildNo = (() => {
  try {
    return execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '0'; // a copy of the sources without git still builds, it just cannot count
  }
})();
const two = (n) => String(n).padStart(2, '0');
const d = new Date();
const builtAt = [two(d.getMonth() + 1), two(d.getDate()), two(d.getFullYear() % 100), two(d.getHours()), two(d.getMinutes())].join('-');
await writeFile(
  join(out, 'brand.json'),
  JSON.stringify(
    {
      brand,
      version: pkg.version,
      name: brandCfg.desktopProductName ?? brandCfg.name,
      site: brandCfg.siteLabel ?? brandCfg.domain ?? '',
      build: buildNo,
      builtAt,
    },
    null,
    2,
  ),
);
console.log(`desktop main built for brand "${brand}" ${pkg.version}.${buildNo} (${builtAt}) → ${out}`);
