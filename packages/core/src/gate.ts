// The command gate (DESIGN_NOTES §8, contract §6): the same gate for UI, CLI and MCP.
// "auto" runs silently, "confirm" is shown and needs a human's Run, "blocked" never runs.

export type GateVerdict = 'auto' | 'confirm' | 'blocked';

export interface GateDecision {
  verdict: GateVerdict;
  /** Why — the rule that matched; shown in the UI and written to the report. */
  reason: string;
}

const AUTO_PREFIXES = [
  'getprop',
  'dumpsys',
  'pm list',
  'pm path',
  'pm dump',
  'settings get',
  'settings list',
  'am start',
  'input keyevent',
  // typing on the television for someone who is looking at it: the remote's on-screen keyboard is
  // the thing being replaced, and what arrives is what the person typed. `input text` cannot reach
  // anything the remote could not.
  'input text',
  // the clock, for the diagnosis on the Device page. ONLY as a read: `date -s …` sets it, and the
  // rule below sends anything that is not a bare `date` or a `date +format` to confirm.
  'date',
  'cmd package resolve-activity',
  // reading which apps can be HOME is the same kind of question as resolving which one IS
  'cmd package query-activities',
  'cmd package list',
  'df',
  'screencap',
  'ls',
  'echo',
  'whoami',
  'id',
  'uptime',
  'cat /proc/meminfo',
  'wm size',
  'wm density',
  'ip addr',
  'ip route',
  'netstat',
];

// Matched on the normalized command. Order matters: the first hit wins.
const BLOCKED: Array<{ re: RegExp; reason: string }> = [
  { re: /^reboot\s+(bootloader|recovery|fastboot|sideload)/, reason: 'reboot into bootloader/recovery' },
  { re: /^fastboot\b/, reason: 'fastboot' },
  { re: /^(rm\s+-rf?|dd\b)/, reason: 'destructive filesystem command' },
  { re: /\bwipe\b/, reason: 'wipe' },
  { re: /^su\b|\bsu\s+-c\b/, reason: 'root' },
  { re: /^dpm\s+(remove-active-admin|clear-)/, reason: 'device-owner removal happens only from the app or a factory reset' },
  { re: /^am\s+broadcast\s+-a\s+android\.intent\.action\.MASTER_CLEAR/, reason: 'factory reset' },
  { re: /^settings\s+put\s+global\s+adb_enabled\s+0/, reason: 'turning debugging off is only the LAST step of handover' },
  { re: /^settings\s+put\s+global\s+development_settings_enabled\s+0/, reason: 'turning developer options off cuts the session' },
];

/** System packages that `pm uninstall` / `pm disable` must never touch, even with confirmation. */
export const PROTECTED_PACKAGES = ['android', 'com.android.settings', 'com.android.systemui', 'com.android.providers.settings', 'com.google.android.gms', 'com.android.vending'];

export function normalizeCommand(cmd: string): string {
  return cmd.trim().replace(/^adb\s+(-s\s+\S+\s+)?shell\s+/, '').replace(/\s+/g, ' ');
}

/**
 * Εντολές που η έκδοση Play ΔΕΝ κάνει — και άρα δεν πρέπει να τις κάνει ούτε γραμμένες με το χέρι.
 *
 * Η έκδοση Play κρύβει τη σελίδα Debloat (`canRiskyTasks`), αλλά μια κρυμμένη σελίδα δεν είναι
 * περιορισμός: η κονσόλα δέχεται ελεύθερες εντολές, οπότε το ίδιο πράγμα ξαναέμπαινε από την πίσω
 * πόρτα (μελέτη Play §3.4). Ο περιορισμός ζει ΕΔΩ, γιατί από εδώ περνούν και η κονσόλα και το CLI
 * και ο MCP server — τρεις πόρτες, ένας κανόνας.
 */
const PLAY_FORBIDDEN: Array<{ re: RegExp; reason: string }> = [
  { re: /^pm\s+uninstall\b/, reason: 'uninstalling apps is not in the Google Play edition' },
  { re: /^pm\s+disable(-user)?\b/, reason: 'disabling apps is not in the Google Play edition' },
  { re: /^cmd\s+package\s+(uninstall|disable(-user)?)\b/, reason: 'disabling apps is not in the Google Play edition' },
];

export function classifyCommand(cmd: string, opts: { handoverLastStep?: boolean; playBuild?: boolean } = {}): GateDecision {
  const c = normalizeCommand(cmd);
  if (!c) return { verdict: 'blocked', reason: 'empty command' };

  // ΠΡΙΝ από όλα τα άλλα: ό,τι δεν κάνει αυτή η έκδοση, δεν το κάνει με κανέναν τρόπο.
  if (opts.playBuild) {
    for (const p of PLAY_FORBIDDEN) {
      if (p.re.test(c)) return { verdict: 'blocked', reason: p.reason };
    }
  }

  for (const b of BLOCKED) {
    if (b.re.test(c)) {
      if (opts.handoverLastStep && /adb_enabled 0/.test(c)) break; // the one sanctioned use
      return { verdict: 'blocked', reason: b.reason };
    }
  }
  // `pm uninstall` / `pm disable` of a system package: matched on whole tokens, so that
  // `com.google.android.tvlauncher` (the stock launcher we DO disable for PLUI) is not caught by "android".
  if (/^pm\s+(uninstall|disable(-user)?)\b/.test(c)) {
    const tokens = c.split(' ');
    for (const p of PROTECTED_PACKAGES) {
      if (tokens.includes(p)) return { verdict: 'blocked', reason: `protected package ${p}` };
    }
    if (tokens.some((t) => /^com\.android\.(settings|systemui|providers\.)/.test(t))) return { verdict: 'blocked', reason: 'system package' };
  }
  // Chained / piped commands never go through the allowlist as a whole.
  if (/[;&|`$]/.test(c) && !/^echo\b/.test(c)) return { verdict: 'confirm', reason: 'compound command' };

  for (const p of AUTO_PREFIXES) {
    if (c === p || c.startsWith(p + ' ')) {
      // `am start` opens screens on the TV — read-only for the box, but never with data extras.
      if (p === 'am start' && /--e[sz]?\s|-d\s/.test(c)) return { verdict: 'confirm', reason: 'am start with extras' };
      // `date` reads the clock; `date -s …` (or any other switch) SETS it — that is not a read.
      if (p === 'date' && !/^date(\s+\+\S*)?$/.test(c)) return { verdict: 'confirm', reason: 'date with arguments sets the clock' };
      // `wm size` / `wm density` with an argument REWRITE what the panel draws. The Screen page
      // runs them after a press (userInitiated), so they are still one click there — but an agent
      // asking for them has to be answered by a person.
      if ((p === 'wm size' || p === 'wm density') && c !== p) return { verdict: 'confirm', reason: 'wm with an argument changes what the box draws' };
      return { verdict: 'auto', reason: `allowlist: ${p}` };
    }
  }
  return { verdict: 'confirm', reason: 'not on the allowlist' };
}

/** A tiny helper for callers that only need yes/no. */
export function isBlocked(cmd: string): boolean {
  return classifyCommand(cmd).verdict === 'blocked';
}
