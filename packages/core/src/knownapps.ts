// Friendly names for the packages a person is likely to meet on a TV box — for the Debloat list,
// where ADB gives us package names and nothing else. A name here is a courtesy, never a rule: an
// unknown package is shown by its name and is just as switchable.
//
// Nothing in this list is a recommendation to remove anything. It only says what a package IS.
export const KNOWN_APPS: Readonly<Record<string, string>> = {
  'com.google.android.youtube.tv': 'YouTube',
  'com.google.android.youtube.tvmusic': 'YouTube Music',
  'com.google.android.youtube.tvkids': 'YouTube Kids',
  'com.netflix.ninja': 'Netflix',
  'com.amazon.amazonvideo.livingroom': 'Prime Video',
  'com.disney.disneyplus': 'Disney+',
  'com.spotify.tv.android': 'Spotify',
  'com.google.android.videos': 'Google TV / Play Movies',
  'com.google.android.play.games': 'Play Games',
  'com.google.android.tvrecommendations': 'Android TV recommendations',
  'com.google.android.tvlauncher': 'Android TV Home',
  'com.google.android.apps.tv.launcherx': 'Google TV Home',
  'com.google.android.katniss': 'Google Assistant (TV)',
  'com.google.android.apps.mediashell': 'Chromecast built-in',
  'com.google.android.tv.remote.service': 'Android TV Remote Service',
  'com.google.android.backdrop': 'Backdrop (screensaver)',
  'com.google.android.tts': 'Google Text-to-speech',
  'com.google.android.gms': 'Google Play services',
  'com.android.vending': 'Google Play Store',
  'com.google.android.tv': 'Live Channels',
  'com.google.android.gms.optional': 'Google Play services (optional)',
  'com.xiaomi.mitv.tvrecommendation': 'Xiaomi recommendations',
  'com.xiaomi.mitv.settings': 'Xiaomi Settings',
  'com.xiaomi.mitv.wificonfig': 'Xiaomi Wi‑Fi setup',
  'com.xiaomi.mitv.payment': 'Xiaomi payment',
  'com.xiaomi.mitv.smartshare': 'Xiaomi Smart Share',
  'com.mitv.mitvpatchwall': 'Xiaomi PatchWall',
  'com.amazon.tv.launcher': 'Fire TV Home',
  'com.amazon.tv.alexadetection': 'Alexa detection',
  'com.amazon.tv.ottssocompanionapp': 'Amazon single sign-on',
  'com.amazon.tv.forcedotaupdater.v2': 'Fire OS updater',
  'com.amazon.tv.ottssocompanionapp.v2': 'Amazon single sign-on (v2)',
  'com.amazon.avod': 'Prime Video (Fire)',
  'com.amazon.venezia': 'Amazon Appstore',
  'com.amazon.hedwig': 'Amazon Help',
  'com.plexapp.android': 'Plex',
  'org.xbmc.kodi': 'Kodi',
  'com.hbo.hbonow': 'HBO Max',
  'com.apple.atve.androidtv.appletv': 'Apple TV',
};

/**
 * WHAT HAPPENS IF I SWITCH THIS OFF — the column the other tools sell (the 500k-install app keeps
 * "debloat recommendations" behind its PRO tier, docs/COMPETITOR_TASKS_STUDY.md §2.3). Ours is free
 * and it is OURS: written from what each package does on a television, never copied from the
 * Universal Android Debloater lists, which are GPL-3 and cannot live in an Apache-2.0 repo.
 *
 * It is a CONSEQUENCE, not a recommendation. We never say "remove this" — we say what stops, and
 * the person decides. `pm disable-user` is reversible by the same row, which is what makes an
 * honest sentence enough.
 */
export type SafetyLevel = 'safe' | 'care' | 'keep';

/** The handful of things that actually stop. One key per consequence, translated in the UI. */
export type SafetyEffect =
  | 'store'
  | 'updates'
  | 'voice'
  | 'cast'
  | 'recos'
  | 'screensaver'
  | 'tts'
  | 'account'
  | 'input'
  | 'media'
  | 'yours';

export interface AppSafety {
  level: SafetyLevel;
  effect?: SafetyEffect;
}

/** Packages we know by name, and what their absence costs. */
const SAFETY: Readonly<Record<string, AppSafety>> = {
  // --- Google, on every Android TV box -----------------------------------------------------------
  'com.google.android.katniss': { level: 'care', effect: 'voice' },
  'com.google.android.apps.mediashell': { level: 'care', effect: 'cast' },
  'com.google.android.tvrecommendations': { level: 'care', effect: 'recos' },
  'com.google.android.backdrop': { level: 'care', effect: 'screensaver' },
  'com.google.android.tts': { level: 'care', effect: 'tts' },
  'com.google.android.tv.remote.service': { level: 'care', effect: 'input' },
  'com.google.android.gsf': { level: 'keep', effect: 'account' },
  'com.google.android.syncadapters.contacts': { level: 'safe' },
  // apps: switching off one you never open costs exactly that one app
  'com.google.android.youtube.tv': { level: 'safe' },
  'com.google.android.youtube.tvmusic': { level: 'safe' },
  'com.google.android.youtube.tvkids': { level: 'safe' },
  'com.google.android.videos': { level: 'safe' },
  'com.google.android.play.games': { level: 'safe' },
  'com.google.android.tv': { level: 'safe' },
  'com.netflix.ninja': { level: 'safe' },
  'com.amazon.amazonvideo.livingroom': { level: 'safe' },
  'com.disney.disneyplus': { level: 'safe' },
  'com.spotify.tv.android': { level: 'safe' },
  'com.plexapp.android': { level: 'safe' },
  'org.xbmc.kodi': { level: 'safe' },
  'com.hbo.hbonow': { level: 'safe' },
  'com.apple.atve.androidtv.appletv': { level: 'safe' },
  // --- Xiaomi ------------------------------------------------------------------------------------
  'com.xiaomi.mitv.tvrecommendation': { level: 'safe' },
  'com.xiaomi.mitv.payment': { level: 'safe' },
  'com.xiaomi.mitv.smartshare': { level: 'care', effect: 'cast' },
  'com.xiaomi.mitv.settings': { level: 'keep' },
  'com.xiaomi.mitv.wificonfig': { level: 'keep' },
  'com.mitv.mitvpatchwall': { level: 'safe' },
  // --- Amazon / Fire TV --------------------------------------------------------------------------
  'com.amazon.tv.alexadetection': { level: 'safe' },
  'com.amazon.tv.ottssocompanionapp': { level: 'care', effect: 'account' },
  'com.amazon.tv.ottssocompanionapp.v2': { level: 'care', effect: 'account' },
  'com.amazon.tv.forcedotaupdater.v2': { level: 'care', effect: 'updates' },
  'com.amazon.venezia': { level: 'care', effect: 'store' },
  'com.amazon.avod': { level: 'safe' },
  'com.amazon.hedwig': { level: 'safe' },
};

/**
 * Patterns for the packages no list can name: every maker ships its own updater, its own store and
 * its own shop-window demo, under its own name. The test is on what the name SAYS it is, and a miss
 * only means the row says nothing — never that it says something wrong.
 */
const PATTERNS: ReadonlyArray<{ re: RegExp; safety: AppSafety }> = [
  { re: /(retaildemo|demomode|\.demo\.|shopdemo|storedemo)/i, safety: { level: 'safe' } },
  { re: /(fota|\bota\b|dmagent|softwareupdate|systemupdate|\.updater)/i, safety: { level: 'care', effect: 'updates' } },
  { re: /(appstore|\.market\.|\.store\.|marketplace)/i, safety: { level: 'care', effect: 'store' } },
  { re: /(inputmethod|\.ime\b|latin)/i, safety: { level: 'care', effect: 'input' } },
  { re: /(widevine|\bdrm\b|playready)/i, safety: { level: 'keep', effect: 'media' } },
  { re: /(voiceassist|assistant|\.voice\.|speech)/i, safety: { level: 'care', effect: 'voice' } },
  { re: /(screensaver|daydream)/i, safety: { level: 'care', effect: 'screensaver' } },
  { re: /(\.tts\b|texttospeech)/i, safety: { level: 'care', effect: 'tts' } },
  { re: /(settings|provider|framework|systemui)/i, safety: { level: 'keep' } },
];

/**
 * What switching this package off would cost. `userInstalled` is the box's own answer (`pm list
 * packages -3`): an app somebody put there themselves can always be put back from wherever it came,
 * so it is safe by definition and says so.
 */
export function appSafety(pkg: string, opts: { userInstalled?: boolean } = {}): AppSafety | null {
  const known = SAFETY[pkg];
  if (known) return known;
  if (opts.userInstalled) return { level: 'safe', effect: 'yours' };
  for (const p of PATTERNS) {
    if (p.re.test(pkg)) return p.safety;
  }
  return null;
}

/** The friendly name if we have one, else the package itself. */
export function appLabel(pkg: string): string {
  return KNOWN_APPS[pkg] ?? pkg;
}
