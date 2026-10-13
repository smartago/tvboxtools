#!/usr/bin/env node
// Builds the Claude plugin as a SELF-CONTAINED folder: plugin/ (manifest, skill, README, icon) + server/ with the
// MCP server. No npx, no npm install, nothing fetched when the plugin starts — Claude runs
// `node ${CLAUDE_PLUGIN_ROOT}/server/tvboxtools.mjs --mcp --no-shell`.
//
//   node apps/cli/scripts/build-plugin.mjs [outDir]      (default: <repo>/plugin-dist, gitignored)
//   outDir may be the clone of smartago/tvboxtools-plugin: everything but its .git is replaced.
//
// Why this shape (Claude directory pre-submission checklist, 10/2026): a launcher (`npx pkg@x`) or a lockfile
// install is ALWAYS held for a human reviewer; any non-image file over 256 KiB or more than 512 files is held;
// minified code is held. So: OUR code is one readable file (~160 KiB), and every third-party module is copied
// UNCHANGED from node_modules — only the files the server really loads (esbuild's metafile says which), with
// each package's package.json (trimmed to what Node resolves with) and its LICENSE.
// `usb` (native, one binary per platform) is left out on purpose: binaries are held too. USB boxes still work
// through Google's adb server when it runs; Wi-Fi needs nothing.
// The folder is the ROOT of its own repo (smartago/tvboxtools-plugin): a server command in a plugin that sits in
// a subfolder of a repo is held as well.
import { build } from 'esbuild';
import { builtinModules } from 'node:module';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = dirname(dirname(CLI));
const SRC = join(ROOT, 'plugin');
const OUT = process.argv[2] ?? join(ROOT, 'plugin-dist');
const SERVER = join(OUT, 'server');
const ENTRY = "import { runCli } from './src/main.ts';\nprocess.exitCode = await runCli(process.argv.slice(2));\n";
const NOT_SHIPPED = ['usb', 'bufferutil', 'utf-8-validate'];
const BUILTIN = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

const KIB = 1024;
const LIMITS = { files: 512, fileBytes: 256 * KIB };

const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const common = {
  stdin: { contents: ENTRY, resolveDir: CLI, sourcefile: 'tvboxtools-entry.ts', loader: 'ts' },
  absWorkingDir: ROOT,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minify: false,
  metafile: true,
  logLevel: 'warning',
};

// ── 1. which third-party files does the server load? (a full bundle, never written) ─────────────────
const full = await build({ ...common, write: false, outfile: join(OUT, 'x.mjs'), external: NOT_SHIPPED });
/** pkg name → { dir (real path of the package root), files: Set<relative path inside it> } */
const pkgs = new Map();
for (const input of Object.keys(full.metafile.inputs)) {
  const abs = join(ROOT, input);
  const m = /^(.*[\\/]node_modules[\\/])((?:@[^\\/]+[\\/])?[^\\/]+)[\\/](.+)$/.exec(abs);
  if (!m) continue; // our own sources
  const name = m[2].replace(/\\/g, '/');
  const dir = m[1] + m[2];
  const p = pkgs.get(name) ?? { dir, files: new Set() };
  if (p.dir !== dir) throw new Error(`two copies of ${name}: ${p.dir} / ${dir} — a flat node_modules cannot hold both`);
  p.files.add(m[3]);
  pkgs.set(name, p);
}

// ── 2. our code alone, every package import left as an import ─────────────────────────────────────
// The out dir may be the clone of the plugin repo: empty it but keep its .git.
if (existsSync(OUT)) for (const n of readdirSync(OUT)) if (n !== '.git') rmSync(join(OUT, n), { recursive: true, force: true });
mkdirSync(SERVER, { recursive: true });
const externals = new Set();
const app = await build({
  ...common,
  outfile: join(SERVER, 'tvboxtools.mjs'),
  banner: { js: '#!/usr/bin/env node\n// TV Box Tools MCP server + CLI (Apache-2.0) — built from https://github.com/smartago/tvboxtools by apps/cli/scripts/build-plugin.mjs.\n// Third-party modules load from ./node_modules, copied unchanged from their npm releases.' },
  plugins: [
    {
      name: 'third-party-stays-external',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (a) => {
          if (BUILTIN.has(a.path) || a.path.startsWith('@tvlm/')) return undefined;
          externals.add(a.path);
          return { path: a.path, external: true };
        });
      },
    },
  ],
});
void app;

// ── 3. copy those files, unchanged ─────────────────────────────────────────────────────────────────
const NM = join(SERVER, 'node_modules');
for (const [name, p] of pkgs) {
  const dst = join(NM, ...name.split('/'));
  for (const f of p.files) {
    mkdirSync(dirname(join(dst, f)), { recursive: true });
    copyFileSync(join(p.dir, f), join(dst, f));
  }
  // Node needs the package.json to resolve (type / exports / main / imports); nothing else from it.
  const pj = JSON.parse(readFileSync(join(p.dir, 'package.json'), 'utf8'));
  const keep = Object.fromEntries(['name', 'version', 'license', 'type', 'main', 'module', 'exports', 'imports'].filter((k) => k in pj).map((k) => [k, pj[k]]));
  writeFileSync(join(dst, 'package.json'), JSON.stringify(keep, null, 2) + '\n');
  const lic = readdirSync(p.dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
  if (lic) copyFileSync(join(p.dir, lic), join(dst, lic));
}
// Every package our file imports must be there (a bare import we did not copy = a server that dies at start).
for (const spec of externals) {
  const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  if (!pkgs.has(name) && !NOT_SHIPPED.includes(name)) throw new Error(`imported but not shipped: ${spec}`);
}

// ── 4. the plugin files + version + a marketplace entry for this repo ──────────────────────────────
cpSync(SRC, OUT, { recursive: true });
const manifestPath = join(OUT, '.claude-plugin', 'plugin.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.version = version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(
  join(OUT, '.claude-plugin', 'marketplace.json'),
  JSON.stringify(
    {
      name: 'tvboxtools',
      description: 'TV Box Tools: set up Android TV boxes over ADB from Claude.',
      owner: { name: 'Smartago', email: 'hello@smartago.net' },
      plugins: [{ name: 'tvboxtools', source: './', description: manifest.description }],
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  join(SERVER, 'THIRD_PARTY.md'),
  '# Third-party modules\n\nCopied unchanged from their npm releases; only the files the server loads. Each folder keeps its license.\n\n| Package | Version | License |\n| - | - | - |\n' +
    [...pkgs.keys()].sort().map((n) => {
      const pj = JSON.parse(readFileSync(join(NM, ...n.split('/'), 'package.json'), 'utf8'));
      return `| ${n} | ${pj.version} | ${pj.license ?? '?'} |`;
    }).join('\n') + '\n',
);

// ── 5. the directory's file rules, checked here so the portal has nothing to hold ─────────────────
const all = [];
const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.name === '.git' ? null : e.isDirectory() ? walk(join(d, e.name)) : all.push(join(d, e.name))));
walk(OUT);
const problems = [];
const IMAGE = /\.(png|jpe?g|gif|webp|svg|woff2?|ttf|otf)$/i;
const TEXT = /\.(m?js|cjs|json|md|txt|d\.ts)$|(^|[\\/])(LICENSE|LICENCE|COPYING|\.mcp\.json)$/i;
const lower = new Map();
for (const f of all) {
  const rel = relative(OUT, f);
  const size = statSync(f).size;
  if (!IMAGE.test(f) && size >= LIMITS.fileBytes) problems.push(`${rel}: ${Math.round(size / KIB)} KiB (≥256 KiB is held)`);
  if (!IMAGE.test(f) && !TEXT.test(f)) problems.push(`${rel}: not a text/image file (held)`);
  if (/(^|[\\/])(\.DS_Store|Thumbs\.db|desktop\.ini)$/.test(rel)) problems.push(`${rel}: OS file (blocks)`);
  if (/[:]|[. ]$/.test(rel.split(sep).pop())) problems.push(`${rel}: name invalid on Windows/macOS`);
  const k = rel.toLowerCase();
  if (lower.has(k)) problems.push(`${rel}: differs only by case from ${lower.get(k)}`);
  lower.set(k, rel);
  if (!IMAGE.test(f) && readFileSync(f).includes(0)) problems.push(`${rel}: NUL byte`);
}
if (all.length > LIMITS.files) problems.push(`${all.length} files (>${LIMITS.files} is held)`);
const ours = statSync(join(SERVER, 'tvboxtools.mjs')).size;
console.log(`tvboxtools plugin ${version} → ${OUT}`);
console.log(`  ${all.length} files · server/tvboxtools.mjs ${Math.round(ours / KIB)} KiB · ${pkgs.size} packages: ${[...pkgs.keys()].sort().join(', ')}`);
if (problems.length) {
  console.error('\nPROBLEMS (the directory would block or hold these):\n  ' + problems.join('\n  '));
  process.exit(2);
}
console.log('  directory file rules: ok');
