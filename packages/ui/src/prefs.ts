/**
 * What this computer remembers — one bag, read once at start, written as the person answers.
 *
 * Why not straight `localStorage`: on the desktop the answers belong in `config.json` next to the
 * exe (Jim, 25/9), so a reseller's stick carries them from box to box; in a browser and on Android
 * there is no such file and `localStorage` is the only memory there is. The UI should not care
 * which of the two it got, so both live behind these three functions.
 *
 * Everything here is a string. A bag of strings survives a hand-edited file, an older build, and a
 * value that used to be a number — and the caller parses what it knows.
 */
export interface PrefsHost {
  /** The whole bag, as the host has it. */
  get(): Promise<Record<string, string>>;
  /** Merge; `null` forgets a key. Fire-and-forget: nothing in the UI waits for a save. */
  set(patch: Record<string, string | null>): void;
}

let bag: Record<string, string> = {};
let host: PrefsHost | null = null;

/**
 * Read the host's bag before the app mounts, so the first screen already knows the answers.
 * Without a host (browser, Android) the memory is `localStorage`, key by key.
 */
export async function hydratePrefs(h: PrefsHost | null | undefined): Promise<void> {
  host = h ?? null;
  if (!host) return;
  try {
    bag = await host.get();
  } catch {
    bag = {}; // a host that cannot answer is a host with nothing remembered
  }
}

export function prefGet(key: string): string {
  if (host) return bag[key] ?? '';
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return ''; // private window, storage turned off: the question simply comes back next time
  }
}

export function prefSet(key: string, value: string): void {
  if (host) {
    bag[key] = value;
    host.set({ [key]: value });
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // nothing to remember with — the field just starts empty next time
  }
}

/** For "forget this computer" and for tests. */
export function prefClear(key: string): void {
  if (host) {
    delete bag[key];
    host.set({ [key]: null });
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // as above
  }
}
