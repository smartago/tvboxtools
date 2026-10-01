// Brand config — ONE product (TV Box Tools / TV Launcher Manager) and the TARGETS it provisions.
//
// Until 27/9/2026 there were two products here, `launcher` and `kiosk` (DESIGN_NOTES §14). Jim
// retired the second: "one strong tool, for everyone and for everything". What survives of it
// is `brands/hotel.json` — not a product but a TARGET: the description of the app the tool
// installs and locks when the person is a property. It keeps the brand's shape because the
// step engine reads the run's `brand.*` (launcher package, home methods, profiles, never…),
// and the hotel road already ran that way (`runBrand` in the UI swaps it in).
//
// The JSON files live at the repo root (`brands/<id>.json`) so that every app, the build scripts
// and the sites read the same file. No `if (brand === …)` anywhere else.
import launcher from '../../../brands/launcher.json';
import hotel from '../../../brands/hotel.json';

/** The product. There is one. */
export type BrandId = 'launcher';
/** What a run addresses: the product's own launcher, or the hotel launcher on the hotel road. */
export type TargetId = BrandId | 'hotel';
export type Flow = 'kiosk' | 'disable-launcher';
export type Profile = 'kiosk' | 'open' | 'install-only';
export type HomeMethod = 'set-home-activity' | 'device-owner' | 'disable-stock';
export type NeverAction = 'device-owner' | 'factory-reset' | 'kiosk';
/**
 * The doors on the Tasks hub, step 7 of the wizard (docs/TASKS_HUB_PLAN.md). The brand lists
 * them in the order they are drawn; a task in `never` is not drawn, and a task the brand cannot
 * run itself may point at the product that can (`taskLinks`).
 */
export type HubTask = 'launcher' | 'kiosk' | 'console' | 'advanced' | 'debloat' | 'speedup' | 'screenshot' | 'display' | 'remote' | 'device' | 'apk' | 'free' | 'backup';
/**
 * The doors a copy that came from Google Play must not even draw (Jim, 23/9: "Debloat and
 * anything risky — NOT in the Play version, only sideload, exe and web"). The check is the
 * session's `canRiskyTasks`; this is the list it applies to.
 */
export const RISKY_TASKS: ReadonlyArray<HubTask> = ['debloat', 'apk', 'free', 'backup'];

export interface BrandColors {
  gradient: [string, string, string];
  cta: string;
  ctaText: string;
  confirm: string;
  confirmSoft: string;
  focus: string;
}

export interface BrandConfig {
  id: TargetId;
  /** Product name of THIS tool, e.g. "Hotel TV Launcher Manager". */
  name: string;
  byline: string;
  /** The launcher app the tool installs and configures. */
  launcherName: string;
  launcherPackage: string;
  /** `<pkg>/<class>` — the component that owns `android.intent.category.HOME`. */
  launcherHomeComponent: string;
  launcherAccessibilityService: string;
  launcherNotificationListener: string;
  launcherDeviceAdminReceiver: string | null;
  domain: string;
  webPath: string;
  manifestUrl: string;
  agentPage: string;
  /**
   * Η πολιτική απορρήτου αυτού του brand. Το Google Play τη ζητά ΚΑΙ στο Console ΚΑΙ μέσα στο
   * app· χωρίς αυτήν δεν υποβάλλεται τίποτα. Προαιρετικό στον τύπο, γιατί ένα brand που δεν
   * πάει σε κατάστημα δεν χρειάζεται να ψεύδεται ότι έχει.
   */
  privacyUrl?: string;
  /** Όροι χρήσης και πολιτική cookies — ό,τι υπάρχει, δείχνεται· ό,τι λείπει, δεν υπόσχεται. */
  termsUrl?: string;
  cookiesUrl?: string;
  /** Ο δημόσιος κώδικας, όταν υπάρχει — το λέει η οθόνη «Σχετικά» με τη διεύθυνσή του. */
  sourceUrl?: string;
  androidAppId: string;
  desktopProductName: string;
  cli: string;
  flow: Flow;
  roleStep: boolean;
  accountCheck: boolean;
  profiles: Profile[];
  homeMethods: HomeMethod[];
  accessibilityHome: boolean;
  /**
   * The launcher's first-run wizard asks for EVERY permission that needs a human, in one sitting
   * (the hotel launcher: the guest must never see an Android popup). Then the tool grants every
   * one of them by adb, so that wizard has nothing left to ask.
   */
  launcherAsksAllPermissions: boolean;
  fireTv: 'blocked' | 'supported';
  never: NeverAction[];
  tasks: HubTask[];
  taskLinks: Partial<Record<HubTask, string>>;
  debugOffAtHandover: boolean;
  colors: BrandColors;
  logo: {
    /** The horizontal lockup for the app header. */
    wordmark: string;
    icon: string;
    /** A ready-made 16:9 Android TV banner. Without one the generator composites the wordmark. */
    banner?: string;
    /** The full vertical lockup (artwork + wordmark), when the brand has one. */
    full?: string;
    /** The wordmark is dark: the header puts it on a light plate instead of on the glass. */
    onLight?: boolean;
  };
}

const BRANDS: Record<BrandId, BrandConfig> = {
  launcher: launcher as unknown as BrandConfig,
};
const TARGETS: Record<TargetId, BrandConfig> = {
  launcher: BRANDS.launcher,
  hotel: hotel as unknown as BrandConfig,
};

export const BRAND_IDS: readonly BrandId[] = ['launcher'];
export const TARGET_IDS: readonly TargetId[] = ['launcher', 'hotel'];

export function isBrandId(x: unknown): x is BrandId {
  return BRAND_IDS.includes(x as BrandId);
}

export function loadBrand(id: BrandId): BrandConfig {
  const b = BRANDS[id];
  if (!b) throw new Error(`unknown brand: ${id}`);
  return b;
}

export function isTargetId(x: unknown): x is TargetId {
  return TARGET_IDS.includes(x as TargetId);
}

/** The app a run addresses. `launcher` = the product's own launcher; `hotel` = the hotel launcher. */
export function targetConfig(id: TargetId): BrandConfig {
  const t = TARGETS[id];
  if (!t) throw new Error(`unknown target: ${id}`);
  return t;
}

/**
 * The hotel launcher — the target of the hotel road, whichever screen is asking. It is our APK from
 * our manifest, so the tool may fetch and install it itself wherever a download is allowed at all.
 */
export function hotelTarget(): BrandConfig {
  return TARGETS.hotel;
}

/**
 * The launchers of the OTHER targets. The hotel launcher on a box belongs to the hotel road, not to
 * the home picker — Jim saw it listed on his own box (23/9: "don't put com.hotel.bnb… here,
 * remove it"). And on the hotel road the product's own launcher is not on offer either.
 */
export function siblingLaunchers(brand: BrandConfig): ReadonlySet<string> {
  return new Set(TARGET_IDS.filter((id) => id !== brand.id).map((id) => TARGETS[id].launcherPackage));
}

/** Resolve the brand from a query string / env value / CLI flag, defaulting to `launcher`. */
export function resolveBrand(value: string | null | undefined): BrandConfig {
  return loadBrand(isBrandId(value) ? value : 'launcher');
}

/** Can this brand do X? Reads `never` so the UI never has to. */
export function brandAllows(b: BrandConfig, action: NeverAction): boolean {
  return !b.never.includes(action);
}

/**
 * The prototype strings say "HOTELTV" and "com.hotel.bnb" — the design notes chose to substitute at
 * runtime for the PLUI brand. Same here: one string table, brand words filled in.
 */
export function brandText(b: BrandConfig, text: string): string {
  return text
    .replace(/HOTELTV/g, b.launcherName)
    .replace(/hoteltvapp\.com/g, b.domain)
    .replace(/com\.hotel\.bnb(?:\.smart\.hospitality\.tv\.launcher)?/g, b.launcherPackage);
}
