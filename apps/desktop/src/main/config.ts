// What this computer remembers between runs: `config.json`.
//
// Jim, 25/9: "a config.json in the folder the exe runs from, keeping the user's config — the
// language you suggest the FIRST time and then never again, the reseller id, and anything else the
// person should not have to fill in twice."
//
// WHERE — and this took one measurement to get right. The obvious place is next to the exe, and
// for a reseller carrying the tool on a stick that is exactly right: the answers travel with it.
// But the build writes that folder: `win-unpacked` is recreated on every rebuild, which wiped the
// settings of the person testing (25/9, measured — the bag came back empty after a rebuild).
//
// So: **next to the exe when a `config.json` is ALREADY there**. Putting the file there is a
// deliberate act — that is what makes a copy portable — and nothing else writes into that folder
// by accident. Otherwise the per-user data folder, which survives every build and every reinstall.
//
// The app never fails because of this file: unreadable = no memory, unwritable = nothing
// remembered, and both are ordinary states, not errors.
import { app } from 'electron';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Flat on purpose: strings in, strings out. A bag the UI owns; main only keeps it alive. */
export type ConfigBag = Record<string, string>;

let file: string | null = null;
let cache: ConfigBag | null = null;

function writable(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** The file we will use — decided once, and remembered for the run. */
export function configPath(): string {
  if (file) return file;
  // Portable only when packaged (in development the "exe" is electron.exe inside node_modules) and
  // only when the file is already there — see the note at the top of this file.
  const beside = app.isPackaged ? join(dirname(app.getPath('exe')), 'config.json') : '';
  if (beside && existsSync(beside) && writable(dirname(beside))) {
    file = beside;
    return file;
  }
  const dir = app.getPath('userData');
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // the folder already exists, or we cannot make it — the write below will say so
  }
  file = join(dir, 'config.json');
  return file;
}

export function configRead(): ConfigBag {
  if (cache) return cache;
  try {
    const raw = JSON.parse(readFileSync(configPath(), 'utf8')) as unknown;
    // Anything that is not a flat string bag is ignored rather than trusted: a half-written or
    // hand-edited file must not decide what the wizard does.
    cache = Object.fromEntries(
      Object.entries((raw ?? {}) as Record<string, unknown>).filter(([, v]) => typeof v === 'string'),
    ) as ConfigBag;
  } catch {
    cache = {};
  }
  return cache;
}

/**
 * Merge and save. `null` removes a key — that is how "forget this" is said.
 * Written through a temporary file: a power cut mid-write leaves the old file, not half a file.
 */
export function configWrite(patch: Record<string, string | null>): ConfigBag {
  const next: ConfigBag = { ...configRead() };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = String(v);
  }
  cache = next;
  const path = configPath();
  try {
    const tmp = path + '.tmp';
    writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8');
    renameSync(tmp, path);
  } catch (e) {
    console.error(`[tvlm] config not saved (${path}): ${String(e)}`);
  }
  return next;
}
