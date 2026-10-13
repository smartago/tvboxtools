// The wizard + workspace state machine — a port of the prototype's `class Component`
// (design/prototype/TV Setup.dc.html, <script data-dc-script>): same fields, same methods, same
// enable/disable rules — but driving the real ProvisionEngine + AdbTransport instead of setTimeout fakes.
// Every difference between what a run addresses goes through `brand.*` (roleStep, accountCheck,
// fireTv, flow, profiles, homeMethods, never, accessibilityHome); there is no `brand.id` in here.
// `this.brand` is the one product; `hotelTarget()` is the hotel launcher the hotel road provisions.
import {
  CheckTimeoutError,
  aftvPage,
  brandAllows,
  isDownloadableUrl,
  isOurShortCode,
  isShortCode,
  isMultiApk,
  orderApkParts,
  readXapk,
  appsFromList,
  hotelAppsListUrl,
  type ListApp,
  looksLikeApk,
  resolveShortCode,
  shortCodeForPackage,
  knownLauncherSource,
  ProvisionEngine,
  SessionReport,
  STEPS,
  STOCK_LAUNCHERS,
  TOOL_VERSION,
  autoRunOrder,
  buildCheck,
  CHECK_COMMANDS,
  launcherRows,
  hospitalityRows,
  hotelTarget,
  ACCOUNTS_INTENT,
  parseFocusedPackage,
  playIntent,
  playSearchIntent,
  LAUNCHER_SEARCH,
  parseAccounts,
  parsePackages,
  parseDeviceOwner,
  parseResolvedHome,
  pickApps,
  appsForType,
  type InstallType,
  renderCommand,
  stepSucceeded,
  validateManifest,
  type BoxCheck,
  type BrandConfig,
  type HubTask,
  RISKY_TASKS,
  PROTECTED_PACKAGES,
  appLabel,
  appSafety,
  installFailure,
  isIrreversible,
  toolOutdated,
  type AppSafety,
  type CheckOutputs,
  type EngineEvent,
  type GateVerdict,
  type HomeMethod,
  type LauncherRow,
  type Manifest,
  type ManifestApp,
  type Profile,
  type ReportEntry,
  type ReportMeta,
  type Role,
  type ShellStep,
  type StepContext,
  type TaskId,
  INSTALL_TYPES,
} from '@tvlm/core';
import { ringTo } from './nav.js';
import { NoDevicesError, UnauthorizedError, type AdbDevice, type AdbTransport, type DebugPath, type DeviceInfo } from '@tvlm/adb';
import { hasLang, I18n, LANGS, type StrKey } from './i18n/index.svelte.js';
import { detectOs, type HelpTopic, type HostOs } from './help.js';
import { prefGet, prefSet } from './prefs.js';

export type Platform = 'desktop' | 'web' | 'android';
export type Mode = 'wizard' | 'workspace';
export type BoxId = 'androidtv' | 'googletv' | 'xiaomi' | 'other' | 'firetv';
export type TaskPage = 'over' | 'auto' | 'prof' | 'inst' | 'home' | 'conf' | 'test' | 'hand' | 'maint' | 'console' | 'debloat' | 'speed' | 'shot' | 'display' | 'device' | 'remote' | 'apk' | 'free' | 'backup' | 'agent' | 'agentmcp' | 'fleet' | 'about';
export type ScanState = 'idle' | 'scanning' | 'found' | 'empty';
export type InstStatus = 'wait' | 'ver' | 'ing' | 'ok' | 'err';
export type TestId = 'home' | 'perms' | 'profile' | 'apps' | 'reboot';
export type StatusKind = 'done' | 'run' | 'wait' | 'todo';
/**
 * Google's own "sign in again" flows. When one of these is in front after a Play intent, the box
 * did not fail to open Play — Play handed the screen to Google, and nothing will install until
 * somebody types the password on the TV. Two packages, because the screen is GMS's and older
 * boxes route it through the setup wizard.
 */
const GOOGLE_SIGN_IN = ['com.google.android.gms', 'com.google.android.gsf.login', 'com.android.setupwizard'];

export type HumanWhat = NonNullable<ShellStep['humanAfter']>;

/** The risk a door carries — the tag on its row, from the design session (23/9). */
export type HubRisk = 'ro' | 'rev' | 'chg';
export const RISK_KEY: Record<HubRisk, StrKey> = { ro: 'th_ro', rev: 'th_rev', chg: 'th_chg' };
/**
 * What each door IS: icon, the three lengths of its name, its risk, and the commands it will run
 * (the right panel shows them BEFORE anything runs — the promise made visible). `<pkg>` is the
 * launcher the person picks on the next screen; nothing here is assumed about which.
 */
/**
 * `title` = το πλήρες όνομα (δεξί πάνελ) · `tile` = το σύντομο, αυτό που χωρά σε πλακίδιο μιας
 * γραμμής σε τρεις στήλες — τα ίδια που δείχνει το μενού του workspace, ήδη μεταφρασμένα.
 */
export const HUB_META: Record<HubTask, { icon: string; title: StrKey; tile: StrKey; short: StrKey; desc: StrKey; risk: HubRisk; cmds: string[] }> = {
  launcher: { icon: 'pi-cat-all', title: 'th_launcher', short: 'th_launcherS', tile: 't_home', desc: 'th_launcherD', risk: 'rev', cmds: ['cmd package set-home-activity <pkg>/.Main', 'cmd package resolve-activity -c HOME'] },
  debloat: { icon: 'pi-cat-others', title: 'th_debloat', short: 'th_debloatS', tile: 't_debloat', desc: 'th_debloatD', risk: 'rev', cmds: ['pm list packages -d', 'pm disable-user --user 0 <pkg>'] },
  speedup: { icon: 'pi-wand', title: 'th_speed', short: 'th_speedS', tile: 't_speed', desc: 'th_speedD', risk: 'rev', cmds: ['settings put global window_animation_scale 0', 'settings put global transition_animation_scale 0', 'settings put global animator_duration_scale 0'] },
  screenshot: { icon: 'pi-gallery', title: 'th_shot', short: 'th_shotS', tile: 't_shot', desc: 'th_shotD', risk: 'ro', cmds: ['exec-out screencap -p > tv.png'] },
  display: { icon: 'pi-top-bar', title: 'th_display', short: 'th_displayS', tile: 't_display', desc: 'th_displayD', risk: 'rev', cmds: ['wm size 1920x1080', 'wm density 320', 'settings put system font_scale 1.0'] },
  device: { icon: 'pi-opt-general', title: 'th_device', short: 'th_deviceS', tile: 't_device', desc: 'th_deviceD', risk: 'ro', cmds: ['getprop ro.product.model', 'wm size', 'df /data', 'date'] },
  backup: { icon: 'pi-bag', title: 'th_backup', short: 'th_backupS', tile: 't_backup', desc: 'th_backupD', risk: 'ro', cmds: ['pm list packages -3', 'pm path <pkg>', 'pull <path>'] },
  apk: { icon: 'pi-cat-others', title: 'th_apk', short: 'th_apkS', tile: 't_apk', desc: 'th_apkD', risk: 'chg', cmds: ['pm install -r <your file>.apk'] },
  free: { icon: 'pi-wand', title: 'th_free', short: 'th_freeS', tile: 't_free', desc: 'th_freeD', risk: 'chg', cmds: ['df /data', 'pm trim-caches 2G', 'pm clear <pkg>'] },
  remote: { icon: 'pi-bullhorn', title: 'th_remote', short: 'th_remoteS', tile: 't_remote', desc: 'th_remoteD', risk: 'chg', cmds: ['input keyevent KEYCODE_DPAD_DOWN', 'input text hello', 'input keyevent KEYCODE_WAKEUP'] },
  console: { icon: 'bi-solid-arrow-right', title: 'th_console', short: 'th_consoleS', tile: 'th_console', desc: 'th_consoleD', risk: 'chg', cmds: ['<your command> · gated'] },
  advanced: { icon: 'pi-settings', title: 'th_advanced', short: 'th_advancedS', tile: 'th_advanced', desc: 'th_advancedD', risk: 'chg', cmds: ['opens workspace'] },
  kiosk: { icon: 'pi-lock', title: 'th_kiosk', short: 'th_kioskS', tile: 'th_kiosk', desc: 'th_kioskD', risk: 'chg', cmds: ['dumpsys account', 'dpm set-device-owner <dpc>', 'am broadcast -a <pkg>.PROVISION --es profile kiosk'] },
};
/** Which box the run is about: the television the tool is running on, or another one on the network. */
export type Target = 'self' | 'other';
/** A system settings screen on the device the tool runs on — the Android face can open these. */
export type SettingsScreen = 'about' | 'dev' | 'wifi' | 'settings';
/** The manifest may carry two display-only extras the prototype shows (`2.0 (1002)` · `38 MB`). */
export type UiApp = ManifestApp & { versionName?: string; size?: string };
/** Where a Hotel TV box will be used (design 24/9, "Hotel TV Use"). */
export type HotelUse = 'bnb' | 'hotel' | 'reseller';
/**
 * The Install screen's switches. `hideStock`, `secure`, `bg` the tool does itself over adb; the rest
 * travel as PROVISION extras for the hotel app to apply, and are drawn "coming" until it does.
 */
export interface HotelSwitches {
  adult: boolean;
  updates: boolean;
  cec: boolean;
  volume: boolean;
  hideStock: boolean;
  secure: boolean;
  bg: boolean;
}
/** The Admin PIN a locked box gets when nobody chose one (Jim, 25/9). Same value in the hotel app (Kiosk.DEFAULT_ADMIN_PIN). */
export const DEFAULT_ADMIN_PIN = '1111';
/**
 * A remembered value, or '' when this computer remembers nothing. On the desktop the bag is
 * `config.json` (next to the exe where that can be written); everywhere else it is `localStorage`.
 * Both live behind `prefs.ts`, so nothing here knows which one answered.
 */
const readStored = prefGet;
const writeStored = prefSet;

export interface HumanPrompt {
  what: HumanWhat;
  step: ShellStep;
  resolve: () => void;
}
export interface GateAsk {
  id: number;
  /** Index of the `cmd` entry in `entries` this ask belongs to. */
  entry: number;
  cmd: string;
  resolve: (ok: boolean) => void;
}
export interface GateRow {
  entry: number;
  cmd: string;
  verdict: GateVerdict;
  state: 'auto' | 'pending' | 'ran' | 'denied' | 'blocked';
  ask?: GateAsk;
}

/**
 * What the Android host says about the device it is running on (the AdbSocket plugin's
 * `deviceInfo`): the name to show, and the three switches the "set up this TV" path waits for.
 */
export interface SelfInfo {
  manufacturer: string;
  model: string;
  sdk: number;
  /** `Build.VERSION.RELEASE` — "14", the number a human recognises. */
  release: string;
  /** The package whose activity answers HOME here — what kind of box this is, in one string. */
  home: string;
  /** This copy came from Google Play — then the picker never fetches an APK from the internet. */
  playBuild: boolean;
  /** Το δικό ΜΑΣ applicationId — για τη σελίδα μας στο Play. */
  packageName?: string;
  /**
   * Installer-of-record: ΠΟΙΟΣ έβαλε αυτό το αντίγραφο (Downloader, ο δικός μας Downloader TV,
   * Chrome…), '' όταν δεν ξέρει το σύστημα. Στην οθόνη «Σχετικά» είναι η πιο γρήγορη απάντηση σε
   * «από πού το κατέβασες;» όταν κάποιος ζητά υποστήριξη.
   */
  installer?: string;
  /** Settings.Global: DEVELOPMENT_SETTINGS_ENABLED · ADB_ENABLED · adb_wifi_enabled. */
  developer: boolean;
  adb: boolean;
  wirelessAdb: boolean;
  /**
   * Does THIS device — the one running the tool, not the box — have an app that can open a
   * file picker? A television usually does not, and then the APK road is not a road at all
   * (Jim saw Android's own "You don't have an app that can do this", 29/9). `undefined` means
   * nobody asked, which is every host that is not Android: those can always pick a file.
   */
  canPickFile?: boolean;
}

export interface SessionHooks {
  fetchApk?: (url: string) => Promise<{ stream: ReadableStream<Uint8Array>; size?: number }>;
  sha256?: (stream: ReadableStream<Uint8Array>) => Promise<string>;
  /**
   * ΕΝΑ JSON ΑΠΟ ΤΟ ΔΙΚΤΥΟ — και ΟΧΙ μέσα από το WebView όταν τρέχουμε σε κουτί. Το ίδιο μάθημα
   * με την κλήση της γλώσσας κατά IP (main.ts, 29/9): η τηλεόραση τρέχει το Chrome που πάγωσε ο
   * κατασκευαστής της, με τη λίστα ριζικών πιστοποιητικών εκείνης της χρονιάς, και το `fetch`
   * σκάει με σκέτο `TypeError` ενώ το δίκτυο είναι μια χαρά. Στο Android περνά από το σύστημα.
   */
  getJson?: (url: string) => Promise<unknown>;
  /**
   * ANDROID: η ΙΔΙΑ η εφαρμογή κατεβάζει το δικό της APK και το δίνει στον εγκαταστάτη του
   * συστήματος — ο δρόμος όλων των sideload app μας (UNI, REMAP, Downloader TV). Σε τηλεόραση
   * δεν υπάρχει browser να σταλεί κάποιος σε σελίδα λήψης.
   */
  selfUpdate?: (url: string, onProgress?: (percent: number) => void) => Promise<boolean>;
  canSelfInstall?: () => Promise<boolean>;
  openSelfInstallPermission?: () => Promise<boolean>;
  /**
   * ΜΙΑ ΓΡΑΜΜΗ ΟΤΑΝ ΚΑΤΙ ΣΠΑΣΕΙ ΣΤΟ BOX (2/10/2026). Το περνά το app που ξέρει από δίκτυο· χωρίς
   * αυτό η αποτυχία μένει μόνο στην τοπική αναφορά και δεν μαθαίνουμε ποτέ σε ποια μοντέλα σπάει.
   */
  reportError?: (command: string, message: string, details?: Record<string, unknown>) => void;
  manifest?: Manifest | (() => Promise<Manifest>);
  /**
   * Open a URL outside the app (guide links, system-settings deep links). Hosts that cannot use
   * `window.open` pass their own; the desktop app routes `window.open` through the main process,
   * so it works there without a hook.
   */
  openExternal?: (url: string) => void;
  /**
   * Η έκδοση του ΕΡΓΑΛΕΙΟΥ, από το package.json της όψης που το χτίζει. Η σταθερά `TOOL_VERSION`
   * του πυρήνα έλεγε ακόμη 0.1.0 ενώ κυκλοφορούσε το 0.2.3 — και ήταν αυτό που έμπαινε στην
   * αναφορά κάθε εκτέλεσης. Ό,τι δεν το περνά κανείς, το λέει η σταθερά· ό,τι το περνά, νικά.
   */
  version?: string;
  /** Ο αριθμός build (πλήθος commit) — η ΜΟΝΗ σύγκριση που δουλεύει· το όνομα είναι ημερήσιο. */
  build?: number;
  /** Desktop only: open the box in a scrcpy window, if this computer has scrcpy. */
  mirror?: (target: string) => Promise<{ ok: boolean; reason?: 'missing' | 'failed'; message?: string }>;
  /**
   * Web only: open a connection to the local bridge (`tvlm bridge`, ws://127.0.0.1:15555) and
   * resolve with it. Rejects while nothing is listening. A browser cannot open TCP sockets, so
   * Wi-Fi goes through this or not at all — see `bridgeDesktop()`.
   */
  connectBridge?: () => Promise<AdbTransport>;
  /**
   * Android only: read the switches of the device the tool is running on. The "set up this TV"
   * path waits on this instead of asking the installer whether Developer options are on — the set
   * is right there and can answer for itself. `null` = the host cannot tell, and then nothing is
   * ever blocked: an answer we cannot get must not become a closed door.
   */
  selfInfo?: () => Promise<SelfInfo | null>;
  /** Android only: open a system settings screen on THIS device. `false` = nothing answered. */
  openSettingsScreen?: (screen: SettingsScreen) => Promise<boolean>;
  /**
   * Android only: the rendered icons of apps on THIS device, as data URLs. The launcher picker
   * shows them when the box IS this television; there is no honest way to get an app's icon off a
   * box across the room (its resource names are renamed in an optimised build), and we will not
   * ship anyone's logo with the tool.
   */
  appIcons?: (packages: string[]) => Promise<Record<string, string>>;
  /**
   * Read what is on this device's clipboard. On a TELEVISION this is the only comfortable way to
   * put a command on screen: the person writes it on their phone (Send to TV Quick) and pastes it
   * here with one press, instead of spelling it out with a remote.
   */
  readClipboard?: () => Promise<string>;
}

export interface SessionOptions extends SessionHooks {
  brand: BrandConfig;
  transport: AdbTransport;
  platform: Platform;
  /** Running on a television: the console dock collapses and the D-pad drives everything. */
  tv?: boolean;
  lang?: string;
  startIn?: Mode;
  /** Where the brand logos live, relative to the page (`brand/` in apps/web). */
  assetBase?: string;
  /**
   * The language was decided OUTSIDE this app — on the website that serves it, where it is part of
   * the address (`/el/setup/`, the Lunona pattern). Asking again on the first screen would be the
   * tool doubting a choice the person already made one click earlier (Jim, 22/9).
   */
  langLocked?: boolean;
  /**
   * Built for a phone. Passed in (not measured later) because the first screen is decided in the
   * constructor: on a phone the language SCREEN does not exist at all — a dialog over the first
   * real step asks the question instead (LangAsk.svelte, the shape ZUKKA uses).
   */
  phone?: boolean;
  /** Test only: fetch the download list from here instead of the brand's address. */
  manifestOverride?: string;
}

/** A SessionReport that mirrors every entry into a reactive array for the console. */
class UiReport extends SessionReport {
  constructor(
    meta: ReportMeta,
    private readonly onAdd: (e: ReportEntry) => void,
  ) {
    super(meta);
  }
  override add(kind: ReportEntry['kind'], text: string, extra: Partial<Pick<ReportEntry, 'verdict' | 'stepId'>> = {}): ReportEntry {
    const e = super.add(kind, text, extra);
    this.onAdd(e);
    return e;
  }
}

export const WIZARD_STEPS: ReadonlyArray<StrKey> = ['s_lang', 's_target', 's_role', 's_box', 's_dev', 's_debug', 's_connect', 's_allow', 's_check', 's_tasks', 's_launcher', 's_kiosk', 's_kioskApp', 's_use', 's_install', 's_mode'];
/**
 * The screens BY NAME. `step` is an index into WIZARD_STEPS, so every insertion moves the numbers
 * — the names do not move. Nothing outside this file should know the numbers at all.
 */
export const W = { lang: 0, target: 1, role: 2, box: 3, dev: 4, debug: 5, find: 6, allow: 7, check: 8, tasks: 9, launcher: 10, kiosk: 11, kioskApp: 12, use: 13, install: 14, mode: 15 } as const;
export const BOXES: ReadonlyArray<{ id: BoxId; tile: string; tileText: string }> = [
  { id: 'androidtv', tile: '#3DDC84', tileText: 'ANDROID TV' },
  { id: 'googletv', tile: '#1a73e8', tileText: 'GOOGLE TV' },
  { id: 'xiaomi', tile: '#FF6900', tileText: 'MI' },
  { id: 'other', tile: '#4B5563', tileText: '?' },
  { id: 'firetv', tile: '#F59E0B', tileText: 'FIRE TV' },
];
export const TEST_IDS: ReadonlyArray<TestId> = ['home', 'perms', 'profile', 'apps', 'reboot'];
const CHECK_ROWS = 6;

function boxPlatform(box: BoxId | null): 'googletv' | 'androidtv' | 'firetv' {
  return box === 'googletv' ? 'googletv' : box === 'firetv' ? 'firetv' : 'androidtv';
}

async function defaultSha256(stream: ReadableStream<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function defaultFetchApk(url: string): Promise<{ stream: ReadableStream<Uint8Array>; size?: number }> {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`GET ${url} → ${r.status}`);
  const len = r.headers.get('content-length');
  return { stream: r.body as ReadableStream<Uint8Array>, size: len ? parseInt(len, 10) : undefined };
}

/** Η εφεδρεία όπου κανείς δεν έδωσε δικό του: σκέτο `fetch`, που αρκεί παντού εκτός από box. */
async function defaultGetJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
  return r.json();
}

export class Session {
  readonly brand: BrandConfig;
  /** Η έκδοση του εργαλείου, όπως την περνά η όψη που το χτίζει (δες `version` στις επιλογές). */
  readonly appVersion: string;
  appBuild = 0;
  /**
   * Not readonly: the web face starts on WebUSB and swaps to the bridge when one comes up — and
   * reactive, because screens ask it what this platform can actually do (`supports`), so the
   * answer has to change on screen the moment the transport does.
   */
  transport = $state<AdbTransport>(null!);
  readonly platform: Platform;
  readonly tv: boolean;
  /**
   * A PHONE held upright: the 1280×820 canvas does not fit, so the app changes shape (portrait.css)
   * — one column, the task nav becomes a drawer, the console dock collapses to its bar. Set by <App>
   * from the viewport on every resize, never from the platform: an Android TABLET is wide enough for
   * the real layout, and a desktop window dragged narrow deserves the same treatment as a phone.
   * Reactive, because the screens ask it what shape they are in (Workspace, Console, Stepper).
   */
  phone = $state(false);
  readonly i18n: I18n;
  readonly assetBase: string;
  /** The site chose the language, so the wizard's first screen is not a language screen. */
  readonly langLocked: boolean;
  /** `?manifest=` / `TVLM_MANIFEST`: a download list somewhere else, for testing an unreleased build. */
  readonly manifestOverride: string;
  /**
   * A language we believe suits this visitor better than the one on screen — offered, never
   * applied behind their back. Null once they answer, or when there is nothing to offer.
   */
  langSuggestion = $state<string | null>(null);
  readonly report: UiReport;
  private readonly hooks: Required<Pick<SessionHooks, 'fetchApk' | 'sha256' | 'getJson'>> & Pick<SessionHooks, 'manifest' | 'openExternal' | 'mirror' | 'connectBridge' | 'selfInfo' | 'selfUpdate' | 'canSelfInstall' | 'openSelfInstallPermission' | 'openSettingsScreen' | 'appIcons' | 'readClipboard' | 'reportError'>;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private tick: ReturnType<typeof setInterval> | null = null;
  private connectAbort: AbortController | null = null;
  private selfTimer: ReturnType<typeof setInterval> | null = null;
  private onVisible: (() => void) | null = null;
  /** >0 while a task the user started is running: the Start/Run button IS the confirmation (DESIGN_NOTES §2). */
  private userInitiated = 0;
  private gateSeq = 0;
  private manifestPromise: Promise<Manifest> | null = null;
  private checkFrom = 0;
  private currentInstallPkg: string | null = null;
  engine: ProvisionEngine | null = null;

  // ---- wizard
  mode = $state<Mode>('wizard');
  step = $state(0);
  /** Which box this run is about. Only the TV face asks; everywhere else it is another box. */
  target = $state<Target>('other');
  /** What this TV last said about itself, polled while a screen waits on it (null = cannot tell). */
  selfInfo = $state<SelfInfo | null>(null);
  /** The last "open settings" found nothing to open: the remote is the only way in. */
  settingsFailed = $state(false);
  /** `box` was filled in from what this TV said, not picked by a human — so it can be taken back. */
  boxAuto = $state(false);
  /** The row id of the launcher that should open on HOME (`ours`, a package, or `ask`). */
  launcherPick = $state<string | null>(null);
  /** An install started from the picker is running (ours, straight from the manifest). */
  launcherBusy = $state(false);
  /** Play was opened on the TV for this package; the row then offers "check again". */
  launcherSent = $state<string | null>(null);
  /** Why the last install from the picker failed. On a TV the console is closed — say it on screen. */
  launcherError = $state<string | null>(null);
  /** The last thing the engine said went wrong — shown instead of a generic failure. */
  lastEngineError = $state<string | null>(null);
  /** Real icons for the picker's rows, read from this device when it is the box being set up. */
  launcherIcons = $state<Record<string, string>>({});
  /** Which phase the running install is in — what the button says while it works. */
  installPhase = $state<'download' | 'verify' | 'install' | null>(null);
  /** Bytes of the APK that have actually arrived, and how many there are. A television is far from
   *  the reader, so "Working…" is not an answer: the button fills up and the line counts. */
  dlDone = $state(0);
  dlTotal = $state(0);
  /** "Keep the current launcher": HOME is left exactly as it is, here and in the automatic run. */
  keepHome = $state(false);
  /** The step of the gold action that the engine cannot name (fetching the manifest, setting HOME). */
  stageText = $state<string | null>(null);
  role = $state<Role>('owner');
  resellerCode = $state('RS-4471');
  box = $state<BoxId | null>(null);
  debug = $state<DebugPath | null>(null);
  scan = $state<ScanState>('idle');
  scanHint = $state<NoDevicesError['hint']>('none');
  /** The open guide sheet (W6 "Hotspot guide" / "Get USB driver"), or null. */
  help = $state<HelpTopic | null>(null);
  /** Why USB is unavailable on this host, when the transport can say (Electron). Shown in the driver guide. */
  usbReason = $state<string | null>(null);
  readonly hostOs: HostOs = detectOs();
  devices = $state<DeviceInfo[]>([]);
  devSel = $state<number | null>(null);
  ip = $state('');
  pair = $state('');
  pairPort = $state('');
  manualError = $state<StrKey | null>(null);
  allowTries = $state(0);
  authorized = $state(false);
  allowFailed = $state(false);
  // ΤΟ ΚΟΥΤΙ ΔΕΝ ΑΠΑΝΤΗΣΕ ΚΑΘΟΛΟΥ, δεν είναι «δεν πάτησες Allow» (Jim, 2/10: Android 7 box στο
  // 192.168.1.151 — καμία απάντηση ούτε σε ARP, και η οθόνη του έλεγε να πατήσει Allow στην TV).
  // Το ξεχωρίζει το catch: unauthorized = μας απάντησε, οτιδήποτε άλλο = δεν μας απάντησε.
  allowSilent = $state(false);
  anim = $state(0);
  bridged = $state(false);
  bridgeQr = $state(false);
  /** Web + Wi-Fi: the download page is open and we are polling for the bridge to come up. */
  bridgeWait = $state(false);
  /** The polling gave up. Never silently "connected" — the user has something to do. */
  bridgeFailed = $state(false);
  private bridgeSeq = 0;
  device = $state<AdbDevice | null>(null);
  check = $state<BoxCheck | null>(null);
  checkPartial = $state<BoxCheck | null>(null);
  checkN = $state(0);
  checking = $state(false);
  /** The check command the box never answered (CheckTimeoutError) — the screen names it and offers a retry. */
  checkStuck = $state<string | null>(null);
  setupMode = $state<'auto' | 'manual'>('auto');
  accRemoved = $state(false);
  accScreen = $state(false);
  setupOpen = $state(false);
  wsConnecting = $state(false);
  wsError = $state<string | null>(null);

  // ---- workspace
  task = $state<TaskPage>('over');
  /** The door taken on the Tasks hub (step 7). Null until one is pressed. */
  hubTask = $state<HubTask | null>(null);
  /** The tile under the pointer / the arrows on the hub: the right panel and the footer follow it. */
  hubFocus = $state<HubTask | null>(null);
  /** The launcher task finished: the name of the app that now opens on HOME. Null while choosing. */
  launcherDone = $state<string | null>(null);
  // ---- Kiosk (docs/TASKS_HUB_PLAN.md §10): which app takes control, and the lock
  /** The row picked on the Kiosk screen. Ours is the recommendation, so the screen opens on it. */
  kioskPick = $state<string | null>('ours');
  /** "My own app": the package typed by the person. Only a HOME-capable one can be locked in. */
  kioskCustom = $state('');
  /** The kiosk task finished on an edition that never locks: the app that now opens on HOME. */
  kioskDone = $state<string | null>(null);
  /** The Accounts screen was opened on the TV: the button now offers to read the box again. */
  accountsSent = $state(false);
  /** The Admin PIN typed on the Kiosk screen to unlock a box our app has locked. */
  unlockPin = $state('');
  /** The last unlock said "done", and which of the two it was — the verdict on the Kiosk screen. */
  unlockDone = $state<'keep' | 'reset' | false>(false);
  // ---- Hotel TV setup (docs/HOTELTV_SETUP_PLAN.md): where the box will be used, and what goes on it
  hotelUse = $state<HotelUse>('bnb');
  hotelWhere = $state<'room' | 'lobby'>('room');
  /** The room code from hoteltvapp.com — optional; the host can link the TV later from the app. */
  hotelCode = $state('');
  installType = $state<InstallType>('typ');
  /** Apps ticked one by one on the Install screen; null = exactly what the type says. */
  installPick = $state<string[] | null>(null);
  /** The reseller's code — remembered on this computer (design: "Reseller ID, remembered"). */
  resellerId = $state(readStored('tvlm.resellerId'));
  /**
   * Admin PIN typed on the Install screen. Default 1111 (Jim, 25/9): a locked box must always have a
   * key — the app makes it the Admin PIN when the Admin has none. The host changes it in the app.
   */
  adminPin = $state(DEFAULT_ADMIN_PIN);
  hotelSw = $state<HotelSwitches>({ adult: false, updates: true, cec: true, volume: true, hideStock: false, secure: true, bg: true });
  /**
   * The hotel launcher's manifest, on an edition whose own manifest lists a different launcher.
   * Undefined until read; null when it could not be read. The button reads it before promising
   * "Install": a manifest with no APK for the app sends the row to Play instead.
   */
  hotelManifest = $state<Manifest | null | undefined>(undefined);
  /**
   * ΤΑ ΥΠΟΛΟΙΠΑ APPS, ΑΠΟ ΤΗ ΛΙΣΤΑ ΤΟΥ SMRT ADMIN (Jim, 8/10/2026 — HOTELTV_INCLUDE_APPS_STUDY.md).
   * Το manifest κρατά τον launcher με μετρημένο sha256· η λίστα `HOTELTV_APPS_INLCUDE_SETUP` δίνει
   * τα υπόλοιπα, με τύπο εγκατάστασης ανά γραμμή. `undefined` = δεν ζητήθηκε ακόμη, `null` = δεν
   * απάντησε (η οθόνη δουλεύει όπως πριν: μόνο ο launcher — η λίστα είναι προσθήκη, όχι προϋπόθεση).
   */
  hotelListApps = $state<ListApp[] | null | undefined>(undefined);
  /**
   * A task opened from the Tasks hub stands on its own: no workspace sidebar, one way back — to
   * the hub. The sidebar belongs to the Advanced door only (Jim, 23/9).
   */
  taskOnly = $state(false);
  // ---- Debloat: what the box says is off, what THIS session switched off, the row waiting for a second press
  dbDisabled = $state<string[]>([]);
  dbDoneByUs = $state<string[]>([]);
  dbArmed = $state<string | null>(null);
  dbBusy = $state(false);
  /** `pm list packages -3` — what somebody put on this box, as opposed to what came with it. */
  dbUser = $state<string[]>([]);
  // ---- Speed up: the window animation scale as last read (null = not read yet)
  animScale = $state<number | null>(null);
  // ---- Screen: what `wm size` / `wm density` / font_scale answer. "physical" is what the panel is,
  // "override" is what Android has been told to pretend — the second is what we write, and clearing
  // it is always one press away, which is what makes this safe to offer at all.
  dispPhysical = $state<string | null>(null);
  dispOverride = $state<string | null>(null);
  densPhysical = $state<number | null>(null);
  densOverride = $state<number | null>(null);
  fontScale = $state<number | null>(null);
  dispBusy = $state(false);
  // ---- Device: the read-only card (model, Android, screen, storage, uptime) and the clock
  devInfo = $state<Array<{ key: StrKey; value: string }>>([]);
  devBusy = $state(false);
  /** Seconds the box's clock is away from this computer's — the cause behind "Trust anchor not found". */
  clockSkew = $state<number | null>(null);
  ntpServer = $state<string | null>(null);
  // ---- Install my APK: what was dropped in, and how each one went
  apkQueue = $state<Array<{ name: string; size: number; status: InstStatus; msg?: string; bundle?: boolean; parts?: number }>>([]);
  apkBusy = $state(false);
  // ---- Free space: what `df` said before and after, and the row waiting for an answer
  freeBefore = $state<string | null>(null);
  freeAfter = $state<string | null>(null);
  freeBusy = $state(false);
  freeAsk = $state<string | null>(null);
  // ---- Backup: one row per app on the box, with the file once it has been pulled
  backupRows = $state<Array<{ pkg: string; label: string; path?: string; size?: number; blob?: string; err?: string; busy?: boolean; extra?: Array<{ name: string; url: string }> }>>([]);
  backupBusy = $state(false);
  // ---- Mirror: whether this computer can show the television in a window, and what happened
  mirrorMsg = $state<string | null>(null);
  mirrorBusy = $state(false);
  // ---- Remote: the last key we sent, so the on-screen pad can show it landed
  lastKey = $state<string | null>(null);
  remoteText = $state('');

  profile = $state<Profile | null>(null);
  profileApplied = $state(false);
  profileBusy = $state(false);
  manifest = $state<Manifest | null>(null);
  manifestError = $state<string | null>(null);
  choices = $state<Record<string, string>>({});
  inst = $state<Record<string, InstStatus>>({});
  installing = $state(false);
  homeMethod = $state<HomeMethod | null>(null);
  homeSet = $state(false);
  stockDisabled = $state(false);
  homeAsk = $state(false);
  homeBusy = $state(false);
  curHome = $state<string | null>(null);
  cfg = $state<Record<string, boolean>>({ overlay: true, usage: true, notif: true, tvl: true, acs: true });
  cfgApplied = $state(false);
  cfgBusy = $state(false);
  room = $state('3391-2854');
  tests = $state<Partial<Record<TestId, boolean>>>({});
  testsBusy = $state(false);
  shot = $state<string | null>(null);
  adbOff = $state<boolean | null>(null);
  pin = $state('');
  maintBusy = $state(false);
  maintActive = $state(false);
  removeArmed = $state(false);
  removed = $state(false);
  gateAsks = $state<GateAsk[]>([]);
  /**
   * ΜΙΑ ΕΝΤΟΛΗ ΕΣΚΑΣΕ — ΤΙ ΚΑΝΟΥΜΕ; (Jim, 2/10/2026.) Το παράθυρο ΔΕΝ κλείνει μόνο του: δείχνει την
   * εντολή και την ωμή απάντηση του κουτιού, και περιμένει άνθρωπο. Null = δεν ρωτά τίποτα τώρα.
   */
  failAsk = $state<{ label: string; cmd: string; out: string; resolve: (go: boolean) => void } | null>(null);

  // ------------------------------------------------- η κονσόλα ΜΕΣΑ στον οδηγό
  /**
   * ΔΕΝ ΕΙΝΑΙ ΜΟΝΙΜΗ ΕΔΩ (Jim, 2/10/2026: «έχει πάρει όλο τον πολύτιμο χώρο και μπερδεύει τον
   * user»). Στον χώρο εργασίας η κονσόλα είναι εργαλείο και μένει· στον οδηγό είναι ΑΠΟΔΕΙΞΗ και
   * βγαίνει μόνο όσο τρέχει εργασία: αν όλα πήγαν καλά φεύγει μόνη της, αν κάτι έσπασε μένει για να
   * διαβαστεί — και τότε κρύβεται με το χέρι.
   */
  runConsole = $state(false);
  /**
   * ΠΕΤΥΧΕ — ΚΑΙ ΦΑΙΝΕΤΑΙ ΠΡΙΝ ΦΥΓΕΙ (Jim, 2/10: «πάτησα συνέχισε και δεν έκανε τίποτα, ούτε έδωσε
   * αν πέρασε ή όχι, απλά έκλεισε»). Όταν τα υπόλοιπα βήματα είναι ακαριαία, ένα παράθυρο που
   * εξαφανίζεται στο ίδιο καρέ μοιάζει με «δεν έγινε τίποτα». Μένει μια στιγμή με πράσινο ✓.
   */
  runOk = $state(false);
  /**
   * ΜΠΗΚΕ ΤΟ APK ΚΑΙ ΤΟ ΚΟΥΤΙ ΤΟ ΔΕΧΤΗΚΕ ΩΣ ΑΡΧΙΚΗ ΟΘΟΝΗ (Jim, 3/10/2026). Μέχρι τώρα η οθόνη
   * έμενε απαράλλαχτη και κανείς δεν μάθαινε ούτε ότι πέτυχε ούτε τι μένει. Ο διάλογος λέει ποιος
   * ήρθε και προσφέρει το ένα βήμα που απομένει: να γίνει HOME.
   */
  apkArrived = $state<{ pkg: string; file: string; pick: string; wrong?: string } | null>(null);

  // ------------------------------------------------- υπάρχει νεότερη έκδοση του ΕΡΓΑΛΕΙΟΥ
  /**
   * ΔΕΝ ΕΝΗΜΕΡΩΝΟΥΜΕ ΜΟΝΟΙ ΜΑΣ, ΕΙΔΟΠΟΙΟΥΜΕ (απόφαση Jim, 3/10/2026). Μετρημένο την ίδια νύχτα:
   * το portable ΔΕΝ μετονομάζεται όσο τρέχει (είναι αυτοεξαγόμενο 7z και κρατά handle στον εαυτό
   * του), και το `resources/app.asar` της εγκατάστασης είναι κλειδωμένο. Ό,τι «έξυπνο» θα δούλευε
   * σε μία μορφή και θα έσπαγε στην άλλη. Ένας διάλογος και ο browser δουλεύουν παντού.
   */
  updateAvail = $state<{ version: string; build: number } | null>(null);
  private static readonly UPDATE_SNOOZE_KEY = 'tvlm_update_dismissed_at';
  private static readonly UPDATE_SNOOZE_MS = 24 * 60 * 60 * 1000;

  /**
   * ΡΩΤΑ ΤΟ API, ΟΧΙ ΤΟ MANIFEST (Jim, 5/10/2026). Το `get-sideloaded-app-version` του
   * api.smartago.net, όπως PLUI/UNI/TVS: μία εγγραφή ΑΝΑ ΠΛΑΤΦΟΡΜΑ (`<appId>`, `.win`, `.mac`,
   * `.linux`), που φαίνεται και αλλάζει στο SMRT ADMIN › System › Settings › TV Box Tools και την
   * ενημερώνει το push_downloads.py με το build του αρχείου που μόλις ανέβηκε. Έτσι ένα apk που
   * βγήκε δεν κάνει κανένα exe να λέει «βγήκε νεότερη» — και το «Enable» του admin είναι πύλη.
   * Ο web δεν ρωτά (σερβίρεται από εμάς). Σε σφάλμα δικτύου σωπαίνει.
   */
  async checkAppUpdate() {
    if (this.isWeb) return;
    try {
      const snoozed = Number(localStorage.getItem(Session.UPDATE_SNOOZE_KEY) || 0);
      if (snoozed && Date.now() - snoozed < Session.UPDATE_SNOOZE_MS) return;
    } catch {
      /* χωρίς localStorage (ιδιωτικό παράθυρο): απλώς ρωτάμε */
    }
    const r = await this.fetchLatest();
    if (!r?.enabled || !this.isNewer(r)) return;
    this.log('info', `update available: ${this.appVersion} (build ${this.myBuild}) → ${r.version} (build ${r.build || '—'})`);
    this.updateAvail = { version: r.version, build: r.build };
  }

  /**
   * ΤΟ BUILD ΜΑΣ ΣΤΗΝ ΑΡΙΘΜΗΣΗ ΤΗΣ ΕΓΓΡΑΦΗΣ ΜΑΣ. Στο Android ισχύει ο κανόνας όλων των app μας:
   * sideload = build + 1000 (Jim, 5/10/2026: «το sideload κανονικά είναι v+1000 — έπρεπε 1222»).
   * Το bundle ξέρει μόνο το πλήθος commit (222), οπότε το +1000 μπαίνει εδώ, σε ΚΑΘΕ αντίγραφο
   * Android — και του Play, που συγκρίνεται με την ίδια εγγραφή. Τα desktop μένουν 222 (= τίτλος).
   */
  get myBuild(): number {
    return this.appBuild && this.platform === 'android' ? this.appBuild + 1000 : this.appBuild;
  }

  /** Ο κωδικός της εγγραφής ΜΑΣ στο API — ίδιοι με το push_downloads.py (API_ROWS). */
  private get updateCode(): string {
    const id = this.brand.androidAppId;
    if (this.platform === 'android') return id;
    const p = (globalThis.navigator?.platform || globalThis.navigator?.userAgent || '').toLowerCase();
    if (p.includes('win')) return `${id}.win`;
    if (p.includes('mac')) return `${id}.mac`;
    return `${id}.linux`;
  }

  private async fetchLatest(): Promise<{ version: string; build: number; enabled: boolean } | null> {
    try {
      const res = (await this.hooks.getJson(`https://api.smartago.net/api/multi/get-sideloaded-app-version?code=${encodeURIComponent(this.updateCode)}&t=${Date.now()}`)) as {
        data?: { version?: string; buildNumber?: number; isEnabled?: boolean } | null;
      };
      const d = res?.data;
      if (!d?.version) return null;
      return { version: d.version, build: Number(d.buildNumber ?? 0), enabled: !!d.isEnabled };
    } catch {
      return null;
    }
  }

  /**
   * ΑΡΙΘΜΟΣ BUILD, ΟΧΙ ΟΝΟΜΑ (Jim, 3/10/2026): το όνομα είναι ημερήσιο, δύο builds της ίδιας μέρας
   * το μοιράζονται. Εγγραφή με build 0 (π.χ. macOS, που το dmg δεν διαβάζεται στα Windows) →
   * σύγκριση ονόματος, που δεν δίνει ψεύτικο συναγερμό.
   */
  private isNewer(r: { version: string; build: number }): boolean {
    return r.build && this.myBuild ? r.build > this.myBuild : toolOutdated(this.appVersion, r.version);
  }

  // ---------------------------------------- ο ΧΕΙΡΟΚΙΝΗΤΟΣ έλεγχος, στην οθόνη «Σχετικά»
  /**
   * ΜΟΝΟ Η ANDROID ΟΨΗ ΤΟΝ ΔΕΙΧΝΕΙ (Jim, 3/10/2026, με το About του PLUI ως υπόδειγμα). Στο
   * desktop η ενημέρωση είναι ένα αρχείο που κατεβάζεις από τη σελίδα· σε ένα κουτί που μένει
   * χρόνια στον ίδιο τοίχο, το «ποια έκδοση έχω και υπάρχει νεότερη;» πρέπει να απαντιέται ΜΕΣΑ
   * στην εφαρμογή, γιατί συχνά δεν υπάρχει καν browser για να ρωτήσεις αλλού.
   *
   * Ο αυτόματος έλεγχος (`checkAppUpdate`) σωπαίνει σε σφάλμα και σέβεται την αναβολή 24 ωρών.
   * Αυτός εδώ τον ζήτησε ΑΝΘΡΩΠΟΣ: αγνοεί την αναβολή, ξαναρωτά τον server (καθαρίζει την
   * προσωρινή μνήμη του manifest) και λέει ΚΑΙ το «είσαι ενημερωμένος» ΚΑΙ το «δεν απάντησε».
   */
  updateCheck = $state<'idle' | 'checking' | 'current' | 'newer' | 'failed'>('idle');
  updateLatest = $state<{ version: string; build: number } | null>(null);

  async checkForUpdateNow() {
    if (this.updateCheck === 'checking') return;
    this.updateCheck = 'checking';
    // Το manifest (για το URL του apk) ξαναδιαβάζεται κι αυτό: ένα «Έλεγχος» που κατεβάζει το
    // χθεσινό αρχείο δεν είναι έλεγχος.
    this.manifest = null;
    this.manifestPromise = null;
    const r = await this.fetchLatest();
    if (!r) {
      this.updateCheck = 'failed';
      return;
    }
    this.updateLatest = { version: r.version, build: r.build };
    // Πύλη κλειστή στο admin = «είσαι ενημερωμένος»: δεν προσφέρουμε ό,τι ο admin κράτησε πίσω.
    const newer = r.enabled && this.isNewer(r);
    this.updateCheck = newer ? 'newer' : 'current';
    this.log('info', `update check (${this.updateCode}): ${this.appVersion} (build ${this.myBuild}) vs ${r.version} (build ${r.build || '—'}, enabled ${r.enabled}) → ${newer ? 'newer available' : 'up to date'}`);
    if (newer) this.updateAvail = { version: r.version, build: r.build };
  }


  /**
   * ΤΟ «ΝΑΙ» ΤΟΥ ΔΙΑΛΟΓΟΥ. Στο desktop είναι ένα αρχείο από τη σελίδα λήψης — εκεί υπάρχει
   * browser και τα πέντε είδη αρχείου διαλέγονται από άνθρωπο.
   *
   * ΣΤΟ ANDROID ΟΧΙ (ΕΝΤΟΛΗ JIM, 3/10/2026: «στο android τι λήψη να κάνει; το βάζεις εσύ
   * όπως τα υπόλοιπα apps μας, δες uni»). Μια τηλεόραση συχνά δεν έχει browser καθόλου — και άμα
   * είχε, ένα APK στα Downloads δεν εγκαθίσταται μόνο του. Κατεβάζουμε εμείς, με τη στοίβα
   * του συστήματος, και δίνουμε το αρχείο στον εγκαταστάτη, όπως το UNI.
   */
  updateBusy = $state(false);
  updatePct = $state(0);
  updateErr = $state('');

  async takeUpdate() {
    if (this.hooks.selfUpdate && this.platform === 'android') return void this.selfInstallUpdate();
    this.openDownloadPage();
  }

  private async selfInstallUpdate() {
    if (this.updateBusy) return;
    this.updateErr = '';
    this.updateBusy = true;
    this.updatePct = 0;
    try {
      // Η ΑΔΕΙΑ ΠΡΩΤΑ: χωρίς αυτή ο εγκαταστάτης ανοίγει και κλείνει αμέσως, και ο άνθρωπος
      // βλέπει μια λήψη 18MB να τελειώνει στο πουθενά.
      if (this.hooks.canSelfInstall && !(await this.hooks.canSelfInstall())) {
        this.updateBusy = false;
        this.updateErr = this.t('up_needPerm');
        await this.hooks.openSelfInstallPermission?.();
        return;
      }
      const m = await this.loadManifest();
      const url = m?.tool?.downloads?.android ?? m?.tool?.latest?.android;
      if (!url) throw new Error('no android download in the manifest');
      this.log('cmd', `$ GET ${url}`);
      const started = await this.hooks.selfUpdate!(url, (p) => (this.updatePct = p));
      if (!started) throw new Error('the installer did not open');
      // Αν ο εγκαταστάτης άνοιξε, το επόμενο βήμα είναι δικό του: ο διάλογός μας φεύγει
      // από τη μέση, και αν η εγκατάσταση πετύχει, η διεργασία μας σκοτώνεται και ξεκινά η νέα.
      this.updateAvail = null;
    } catch (e) {
      this.updateErr = this.t('up_failed', { err: e instanceof Error ? e.message : String(e) });
      this.log('err', this.updateErr);
    } finally {
      this.updateBusy = false;
    }
  }

  /**
   * ΤΟ ΑΝΤΙΓΡΑΦΟ ΤΟΥ PLAY ΔΕΝ ΚΑΤΕΒΑΖΕΙ ΤΙΠΟΤΑ (εντολή Jim, 3/10/2026: «στο play απλά
   * ανοίγεις το play και δεν έχεις λήψη ξανά»). Η ενημέρωσή του είναι δουλειά του καταστήματος.
   */
  get onPlayBuild(): boolean {
    return this.platform === 'android' && !!this.selfInfo?.playBuild;
  }
  openOurPlayPage() {
    const pkg = this.selfInfo?.packageName;
    if (pkg) this.openExternal(`https://play.google.com/store/apps/details?id=${pkg}`);
  }

  /** «Λήψη» στο desktop: τον πάμε στη σελίδα λήψης, εκεί διαλέγει το αρχείο του. */
  openDownloadPage() {
    this.updateAvail = null;
    this.openExternal(`https://${this.brand.domain}/#download`);
  }
  snoozeUpdate() {
    this.updateAvail = null;
    try {
      localStorage.setItem(Session.UPDATE_SNOOZE_KEY, String(Date.now()));
    } catch {
      /* δεν πειράζει: θα ξαναρωτήσει την επόμενη φορά */
    }
  }
  /** «Ναι, κάν' τον αρχική οθόνη»: διαλέγει τη νέα γραμμή και γυρνά στη λίστα των launcher. */
  useArrived() {
    const a = this.apkArrived;
    this.apkArrived = null;
    if (!a) return;
    // ΤΟ ΠΑΚΕΤΟ ΔΕΝ ΕΙΝΑΙ ΠΑΝΤΑ ΤΟ id ΤΗΣ ΓΡΑΜΜΗΣ: μια γραμμή που βρέθηκε στο κουτί κλειδώνεται
    // στο πακέτο, αλλά ένας ΓΝΩΣΤΟΣ launcher κρατά το δικό του id («projectivy»). Με σκέτο πακέτο
    // η επιλογή αστοχούσε σιωπηλά και η λίστα άνοιγε χωρίς τίποτα διαλεγμένο.
    this.chooseLauncher(a.pick || a.pkg);
    this.goStep(this.appHome);
  }
  dismissArrived() {
    this.apkArrived = null;
  }
  private runConsoleHidden = $state(false);
  get showRunConsole(): boolean {
    return this.runConsole && !this.runConsoleHidden;
  }
  hideRunConsole() {
    this.runConsoleHidden = true;
  }
  private openRunConsole() {
    this.runConsoleHidden = false;
    this.runConsole = true;
  }
  human = $state<HumanPrompt | null>(null);
  guided = $state(false);
  autoDone = $state(false);
  autoTask = $state<TaskId | null>(null);
  autoDoneTasks = $state<TaskId[]>([]);
  autoFailedTasks = $state<TaskId[]>([]);
  autoStepLabel = $state<string | null>(null);
  copied = $state(false);
  entries = $state<ReportEntry[]>([]);
  consoleFrom = $state(0);

  constructor(o: SessionOptions) {
    this.brand = o.brand;
    this.appVersion = o.version ?? TOOL_VERSION;
    this.appBuild = Number(o.build ?? 0);
    this.transport = o.transport;
    this.platform = o.platform;
    this.tv = o.tv ?? false;
    this.assetBase = o.assetBase ?? 'brand/';
    this.langLocked = !!o.langLocked;
    this.phone = !!o.phone;
    this.manifestOverride = o.manifestOverride ?? '';
    // The remembered language wins over the host's guess (the browser's, the site's): it is an
    // answer, and the guess is a guess. `o.lang` still decides when nothing was ever answered.
    const remembered = prefGet('tvlm.lang');
    this.i18n = new I18n(o.brand, remembered && hasLang(remembered) ? remembered : o.lang);
    this.hooks = { fetchApk: o.fetchApk ?? defaultFetchApk, sha256: o.sha256 ?? defaultSha256, getJson: o.getJson ?? defaultGetJson, manifest: o.manifest, selfUpdate: o.selfUpdate, canSelfInstall: o.canSelfInstall, openSelfInstallPermission: o.openSelfInstallPermission, openExternal: o.openExternal, mirror: o.mirror, connectBridge: o.connectBridge, selfInfo: o.selfInfo, openSettingsScreen: o.openSettingsScreen, appIcons: o.appIcons, readClipboard: o.readClipboard, reportError: o.reportError };
    this.report = new UiReport({ brand: o.brand.id, tool: o.brand.name, version: o.version ?? TOOL_VERSION, startedAt: Date.now() }, (e) => this.onReportAdd(e));
    if (o.startIn === 'workspace') this.mode = 'workspace';
    // The language screen is the first one; with the site's answer already in hand the wizard opens
    // on the next one instead of showing a question nobody needs to answer twice. SEEK, do not
    // count: step 1 is "which box are we setting up", which exists only inside the APK on a
    // television — landing on it blind put it in front of every web visitor (Jim, 23/9).
    // On the television the likely job is the set in front of the installer, so it starts picked.
    if (this.canTargetSelf) this.target = 'self';
    // A language this computer already answered skips the screen entirely (Jim, 25/9): asking it
    // again on every run is the wizard forgetting. The header's flag still changes it any time,
    // and that press is an answer too — so the question never has to come back.
    this.step = this.firstStep;
    // The phone's question, asked the way ZUKKA asks it: no screen of its own, a dialog over the
    // first real step. It waits here for the IP answer (geoLang) — see langProbe.
    if (this.phone && !this.langKnown) this.langProbe = true;
    // Every face with a language screen opens it with the answer already on it: the language is
    // set (from this box, until the region says otherwise) and the card says so — with the way
    // out in English under it. Without this, a box with no network showed no card at all.
    else if (!this.langKnown && !this.langAnswered) {
      this.langAuto = this.i18n.lang;
      this.langAutoSrc = 'device';
    }
  }

  /** Call once mounted: the W4 animation ticker + the workspace bootstrap when starting there. */
  /**
   * WHAT THIS COMPUTER ALREADY ANSWERED (Jim, 25/9). The tool is used on box after box: the person
   * who set the language, said they are a reseller and typed their id should never be asked again.
   * Read straight into the fields, each value checked — a hand-edited config.json must not be able
   * to put the wizard in a state it has no screen for.
   */
  private restore() {
    const box = readStored('tvlm.box');
    if (BOXES.some((b) => b.id === box)) this.box = box as BoxId;
    const debug = readStored('tvlm.debug');
    if (debug === 'usb' || debug === 'tcp' || debug === 'wireless') this.debug = debug;
    const role = readStored('tvlm.role');
    if (role === 'owner' || role === 'reseller') this.role = role;
    const use = readStored('tvlm.hotelUse');
    if (use === 'bnb' || use === 'hotel' || use === 'reseller') this.hotelUse = use;
    const where = readStored('tvlm.hotelWhere');
    if (where === 'room' || where === 'lobby') this.hotelWhere = where;
    const type = readStored('tvlm.installType');
    if (INSTALL_TYPES.includes(type as InstallType)) this.installType = type as InstallType;
    // The Install screen's switches travel together: one line, and a broken line is simply ignored.
    try {
      const sw = JSON.parse(readStored('tvlm.hotelSw') || '{}') as Partial<HotelSwitches>;
      const keys = Object.keys(this.hotelSw) as Array<keyof HotelSwitches>;
      const next = { ...this.hotelSw };
      for (const k of keys) if (typeof sw[k] === 'boolean') next[k] = sw[k];
      this.hotelSw = next;
    } catch {
      // not JSON any more: the defaults stand
    }
  }

  /**
   * Called on every screen change: whatever the person has chosen so far is what this computer
   * knows next time. Writing the same value again costs nothing (the host merges), so there is no
   * bookkeeping about what changed.
   */
  private remember() {
    // The language question is a FIRST-RUN question (Jim, 28/9: «το ρωτάς μόνο την πρώτη φορά που
    // τρέχει το app, μετά τέλος» — only the language, not the wizard). Leaving its screen is the
    // answer, whether it was picked from the list or simply accepted, so it is written down here.
    if (this.step === W.lang) this.rememberLang(this.i18n.lang);
    if (this.box) writeStored('tvlm.box', this.box);
    if (this.debug) writeStored('tvlm.debug', this.debug);
    writeStored('tvlm.role', this.role);
    writeStored('tvlm.hotelUse', this.hotelUse);
    writeStored('tvlm.hotelWhere', this.hotelWhere);
    writeStored('tvlm.installType', this.installType);
    writeStored('tvlm.hotelSw', JSON.stringify(this.hotelSw));
  }

  start() {
    this.restore();
    // FAILSAFE, ZUKKA's number: a stalled network must never hold the question. Three seconds and
    // the device's own language answers instead.
    if (this.langProbe) setTimeout(() => this.geoLang(null), 3000);
    // Coming back from Play — or from anywhere the user was sent on the TV — the box has changed
    // under us. Read it again by itself: nobody should have to press a button to be told what the
    // tool could have noticed on its own.
    this.onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (this.mode === 'wizard' && this.step === W.launcher && this.launcherSent && !this.launcherBusy) void this.recheckLaunchers();
    };
    document.addEventListener('visibilitychange', this.onVisible);
    // Once, everywhere: the picker needs to know which build of the tool this is, and on a TV the
    // first screens want the device's own name. Off Android the hook answers null and nothing asks again.
    void this.readSelf();
    this.tick = setInterval(() => {
      if (this.mode === 'wizard' && this.step === W.dev) this.anim = (this.anim + 1) % 12;
    }, 900);
    if (this.mode === 'workspace') this.landing();
  }

  destroy() {
    if (this.onVisible) document.removeEventListener('visibilitychange', this.onVisible);
    if (this.tick) clearInterval(this.tick);
    if (this.selfTimer) clearInterval(this.selfTimer);
    this.timers.forEach(clearTimeout);
    this.connectAbort?.abort();
    void this.device?.close();
  }

  // ------------------------------------------------------------------ small helpers
  t(key: StrKey, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
  get lang(): string {
    return this.i18n.lang;
  }
  /**
   * The host has worked out which language this visitor probably reads (their browser first, the
   * ecosystem's geo endpoint second). We show it as a question, we never switch on our own: a page
   * that changes language by itself is a page that lost the reader.
   */
  offerLang(tag: string) {
    if (!tag || tag === this.i18n.lang || !hasLang(tag)) return;
    if (this.langAnswered) return;
    this.langSuggestion = tag;
  }
  /** Yes — and remembered, so the question is asked once per browser. */
  takeLangSuggestion() {
    const tag = this.langSuggestion;
    this.langSuggestion = null;
    if (!tag) return;
    this.i18n.set(tag);
    this.rememberLang(tag);
  }
  /**
   * PHONE: the first-run language question, as a dialog over the first step. `true` only when this
   * phone has never answered and the language we settled on is not English.
   */
  langAsk = $state(false);
  /** Waiting for the IP answer before asking. The dialog holds while this is true. */
  langProbe = $state(false);
  /** What we settled on: the country's language if the endpoint answered, else the device's. */
  langDetected = $state('');
  /**
   * The ecosystem's geo endpoint answered — or failed, or was never configured (`null`).
   *
   * IP FIRST, device second: the order ZUKKA and PLUI already use, and for the same reason. A Greek
   * user with the phone set to US English is the common case, and the device would answer "English"
   * with confidence. Where the box actually is beats how the phone is configured.
   *
   * On a phone this is the moment the first-run question is decided: English needs no question at
   * all (the answer is already on screen), anything else opens the dialog with that language
   * pre-selected. Everywhere else the answer is a suggestion bar, exactly as before.
   */
  /** The language we set from the region, on the faces that have a language screen (never a phone). */
  langAuto = $state<string | null>(null);
  /** Where that language came from: the region (the IP answered) or this box's own setting. */
  langAutoSrc = $state<'geo' | 'device'>('device');
  geoLang(tag: string | null) {
    if (!this.phone || this.langKnown) {
      // TELEVISION, WINDOWS, macOS, LINUX: the screen SAYS what happened instead of asking a second
      // question (Jim, 28/9, pointing at DWTV): the region's language is set, the notice explains
      // why, and "Switch to English" is one press away. A phone has no such screen — it gets the
      // dialog instead (LangAsk).
      if (!tag || this.langKnown || !hasLang(tag)) return;
      if (this.step === W.lang && !this.langAnswered) {
        if (tag !== this.i18n.lang) this.i18n.set(tag);
        this.langAuto = tag;
        this.langAutoSrc = 'geo';
        return;
      }
      // past that screen already: never switch the language under someone's hands, just offer
      this.offerLang(tag);
      return;
    }
    if (!this.langProbe) return; // answered already, or too late — the failsafe decided
    this.langProbe = false;
    const detected = tag && hasLang(tag) ? tag : this.i18n.lang;
    this.langDetected = detected;
    if (detected === 'en') this.rememberLang('en');
    else this.langAsk = true;
  }
  /** The answer: this language from now on, remembered, and the dialog never returns. */
  confirmLangAsk(tag: string) {
    this.langAsk = false;
    this.pickLang(hasLang(tag) ? tag : 'en');
  }
  /** No — the language on screen stays, and we stop asking. */
  keepLang() {
    this.langSuggestion = null;
    this.rememberLang(this.i18n.lang);
  }
  private get langAnswered(): boolean {
    return !!readStored('tvlm.lang');
  }
  /**
   * This computer has a language of its own — so the first screen has nothing to ask, and the
   * stepper is one shorter (its numbers are built from what is NOT skipped, so they follow).
   * Read once, at construction: a language changed mid-run must not make screens appear or vanish
   * under the person's hands.
   */
  private readonly langKnown: boolean = (() => {
    const tag = prefGet('tvlm.lang');
    return !!tag && hasLang(tag);
  })();
  private rememberLang(tag: string) {
    // Answered once, on this computer, and never asked again — the first line of the config file
    // Jim asked for (25/9). On the desktop it lands in config.json, in a browser in localStorage.
    writeStored('tvlm.lang', tag);
  }
  toggleLang() {
    const next = this.i18n.lang === 'en' ? 'el' : 'en';
    this.i18n.set(next);
    // A language picked by hand is an answer too: remember it, and stop offering another one.
    this.rememberLang(next);
    this.langSuggestion = null;
  }
  after(ms: number, fn: () => void) {
    const id = setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== id);
      fn();
    }, ms);
    this.timers.push(id);
  }
  /** UI-originated console lines. Lines starting with `$` are shown verbatim; the engine's `cmd` entries get `$ adb shell`. */
  log(kind: ReportEntry['kind'], text: string) {
    this.report.add(kind, text);
  }
  private onReportAdd(e: ReportEntry) {
    this.entries = [...this.entries, e];
    if (this.checking && e.kind === 'cmd') this.updateCheckPartial();
  }
  /** TV only: the console dock is one line until the operator opens it (see Console.svelte). */
  consoleOpen = $state(false);
  toggleConsole() {
    this.consoleOpen = !this.consoleOpen;
  }
  /** Does this face have a clipboard to read? (Android and the desktop do; a browser tab may not.) */
  get canPaste(): boolean {
    return !!this.hooks.readClipboard;
  }
  /** What is on the clipboard, trimmed — empty string when there is nothing or the read is refused. */
  async paste(): Promise<string> {
    try {
      return (await this.hooks.readClipboard?.()) ?? '';
    } catch {
      return '';
    }
  }
  clearConsole() {
    this.consoleFrom = this.entries.length;
  }
  get consoleLines(): ReportEntry[] {
    return this.entries.slice(this.consoleFrom);
  }
  copy(text: string) {
    try {
      void navigator.clipboard?.writeText(text);
    } catch {
      /* clipboard may be unavailable (http, iframe) */
    }
    this.copied = true;
    this.after(1500, () => (this.copied = false));
  }

  // ------------------------------------------------------------------ derived (brand-driven)
  get isWeb(): boolean {
    return this.platform === 'web';
  }
  get platformChip(): string {
    return { desktop: 'Desktop · Win / Mac / Linux', web: 'Web · Chrome', android: 'Android' }[this.platform];
  }
  /** platform: web, Wi‑Fi path, no bridge yet → the "Wi‑Fi needs a bridge" block (DESIGN_NOTES §12). */
  get webBridge(): boolean {
    return this.isWeb && this.debug !== 'usb' && !this.bridged;
  }
  get showManual(): boolean {
    return !(this.isWeb && !this.bridged);
  }
  get scanLabel(): string {
    // It used to print "192.168.1.0/24" always — a number the UI does not know and, on the first
    // network where it was wrong, a confident lie (Jim, 23/9: the box was on 192.168.10.x behind a
    // second router). The scan says WHAT it does; the addresses belong to the rows it finds.
    return this.isWeb && this.debug === 'usb' ? 'WebUSB · Chrome' : 'mDNS · this network :5555 · USB';
  }
  get hasAcc(): boolean {
    return !!this.check && this.check.accounts.length > 0 && !this.accRemoved;
  }
  get accountName(): string {
    return this.check?.accounts[0] ?? '';
  }
  get fireBlocked(): boolean {
    return this.box === 'firetv' && this.brand.fireTv === 'blocked';
  }
  get fireSupported(): boolean {
    return this.box === 'firetv' && this.brand.fireTv === 'supported';
  }
  /**
   * The launcher picker (docs/LAUNCHER_PICKER_PLAN.md): every app on this box that can open on
   * HOME, ours first, the names we know after it, and "let the box ask" last.
   */
  get launcherList(): LauncherRow[] {
    return launcherRows(this.brand, this.check);
  }
  get launcherRow(): LauncherRow | null {
    // On the kiosk road the subject is the kiosk pick: the run's context, `oursIsTarget`, the
    // "your turn on the TV" wording all read this one getter, so they follow the road.
    if (this.hubTask === 'kiosk') return this.kioskRow;
    return this.launcherList.find((r) => r.id === this.launcherPick) ?? null;
  }
  /**
   * "Which launcher opens on HOME" is not a detail of installing ours — it IS the tool (D2). It was
   * skipped when our launcher was already on the box, so a set that came with Projectivy was never
   * asked at all. Now the only condition is having read the box, because the list is the box's.
   */
  get canPickLauncher(): boolean {
    return !!this.check;
  }
  /**
   * What the box opens today, shown ABOVE the list and with less weight (Jim, 22/9): it is almost
   * always the thing the person came here to replace, so it belongs on the screen as a fact — "yes,
   * this is what you have" — and not as one of the offers.
   */
  get currentLauncherRow(): LauncherRow | null {
    return this.launcherList.find((r) => r.current) ?? null;
  }
  /** The offers: ours first, then the popular ones, anything else the box can open, and "other". */
  get pickerRows(): LauncherRow[] {
    return this.launcherList.filter((r) => !r.current);
  }
  /**
   * THE subject of this tool (docs/GENERIC_TOOL_PLAN.md D1): the launcher every screen is talking
   * about. What the user picked; failing that, whatever answers HOME on this box today; and only
   * when neither is known, the launcher this brand ships. Before 22/9 every sentence named OURS,
   * which made a tool for launchers read like an installer for one launcher.
   */
  get targetRow(): LauncherRow | null {
    return this.launcherRow ?? this.launcherList.find((r) => r.current) ?? null;
  }
  /** The name to put in a sentence — never a package, never "the launcher". */
  get targetName(): string {
    const r = this.targetRow;
    if (!r) return this.brand.launcherName;
    return r.kind === 'ask' ? this.t('wl_other') : r.name;
  }
  /** The package the box will be asked about (Check, Test, a grant offered by name). */
  get targetPkg(): string {
    const r = this.targetRow;
    return r && r.kind !== 'ask' ? r.package : this.brand.launcherPackage;
  }
  /** What answers HOME right now, in words a person reads — the Check screen's first fact. */
  get currentHomeName(): string {
    // The hotel launcher is not in the launcher list of the home road (a sibling target), but it can
    // still be what answers HOME — the kiosk list knows it by name.
    const r = this.launcherList.find((x) => x.current) ?? this.kioskList.find((x) => x.current);
    if (r) return r.name;
    const p = (this.curHome ?? this.stockLauncher ?? '').split('/')[0];
    return p || '—';
  }
  /** The picked home is somebody else's app — the tasks that address ours have no subject. */
  get foreignHome(): boolean {
    const r = this.launcherRow;
    return !!r && !r.ours;
  }
  /**
   * A build distributed BY Play never offers an APK from the internet (Play DDA §4.5). Everywhere
   * else — the sideload APK, desktop, the web page — the direct download is the normal path.
   */
  get canDirectInstall(): boolean {
    return this.platform !== 'android' || (!!this.selfInfo && !this.selfInfo.playBuild);
  }
  /**
   * May we OFFER the "I have the APK" road? It is an `<input type=file>`, so it needs two
   * things: an edition allowed to install at all, and a host that can actually open a file
   * picker. A desktop and a phone always can; a television usually cannot, and the press used
   * to do nothing but raise Android's own toast.
   */
  get canPickApk(): boolean {
    if (!this.canDirectInstall) return false;
    if (this.platform !== 'android') return true;
    return this.selfInfo?.canPickFile !== false;
  }
  /** Stepper items: the pills of the steps this run actually has (see `skipped`). */
  get stepItems(): Array<{ index: number; key: StrKey; n: number; done: boolean; active: boolean }> {
    return WIZARD_STEPS.map((key, index) => ({ key, index }))
      .filter(({ index }) => !this.skipped(index))
      .map(({ key, index }, n) => ({ index, key, n: n + 1, done: index < this.step, active: index === this.step }));
  }
  /**
   * What this brand is allowed to do to a box (`brand.never`). A screen that offers something the
   * brand never does is worse than a missing screen: it invites a press that can only fail.
   */
  get canKiosk(): boolean {
    return brandAllows(this.brand, 'kiosk');
  }
  get canDeviceOwner(): boolean {
    return brandAllows(this.brand, 'device-owner');
  }
  /** The "which box" question exists only inside the app running on the television itself. */
  get canTargetSelf(): boolean {
    return this.platform === 'android' && this.tv;
  }
  /**
   * The device the tool is RUNNING on is a box worth offering only when that device is a television.
   * On a phone it is never the answer — the phone is the remote control, the box is across the room —
   * and offering it had a cost: the scan found the phone's own adb daemon, connected to it, and
   * Android put up "Allow USB debugging?" on the very screen the person was setting up a TV from
   * (Jim, 27/9/2026). A television that scans itself is the documented `selfTarget` road and stays.
   */
  private boxes(list: DeviceInfo[]): DeviceInfo[] {
    return this.canTargetSelf ? list : list.filter((d) => !d.self);
  }
  /** This run is about the TV the tool is running on. */
  get selfTarget(): boolean {
    return this.canTargetSelf && this.target === 'self';
  }
  get selfName(): string {
    const i = this.selfInfo;
    return i ? `${i.manufacturer} ${i.model}`.trim() : '';
  }
  /**
   * What kind of box this TV is, from the launcher that answers HOME on it — the same signal
   * `detectPlatform` uses after connecting, available here before anything is connected at all.
   * Null when the answer is not one we know (or is our own launcher, on a box set up already):
   * then the brand question comes back, because a guess would be worse than asking.
   */
  get selfBox(): BoxId | null {
    const i = this.selfInfo;
    if (!i) return null;
    const maker = i.manufacturer.toLowerCase();
    if (maker === 'amazon' || i.home.startsWith('com.amazon.tv')) return 'firetv';
    if (i.home === 'com.google.android.apps.tv.launcherx') return 'googletv';
    if (i.home === 'com.google.android.tvlauncher') return maker === 'xiaomi' ? 'xiaomi' : 'androidtv';
    return null;
  }
  /** "Google AOSP TV on x86 · Android 14 · Android TV" — everything the set already told us. */
  get selfSummary(): string {
    const i = this.selfInfo;
    if (!i) return this.t('wt_thisTv');
    const bits = [this.selfName || this.t('wt_thisTv')];
    if (i.release) bits.push(`Android ${i.release}`);
    const b = this.selfBox;
    if (b) bits.push(this.t(`b_${b}` as StrKey));
    return bits.join(' · ');
  }
  get selfDev(): boolean {
    return !!this.selfInfo?.developer;
  }
  get selfDebugOn(): boolean {
    return !!this.selfInfo && (this.selfInfo.adb || this.selfInfo.wirelessAdb);
  }
  /** Wireless debugging when this TV has it on (Android 11+), otherwise plain ADB on port 5555. */
  get selfPath(): DebugPath {
    return this.selfInfo?.wirelessAdb ? 'wireless' : 'tcp';
  }
/**
   * The developer step holds the wizard until THIS TV can actually be reached: debugging on.
   *
   * Deliberately NOT "and Developer options on". That flag says a menu was unlocked, and it can be
   * unset on a set where debugging works — the AOSP TV image is exactly that case. What the next
   * steps need is the daemon, so the daemon is what the door waits for. When `selfInfo` is null the
   * host cannot read either switch, and then nobody is held anywhere.
   */
  get selfBlocked(): boolean {
    return this.selfTarget && !!this.selfInfo && !this.selfDebugOn;
  }
  get langs() {
    return LANGS.map((l) => ({ ...l, sel: l.tag === this.i18n.lang }));
  }
  get selectedDevice(): DeviceInfo | null {
    return this.devSel == null ? null : (this.devices[this.devSel] ?? null);
  }
  get devName(): string {
    return this.device?.info.name ?? this.selectedDevice?.name ?? (this.check ? `${this.check.manufacturer} ${this.check.model}`.trim() : '—');
  }
  /** The connected (or picked) box IS the device the tool runs on — the header says so too. */
  get devIsSelf(): boolean {
    return this.device?.info.self ?? this.selectedDevice?.self ?? false;
  }
  get devAddr(): string {
    return this.device?.info.addr ?? this.selectedDevice?.addr ?? (this.ip ? `${this.ip}:5555` : '—');
  }
  /**
   * ΠΟΙΟΝ ΚΑΛΟΥΜΕ ΤΩΡΑ — όχι ποιον κρατάμε ακόμη από πριν. Το `devAddr` ρωτά ΠΡΩΤΑ τη συνδεδεμένη
   * συσκευή, που είναι σωστό παντού αλλού αλλά ψέμα στην οθόνη Αποδοχή: όποιος είχε συνδεθεί σε ένα
   * κουτί και μετά γύριζε πίσω να γράψει άλλη IP, έβλεπε «Καμία απάντηση από USB · emulator-5554»
   * ενώ η εντολή είχε φύγει για το 192.168.1.151, ΚΑΙ έπαιρνε συμβουλές για καλώδιο σε δικτυακή
   * διεύθυνση (Jim, 2/10 — με φωτογραφία της οθόνης).
   */
  get dialTarget(): DeviceInfo | null {
    return this.selectedDevice ?? this.device?.info ?? null;
  }
  get dialAddr(): string {
    return this.dialTarget?.addr ?? (this.ip ? `${this.ip}:5555` : '—');
  }
  get serial(): string {
    return this.device?.serial ?? this.check?.serial ?? '—';
  }
  get androidVer(): string {
    const c = this.check ?? this.checkPartial;
    return c && c.androidVersion ? `${c.androidVersion} (API ${c.sdk})` : '—';
  }
  /**
   * ΟΤΑΝ ΤΟ ΚΟΥΤΙ ΕΧΕΙ ΜΙΛΗΣΕΙ, ΤΟ ΠΙΣΤΕΥΟΥΜΕ (Jim, 3/10/2026).
   *
   * Εδώ υπήρχε σκληρό `?? 'com.google.android.tvlauncher'`: όταν ο έλεγχος απαντούσε σωστά «δεν
   * υπάρχει εργοστασιακός» (`null`), η οθόνη ΕΦΕΥΡΙΣΚΕ έναν — και το `boxPlatform()` στέλνει στο
   * `androidtv` ό,τι δεν είναι googletv/firetv, οπότε η μαντεψιά έβγαινε πάντα η ίδια. Το βήμα
   * έτρεχε `pm disable-user --user 0 com.google.android.tvlauncher` σε κουτί που δεν τον έχει καν,
   * και απαντούσε «Unknown package». Μαντεψιά ντυμένη ως γεγονός.
   *
   * Η μαντεψιά επιτρέπεται ΜΟΝΟ πριν διαβαστεί το κουτί (οθόνες που δείχνουν τι θα γίνει). Μόλις
   * υπάρχει `check`, κενό σημαίνει κενό — και τα βήματα που θέλουν εργοστασιακό αυτοακυρώνονται.
   */
  get stockLauncher(): string {
    if (this.check) return this.check.stockLauncher ?? '';
    return STOCK_LAUNCHERS[boxPlatform(this.box)] ?? '';
  }
  /**
   * Where the download list comes from. The brand's address, unless the host was started with an
   * override — a build that is not published yet has to be testable end to end, and editing the
   * brand file for an afternoon means shipping it by accident (Jim, 23/9).
   */
  get manifestUrl(): string {
    return this.manifestOverride || this.brand.manifestUrl;
  }
  get launcherPkg(): string {
    return this.brand.launcherPackage;
  }
  get appInstalled(): boolean {
    return this.inst[this.launcherPkg] === 'ok' || !!this.check?.launcherInstalled;
  }
  get checkDone(): boolean {
    return !!this.check && this.checkN >= CHECK_ROWS;
  }
  /** W8 rows in the prototype's order; `ok` true = green check, false = warning, null = neutral. */
  get checkRows(): Array<{ k: string; v: string; ok: boolean | null }> {
    const c = this.check ?? this.checkPartial;
    if (!c) return [];
    const gb = (n: number | null) => (n == null ? '—' : `${(n / 1024 ** 3).toFixed(1)} GB`);
    const accN = c.accounts.length;
    const accText = this.brand.accountCheck ? (accN ? this.t('v_one') : this.t('v_none')) : accN ? this.t('v_accN', { n: accN }) : this.t('v_acc0');
    const rows: Array<{ k: string; v: string; ok: boolean | null }> = [
      { k: this.t('c_model'), v: `${c.manufacturer} ${c.model}`.trim() || this.devName, ok: true },
      { k: this.t('c_android'), v: c.androidVersion ? `${c.androidVersion} (API ${c.sdk})` : '—', ok: true },
      { k: this.t('c_acc'), v: accText, ok: this.brand.accountCheck ? accN === 0 : null },
      { k: this.t('c_space'), v: `${gb(c.freeBytes)} / ${gb(c.totalBytes)}`, ok: true },
      // What opens on HOME today — the fact this whole tool is about. It used to read "is OUR app
      // installed", which on a box being set up with somebody else's launcher answered nothing.
      { k: this.t('c_home'), v: this.currentHomeName, ok: true },
      { k: this.t('c_dev'), v: c.developerOptions ? this.t('v_on') : this.t('v_off'), ok: c.developerOptions },
      // Asked for on the first real run (Jim, 23/9): the picker sends every other launcher to Play,
      // so whether this box HAS Play is a fact about what the next screen can do — not trivia.
      { k: this.t('c_play'), v: c.hasPlay ? this.t('v_play') : this.t('v_noPlay'), ok: c.hasPlay },
    ];
    return rows.slice(0, this.checkN);
  }
  get autoBlocked(): boolean {
    return this.step === W.mode && this.setupMode === 'auto' && this.hasAcc && this.brand.accountCheck && !this.setupOpen;
  }
  get wsBlocked(): boolean {
    return this.mode === 'workspace' && this.hasAcc && this.brand.accountCheck && !this.setupOpen && this.profile !== 'open';
  }
  get accCleared(): boolean {
    return this.step === W.mode && this.accRemoved;
  }
  get kioskAuto(): boolean {
    return this.runBrand.flow === 'kiosk' && !this.hasAcc && !this.setupOpen;
  }
  /** The profile the automatic run will use: the brand's first, `open` when an account blocks kiosk. */
  get effectiveProfile(): Profile {
    if (this.setupOpen) return 'open';
    if (this.profile) return this.profile;
    const first = this.brand.profiles[0] ?? 'open';
    return first === 'kiosk' && this.hasAcc && this.brand.accountCheck ? 'open' : first;
  }
  /** The "What will run" list (W9) = the Automatic page rows, per brand flow. */
  get autoList(): Array<{ n: number; label: string; task: TaskId; blocked: boolean; running: boolean; done: boolean; failed: boolean }> {
    const rows: Array<{ label: string; task: TaskId }> = [];
    // The rows follow the RUN's brand: on the Kiosk road of any edition the hotel launcher's run
    // has the profile step (device owner) and the hotel brand's home method.
    if (this.runBrand.flow === 'kiosk') rows.push({ label: this.kioskAuto ? this.t('a1') : this.t('a1o'), task: 'profile' });
    rows.push({ label: this.t('a2'), task: 'install' });
    // One label, one subject: whoever was picked. The method still shows, because "the stock
    // launcher goes off" is a thing the owner of the box deserves to read before it happens.
    rows.push({
      label:
        this.launcherRow?.kind === 'ask'
          ? this.t('a4a')
          : this.runBrand.homeMethods[0] === 'disable-stock'
            ? this.t('a4d', { app: this.targetName })
            : this.t('a4o', { app: this.targetName }),
      task: 'launcher',
    });
    rows.push({ label: this.t('a3'), task: 'configure' });
    rows.push({ label: this.t(this.selfTarget ? 'a5s' : 'a5'), task: 'test' });
    return rows
      .filter((r) => this.autoTasks.includes(r.task))
      .map((r, i) => ({
      n: i + 1,
      ...r,
        blocked: r.task === 'profile' && (this.autoBlocked || this.wsBlocked),
        running: this.guided && this.autoTask === r.task,
        done: this.autoDoneTasks.includes(r.task),
        failed: this.autoFailedTasks.includes(r.task),
      }));
  }
  get autoStage(): number {
    const i = this.autoList.findIndex((r) => r.running);
    return i < 0 ? (this.autoDone ? this.autoList.length : 1) : i + 1;
  }
  get primaryDisabled(): boolean {
    const s = this.step;
    return (
      // Fire TV on a brand that refuses it: the wall used to stand on the brand question, which no
      // longer exists. It stands here instead, on the first screen that knows what the box IS.
      (s === W.check && this.fireBlocked) ||
      (s === W.dev && this.selfBlocked) ||
      // (the debugging screen blocks nothing: the scan tries every path this platform has, so the
      // answer there only narrows what we SHOW — Jim, 23/9)
      (s === W.find && (this.scan !== 'found' || this.devSel == null)) ||
      (s === W.check && !this.checkDone) ||
      (s === W.install && (this.launcherBusy || !!this.installCta.blocked)) ||
      this.autoBlocked
    );
  }
  get primaryLabel(): string {
    const s = this.step;
    if (s === W.dev) return this.selfTarget ? this.t('cont') : this.t('w4_done');
    if (s === W.find) return this.t('connect');
    if (s === W.mode) return this.setupMode === 'auto' ? this.t('w9_start') : this.t('w8_open');
    if (s === W.tasks) return this.hubPrimaryLabel;
    if (s === W.install) return this.launcherBusy ? (this.launcherStage ?? this.t('wl_working')) : this.installCta.label;
    return this.t('cont');
  }
  get showBack(): boolean {
    // Not "past the language screen" — past THE FIRST SCREEN THIS RUN HAS. On a phone there is no
    // language screen, so a Back on the very first step pointed at nothing (Jim, 28/9).
    return this.step > this.firstStep;
  }
  get showSkip(): boolean {
    // "This TV" waits on the device itself, so there is nothing to skip past — the set answers.
    if (this.step === W.dev) return !this.selfTarget;
    return this.step === W.allow;
  }
  get showPrimary(): boolean {
    // The launcher step carries its own gold action (install + set as HOME in one press), so a
    // second "Continue" in the footer would be a button that does less than the one above it.
    return this.step > W.lang && this.step !== W.allow && this.step !== W.launcher && this.step !== W.kiosk && this.step !== W.kioskApp && this.step !== W.use;
  }
  get showRoleChip(): boolean {
    return this.step > W.role && this.brand.roleStep;
  }
  get showBoxChip(): boolean {
    // Only what was detected — by the set's own launcher, or by the check. Nobody answers this
    // question by hand any more, so a chip before either of those would be a guess with a face.
    return !!this.box && (this.boxAuto || !!this.check);
  }
  get boxTitle(): string {
    return this.box ? this.t(`b_${this.box}` as StrKey) : '';
  }
  /**
   * The brand whose launcher THIS run addresses. On the Kiosk road with the hotel launcher picked,
   * that is the hotel brand — in every edition: its package, its device admin receiver, its
   * services are what `{pkg}` `{dpc}` `{acs}` `{notif}` render to, and its `never` (none) is what
   * the steps consult. The edition's own brand still decides everything about the tool itself.
   */
  get runBrand(): BrandConfig {
    return this.hubTask === 'kiosk' && this.kioskRow?.family ? hotelTarget() : this.brand;
  }
  /** The Kiosk road locks the box here whenever the app in control is ours — or the edition itself may. */
  get lockHere(): boolean {
    return this.hubTask === 'kiosk' && (!!this.kioskRow?.family || this.canKiosk);
  }
  get ctx(): StepContext {
    const picked = this.launcherRow;
    return {
      brand: this.runBrand,
      profile: this.effectiveProfile,
      lang: this.i18n.lang,
      stockLauncher: this.stockLauncher,
      ...(this.check ? { sdk: this.check.sdk } : {}),
      linkCode: this.onHotelRoad
        ? this.hotelUse !== 'reseller' && this.hotelCode.trim() ? this.hotelCode.trim() : undefined
        : this.brand.roleStep && this.role === 'owner' && this.room ? this.room : undefined,
      // the Install screen's answers — only on the Hotel TV road
      ...(this.onHotelRoad ? { provisionExtras: this.hotelExtras, grantSecureSettings: this.hotelSw.secure, keepBackground: this.hotelSw.bg, hideStock: this.hotelSw.hideStock } : {}),
      debugOff: this.adbOffEffective,
      // The picker decides what HOME opens. Absent = ours, which is what every other face assumes.
      ...(picked && picked.kind !== 'ask' && !this.oursIsTarget && picked.component ? { homeTarget: picked.component } : {}),
      ...(picked?.kind === 'ask' ? { homeAsk: true } : {}),
      // Rebooting the box would reboot the tool: the run ends with the person, not with `reboot`.
      ...(this.selfTarget ? { selfBox: true } : {}),
    };
  }
  /**
   * The automatic run's tasks. A launcher that is not ours turns the run into the one thing that
   * still applies: set HOME and test it. Installing our apps, granting our permissions and sending
   * our broadcasts would all be addressed to an app nobody chose.
   */
  /**
   * Is OUR launcher the subject of this run? Install, profile and configure all address it by name —
   * its APK, its PROVISION broadcast, its permissions. When the answer to "which launcher" was
   * somebody else's app, the TV's own chooser, or "keep what I have", those three tasks have no
   * subject and must not run. Before 22/9 only the *foreign* case was covered, so "keep the current
   * launcher" still installed ours and granted it permissions — a tool doing the one thing the user
   * had just declined (GENERIC_TOOL_PLAN D4).
   */
  get oursIsTarget(): boolean {
    if (this.keepHome) return false;
    const r = this.launcherRow;
    // On the Kiosk road "ours" is the hotel launcher in every edition (`runBrand`).
    return r ? (!!r.ours || (this.hubTask === 'kiosk' && !!r.family)) && r.kind !== 'ask' : true;
  }
  get autoTasks(): TaskId[] {
    return autoRunOrder(this.brand).filter((t) => {
      // "Keep the current launcher" is an answer, not a postponement: nothing touches HOME after it.
      if (t === 'launcher') return !this.keepHome;
      // …and the Play edition never downloads an APK at all (`canDirectInstall`).
      if (t === 'install') return this.oursIsTarget && this.canDirectInstall && this.runBrand === this.brand && !this.onHotelRoad;
      if (t === 'profile' || t === 'configure') return this.oursIsTarget;
      return true;
    });
  }
  /** The download size of our launcher as the manifest states it ("38 MB"), when it is known. */
  get launcherSize(): string {
    return (this.manifest?.apps.find((a) => a.pkg === this.launcherPkg) as UiApp | undefined)?.size ?? '';
  }
  /**
   * The one action of the launcher screen. The design asks for a single gold button that says what
   * will happen to the picked row — and then does all of it, so nobody has to press Continue to
   * find out what Continue meant.
   */
  /**
   * What "your turn on the TV" says when the TV is about to ask for a home app. The brand's own
   * wording names OUR launcher, which is wrong the moment the user picked somebody else's — or
   * asked for the TV's own list.
   */
  get pickLauncherPrompt(): string {
    const r = this.launcherRow;
    if (r?.kind === 'ask') return this.t('hu_pickAny');
    return this.t('hu_pickNamed', { app: this.targetName });
  }
  /**
   * Home apps this box would still have once the stock launcher is off. If there are none, the
   * TV's own chooser has nothing to offer and the set is left without a home screen — the one
   * outcome this tool must never cause (docs/LAUNCHER_PICKER_PLAN.md: reversibility).
   */
  get otherHomeApps(): LauncherRow[] {
    return this.launcherList.filter((r) => r.kind === 'found' && r.installed && !r.stock);
  }
  /** 0–100 while an APK is coming down, -1 when the size is unknown (no bar, just the phase). */
  get dlPercent(): number {
    if (!this.dlTotal) return -1;
    return Math.min(100, Math.round((this.dlDone / this.dlTotal) * 100));
  }
  /**
   * What the gold button says under itself while it works. Every stage is named, and the download
   * counts in megabytes: on a television nobody can see a spinner's meaning, and "Working…" on its
   * own is the thing that makes a person reach for the remote.
   */
  get launcherStage(): string | null {
    if (!this.launcherBusy) return null;
    // one decimal under 10 MB, so a small file does not read "0 MB of 0 MB"
    const mb = (n: number) => (n >= 10 * 1048576 ? `${Math.round(n / 1048576)} MB` : `${(n / 1048576).toFixed(1)} MB`);
    // The engine says `download` only while it OPENS the response; the bytes actually flow under
    // `verify`, because the hash is what reads the stream. So the BYTES decide what this says —
    // otherwise the line reads "Checking SHA-256" for the whole 33 MB, which is a lie with a
    // progress bar next to it.
    if (this.installPhase === 'download' || this.installPhase === 'verify') {
      const arriving = !this.dlTotal || this.dlDone < this.dlTotal;
      if (arriving) {
        return this.dlTotal
          ? this.t('wl_stageFetch', { done: mb(this.dlDone), total: mb(this.dlTotal), pct: `${this.dlPercent}` })
          : this.t('wl_stageFetchN', { done: mb(this.dlDone) });
      }
      return this.t('wl_stageVerify');
    }
    if (this.installPhase === 'install') return this.t('wl_stagePush');
    return this.stageText;
  }
  get launcherCta(): { kind: 'install' | 'play' | 'recheck' | 'set' | 'keep' | 'ask' | 'app'; label: string; sub: string; blocked?: boolean } | null {
    const r = this.launcherRow;
    if (!r) return null;
    // "Another launcher" has a screen of its own now: search Play on the TV, send an APK, or pick
    // one the box already has. The old two answers below stay for the kiosk door.
    if (r.kind === 'ask' && this.appScreen) {
      return { kind: 'app', label: this.t('wk_ctaNext', { app: this.t('wl_other') }), sub: this.t('ka_subOther') };
    }
    if (r.kind === 'ask') {
      // Nothing else on the box can be home: switching the stock launcher off would leave the TV
      // with a chooser that has nothing in it. That is a reason not to DO it — not a reason to
      // leave the person on a dead button (Jim, 23/9: "if I pick Other I have to be able to get
      // out"). The press becomes the one move that can change the answer: read the box again,
      // after they install something with the remote.
      const none = this.otherHomeApps.length === 0;
      if (none) return { kind: 'recheck', label: this.t('wl_ctaRecheck'), sub: this.t('wl_askNone') };
      return { kind: 'ask', label: this.t('wl_ctaAsk'), sub: this.t('wl_subAsk') };
    }
    if (r.current) return { kind: 'keep', label: this.t('wl_ctaKeep', { app: r.name }), sub: this.t('wl_subKeep') };
    if (r.installed) return { kind: 'set', label: this.t('wl_ctaSet', { app: r.name }), sub: this.t('wl_subSet') };
    if (r.ours && this.canDirectInstall) {
      return { kind: 'install', label: this.t('wl_ctaInstall', { app: r.name }), sub: [this.launcherSize, this.t('wl_subVerified'), this.t('wl_subOneStep')].filter(Boolean).join(' · ') };
    }
    // Not on the box: the app's own screen, the same one the kiosk door uses (Jim, 29/9). It is
    // what turns "we never fetch somebody else's APK" from a dead end into a choice — the Play
    // page on the television, or the file the person already has. It comes BEFORE the two blocks
    // below on purpose: a box with no Play used to end on a button that could not be pressed, and
    // that is exactly the box the APK road was made for.
    if (this.appScreen) return { kind: 'app', label: this.t('wk_ctaNext', { app: r.name }), sub: this.t('ka_subGet', { app: r.name }) };
    if (this.launcherSent === r.package) return { kind: 'recheck', label: this.t('wl_ctaRecheck'), sub: this.t('wl_subRecheck') };
    // A box with no Play store cannot be sent to a Play page. We know this from the check, before
    // the press, so the button says what is true instead of opening nothing on the television.
    if (this.check && !this.check.hasPlay) {
      return { kind: 'play', label: this.t('wl_ctaPlay', { app: r.name }), sub: this.t('wl_subNoPlay', { app: r.name }), blocked: true };
    }
    // "we never install another developer's app" is true of everybody else's row and false of ours:
    // in the Play edition our own row goes to Play too, because THIS copy installs nothing itself.
    return { kind: 'play', label: this.t('wl_ctaPlay', { app: r.name }), sub: this.t(r.ours ? 'wl_subPlayOurs' : 'wl_subPlay') };
  }
  get adbOffEffective(): boolean {
    return this.adbOff ?? this.brand.debugOffAtHandover;
  }

  // ---- workspace derived
  get navItems(): Array<{ id: TaskPage | 'sep'; label: string; icon: string; disabled: boolean }> {
    // ΤΑ ΒΗΜΑΤΑ ΤΗΣ ΑΥΤΟΜΑΤΗΣ ΕΚΤΕΛΕΣΗΣ ΑΝΗΚΟΥΝ ΣΤΟΝ ΔΡΟΜΟ ΤΟΥ ΞΕΝΟΔΟΧΕΙΟΥ (Jim, 30/9).
    // Επισκόπηση, Εγκατάσταση, Default launcher, Ρύθμιση, Τεστ, Παράδοση: είναι η σειρά που τρέχει
    // ένα kiosk μετά τον home app. Για το TV Box Tools τα αντικατέστησε ο πίνακας Εργασιών (Jim,
    // 23/9: «δεν υπάρχει πια»), αλλά είχαν μείνει στο μενού και έδειχναν έξι πόρτες που δεν πάνε
    // πουθενά. Οι σελίδες ΔΕΝ σβήνονται — ο δρόμος του ξενοδοχείου τις χρειάζεται ακόμη.
    const run: Array<[TaskPage, StrKey, string]> =
      this.brand.flow === 'kiosk'
        ? [
            ['over', 't_over', 'pi-cat-all'],
            ['auto', 't_auto', 'pi-wand'],
            ...(this.brand.profiles.length > 1 ? ([['prof', 't_prof', 'pi-lock']] as Array<[TaskPage, StrKey, string]>) : []),
            // no downloads in the Play edition → no page whose only button downloads
            ...(this.canDirectInstall ? ([['inst', 't_inst', 'pi-cat-others']] as Array<[TaskPage, StrKey, string]>) : []),
            ['home', 't_home', 'pi-top-bar'],
            ['conf', 't_conf', 'pi-settings'],
            ['test', 't_test', 'bi-check-circle-fill'],
            ['hand', 't_hand', 'pi-bag'],
          ]
        : [];
    const items: Array<[TaskPage | 'sep', StrKey, string]> = [
      ...run,
      ...(run.length ? ([['sep', 'box', '']] as Array<['sep', StrKey, string]>) : []),
      ...(this.canRiskyTasks ? ([['debloat', 't_debloat', 'pi-cat-others']] as Array<[TaskPage, StrKey, string]>) : []),
      ['speed', 't_speed', 'pi-wand'],
      ['display', 't_display', 'pi-top-bar'],
      ...(this.canRiskyTasks ? ([['apk', 't_apk', 'pi-cat-others'], ['backup', 't_backup', 'pi-bag'], ['free', 't_free', 'pi-wand']] as Array<[TaskPage, StrKey, string]>) : []),
      ['device', 't_device', 'pi-opt-general'],
      ['remote', 't_remote', 'pi-bullhorn'],
      ['shot', 't_shot', 'pi-gallery'],
      ['sep', 'more', ''],
      // Η ΣΥΝΤΗΡΗΣΗ είναι του ξενοδοχείου: στέλνει broadcast στον ΔΙΚΟ ΜΑΣ launcher για να παγώσει
      // το kiosk lock με PIN, και PIN έχει μόνο εκείνος ο δρόμος (`when: (c) => !!c.pin`). Εδώ δεν
      // θα έτρεχε ποτέ — μια γραμμή που υπόσχεται κάτι που δεν γίνεται.
      ...(this.brand.flow === 'kiosk' ? ([['maint', 't_maint', 'pi-wand']] as Array<[TaskPage, StrKey, string]>) : []),
      ['console', 't_console', 'bi-solid-arrow-right'],
      ['agent', 't_agent_easy', 'pi-bullhorn'],
      ['agentmcp', 't_agent_mcp', 'pi-brain'],
      ['fleet', 't_fleet', 'pi-users-group'],
      // Τελευταία, και ΜΟΝΗ πόρτα για τα νομικά: το Play τη θέλει μέσα στο app, όχι σε κάθε
      // υποσέλιδο (εκεί το δαχτυλίδι προσγειωνόταν σε κάθε οθόνη και ο άνθρωπος χανόταν).
      ['about', 't_about', 'pi-opt-general'],
    ];
    return items.map(([id, key, icon]) => ({ id, label: this.t(key), icon, disabled: id === 'fleet' }));
  }
  /**
   * Οι γραμμές «Κατάσταση εργασιών» της Επισκόπησης: είναι τα ΙΔΙΑ βήματα της αυτόματης εκτέλεσης
   * που έφυγαν από το μενού (Jim, 30/9). Η Επισκόπηση δεν είναι πια στο μενού αυτού του brand,
   * αλλά ήταν ακόμη προσβάσιμη από τα «άνοιξε τις εργασίες» — και έδειχνε τις έξι γραμμές ξανά.
   */
  get statusPages(): TaskPage[] {
    if (this.brand.flow !== 'kiosk') return [];
    return [
      ...(this.brand.profiles.length > 1 ? (['prof'] as TaskPage[]) : []),
      ...(this.canDirectInstall ? (['inst'] as TaskPage[]) : []),
      'home',
      'conf',
      'test',
      'hand',
    ];
  }
  get status(): Record<TaskPage, StatusKind> {
    return {
      over: 'done',
      auto: this.autoDone ? 'done' : this.guided ? 'run' : 'todo',
      prof: this.profileApplied ? 'done' : this.profileBusy ? 'run' : 'todo',
      inst: this.installing ? 'run' : this.requiredOk ? 'done' : 'todo',
      home: this.homeSet ? 'done' : this.homeAsk ? 'wait' : this.homeBusy ? 'run' : 'todo',
      conf: this.cfgApplied ? 'done' : this.cfgBusy ? 'run' : 'todo',
      test: this.testsAll ? 'done' : this.human ? 'wait' : this.testsBusy ? 'run' : 'todo',
      hand: 'todo',
      maint: this.maintActive ? 'done' : 'todo',
      console: 'todo',
      debloat: this.dbDoneByUs.length ? 'done' : 'todo',
      speed: this.animScale === 0 ? 'done' : 'todo',
      shot: this.shot ? 'done' : 'todo',
      // the screen carries a mark only when something was actually overridden; reading a box is not
      // "done", and the remote is a thing you use, not a thing you finish
      display: this.dispOverride || (this.fontScale !== null && this.fontScale !== 1) ? 'done' : 'todo',
      device: 'todo',
      remote: 'todo',
      apk: this.apkQueue.some((q) => q.status === 'ok') ? 'done' : this.apkBusy ? 'run' : 'todo',
      free: 'todo',
      backup: this.backupRows.some((r) => r.blob) ? 'done' : this.backupBusy ? 'run' : 'todo',
      agent: 'todo',
      agentmcp: 'todo',
      fleet: 'todo',
      // δεν είναι εργασία, είναι πληροφορία — δεν «τελειώνει» ποτέ
      about: 'todo',
    };
  }
  get profiles(): Array<{ id: Profile; title: string; desc: string; icon: string; disabled: boolean }> {
    const meta: Record<Profile, [StrKey, StrKey, string]> = { kiosk: ['p_kiosk', 'p_kioskD', 'pi-lock'], open: ['p_open', 'p_openD', 'pi-cat-all'], 'install-only': ['p_only', 'p_onlyD', 'pi-cat-others'] };
    return this.brand.profiles.map((id) => {
      const [tk, dk, icon] = meta[id];
      return { id, title: this.t(tk), desc: this.t(dk), icon, disabled: id === 'kiosk' && this.hasAcc && this.brand.accountCheck };
    });
  }
  get apps(): UiApp[] {
    return (this.manifest?.apps ?? []) as UiApp[];
  }
  private groupPick(group: string): string | undefined {
    return this.choices[group] ?? this.apps.find((a) => a.group === group && a.required && a.role.includes(this.role))?.pkg;
  }
  appOn(a: UiApp): boolean {
    return a.group ? this.groupPick(a.group) === a.pkg : a.required && a.role.includes(this.role);
  }
  get pickedApps(): ManifestApp[] {
    return this.manifest ? pickApps(this.manifest, { role: this.role, choices: this.choices }) : [];
  }
  get requiredOk(): boolean {
    const picked = this.pickedApps;
    return picked.length > 0 && picked.every((a) => this.inst[a.pkg] === 'ok');
  }
  get installedCount(): string {
    return `${this.pickedApps.filter((a) => this.inst[a.pkg] === 'ok').length} / ${this.pickedApps.length}`;
  }
  /**
   * The tests this run actually has. On the box that IS the tool there is no reboot test — the
   * reboot would take the tool down with it — so counting it would report 4/5 and exit 1 on a run
   * where everything worked. Measured on the emulator, 22/9.
   */
  get testIds(): TestId[] {
    return this.selfTarget ? TEST_IDS.filter((k) => k !== 'reboot') : [...TEST_IDS];
  }
  get testsAll(): boolean {
    return this.testIds.every((k) => this.tests[k] === true);
  }
  get testsCount(): string {
    return `${this.testIds.filter((k) => this.tests[k] === true).length} / ${this.testIds.length}`;
  }
  get profileTitle(): string {
    return this.profiles.find((p) => p.id === this.profile)?.title ?? '—';
  }
  /** Permission rows for Configure — the `configure` steps of the core table, keyed by the toggle ids the prototype used. */
  get perms(): Array<{ id: string; label: string; cmd: string; off: boolean; on: boolean }> {
    const rows: Array<[string, string, StrKey, boolean]> = [
      ['overlay', 'cfg.overlay', 'c_overlay', true],
      ['usage', 'cfg.usage', 'c_usage', true],
      ['notif', 'cfg.notif', 'c_notif', true],
      ['tvl', 'cfg.tvl', 'c_tvl', true],
      ['acs', 'cfg.acs', 'c_acs', this.brand.accessibilityHome],
    ];
    return rows
      .filter(([, , , show]) => show)
      .map(([id, stepId, key]) => {
        const step = STEPS.find((s) => s.id === stepId)!;
        const off = id === 'acs' && this.profile === 'kiosk';
        const label = id === 'acs' ? `${this.t(key)} · ${this.t('c_acsD')}` : this.t(key);
        return { id, label, cmd: renderCommand(step, this.ctx).replace(this.launcherPkg, '').replace(/\s{2,}/g, ' ').trim(), off, on: !!this.cfg[id] && !off };
      });
  }
  get homeMethods(): Array<{ id: HomeMethod; title: string; desc: string; tag: string; tagKind: 'teal' | 'warn' | 'gray' | ''; code: string; icon: string; warn: string; na: boolean }> {
    const home = this.brand.launcherHomeComponent;
    return this.brand.homeMethods.map((m, i) => {
      const primary = i === 0;
      if (m === 'set-home-activity') {
        return { id: m, title: this.t('l_cmd'), desc: this.t('l_cmdD'), tag: primary ? this.t('l_cmdTag') : '', tagKind: primary ? 'teal' : '', code: `cmd package set-home-activity ${home}`, icon: 'bi-solid-arrow-right', warn: '', na: false };
      }
      if (m === 'device-owner') {
        const kiosk = this.profile === 'kiosk';
        return { id: m, title: this.t('l_do'), desc: this.t('l_doD'), tag: kiosk ? this.t('l_doTag') : this.t('l_na'), tagKind: 'gray', code: 'app → addPersistentPreferredActivity(HOME)', icon: 'pi-lock', warn: '', na: !kiosk };
      }
      if (this.brand.flow === 'disable-launcher') {
        return { id: m, title: this.t('l_disPlui'), desc: this.t('l_disPluiD'), tag: primary ? this.t('l_cmdTag') : '', tagKind: primary ? 'teal' : '', code: `pm disable-user --user 0 ${this.stockLauncher} · cmd package set-home-activity ${home}`, icon: 'bi-eye-slash-fill', warn: this.t('l_disWPlui'), na: false };
      }
      return { id: m, title: this.t('l_dis'), desc: this.t('l_disD'), tag: this.t('l_disTag'), tagKind: 'warn', code: `pm disable-user --user 0 ${this.stockLauncher}`, icon: 'bi-eye-slash-fill', warn: this.t('l_disW'), na: false };
    });
  }
  get homeSel(): HomeMethod | null {
    return this.homeMethod ?? (this.brand.flow === 'disable-launcher' ? (this.brand.homeMethods[0] ?? null) : null);
  }
  get homeBtnDisabled(): boolean {
    return !this.appInstalled || !this.homeSel || this.homeAsk || this.homeBusy;
  }
  get curHomeText(): string {
    return this.homeSet ? this.brand.launcherHomeComponent : this.stockDisabled ? '—' : (this.curHome ?? this.stockLauncher);
  }
  get promptText(): string {
    const res = this.brand.roleStep && this.role === 'reseller' ? this.t('a_promptRes', { code: this.resellerCode }) : '';
    return this.t('a_promptText').replace(/https:\/\/[^\s]+\/boxsetupai/, this.brand.agentPage) + res;
  }
  get mcpText(): string {
    const c = this.brand.cli;
    return `claude mcp add ${c} -- ${c} --mcp\n\n# or in .mcp.json\n{ "mcpServers": { "${c}": { "command": "${c}", "args": ["--mcp"] } } }`;
  }
  get handSub(): string {
    if (!this.brand.roleStep) return '';
    return this.role === 'owner' ? `${this.t('h_room')} ${this.room}` : `${this.t('h_unl')} — ${this.t('h_unlD')}`;
  }
  get reportText(): string {
    const link = !this.brand.roleStep ? '—' : this.role === 'owner' ? this.room : `unlinked (reseller ${this.resellerCode})`;
    return [
      `${this.brand.cli} report · ${new Date().toISOString().slice(0, 10)}`,
      `model     ${this.devName}`,
      `serial    ${this.serial}`,
      `android   ${this.androidVer}`,
      `profile   ${this.profile ?? '—'}`,
      `apps      ${this.installedCount}`,
      `tests     ${this.testsCount}`,
      `link      ${link}`,
      `exit      ${this.testsAll ? '0' : '1'}`,
    ].join('\n');
  }
  /** The command gate panel: every `cmd` entry with its verdict, newest last, plus the pending asks. */
  get gateRows(): GateRow[] {
    const rows: GateRow[] = [];
    const es = this.entries;
    for (let i = 0; i < es.length; i++) {
      const e = es[i]!;
      if (e.kind !== 'cmd' || !e.verdict) continue;
      const ask = this.gateAsks.find((a) => a.entry === i);
      const next = es[i + 1];
      let state: GateRow['state'] = 'ran';
      if (e.verdict === 'auto') state = 'auto';
      else if (e.verdict === 'blocked') state = 'blocked';
      else if (ask) state = 'pending';
      else if (next && next.kind === 'warn' && /not confirmed/.test(next.text)) state = 'denied';
      rows.push({ entry: i, cmd: e.text, verdict: e.verdict, state, ask });
    }
    return rows.slice(-6);
  }

  // ------------------------------------------------------------------ wizard navigation
  /**
   * Steps this run does not have. They keep their index (the names in `W` stay put) and the
   * navigation walks over them: a brand without roles, a tool that is not on a television, and
   * the debugging question when the box IS this television — there is nothing to choose then.
   */
  private skipped(n: number): boolean {
    // "Automatic or manual?" retired (Jim, 23/9): the launcher task does its job and hands back to
    // Tasks, which is the menu; the manual road is the Advanced tile. The screen file stays for
    // the old kiosk edition's history, but no run reaches it.
    if (n === W.mode) return true;
    if (n === W.lang) return this.langLocked || this.langKnown || this.phone;
    // "This TV or another box?" RETIRED (Jim, 28/9). On a television the answer was always "this
    // one", and the question stood between the person and the work; a different box is simply the
    // one they pick at Connect, where the scan lists every box on the network — this set included.
    // The screen file stays for its history, no run reaches it.
    if (n === W.target) return true;
    if (n === W.role) return !this.brand.roleStep;
    // "Which box is it?" RETIRED (Jim, 28/9: «δεν χρειάζεται, αφαίρεσέ το από παντού»). The answer
    // only ever chose WHICH PICTURES to show — the menu path, the drawing, which film plays — and
    // never changed a single command. Android TV is what the helpers fall back to (`devPath`,
    // `devScreen`, `clipFor` all take null), it is what most boxes are, and the real answer arrives
    // by itself: from the set's own launcher on the local road, from the check everywhere else.
    if (n === W.box) return true;
    if (n === W.debug) return this.selfTarget;
    // The launcher screens belong to ONE door of the hub: until it is taken they are not on the
    // way, and a stepper that promised "Launcher › Mode" to someone going to the console would
    // be describing a road they are not on. Direct goStep() from the hub does not consult this.
    if (n === W.launcher || n === W.kiosk || n === W.mode) {
      if (this.step < W.launcher && this.hubTask !== 'launcher' && this.hubTask !== 'kiosk') return true;
    }
    // …and the two doors have one screen each: "Tasks › Kiosk", never "Tasks › Launcher › Kiosk".
    if (n === W.launcher) return !this.canPickLauncher || this.hubTask === 'kiosk';
    if (n === W.kiosk) return this.hubTask !== 'kiosk';
    // THE APP'S OWN SCREEN (Jim, 29/9, from the design session). It is where the question
    // "is it on the box, and if not, how does it get there" is answered — for a third-party
    // hospitality app ALWAYS, because that road ends in setting it as HOME and the person has
    // to see what that does; and for OURS only in the copy that cannot install it (Google
    // Play), where the honest road is its Play page on the television. Where we can fetch it
    // ourselves, the screen would be a wall in the middle of a road that works.
    if (n === W.kioskApp) return !this.appScreen;
    // Use and Install belong to the Hotel TV road only: the kiosk door, with our launcher picked.
    if (n === W.use || n === W.install) return !this.onHotelRoad;
    return false;
  }
  /**
   * The tiles of the Tasks hub: the brand's list, minus what it may never do, each with the state
   * its own task reports back. A link tile points at the product that can do it.
   */
  get hubTiles(): Array<{ id: HubTask; title: string; tile: string; desc: string; short: string; long: string; icon: string; risk: HubRisk; riskKey: StrKey; cmds: string[]; link?: string; linkLabel?: string; done: boolean }> {
    const meta = HUB_META;
    const tiles: Array<{ id: HubTask; title: string; tile: string; desc: string; short: string; long: string; icon: string; risk: HubRisk; riskKey: StrKey; cmds: string[]; link?: string; linkLabel?: string; done: boolean }> = [];
    for (const id of this.brand.tasks) {
      const m = meta[id];
      const link = this.brand.taskLinks[id];
      // Kiosk is drawn in every edition (design session 23/9, D): the card asks the question and
      // the screen behind it guides the person — sets HOME here, and sends the LOCK to the edition
      // that may do it. `link` is that edition's page, shown under the card, never instead of it.
      // a door the Play copy may not have is not drawn greyed, it is not drawn (a reviewer reads the screen)
      if (RISKY_TASKS.includes(id) && !this.canRiskyTasks) continue;
      const done =
        id === 'launcher' ? this.autoDone || this.homeSet || this.launcherDone !== null
        : id === 'kiosk' ? (this.autoDone && this.profile === 'kiosk') || this.kioskDone !== null
        : id === 'debloat' ? this.dbDoneByUs.length > 0
        : id === 'speedup' ? this.animScale === 0
        : id === 'screenshot' ? !!this.shot
        : id === 'display' ? !!this.dispOverride || (this.fontScale !== null && this.fontScale !== 1)
        : false;
      tiles.push({
        id,
        title: this.t(m.title),
        // what the TILE says: the short name, so three columns do not end in …
        tile: this.t(m.tile),
        desc: this.t(m.desc),
        short: this.t(m.short),
        long: this.t(m.desc),
        icon: m.icon,
        risk: m.risk,
        riskKey: RISK_KEY[m.risk],
        cmds: m.cmds,
        ...(id === 'kiosk' && link ? { link, linkLabel: new URL(link).host } : {}),
        done,
      });
    }
    return tiles;
  }
  /** The main job — the first door the brand lists that is not a link. */
  get hubHero() {
    return this.hubTiles.find((t) => t.id !== 'kiosk') ?? null;
  }
  /** The compact rows: every other door that opens here. Kiosk has a card of its own. */
  get hubRows() {
    const hero = this.hubHero;
    return this.hubTiles.filter((t) => t.id !== 'kiosk' && t.id !== hero?.id);
  }
  /** The kiosk card under the grid — a question, and the door to the Kiosk screen. */
  get hubKiosk() {
    return this.hubTiles.find((t) => t.id === 'kiosk') ?? null;
  }
  focusTask(id: HubTask) {
    this.hubFocus = id;
  }
  /** The right panel: the task under focus, or the main job before anything was pointed at. */
  get hubWillRun() {
    return this.hubTiles.find((t) => t.id === (this.hubFocus ?? this.hubHero?.id)) ?? null;
  }
  /** The footer's gold button on the hub: "Choose — Change launcher" / "Open — Speed up". */
  get hubPrimaryLabel(): string {
    const t = this.hubWillRun;
    if (!t) return this.t('th_open');
    return `${t.id === this.hubHero?.id ? this.t('th_choose') : this.t('th_open')} — ${t.title}`;
  }
  /** A tile IS the action: it opens its road, there is no second Continue on the hub. */
  pickTask(id: HubTask) {
    const t = this.hubTiles.find((x) => x.id === id);
    if (!t) return;
    this.hubTask = id;
    this.log('info', `task: ${id}`);
    if (id === 'launcher') {
      if (this.brand.profiles.includes('open')) this.profile = 'open';
      else if (!this.brand.profiles.includes(this.profile ?? 'open')) this.profile = null;
      return this.goStep(W.launcher);
    }
    if (id === 'kiosk') {
      // The profile is the run's, in every edition: device owner + PROVISION kiosk + persistent HOME
      // address OUR app, and the steps skip themselves when the app in control is somebody else's.
      this.profile = 'kiosk';
      return this.goStep(W.kiosk);
    }
    const page: Partial<Record<HubTask, TaskPage>> = { console: 'console', debloat: 'debloat', speedup: 'speed', screenshot: 'shot', display: 'display', device: 'device', remote: 'remote', apk: 'apk', free: 'free', backup: 'backup' };
    const p = page[id];
    if (p) {
      this.openWs(p);
      this.taskOnly = true;
      return;
    }
    // «Για προχωρημένους» = ΟΛΟΚΛΗΡΟΣ ο χώρος εργασιών, με το μενού του — η μόνη πόρτα που το έχει.
    // ΔΕΝ περνά από το `landing()`: εκείνο απαντά «πού πάμε όταν δεν ζητήθηκε σελίδα», και σε αυτό
    // το brand η απάντηση είναι ο ΠΙΝΑΚΑΣ ΕΡΓΑΣΙΩΝ — οπότε το κουμπί γύριζε εκεί απ' όπου πατήθηκε
    // και έμοιαζε νεκρό (Jim, 30/9: «άνοιγμα για προχωρημένους δεν ανοίγει»). Η Επισκόπηση έφυγε
    // από το μενού αυτού του brand, άρα δεν υπάρχει σταθερή σελίδα να ζητήσουμε με το όνομά της:
    // ανοίγει η ΠΡΩΤΗ του μενού, ό,τι κι αν είναι σε αυτή την έκδοση (το Play δεν έχει debloat).
    const first = this.navItems.find((i) => i.id !== 'sep' && !i.disabled);
    if (!first) return this.landing();
    this.openWs(first.id as TaskPage);
    this.taskOnly = false;
  }
  /**
   * Πού προσγειώνεται το workspace όταν δεν ζητήθηκε σελίδα. Στον δρόμο του ξενοδοχείου υπάρχει
   * «Επισκόπηση»· εδώ ο πίνακας Εργασιών ΕΙΝΑΙ το μενού, οπότε η απάντηση είναι να γυρίσει εκεί
   * αντί να ανοίξει μια σελίδα που δεν υπάρχει πια στο μενού.
   */
  /** Δημόσια, γιατί την καλούν και οι δύο «άνοιξε τις εργασίες» της κεφαλίδας και του οδηγού. */
  landing() {
    if (this.brand.flow === 'kiosk') this.openWs('over');
    else this.backToTasks();
  }
  /**
   * The Play copy of the Android app switches nothing off, installs nothing, removes nothing
   * (Jim, 23/9). Same predicate as the APK download: a build that came from Play knows it.
   */
  get canRiskyTasks(): boolean {
    return this.canDirectInstall;
  }

  // ---- Debloat --------------------------------------------------------------------------------------
  /**
   * Every package on the box that this page is willing to touch: not the system's own parts and
   * Play (PROTECTED_PACKAGES), not anything that can be HOME, not the stock launcher, not ours.
   * A box left without a home screen or a store is not debloated, it is broken.
   */
  get debloatRows(): Array<{ pkg: string; label: string; system: boolean; disabled: boolean; safety: AppSafety | null }> {
    const c = this.check;
    if (!c) return [];
    const homes = new Set(c.homeApps.map((a) => a.package));
    const off = new Set(this.dbDisabled);
    return c.installedPackages
      // ...and NEVER this tool itself. On the local road the tool is just another app on the box, so
      // it turned up in its own list and could switch itself off — it did, on the emulator, and the
      // television fell back to whatever else was installed (28/9). A tool that can disable itself
      // mid-task is a tool that leaves the person with no way back.
      .filter((p) => !PROTECTED_PACKAGES.includes(p) && !homes.has(p) && p !== this.stockLauncher && p !== this.launcherPkg && p !== this.brand.androidAppId)
      .filter((p) => !/^(android|com\.android\.|com\.google\.android\.(gms|gsf|ext\.|packageinstaller|permissioncontroller|overlay|webview|tv\.frameworkpackagestubs))/.test(p))
      .map((p) => ({ pkg: p, label: appLabel(p), system: /^(com\.google\.|com\.xiaomi\.|com\.mitv\.|com\.amazon\.|com\.mediatek\.|com\.realtek\.|com\.droidlogic\.)/.test(p), disabled: off.has(p), safety: appSafety(p, { userInstalled: this.dbUser.includes(p) }) }))
      .sort((a, b) => Number(a.system) - Number(b.system) || a.label.localeCompare(b.label));
  }
  /** `pm list packages -d`: what the box itself says is switched off, whoever did it. */
  async loadDisabled() {
    const r = await this.execAs('pm list packages -d');
    if (!r?.ran) return;
    this.dbDisabled = r.output.split('\n').map((l) => l.trim().replace(/^package:/, '')).filter(Boolean);
    // and who put each app there: an app somebody installed themselves can always be installed
    // again, so the row can say "safe" about it without knowing the app at all.
    const u = await this.execAs('pm list packages -3');
    if (u?.ran) this.dbUser = u.output.split('\n').map((l) => l.trim().replace(/^package:/, '').split(' ')[0] ?? '').filter(Boolean);
  }
  /** Off needs two presses (the second is the confirmation); on is one. Either way the box is read back. */
  /**
   * TELEVISION: the question is a DIALOG, not a second press on the same row (Jim, 28/9).
   *
   * The two-press pattern works with a mouse and fails with a remote: the row redraws on the first
   * press, the button the ring was sitting on is replaced, the focus falls back to the task list,
   * and the second press never reaches the row. Here the row asks once, the answer is Yes or No,
   * and the page puts the ring back on the same row afterwards (DebloatPage).
   */
  dbAsk = $state<string | null>(null);
  askApp(pkg: string) {
    if (!this.canRiskyTasks || this.dbBusy) return;
    this.dbArmed = null;
    this.dbAsk = pkg;
  }
  closeAsk() {
    this.dbAsk = null;
  }
  /** Yes: the dialog closes first, so the ring never sits on a button that is about to be replaced. */
  async confirmAsk() {
    const pkg = this.dbAsk;
    this.dbAsk = null;
    if (!pkg) return;
    this.dbArmed = pkg; // the arm the two-press road would have set: this call is the second press
    await this.toggleApp(pkg);
  }
  async toggleApp(pkg: string) {
    if (!this.canRiskyTasks || this.dbBusy) return;
    const isOff = this.dbDisabled.includes(pkg);
    if (!isOff && this.dbArmed !== pkg) {
      this.dbArmed = pkg;
      this.after(4000, () => { if (this.dbArmed === pkg) this.dbArmed = null; });
      return;
    }
    this.dbArmed = null;
    this.dbBusy = true;
    try {
      const r = await this.execAs(isOff ? `pm enable ${pkg}` : `pm disable-user --user 0 ${pkg}`);
      if (r?.ran && /new state/.test(r.output)) {
        if (isOff) this.dbDoneByUs = this.dbDoneByUs.filter((p) => p !== pkg);
        else if (!this.dbDoneByUs.includes(pkg)) this.dbDoneByUs = [...this.dbDoneByUs, pkg];
      }
      await this.loadDisabled();
    } finally {
      this.dbBusy = false;
    }
  }
  /** Everything this session switched off, back on — one press, the list is ours. */
  async restoreAllApps() {
    if (this.dbBusy) return;
    this.dbBusy = true;
    try {
      for (const pkg of [...this.dbDoneByUs]) await this.execAs(`pm enable ${pkg}`);
      this.dbDoneByUs = [];
      await this.loadDisabled();
    } finally {
      this.dbBusy = false;
    }
  }

  // ---- Speed up -------------------------------------------------------------------------------------
  async readSpeed() {
    const r = await this.execAs('settings get global window_animation_scale');
    if (!r?.ran) return;
    const v = parseFloat(r.output.trim());
    this.animScale = Number.isFinite(v) ? v : 1; // "null" from the box = never set = Android's 1
  }
  /** Three scales, one value: 0 is instant, 1 is what Android ships with. Reversible by the same press. */
  async setSpeed(fast: boolean) {
    const v = fast ? '0' : '1';
    for (const k of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) {
      await this.execAs(`settings put global ${k} ${v}`);
    }
    this.log('ok', fast ? 'animations off — every transition is instant now' : 'animations back to Android default (1x)');
    await this.readSpeed();
  }

  // ---- Screen size, density, text size -------------------------------------------------------------
  // The competitor study (docs/COMPETITOR_TASKS_STUDY.md): "screen resolution manager" is the
  // headline feature of the 500k-install app on Play, and the reason is not vanity — a 4K box that
  // draws its launcher at 1080p is a different machine, and a TV whose text is unreadable from the
  // sofa is fixed here in one press. Everything on this page is an OVERRIDE: `wm size reset`,
  // `wm density reset` and font 1.0 put the panel back exactly as it shipped.
  async readDisplay() {
    const size = await this.execAs('wm size');
    if (size?.ran) {
      this.dispPhysical = /Physical size:\s*(\S+)/.exec(size.output)?.[1] ?? null;
      this.dispOverride = /Override size:\s*(\S+)/.exec(size.output)?.[1] ?? null;
    }
    const dens = await this.execAs('wm density');
    if (dens?.ran) {
      const p = /Physical density:\s*(\d+)/.exec(dens.output)?.[1];
      const o = /Override density:\s*(\d+)/.exec(dens.output)?.[1];
      this.densPhysical = p ? Number(p) : null;
      this.densOverride = o ? Number(o) : null;
    }
    const font = await this.execAs('settings get system font_scale');
    if (font?.ran) {
      const v = parseFloat(font.output.trim());
      this.fontScale = Number.isFinite(v) ? v : 1; // "null" from the box = never set = Android's 1
    }
  }
  /** `null` = back to the panel's own resolution (`wm size reset`). */
  async setResolution(size: string | null) {
    if (this.dispBusy) return;
    this.dispBusy = true;
    try {
      await this.execAs(`wm size ${size ?? 'reset'}`);
      // density follows the size: a 4K density on a 1080p canvas leaves the launcher unusable
      if (size === null) await this.execAs('wm density reset');
      else if (this.densPhysical && this.dispPhysical) {
        const was = Number(this.dispPhysical.split('x')[0] ?? 0);
        const now = Number(size.split('x')[0] ?? 0);
        if (was > 0 && now > 0 && now !== was) await this.execAs(`wm density ${Math.round((this.densPhysical * now) / was)}`);
      }
      await this.readDisplay();
    } finally {
      this.dispBusy = false;
    }
  }
  async setDensity(dpi: number | null) {
    if (this.dispBusy) return;
    this.dispBusy = true;
    try {
      await this.execAs(`wm density ${dpi ?? 'reset'}`);
      await this.readDisplay();
    } finally {
      this.dispBusy = false;
    }
  }
  async setFontScale(v: number) {
    if (this.dispBusy) return;
    this.dispBusy = true;
    try {
      await this.execAs(`settings put system font_scale ${v}`);
      await this.readDisplay();
    } finally {
      this.dispBusy = false;
    }
  }

  // ---- Device: what this box IS, and whether its clock is telling the truth ------------------------
  // Every line is a read the tool already had the right to make. It exists because the first thing
  // anyone asks in a support mail is "what box is it", and because a wrong clock is the hidden cause
  // of "Trust anchor not found" on cheap boxes (memory: tls-root-certificates).
  async readDevice() {
    if (this.devBusy) return;
    this.devBusy = true;
    try {
      const rows: Array<{ key: StrKey; value: string }> = [];
      const get = async (cmd: string) => (await this.execAs(cmd))?.output.trim() ?? '';
      const model = await get('getprop ro.product.model');
      const maker = await get('getprop ro.product.manufacturer');
      if (model || maker) rows.push({ key: 'dv_model', value: [maker, model].filter(Boolean).join(' ') });
      const rel = await get('getprop ro.build.version.release');
      const sdk = await get('getprop ro.build.version.sdk');
      if (rel) rows.push({ key: 'dv_android', value: sdk ? `${rel} (API ${sdk})` : rel });
      const build = await get('getprop ro.build.display.id');
      if (build) rows.push({ key: 'dv_build', value: build });
      const serial = await get('getprop ro.serialno');
      if (serial) rows.push({ key: 'dv_serial', value: serial });
      await this.readDisplay();
      if (this.dispPhysical) rows.push({ key: 'dv_screen', value: this.dispOverride ? `${this.dispOverride} (${this.dispPhysical})` : this.dispPhysical });
      const df = await get('df /data');
      const line = df.split('\n').find((l) => l.includes('/data'));
      const cols = line?.trim().split(/\s+/) ?? [];
      // `df` answers in 1K blocks; nobody reads "3576032" as three and a half gigabytes
      const gb = (blocks: string | undefined) => {
        const n = Number(blocks);
        return Number.isFinite(n) && n > 0 ? `${(n / 1024 / 1024).toFixed(1)} GB` : null;
      };
      const free = gb(cols[3]);
      const total = gb(cols[1]);
      if (free && total) rows.push({ key: 'dv_storage', value: this.t('dv_free', { free, total }) });
      const up = await get('uptime');
      if (up) rows.push({ key: 'dv_uptime', value: up.split(',')[0]?.replace(/^\s*up\s*/, '').trim() || up });
      this.devInfo = rows;
      await this.readClock();
    } finally {
      this.devBusy = false;
    }
  }
  /** How far the box's clock is from ours, in seconds, and which NTP server it was told to use. */
  async readClock() {
    const r = await this.execAs('date +%s');
    const secs = Number((r?.output ?? '').trim());
    this.clockSkew = Number.isFinite(secs) && secs > 0 ? Math.round(Date.now() / 1000 - secs) : null;
    const n = await this.execAs('settings get global ntp_server');
    const v = (n?.output ?? '').trim();
    this.ntpServer = v && v !== 'null' ? v : null;
  }
  /** Point the box at a working time server and turn automatic time back on. */
  async fixClock() {
    await this.execAs('settings put global ntp_server time.google.com');
    await this.execAs('settings put global auto_time 1');
    this.log('ok', 'time server set to time.google.com and automatic time turned on');
    await this.readClock();
  }

  // ---- Remote: the keys and the text ---------------------------------------------------------------
  // A television whose remote is lost, paired to nothing, or simply too slow to type on. `input
  // keyevent` is on the gate's allowlist because it can do nothing a remote could not, and `input
  // text` types what the person in front of the screen typed.
  async sendKey(key: string) {
    this.lastKey = key;
    await this.execAs(`input keyevent ${key}`);
  }
  async sendText(text: string) {
    const t = text.trim();
    if (!t) return;
    // the shell splits on spaces, so a sentence travels as %s — the way `input text` expects it
    await this.execAs(`input text ${t.replace(/\s+/g, '%s')}`);
    this.log('ok', `typed on the TV: ${t}`);
  }

  // ---- See the television in a window --------------------------------------------------------------
  // The strongest feature of the Windows tool in the study is that it puts the TV on the screen
  // (scrcpy). We do not ship scrcpy — its own licence, its own adb server, 40 MB a platform — we
  // OPEN it when the person already has it, with this box selected, and otherwise say where it is.
  get canMirror(): boolean {
    return !!this.hooks.mirror && !!this.device;
  }
  async mirrorBox() {
    if (!this.hooks.mirror || !this.device || this.mirrorBusy) return;
    this.mirrorBusy = true;
    this.mirrorMsg = null;
    try {
      const r = await this.hooks.mirror(this.device.serial || this.device.info.id);
      this.mirrorMsg = r.ok ? this.t('dv_mirrorOn') : this.t(r.reason === 'missing' ? 'dv_mirrorMissing' : 'dv_mirrorFailed');
      if (r.ok) this.log('ok', 'scrcpy opened for this box');
      else this.log('warn', `scrcpy: ${r.reason ?? 'failed'}${r.message ? ` — ${r.message}` : ''}`);
    } finally {
      this.mirrorBusy = false;
    }
  }

  // ---- Back up the apps that are on this box -------------------------------------------------------
  // The one job in the study that NEITHER of the other two tools does on the TV side, and the one a
  // reseller or a hotel spends a day on: the box in hand has the apps, the next box has none.
  //
  // `pm path` says where an app's APK lives, the sync service reads it, and the file lands on this
  // computer as a download. Restoring is the Install my APK page, fed the same files — which is why
  // there is no second half to build: the two tiles are one round trip.
  //
  // Split APKs are named honestly: a modern app is `base.apk` plus `split_*.apk`, and a backup that
  // keeps only the base installs and then fails to open. We pull every path the box reports.
  get canBackup(): boolean {
    return typeof this.device?.pull === 'function';
  }
  async loadBackupRows() {
    // `pm list packages -3` is the box's own answer to "what did somebody put here" — the right set
    // for a backup, and a different question from the Debloat page's (which is about what CAME with
    // the box). Our own package is left out: the next box gets the tool from the site, not from here.
    const r = await this.execAs('pm list packages -3');
    const pkgs = (r?.output ?? '')
      .split('\n')
      .map((l) => l.replace(/^package:/, '').trim().split(' ')[0] ?? '')
      .filter((p) => p && p !== this.brand.androidAppId);
    this.backupRows = pkgs.map((pkg) => ({ pkg, label: appLabel(pkg) }));
  }
  async backupApp(pkg: string) {
    const dev = this.device;
    if (!dev?.pull || this.backupBusy) return;
    this.backupBusy = true;
    this.setBackup(pkg, { busy: true, err: undefined });
    try {
      const r = await this.execAs(`pm path ${pkg}`);
      const paths = (r?.output ?? '').split('\n').map((l) => l.replace(/^package:/, '').trim()).filter(Boolean);
      if (!paths.length) throw new Error('the box did not say where that app lives');
      // one file per path; the base one is what the row offers, the splits follow under it
      let total = 0;
      const files: Array<{ name: string; url: string }> = [];
      for (const p of paths) {
        const bytes = await dev.pull(p);
        total += bytes.byteLength;
        const name = p.split('/').pop() ?? 'base.apk';
        files.push({ name: `${pkg}${paths.length > 1 ? `-${name}` : '.apk'}`, url: URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.android.package-archive' })) });
      }
      this.setBackup(pkg, { busy: false, size: total, blob: files[0]?.url, path: paths[0], extra: files.slice(1) });
      this.log('ok', `${pkg}: ${(total / 1024 / 1024).toFixed(1)} MB read off the box`);
    } catch (e) {
      this.setBackup(pkg, { busy: false, err: e instanceof Error ? e.message : String(e) });
    } finally {
      this.backupBusy = false;
    }
  }
  async backupAll() {
    for (const r of this.backupRows) {
      if (!r.blob) await this.backupApp(r.pkg);
    }
  }
  private setBackup(pkg: string, patch: Record<string, unknown>) {
    this.backupRows = this.backupRows.map((r) => (r.pkg === pkg ? { ...r, ...patch } : r));
  }

  // ---- Apps of ours that answer a question this page raised ----------------------------------------
  // The Windows tool people download installs Button Mapper so they can fix the remote's buttons
  // (docs/COMPETITOR_TASKS_STUDY.md §2.5). That app is ours: Button Mapper TV, on Play. It is
  // offered on ONE screen only — the Remote page, where the person already has the problem — and
  // never as a bundled install: its Play page opens ON THE TELEVISION and they decide there.
  static readonly REMAP_PKG = 'com.tv.remote.button.mapper.remap';
  get remapInstalled(): boolean {
    return !!this.check?.installedPackages.includes(Session.REMAP_PKG);
  }
  remapMsg = $state<string | null>(null);
  /** Installed → open it on the box. Not installed → its Play page, on the box; no Play → the web. */
  async openRemap() {
    this.remapMsg = null;
    if (this.remapInstalled) {
      await this.execAs(`monkey -p ${Session.REMAP_PKG} -c android.intent.category.LAUNCHER 1`);
      this.remapMsg = this.t('rm_appOpened');
      return;
    }
    const r = await this.execAs(playIntent(Session.REMAP_PKG));
    const failed = !r?.ran || /Error|unable to resolve|does not exist/i.test(r.output);
    if (failed) {
      // no Play on the box: the listing opens here instead, and they carry it over themselves
      this.openExternal(`https://play.google.com/store/apps/details?id=${Session.REMAP_PKG}`);
      this.remapMsg = this.t('rm_appNoPlay');
      return;
    }
    this.remapMsg = this.t('rm_appOnTv');
  }

  // ---- Install my APK ------------------------------------------------------------------------------
  // The tile every sideloader opens a tool for, and the one the Play copy never draws (RISKY_TASKS).
  // The file is the person's own: no manifest, no digest to check against — it is streamed straight
  // to `pm install -r -S`, exactly as a manifest app is, and the report writes down what was sent.
  //
  // ΚΑΙ XAPK (Jim, 7/10/2026: «βάλε εδώ δυνατότητα να δίνω και xapk»). Ό,τι κατεβάζει ο κόσμος από
  // APKPure/APKMirror/bundletool δεν είναι ένα apk αλλά zip με base + κομμάτια (και σπάνια OBB):
  // μπαίνουν ΟΛΑ ΜΑΖΙ σε μία συνεδρία του pm, αλλιώς το Android απαντά «INSTALL_FAILED_MISSING_SPLIT».
  // Δες core/xapk.ts για το ξεζίπωμα και engine.installBundle για τη συνεδρία.
  addApks(files: File[]) {
    const take = files.filter((f) => /\.apk$/i.test(f.name) || isMultiApk(f.name));
    this.apkFiles = [...this.apkFiles, ...take];
    this.apkQueue = [...this.apkQueue, ...take.map((f) => ({ name: f.name, size: f.size, status: 'wait' as InstStatus, bundle: isMultiApk(f.name) }))];
  }
  /**
   * ΕΝΑΣ ΦΑΚΕΛΟΣ ΜΕ ΚΟΜΜΑΤΙΑ, ΜΙΑ ΓΡΑΜΜΗ (Jim, 7/10: «θέλω και ένα button δίπλα στο apk για να
   * βάλω folder split»). Στον φάκελό του το base κάθεται δίπλα στον υποφάκελο `splits/` — άρα
   * μαζεύουμε ΟΛΑ τα apk μέσα, όσο βαθιά κι αν είναι, και πάνε σε ΜΙΑ συνεδρία του pm. Αν
   * διαλέξει μόνο τον `splits/`, θα λείπει το base και θα το πει το ίδιο το κουτί — δεν το
   * μαντεύουμε εμείς.
   */
  addApkFolder(files: File[]) {
    const apks = files.filter((f) => /\.apk$/i.test(f.name));
    if (!apks.length) return;
    const rel = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const folder = rel(apks[0]!).split('/')[0] || 'splits';
    const parts = orderApkParts(apks.map((f) => ({ name: rel(f).split('/').pop() ?? f.name, size: f.size, file: f })));
    this.apkFiles = [...this.apkFiles, parts.map((p) => p.file)];
    this.apkQueue = [...this.apkQueue, { name: folder, size: apks.reduce((n, f) => n + f.size, 0), status: 'wait' as InstStatus, bundle: true, parts: apks.length }];
  }
  clearApks() {
    this.apkFiles = [];
    this.apkQueue = [];
  }
  /** Μία εγγραφή ανά ΓΡΑΜΜΗ: ένα αρχείο, ή τα πολλά apk ενός φακέλου. */
  private apkFiles: Array<File | File[]> = [];
  async installApks() {
    if (!this.engine || this.apkBusy || !this.apkFiles.length) return;
    this.apkBusy = true;
    this.userInitiated++;
    try {
      for (let i = 0; i < this.apkFiles.length; i++) {
        const entry = this.apkFiles[i]!;
        if (this.apkQueue[i]?.status === 'ok') continue;
        this.setApk(i, 'ing');
        try {
          let out: string;
          if (Array.isArray(entry)) {
            // Ο φάκελος: τα αρχεία είναι ήδη στη σειρά τους, και κάθε ένα ανοίγει δικό του ρεύμα.
            if (!this.engine.canInstallSplits) throw new Error('ap_eNoSplit');
            out = await this.engine.installBundle(
              entry.map((f) => ({ name: f.name, size: f.size, open: async () => f.stream() as unknown as ReadableStream<Uint8Array> })),
              [],
              { name: this.apkQueue[i]?.name },
            );
          } else if (isMultiApk(entry.name)) {
            const f = entry;
            // ΞΕΖΙΠΩΝΕΤΑΙ ΜΟΝΟ Ο ΚΑΤΑΛΟΓΟΣ: ένα XAPK 300 MB δεν μπαίνει ποτέ στη μνήμη — κάθε
            // κομμάτι ανοίγει δικό του ρεύμα τη στιγμή που το ζητά το pm.
            const bundle = await readXapk(f);
            if (!bundle.apks.length) throw new Error('ap_eNoApk');
            if (!this.engine.canInstallSplits) throw new Error('ap_eNoSplit');
            this.apkQueue = this.apkQueue.map((q, n) => (n === i ? { ...q, parts: bundle.apks.length } : q));
            out = await this.engine.installBundle(bundle.apks, bundle.obb, { name: bundle.pkg ?? f.name });
          } else {
            out = await this.engine.installFile(entry.stream() as unknown as ReadableStream<Uint8Array>, { size: entry.size, name: entry.name });
          }
          if (/Success/i.test(out)) this.setApk(i, 'ok');
          else this.setApk(i, 'err', out.trim().split('\n')[0]);
        } catch (e) {
          this.setApk(i, 'err', e instanceof Error ? e.message : String(e));
        }
      }
      // the package list is what the Debloat and console completion read from: after an install it is stale
      if (this.engine) this.check = await this.engine.check().catch(() => this.check);
    } finally {
      this.userInitiated--;
      this.apkBusy = false;
    }
  }
  private setApk(i: number, status: InstStatus, msg?: string) {
    this.apkQueue = this.apkQueue.map((q, n) => (n === i ? { ...q, status, ...(msg ? { msg } : {}) } : q));
  }

  // ---- Free space ----------------------------------------------------------------------------------
  // Two different things, said apart because they are not equally reversible: trimming caches takes
  // back space nobody owns, clearing an app's data throws away that app's logins and settings. The
  // second one asks, on every face, with the app's name in the question.
  async readFree() {
    const r = await this.execAs('df /data');
    const line = (r?.output ?? '').split('\n').find((l) => l.includes('/data'));
    const cols = line?.trim().split(/\s+/) ?? [];
    const n = Number(cols[3]);
    return Number.isFinite(n) && n > 0 ? `${(n / 1024 / 1024).toFixed(1)} GB` : null;
  }
  async trimCaches() {
    if (this.freeBusy) return;
    this.freeBusy = true;
    try {
      this.freeBefore = await this.readFree();
      // `pm trim-caches <desired free space>`: Android throws away cached files until it can promise
      // that much room. Nothing a person made is touched — caches are rebuilt on demand.
      await this.execAs('pm trim-caches 2G');
      this.freeAfter = await this.readFree();
      this.log('ok', `caches trimmed — ${this.freeBefore ?? '?'} free before, ${this.freeAfter ?? '?'} after`);
    } finally {
      this.freeBusy = false;
    }
  }
  askClear(pkg: string | null) {
    this.freeAsk = pkg;
  }
  async clearApp(pkg: string) {
    this.freeAsk = null;
    if (this.freeBusy) return;
    this.freeBusy = true;
    try {
      this.freeBefore = await this.readFree();
      await this.execAs(`pm clear ${pkg}`);
      this.freeAfter = await this.readFree();
      this.log('ok', `${pkg}: data and cache cleared`);
    } finally {
      this.freeBusy = false;
    }
  }
  /** Back to the tiles with the box still connected — from the workspace or the end of a task. */
  backToTasks() {
    this.mode = 'wizard';
    this.taskOnly = false;
    this.goStep(W.tasks);
  }
  /** The first step at or after `from` in direction `dir` that this run actually has. */
  /**
   * The first screen this run actually HAS. The language screen is missing whenever the answer is
   * already in hand — the site locked it, this computer answered it before, or this is a phone,
   * where the question is a dialog over the first step instead (LangAsk). Everything that lands on
   * "the beginning" goes through here, so nothing can drop onto a screen the stepper does not list.
   */
  private get firstStep(): number {
    return this.langLocked || this.langKnown || this.phone ? this.seek(W.lang + 1, 1) : W.lang;
  }
  private seek(from: number, dir: 1 | -1): number {
    let n = from;
    while (n > W.lang && n < W.mode && this.skipped(n)) n += dir;
    return n;
  }
  goStep(n: number) {
    // Leaving a screen is the moment its answer is final — cheaper and more honest than watching
    // every field, and it covers the ones the screens set directly (box, debugging path, role).
    this.remember();
    if (this.step === W.allow && n !== W.allow) this.connectAbort?.abort();
    this.step = n;
    // Back on the hub, no door is taken: the stepper folds the launcher screens away again.
    if (n === W.tasks) this.hubTask = null;
    // The two screens that wait on this TV keep a poll of its switches running; no other does.
    this.watchSelf(n === W.dev);
    // ΧΩΡΙΣ GOOGLE PLAY, ΕΝΑΣ ΔΡΟΜΟΣ (Arc, 10/10/2026): η οθόνη ανοίγει με τον κωδικό ήδη ανοιχτό και
    // συμπληρωμένο με τον καθρέφτη — το επόμενο OK είναι το «Install & set as HOME».
    if (n === W.kioskApp) {
      const r = this.appRow;
      if (r && r.kind === 'known' && r.play === false && !r.installed && !this.codeRoad) this.pickCodeRoad(true);
    }
    if (n === W.launcher) {
      this.launcherDone = null;
      // D2: the answer the box already gives is the default answer, so the screen opens with a
      // selection and a button that says what keeping it means — not with "pick one to continue".
      if (this.launcherPick === null && !this.keepHome) {
        // Which default is honest depends on why the tool exists. The hotel target is here to put OUR
        // app on a room television; the launcher brand is here to hand the HOME button back, so the
        // honest default is what the box already opens. Brand data, not a brand id.
        // The hotel road exists to put OUR app on a room television, so it may answer its own
        // question. The launcher brand may not: pre-selecting would be us choosing on the one screen
        // that is entirely the user's — and the current launcher, the only "honest" default, is
        // usually the one they came here to get rid of (Jim, 22/9).
        this.launcherPick = this.brand.flow === 'kiosk' ? (this.launcherList.find((r) => r.ours)?.id ?? null) : null;
      }
      void this.loadLauncherIcons();
      void this.loadManifest(); // the gold button says the download size, so it needs the manifest
    }
    if (n === W.kiosk) {
      this.kioskDone = null;
      this.unlockDone = false;
      this.unlockPin = '';
      // Read the box again every time this screen opens: it reports what the box IS — locked or not,
      // which app answers HOME, how many accounts. After a lock run the answers have all changed, and
      // a screen that still says "Unlocked · Android TV Home" would be offering an install that is
      // already done (Jim, 25/9).
      if (this.engine && this.checkDone) void this.startCheck();
      this.launcherError = null;
      this.accountsSent = false;
      if (!this.kioskRow) this.kioskPick = 'ours';
      void this.loadKioskIcons();
      // The list is fetched once and REMEMBERED — including a failure (`null`), which then followed
      // the whole session around and left the gold button saying the app could not be fetched on a
      // box where it could (Jim, 25/9). Coming back to this screen is a new try.
      if (this.hotelManifest === null) this.hotelManifest = undefined;
      void this.loadHotelManifest();
    }
    if (n === W.install) {
      this.launcherError = null;
      if (hotelTarget().launcherPackage === this.launcherPkg) void this.loadManifest();
      else void this.loadHotelManifest();
    }
    if (n === W.find) {
      if (this.selfTarget) this.debug = this.selfPath;
      this.startScan();
    }
    if (n === W.allow) void this.startAllow();
    if (n === W.check) void this.startCheck();
  }
  next() {
    const s = this.step;
    if (s === W.use) return this.goStep(W.install);
    if (s === W.install) return void this.runHotelInstall();
    if (s === W.launcher || s === W.kiosk) return this.backToTasks();
    if (s === W.kioskApp) return this.goStep(this.appHome);
    // the hub's Continue is the focused door
    if (s === W.tasks) {
      const t = this.hubWillRun;
      if (t) this.pickTask(t.id);
      return;
    }
    if (s < W.mode) return this.goStep(this.seek(s + 1, 1));
    if (this.setupMode === 'auto') {
      this.openWs('auto');
      this.after(600, () => void this.startAuto());
    } else this.landing();
  }
  back() {
    // `seek` stops at the language step, so the guard has to: with the site's language locked in
    // there is nothing behind the second screen.
    const first = this.firstStep;
    if (this.step > first) this.goStep(this.seek(this.step - 1, -1));
  }
  skipStep() {
    if (this.step === W.allow) void this.startAllow();
    else this.goStep(this.seek(this.step + 1, 1));
  }
  restartGuide() {
    this.mode = 'wizard';
    // NOT `0`: index 0 is the language screen, which this run may not have at all (phone, or a
    // computer that already answered). Pressing "Guide" used to drop onto it anyway.
    this.step = this.firstStep;
  }
  pickLang(tag: string) {
    this.i18n.set(tag);
    // The answer, on the screen that asks it. From here on this computer opens in this language and
    // is never offered another one (Jim, 25/9: "suggest it the first time, then save it").
    this.rememberLang(tag);
  }
  pickBox(id: BoxId) {
    this.box = id;
    this.anim = 0;
  }

  // ------------------------------------------------------------------ step 10: which launcher
  chooseLauncher(id: string) {
    // ΜΕΤΑ ΤΟ «ΕΓΙΝΕ», ΜΙΑ ΝΕΑ ΕΠΙΛΟΓΗ ΞΑΝΑΝΟΙΓΕΙ ΤΗ ΔΟΥΛΕΙΑ (Jim, 3/10: «αν τελειώσει και εγώ
    // μετά επιλέγω έναν άλλο launcher δεν ανοίγει το button»). Το μπλοκ της ετυμηγορίας
    // αντικαθιστά το κουμπί, οπότε όσο έμενε εκεί η οθόνη ήταν νεκρή: διάλεγες άλλον και δεν
    // υπήρχε τρόπος να τον ορίσεις. Η ετυμηγορία αφορά την ΠΡΟΗΓΟΥΜΕΝΗ επιλογή — μόλις αλλάξει,
    // δεν ισχύει πια. Αν ξαναδιαλέξεις τον ΙΔΙΟ, μένει (δεν έγινε τίποτα καινούργιο).
    if (this.launcherDone !== null && id !== this.launcherPick) this.launcherDone = null;
    if (id !== this.launcherPick) this.resetCodeRoad(); // ο κωδικός ήταν του ΠΡΟΗΓΟΥΜΕΝΟΥ launcher
    this.launcherPick = id;
    this.keepHome = false;
    this.launcherError = null;
    const r = this.launcherRow;
    this.log('info', r?.kind === 'ask' ? 'home: let the box ask' : `home: ${r?.package ?? id}`);
  }
  /**
   * Send the user to the app's Play page ON THE TV. We never install someone else's app ourselves:
   * their repositories carry no licence and the Play agreement forbids distributing outside Play
   * (docs/LAUNCHER_PICKER_PLAN.md). The remote does the installing; we watch for the result.
   */
  async openOnBox(row: LauncherRow) {
    if (!row.package) return;
    this.launcherError = null;
    const r = await this.execAs(playIntent(row.package));
    // `am start` answers "Starting: Intent…" even for a package Play has never heard of, so the
    // only thing this can prove is whether ANYTHING opened. A box with no Play store says so, and
    // then telling the installer to "read the box again" would be sending them to wait for nothing.
    const failed = !r?.ran || /Error|unable to resolve|does not exist/i.test(r.output);
    if (failed) {
      this.launcherError = this.t('wl_noPlay', { app: row.name });
      this.log('warn', `no Play on this box for ${row.package}`);
      return;
    }
    // …and `am start` exiting 0 does not mean the listing is on the screen. Measured on a Mi Box 4
    // (23/9): Play opened and then drew its own "Something went wrong", because the box's Google
    // account had to sign in again — while the tool cheerfully said "waiting for the install". So
    // we ask the box who is in front, and report THAT.
    const front = await this.frontPackage();
    if (front && GOOGLE_SIGN_IN.some((p) => front.startsWith(p))) {
      this.launcherError = this.t('wl_playSignIn');
      this.log('warn', `Play needs the box's Google account to sign in again (front: ${front})`);
      return;
    }
    if (front && !/vending|finsky/.test(front)) {
      this.launcherError = this.t('wl_playNoShow', { app: row.name });
      this.log('warn', `Play did not come to the front (front: ${front})`);
      return;
    }
    this.launcherSent = row.package;
    this.log('ok', `Play is open on the TV for ${row.package}`);
  }
  /** Which app has the TV's focus right now — a 4 KB read, straight off the allowlist. */
  private async frontPackage(): Promise<string | null> {
    await new Promise((r) => setTimeout(r, 1500));
    const r = await this.execAs('dumpsys window policy');
    return r?.ran ? parseFocusedPackage(r.output) : null;
  }
  /**
   * The gold action: everything the picked row needs, in the order it needs it. Install ours if the
   * box does not have it, set HOME to the choice, and move on. A third party is never installed by
   * us — that row opens its Play page on the TV instead and waits to be read again.
   */
  async runLauncherCta() {
    const c = this.launcherCta;
    const r = this.launcherRow;
    if (!c || !r || this.launcherBusy || c.blocked) return;
    // Every branch below talks to the box. Without a connection the honest answer is that sentence,
    // not a TypeError from a non-null assertion three calls deeper.
    if (!this.engine && c.kind !== 'keep') {
      this.launcherError = this.t('wl_noBox');
      return;
    }
    this.launcherError = null;
    if (c.kind === 'app') {
      this.kioskAppError = null;
      this.kioskWaiting = false;
      this.searchSent = false;
      this.pickInstalled = false;
      this.boxApks = [];
      this.boxApkPick = null;
      this.boxApkScanned = false;
      return this.goStep(W.kioskApp);
    }
    if (c.kind === 'play') return void this.openOnBox(r);
    if (c.kind === 'recheck') return void this.recheckLaunchers();
    this.launcherBusy = true;
    this.userInitiated++;
    try {
      if (c.kind === 'install') {
        this.stageText = this.t('wl_stageInstall');
        await this.installOurLauncher();
        this.stageText = this.t('wl_stageRead');
        await this.startCheck();
      }
      if (c.kind !== 'keep') {
        this.stageText = this.t(c.kind === 'ask' ? 'wl_stageAskTv' : 'wl_stageHome');
        const ok = await this.runTask('launcher', this.ctx, this.brand.homeMethods[0]);
        if (!ok) throw new Error(this.t('wl_homeFailed'));
      }
      // Ours and now HOME: hand it its permissions here rather than let its own first run ask for
      // them one screen at a time (Jim, 23/9 — it asked for "install unknown apps" and "display
      // over other apps" on a box where adb could grant both in silence). NOT only when we just
      // installed it: on a box that already had it, "set as HOME" skipped the grants and the TV
      // asked for the same two again (Jim, 9/10, real box). The grants are idempotent, so every
      // branch that made ours HOME gives them. Somebody else's launcher is never touched:
      // `oursIsTarget` is the same gate the run uses.
      if (c.kind !== 'keep' && this.oursIsTarget) {
        this.stageText = this.t('wl_stageGrant');
        await this.runTask('configure', this.ctx);
      }
      this.finishLauncherTask(r.name);
    } catch (e) {
      // The console dock is closed on a television: a failure has to be on the screen or it is lost.
      this.launcherError = e instanceof Error ? e.message : String(e);
      this.log('err', this.launcherError);
    } finally {
      this.userInitiated--;
      this.launcherBusy = false;
      this.stageText = null;
      this.installPhase = null;
    }
  }
  /**
   * The launcher task is over. The hotel road still has a whole run to do after the home app
   * (device owner, persistent home, grants, tests) and no question to ask about it, so it goes
   * straight into the automatic run. Everyone else gets the verdict on this screen and the way
   * back to Tasks — the menu.
   */
  private finishLauncherTask(app: string) {
    if (this.brand.flow === 'kiosk') {
      this.openWs('auto');
      this.after(600, () => void this.startAuto());
      return;
    }
    this.homeSet = true;
    this.launcherDone = app;
    this.log('ok', `HOME now opens ${app}`);
    // ΞΑΝΑΔΙΑΒΑΣΕ ΤΟ ΚΟΥΤΙ (Jim, 3/10/2026). Η οθόνη κρατούσε το `check` της ΠΡΙΝ την αλλαγή:
    // το «ΣΤΟ BOX ΤΩΡΑ» έδειχνε τον παλιό launcher ενώ από κάτω έγραφε «Έγινε — το HOME ανοίγει
    // πλέον τον X», και ένα APK που μόλις είχε εγκατασταθεί συνέχιζε να λέει «δεν υπάρχει».
    // Μια οθόνη που αντιφάσκει με τον εαυτό της είναι χειρότερη από καμία.
    void this.refreshCheck();
  }

  /**
   * Ξαναρωτά το κουτί και ξαναγράφει το `check`. Μετά από κάθε αλλαγή που το αφορά, και με το χέρι
   * από το κουμπί «Ανανέωση» — γιατί το box αλλάζει ΚΑΙ χωρίς εμάς (ο χρήστης πατά HOME και διαλέγει
   * μόνος του, μια εφαρμογή απεγκαθίσταται από την τηλεόραση).
   */
  refreshing = $state(false);
  async refreshCheck() {
    if (!this.engine || this.refreshing) return;
    this.refreshing = true;
    try {
      this.check = await this.engine.check();
    } catch (e) {
      this.log('warn', e instanceof Error ? e.message : String(e));
    } finally {
      this.refreshing = false;
    }
  }
  // ------------------------------------------------------------------ step 11: kiosk
  /** The kiosk picker's rows: the hotel launcher, the hospitality apps we know, what the box has. */
  get kioskList(): LauncherRow[] {
    const rows = hospitalityRows(this.brand, this.check);
    // "My own app": a row built from the typed package. It is a real answer only when the box says
    // that package can be HOME — a lock needs a home activity to return to. Otherwise the row is
    // still there (so the person sees what they typed) and the button says why it cannot run.
    const pkg = this.kioskCustom.trim();
    if (pkg) {
      const h = this.check?.homeApps.find((a) => a.package === pkg);
      const cur = this.check?.currentHome?.split('/')[0] === pkg;
      rows.push({ id: 'custom', kind: 'found', package: pkg, name: pkg, component: h?.component ?? null, installed: !!h || !!this.check?.installedPackages.includes(pkg), current: cur, ours: false, stock: false, play: false });
    }
    return rows;
  }
  get kioskRow(): LauncherRow | null {
    return this.kioskList.find((r) => r.id === this.kioskPick) ?? null;
  }
  get kioskOurs(): LauncherRow {
    return this.kioskList[0]!; // hospitalityRows always begins with the hotel launcher
  }
  get kioskHosp(): LauncherRow[] {
    return this.kioskList.filter((r) => r.kind === 'known');
  }
  /** Other hotel TV solutions the box already has — anything else that can be HOME. */
  get kioskFound(): LauncherRow[] {
    return this.kioskList.filter((r) => r.kind === 'found' && r.id !== 'custom');
  }
  /** The lock needs a box with no Google account (`dpm set-device-owner` refuses otherwise). */
  get kioskAccounts(): number {
    return this.accRemoved ? 0 : (this.check?.accounts.length ?? 0);
  }
  /** The box is locked already: a device owner is set (ours or anybody's). */
  get kioskLocked(): boolean {
    return !!this.check?.deviceOwner;
  }
  /** The box is locked by OUR hotel app — the one lock this tool can open (with the Admin PIN). */
  get lockedByUs(): boolean {
    return (this.check?.deviceOwner ?? '').split('/')[0] === hotelTarget().launcherPackage;
  }
  /**
   * There is a way out of a locked box, and Jim asked for both halves of it (25/9). The lock itself
   * is always lifted the same way — the hotel app's own UNLOCK, because only the owner app can hand
   * the device back, and it checks the Admin PIN. What differs is HOME afterwards:
   *
   * - `keep` — **Unlock the box**: restrictions and device owner go, the hotel launcher STAYS the
   *   home screen. The box is an ordinary Android TV that happens to open our app, and the gold
   *   button on this screen locks it again.
   * - `reset` — **Back to factory**: the stock launcher is enabled and takes HOME back. For a box
   *   that stops being a room television.
   *
   * Both halves finish HERE, over adb, and not in the app: clearing the device owner takes every one
   * of its policies with it — the hidden stock launcher, the pinned HOME — so after the UNLOCK the
   * box would drift back to the stock launcher on the next reboot no matter which one we wanted
   * (measured 25/9: HOME was Google's again). `reset` also works on a box that was never locked but
   * still has our launcher on HOME, which is why the UNLOCK is skipped when there is no lock of ours.
   *
   * Measured end to end on the Android TV 11 emulator (25/9), because "HOME stays ours" is a promise
   * the screen makes out loud: after `keep` the stock launcher stays `enabled=3` across a reboot and
   * the box comes up on the hotel launcher; after `reset` it comes up on Android TV Home.
   */
  async unlockBox(mode: 'keep' | 'reset' = 'keep') {
    const hotel = hotelTarget();
    const pkg = hotel.launcherPackage;
    const pin = this.unlockPin.trim();
    const locked = this.lockedByUs;
    if (!this.engine || this.launcherBusy) return;
    if (locked && !/^\d{4,8}$/.test(pin)) return;
    this.launcherError = null;
    this.launcherBusy = true;
    this.userInitiated++;
    this.stageText = this.t(mode === 'reset' ? 'wk_resetting' : 'wk_unlocking');
    try {
      if (locked) {
        const r = await this.execAs(`am broadcast -a ${pkg}.UNLOCK -p ${pkg} --es pin ${pin}`);
        const out = r?.output ?? '';
        if (!/UNLOCK ok/.test(out)) {
          // the wrong PIN, or an app from before the unlock existed (1003 and older) that says nothing
          this.launcherError = this.t(/PIN/.test(out) ? 'wk_unlockBad' : 'wk_unlockOld');
          return;
        }
        this.unlockPin = '';
        this.log('ok', 'the lock is off — no device owner, no restrictions');
      }
      if (mode === 'keep') {
        // The stock launcher is enabled again the moment the device owner goes, and it would win the
        // next HOME press. Same road the consumer launcher walks: switch it off, then name ours.
        this.stageText = this.t('wk_keepingHome');
        if (this.stockLauncher) await this.execAs(`pm disable-user --user 0 ${this.stockLauncher}`);
        await this.execAs(`cmd package set-home-activity ${hotel.launcherHomeComponent}`);
        this.log('ok', `unlocked — ${hotel.launcherName} still opens on HOME`);
      } else {
        this.stageText = this.t('wk_restoring');
        if (this.stockLauncher) await this.execAs(`pm enable ${this.stockLauncher}`);
        // Its home activity is only in the box's answer once it is enabled again, so read, then name
        // it: our launcher is still the set home activity and nothing else would take it off.
        await this.startCheck();
        const home = this.check?.homeApps.find((a) => a.package === this.stockLauncher)?.component;
        if (home) await this.execAs(`cmd package set-home-activity ${home}`);
        this.log('ok', `back to factory — ${home ?? this.stockLauncher} is the home screen again`);
      }
      this.unlockDone = mode;
      this.stockDisabled = mode === 'keep';
      // `startCheck` refreshes the box card; `curHome` is a field of its own, and without this read
      // the screen kept offering "back to factory" on a box that was already back to factory. The
      // full intent is spelled out here (action AND category): with the category alone this box
      // answers "No activity found" — which is what `verifyHome` asks, and why it is not used here.
      const h = await this.execAs('cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME');
      if (h?.ran) this.curHome = parseResolvedHome(h.output);
      await this.startCheck();
    } finally {
      this.userInitiated--;
      this.launcherBusy = false;
      this.stageText = null;
    }
  }
  /**
   * Is there anything for "back to factory" to undo? A lock of ours, a stock launcher we switched
   * off, or our launcher sitting on HOME. On a box that never met us the button is not there at all.
   */
  get canResetBox(): boolean {
    return this.lockedByUs || this.canRestoreStock || (this.curHome ?? '').startsWith(hotelTarget().launcherPackage + '/');
  }
  /** Who holds the device owner, by name when we know the app, else its package. */
  get deviceOwnerName(): string {
    const pkg = (this.check?.deviceOwner ?? '').split('/')[0] ?? '';
    return this.kioskList.find((r) => r.package === pkg)?.name ?? pkg;
  }
  chooseKiosk(id: string) {
    if (id !== this.kioskPick) this.resetCodeRoad(); // ο κωδικός ήταν της ΠΡΟΗΓΟΥΜΕΝΗΣ εφαρμογής
    this.kioskPick = id;
    this.keepHome = false;
    this.launcherError = null;
    this.log('info', `kiosk: ${this.kioskRow?.package ?? id}`);
  }
  /**
   * The one gold action of the Kiosk screen, and what it will do to the picked row. The lock
   * belongs to a target that may be owned (the hotel launcher); the home road does the half it may —
   * install ours, set HOME — and names where the lock is.
   */
  /**
   * Does the picked app get a screen of its own before anything runs?
   *   \u00b7 third party \u2014 always: the road ends at `set-home-activity`, and what that does (and does
   *     NOT do: no Device Owner around it) has to be on screen before the press.
   *   \u00b7 ours \u2014 only where this copy cannot install it: the Google Play edition, whose only honest
   *     road is the app's Play page ON THE TELEVISION (TVLM_PLAY_STUDY \u00a73.1: the copy used to end
   *     on a blocked button saying "not on Play", which stopped being true on 25/9).
   *
   * 29/9, second pass: the SAME screen serves the LAUNCHER door (Jim: "for the launchers other
   * than PLUI, do it with the logic and the screen of Viggo, so that someone who has the APK can
   * send it"). Somebody else's launcher used to be thrown straight at the television's Play page
   * with no second road — and a box with no Play had no road at all. And ours goes there too in
   * the copy that came from Google Play, which downloads nothing by itself.
   */
  /** The row the app screen is about — whichever door opened it. */
  get appRow(): LauncherRow | null {
    return this.hubTask === 'kiosk' ? this.kioskRow : this.launcherRow;
  }
  /** The door the app screen came from, for "back" and for the step after it. */
  get appHome(): number {
    return this.hubTask === 'kiosk' ? W.kiosk : W.launcher;
  }
  get appScreen(): boolean {
    const r = this.appRow;
    // A typed package has no name, no icon and no Play page — nothing to put on this screen.
    if (!r || r.id === 'custom') return false;
    // "Another launcher" DOES get it on the launcher door (Jim, 29/9): it used to dead-end on a
    // box with no second home app ("install one first" — true, and no road). Now it is the same
    // screen, with Play SEARCHED instead of a package page, and the APK road beside it.
    if (r.kind === 'ask') return this.hubTask !== 'kiosk';
    if (this.hubTask === 'kiosk') {
      if (!r.family) return true;
      return !r.installed && !this.canDirectInstall;
    }
    // The launcher door: only the road to an app that is NOT on the box yet needs the screen.
    // What is already there is set as HOME by one command, and a screen in front of that would
    // be a wall in the middle of a road that works.
    if (r.installed || r.current) return false;
    // Ours, where this copy may fetch it, is still the one-press road (fetch → verify → HOME).
    return r.ours ? !this.canDirectInstall : true;
  }
  /** Waiting for the television: its Play page is open and the box has not reported the app yet. */
  kioskWaiting = $state(false);
  /**
   * APK files that are ALREADY ON THE BOX — the road that needs no file picker at all.
   *
   * DWTV met the same wall and answered it by writing its own picker (docs/local-send.md: the
   * system chooser is touch-designed and "on plenty of these boxes DocumentsUI is not even
   * installed"). Here there is a better answer, because this tool already has adb on the box:
   * we read what is sitting there and install it from there. No storage permission, no picker,
   * and not one byte through the WebView — and it works for a box across the room too, not only
   * for the television that happens to be running the tool.
   */
  boxApks = $state<Array<{ path: string; name: string; dir: string; size: number; when: string; usb: boolean }>>([]);
  boxApkPick = $state<string | null>(null);
  boxApkBusy = $state(false);
  /** Have we looked yet? Without it "none found" and "not looked" read the same on screen. */
  boxApkScanned = $state(false);
  /** Where an APK lands on a television: the browser's downloads, and what adb push leaves. */
  private static readonly APK_DIRS = ['/sdcard/Download', '/sdcard', '/data/local/tmp'];
  /** More than this and the list stops being a choice; the newest are the ones that matter. */
  private static readonly APK_MAX = 40;
  /** "Another launcher": Play was SEARCHED on the TV — we do not know what they will install. */
  searchSent = $state(false);
  /** "Another launcher": the road chosen is "one the box already has", not a new one. */
  pickInstalled = $state(false);
  /** Facts we can honestly read about the picked app (version, who installed it). */
  kioskFacts = $state<Array<{ key: StrKey; value: string }>>([]);
  private kioskApkFile: File | null = null;
  kioskApkName = $state<string | null>(null);
  kioskApkBusy = $state(false);
  /**
   * ΓΙΑΤΙ ΔΕΝ ΜΠΗΚΕ, ΜΕ ΛΟΓΙΑ (Jim, 3/10/2026): το `Failure [INSTALL_FAILED_OLDER_SDK: …
   * Requires newer sdk version #26 (current version is #25)]` είναι σωστό και αδιάβαστο. Η ωμή
   * γραμμή μένει από κάτω — στην κονσόλα και στην αναφορά — αλλά πρώτα λέμε τι συνέβη.
   */
  private whyNotInstalled(raw: string): string {
    const f = installFailure(raw);
    return f ? `${this.t(f.key as StrKey, f.params)}\n${raw}` : raw;
  }
  kioskAppError = $state<string | null>(null);
  /** Read what the box knows about this app \u2014 never invented: only what a command answered. */
  async readKioskFacts() {
    const r = this.appRow;
    this.kioskFacts = [];
    if (!r?.installed || !r.package) return;
    const rows: Array<{ key: StrKey; value: string }> = [];
    const dump = await this.execAs(`dumpsys package ${r.package}`);
    const out = dump?.output ?? '';
    const ver = /versionName=(\S+)/.exec(out)?.[1];
    if (ver) rows.push({ key: 'ka_ver', value: ver });
    // `installerPackageName=null` is the box saying "nobody's store put this here" — sideloaded.
    const inst = /installerPackageName=(\S+)/.exec(out)?.[1];
    const store = inst && inst !== 'null' ? inst : null;
    if (ver) rows.push({ key: 'ka_from', value: !store ? this.t('ka_fromSide') : store === 'com.android.vending' ? this.t('ka_fromPlay') : store });
    const first = /firstInstallTime=(\S+)/.exec(out)?.[1];
    if (first) rows.push({ key: 'ka_first', value: first.slice(0, 10) });
    this.kioskFacts = rows;
  }
  /** Open the app's Play page ON THE TELEVISION, then watch the box until the app turns up. */
  async openKioskPlay() {
    const r = this.appRow;
    if (!r?.package || this.launcherBusy) return;
    this.kioskAppError = null;
    const res = await this.execAs(playIntent(r.package));
    if (!res?.ran || /Error|unable to resolve|does not exist/i.test(res.output)) {
      this.kioskAppError = this.t('wl_noPlay', { app: r.name });
      return;
    }
    this.launcherSent = r.package;
    this.kioskWaiting = true;
    this.log('ok', `Play page for ${r.package} is open on the TV \u2014 waiting for the install`);
    void this.watchForPackage(r.package);
  }
  /** `pm list packages <pkg>` every few seconds: the person presses Install with the remote. */
  private async watchForPackage(pkg: string) {
    for (let i = 0; i < 40 && this.kioskWaiting; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      if (!this.kioskWaiting) return;
      const res = await this.execAs(`pm list packages ${pkg}`);
      if (res?.output.includes(`package:${pkg}`)) {
        this.kioskWaiting = false;
        await this.recheckLaunchers();
        await this.readKioskFacts();
        this.log('ok', `${pkg} is on the box`);
        return;
      }
    }
    this.kioskWaiting = false;
  }
  stopKioskWait() {
    this.kioskWaiting = false;
  }
  /**
   * Search Play ON THE TELEVISION for a launcher. There is no package to watch for afterwards —
   * we do not know what they will choose — so the button becomes "read the box again".
   */
  async openPlaySearch() {
    if (this.launcherBusy) return;
    this.kioskAppError = null;
    const res = await this.execAs(playSearchIntent(LAUNCHER_SEARCH));
    if (!res?.ran || /Error|unable to resolve|does not exist/i.test(res.output)) {
      this.kioskAppError = this.t('ka_noPlayAny');
      return;
    }
    this.searchSent = true;
    this.log('ok', `Play search for "${LAUNCHER_SEARCH}" is open on the TV`);
  }
  /**
   * What .apk files does the box have? `ls` is a read, so it runs without asking anyone.
   *
   * A name carrying anything a shell would read as syntax is LEFT OUT rather than escaped: the
   * path goes into `pm install` as an argument, and a quote in a filename is not worth a hole.
   */
  async scanBoxApks() {
    this.boxApks = [];
    this.boxApkPick = null;
    this.boxApkScanned = false;
    const dirs = [...Session.APK_DIRS];
    // A USB stick lands on /storage/<VOLUME> ("0000-0000", "1A2B-3C4D"). `emulated` is the
    // internal card we already walk and `self` is this process's own view of it — everything
    // else is something somebody plugged in, which is exactly where an APK arrives from on a
    // box with no browser (Jim, 29/9: "and what if he has it on a USB?").
    const vols = await this.execAs('ls -1 /storage');
    if (vols?.ran) {
      for (const line of vols.output.split('\n')) {
        const v = line.trim();
        if (!v || v === 'emulated' || v === 'self' || !/^[\w.-]+$/.test(v)) continue;
        dirs.push(`/storage/${v}`, `/storage/${v}/Download`);
      }
    }
    const rows: Array<{ path: string; name: string; dir: string; size: number; when: string; usb: boolean }> = [];
    const seen = new Set<string>();
    for (const dir of dirs) {
      // `-l` for the size and the time, `-t` for newest first — the one order that matters, because
      // what somebody wants to install is almost always what just landed (the lesson DWTV's own
      // picker was built on). Ten files called `download(1).apk` are a riddle without these.
      const r = await this.execAs(`ls -lt ${dir}`);
      if (!r?.ran) continue;
      for (const line of r.output.split('\n')) {
        const long = /^-\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$/.exec(line.trim());
        // Not every toybox prints the same `ls -l`; a line we cannot read is still a file whose
        // NAME we can read, and a row without a size beats no row at all.
        const name = (long?.[4] ?? line).trim();
        if (!/\.apk$/i.test(name) || !/^[\w .()+-]+$/.test(name)) continue;
        const path = `${dir}/${name}`;
        if (seen.has(path)) continue;
        seen.add(path);
        rows.push({
          path,
          name,
          dir,
          size: Number(long?.[1] ?? 0),
          when: long ? `${long[2]} ${long[3]}` : '',
          usb: dir.startsWith('/storage/'),
        });
      }
    }
    // Newest first across every folder, and undated last: a row we could not read the time of
    // must not push a file that arrived a minute ago out of sight.
    // Ties go to the stick: somebody who plugged in a USB a minute ago plugged it in FOR this.
    rows.sort((a, b) => (b.when || '').localeCompare(a.when || '') || Number(b.usb) - Number(a.usb));
    this.boxApks = rows.slice(0, Session.APK_MAX);
    this.boxApkScanned = true;
    this.log('info', `${rows.length} apk on the box (${dirs.length} folders looked at)`);
  }
  pickBoxApk(path: string | null) {
    this.boxApkPick = path;
    this.kioskAppError = null;
    if (path) {
      this.pickKioskApk(null);
      this.codeRoad = false;
    }
  }
  /**
   * Install a file the box already holds, then ASK THE BOX whether the app is really there —
   * the same ending as the file road, because an APK's name promises nothing.
   */
  async installBoxApk() {
    const p = this.boxApkPick;
    const r = this.appRow;
    if (!p || !this.engine || this.boxApkBusy) return;
    this.boxApkBusy = true;
    this.kioskAppError = null;
    this.userInitiated++;
    try {
      // ΟΧΙ `pm install /sdcard/...`: ο installer τρέχει ως system_server, που ΔΕΝ διαβάζει το
      // FUSE mount που είναι το /sdcard — το box απαντά `avc: denied { read } … fuse:s0` και δεν
      // εγκαθίσταται τίποτα (μετρημένο στον emulator, 29/9). Γι' αυτό ακριβώς και το ίδιο το
      // `adb install` αντιγράφει πρώτα στο /data/local/tmp· κάνουμε το ίδιο και μετά σβήνουμε
      // το αντίγραφό μας, ώστε να μη μείνουν 30 MB στο box για κάτι δικό μας.
      const tmp = '/data/local/tmp/tvlm-install.apk';
      const staged = p.startsWith('/data/local/tmp/');
      if (!staged) {
        const cp = await this.execAs(`cp ${p} ${tmp}`);
        if (!cp?.ran || cp.output.trim()) throw new Error(cp?.output.trim() || this.t('ka_boxFailed'));
      }
      const res = await this.execAs(`pm install -r ${staged ? p : tmp}`);
      if (!staged) await this.execAs(`rm -f ${tmp}`);
      if (!res?.ran || !/Success/i.test(res.output)) {
        throw new Error(res?.output.trim().split('\n')[0] || this.t('ka_boxFailed'));
      }
      await this.recheckLaunchers();
      if (r && r.kind !== 'ask' && !this.appRow?.installed) throw new Error(this.t('ka_wrongApk', { app: r.name, pkg: r.package }));
      await this.readKioskFacts();
    } catch (e) {
      this.kioskAppError = this.whyNotInstalled(e instanceof Error ? e.message : String(e));
      this.log('err', this.kioskAppError);
    } finally {
      this.userInitiated--;
      this.boxApkBusy = false;
    }
  }
  /** The third road of "another launcher": one the box already has. */
  pickInstalledRoad(on: boolean) {
    this.pickInstalled = on;
    this.kioskAppError = null;
    if (on) this.codeRoad = false;
  }
  pickKioskApk(file: File | null) {
    this.kioskApkFile = file;
    this.kioskApkName = file?.name ?? null;
    this.kioskAppError = null;
    // ΜΙΑ ΔΙΑΛΕΓΜΕΝΗ ΚΑΡΤΑ ΤΗ ΦΟΡΑ. Το `codeRoad` σβήνει ΑΠΕΥΘΕΙΑΣ και όχι μέσω `pickCodeRoad`:
    // εκείνο καθαρίζει τους άλλους δρόμους, και τα δύο μαζί θα καλούσε το ένα το άλλο.
    if (file) this.codeRoad = false;
  }
  /**
   * Install the file the person picked, then ASK THE BOX whether the app is really there. We do not
   * parse the APK to promise it is the right one beforehand \u2014 the box's own answer afterwards is
   * both simpler and harder to be wrong about.
   */
  async installKioskApk() {
    const f = this.kioskApkFile;
    if (!f) return;
    await this.installApkStream({ stream: f.stream() as unknown as ReadableStream<Uint8Array>, size: f.size, name: f.name });
  }

  /**
   * ΤΟ ΙΔΙΟ, ΑΛΛΑ ΤΟ ΑΡΧΕΙΟ ΕΡΧΕΤΑΙ ΑΠΟ ΤΟ ΔΙΚΤΥΟ — ο δρόμος του short code / της διεύθυνσης.
   * Από τη στιγμή που υπάρχουν bytes, τίποτα δεν διαφέρει: ίδιο `install -r`, ίδιος διάλογος
   * «ποιος ήρθε», ίδια επανανάγνωση του box.
   */
  private async installApkFrom(url: string) {
    if (this.kioskApkBusy) return;
    const name = (() => {
      try {
        const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
        return last.toLowerCase().endsWith('.apk') ? decodeURIComponent(last) : 'download.apk';
      } catch {
        return 'download.apk';
      }
    })();
    this.kioskApkBusy = true;
    this.kioskAppError = null;
    let src: { stream: ReadableStream<Uint8Array>; size?: number };
    try {
      this.log('cmd', `$ GET ${url}`);
      src = await this.hooks.fetchApk(url);
    } catch (e) {
      // ΤΟ ΚΑΤΕΒΑΣΜΑ ΔΕΝ ΕΓΙΝΕ ΚΑΝ — χωριστό μήνυμα από «μπήκε και απέτυχε»: εδώ φταίει το δίκτυο
      // ή ο host, όχι το box, και η συμβουλή είναι άλλη.
      this.kioskAppError = this.t('ka_cDlFailed', { err: e instanceof Error ? e.message : String(e) });
      this.log('err', this.kioskAppError);
      this.kioskApkBusy = false;
      return;
    }
    this.kioskApkBusy = false;
    await this.installApkStream({ stream: src.stream, size: src.size, name });
  }

  private async installApkStream(src: { stream: ReadableStream<Uint8Array>; size?: number; name: string }) {
    const r = this.appRow;
    const f = { name: src.name, size: src.size ?? 0 };
    // Ο «ΑΛΛΟΣ LAUNCHER» ΔΕΝ ΕΧΕΙ ΠΑΚΕΤΟ — ΑΥΤΟ ΕΙΝΑΙ ΤΟ ΝΟΗΜΑ ΤΟΥ (Jim, 3/10/2026: «πατάω install
    // το atv, δεν κάνει τίποτα»). Η συνθήκη ζητούσε `r.package`, που στη γραμμή `ask` είναι κενό,
    // οπότε η συνάρτηση γύριζε ΣΙΩΠΗΛΑ: καμία εγκατάσταση, κανένα μήνυμα, κανένα ίχνος. Και είναι
    // ακριβώς η διαδρομή που η ίδια η οθόνη υπόσχεται — «διάλεξε το APK ΟΠΟΙΟΥΔΗΠΟΤΕ launcher, και
    // μετά διαβάζουμε το box να δούμε τι έφτασε».
    if (!r || !this.engine || this.kioskApkBusy) return;
    this.kioskApkBusy = true;
    this.kioskAppError = null;
    this.userInitiated++;
    // ΠΟΙΟΣ ΗΡΘΕ (Jim, 3/10: «τελείωσε με επιτυχία αλλά δεν με ενημέρωσε»). Στη γραμμή «Άλλος
    // launcher» δεν ξέρουμε τι κουβαλά το αρχείο — το μαθαίνουμε συγκρίνοντας τις εφαρμογές αρχικής
    // ΠΡΙΝ και ΜΕΤΑ. Ό,τι εμφανίστηκε, αυτό έφερε το APK.
    const before = new Set((this.check?.homeApps ?? []).map((a) => a.package));
    try {
      const out = await this.engine.installFile(src.stream, { size: src.size, name: src.name });
      if (!/Success/i.test(out)) throw new Error(out.trim().split('\n')[0] || 'install failed');
      await this.recheckLaunchers();
      await this.readKioskFacts();
      // ΤΙ ΗΡΘΕ: το μαθαίνουμε συγκρίνοντας τις εφαρμογές αρχικής ΠΡΙΝ και ΜΕΤΑ, σε ΚΑΘΕ διαδρομή.
      const arrived = (this.check?.homeApps ?? []).find((a) => !before.has(a.package));
      const got = r.kind !== 'ask' && !!this.appRow?.installed;
      // ΤΙΠΟΤΑ ΔΕΝ ΗΡΘΕ ΚΑΙ ΔΕΝ ΗΡΘΕ ΟΥΤΕ ΑΥΤΟ ΠΟΥ ΖΗΤΟΥΣΑΜΕ: αυτό είναι το μόνο σκέτο σφάλμα.
      if (!arrived && !got && r.kind !== 'ask') throw new Error(this.t('ka_wrongApk', { app: r.name, pkg: r.package }));
      // ΜΠΗΚΕ — ΚΑΙ ΤΩΡΑ ΤΙ; Η οθόνη έμενε απαράλλαχτη, με το ίδιο κουμπί «Εγκατάσταση στο box»:
      // ο χρήστης δεν μάθαινε ούτε ότι πέτυχε, ούτε ότι μένει ένα βήμα ακόμη για να γίνει HOME.
      // Αν αναγνωρίσαμε ποιος ήρθε, τον ΔΙΑΛΕΓΟΥΜΕ και γυρνάμε στη λίστα, όπου το χρυσό κουμπί
      // λέει πλέον «Όρισε ως HOME — <όνομα>» και καταλήγει στο κανονικό «Έγινε… πάτα HOME».
      this.kioskApkFile = null;
      this.kioskApkName = null;
      this.resetCodeRoad();
      // ΗΡΘΕ ΑΚΡΙΒΩΣ ΑΥΤΟ ΠΟΥ ΖΗΤΗΣΑΜΕ → HOME ΑΜΕΣΩΣ, ΟΠΩΣ ΣΤΟ PLUI (Jim, 10/10/2026: «όταν τελείωσε
      // το install του Projectivy με ρώτησε για το HOME — πρέπει να το κάνει όπως στο PLUI»). Ο
      // διάλογος «Είναι στο box — Κάν' τον HOME» μένει για ό,τι δεν ξέραμε από πριν: τη γραμμή «Άλλος
      // launcher» και το APK που έφερε άλλη εφαρμογή από αυτή της γραμμής.
      const exact = r.kind !== 'ask' && !r.family && (arrived ? arrived.package === r.package : got);
      if (exact) {
        this.kioskApkBusy = false;
        await this.setHomeForAppRow();
        return;
      }
      // ΔΙΑΛΟΓΟΣ ΣΕ ΚΑΘΕ ΠΕΡΙΠΤΩΣΗ ΠΟΥ ΚΑΤΙ ΗΡΘΕ (Jim, 3/10/2026: «πάτησα κατέβασμα και install,
      // βγήκε το console dialog, τελείωσε, έκλεισε, αλλά εγώ δεν ξέρω τίποτα τι έγινε»). Η κονσόλα
      // κλείνει μόνη της όταν όλα πήγαν καλά — και τότε δεν μένει ΤΙΠΟΤΑ στην οθόνη να πει τι έγινε.
      // Ο διάλογος λέει το ΠΑΚΕΤΟ που αναγνώρισε το κουτί και προσφέρει το ένα βήμα που απομένει.
      if (arrived) {
        const row = this.launcherList.find((x) => x.package === arrived.package);
        this.apkArrived = {
          pkg: arrived.package,
          file: src.name,
          pick: row?.id ?? arrived.package,
          // ΗΡΘΕ ΑΛΛΟ ΑΠΟ ΑΥΤΟ ΠΟΥ ΖΗΤΟΥΣΑΜΕ — συνηθισμένο με short code: γράφεις τον κωδικό
          // άλλης εφαρμογής πάνω στη γραμμή του Projectivy. Δεν είναι σφάλμα, είναι γεγονός: το
          // λέμε και αφήνουμε τον άνθρωπο να αποφασίσει.
          ...(r.kind !== 'ask' && arrived.package !== r.package ? { wrong: r.name } : {}),
        };
        return;
      }
      // Μπήκε κάτι, αλλά ΔΕΝ είναι εφαρμογή αρχικής: να το πει, αντί να σωπάσει.
      if (!got) this.kioskAppError = this.t('ka_notLauncher', { file: src.name });
    } catch (e) {
      this.kioskAppError = this.whyNotInstalled(e instanceof Error ? e.message : String(e));
      this.log('err', this.kioskAppError);
    } finally {
      this.userInitiated--;
      this.kioskApkBusy = false;
    }
  }

  // ---------------------------------------- SHORT CODE / ΔΙΕΥΘΥΝΣΗ: Ο ΤΡΙΤΟΣ ΔΡΟΜΟΣ
  /**
   * ΤΟ ΑΡΧΕΙΟ ΤΟ ΔΕΙΧΝΕΙ Ο ΑΝΘΡΩΠΟΣ (εντολή Jim, 3/10/2026). Μέχρι τώρα, για να μπει ένας launcher
   * που δεν είναι στο box, υπήρχαν τρεις δρόμοι: το Play της τηλεόρασης, ένα APK από ΑΥΤΟΝ τον
   * υπολογιστή, ή ένα APK που ήδη κάθεται στο box. Σε τηλεόραση χωρίς λογαριασμό Google και χωρίς
   * επιλογέα αρχείων, και οι τρεις μπορεί να είναι κλειστοί — και η οθόνη κατέληγε σε αδιέξοδο.
   *
   * Εδώ ο χρήστης δίνει ΤΗΝ ΠΗΓΗ: έναν short code του Downloader (δικό μας `0xxx` ή AFTVnews) ή μια
   * απευθείας διεύθυνση. Εμείς τον λύνουμε, κατεβάζουμε και εγκαθιστούμε — η ίδια μηχανική με το
   * APK του δίσκου, από το σημείο που υπάρχουν bytes και μετά.
   *
   * ΟΙ ΚΑΤΑΣΤΑΣΕΙΣ ΕΙΝΑΙ ΤΕΣΣΕΡΙΣ ΓΙΑΤΙ ΔΥΟ ΔΕΝ ΦΤΑΝΟΥΝ: «δεν βρέθηκε» και «βρέθηκε αλλά είναι
   * ΣΕΛΙΔΑ» θέλουν τελείως άλλη συμβουλή, και ο κωδικός που οδηγεί σε σελίδα με πολλά αρχεία
   * (ARM/x86…) είναι συνηθισμένος, όχι σπάνιος.
   */
  codeRoad = $state(false);
  codeInput = $state('');
  /**
   * ΣΕ ΠΟΙΑ ΓΡΑΜΜΗ ΑΝΗΚΕΙ Ο ΚΩΔΙΚΟΣ ΤΟΥ ΠΕΔΙΟΥ (Jim, 10/10/2026, στο box: «διάλεξα Projectivy και μου
   * δείχνεις το URL — και μάλιστα του Monet»). Το πεδίο ζούσε ΠΕΡΑ από την αλλαγή launcher, λυμένο,
   * με το κουμπί «Install & set as HOME — Projectivy» να κατεβάζει το Monet. Ο κωδικός είναι μίας
   * γραμμής· αλλάζει η γραμμή → ο δρόμος του κωδικού ξεκινά από την αρχή.
   */
  private codeFor = '';
  codeState = $state<'idle' | 'resolving' | 'ready' | 'page' | 'error'>('idle');
  /** Ό,τι λύθηκε: αρχείο όταν `ready`, σελίδα όταν `page`. Γράφεται στην οθόνη και στις δύο. */
  codeUrl = $state('');
  codeErr = $state('');

  resetCodeRoad() {
    this.codeFor = '';
    this.codeRoad = false;
    this.codeAsk = null;
    this.codePasteErr = '';
    this.codeInput = '';
    this.codeState = 'idle';
    this.codeUrl = '';
    this.codeErr = '';
  }
  /**
   * Προσυμπληρώνεται για δικές μας εφαρμογές (Jim: «στον PLUI θα έχεις προσυμπληρωμένο τον short
   * code του PLUI που είναι 1166520») ΚΑΙ για τους γνωστούς ξένους launchers (Jim, 9/10/2026: «όταν
   * ανοίγει το code έχεις προσυμπληρωμένο το code ανάλογα τον launcher, αν θέλει ο user βάζει
   * άλλο») — εκεί η πηγή είναι το δικό μας αντίγραφο του νεότερου release (knownLauncherSource),
   * και λύνεται μόνο του ώστε το ring να πέσει κατευθείαν στο «Κατέβασε & εγκατέστησε». Άγνωστο
   * πακέτο → άδειο πεδίο: ένας λάθος προσυμπληρωμένος αριθμός είναι χειρότερος από άδειο.
   */
  pickCodeRoad(on: boolean) {
    this.kioskAppError = null;
    let prefilled = false;
    if (on) {
      this.pickKioskApk(null);
      this.pickInstalledRoad(false);
      this.pickBoxApk(null);
      const pkg = this.appRow?.package ?? '';
      // Ό,τι έμεινε από ΑΛΛΗ γραμμή δεν είναι δικό μας να το δείξουμε — ούτε, πολύ χειρότερα, να το κατεβάσουμε.
      if (this.codeFor !== pkg) {
        this.codeInput = '';
        this.codeState = 'idle';
        this.codeUrl = '';
        this.codeErr = '';
      }
      this.codeFor = pkg;
      if (!this.codeInput) {
        this.codeInput = shortCodeForPackage(pkg) ?? knownLauncherSource(pkg) ?? '';
        prefilled = !!this.codeInput;
      }
    }
    this.codeRoad = on;
    // Το μονοπάτι πρέπει πρώτα να ζωγραφιστεί για να έχει πού να πάει το ring· μετά λύνουμε.
    if (prefilled) setTimeout(() => void this.resolveAppCode(), 0);
  }
  /**
   * ΤΟ ΠΛΗΚΤΡΟΛΟΓΙΟ ΤΗΣ ΤΗΛΕΟΡΑΣΗΣ ΚΑΛΥΠΤΕΙ ΤΟ ΠΕΔΙΟ (Jim, 3/10/2026, με φωτογραφία: το IME
   * πιάνει το κάτω μισό της οθόνης και το κουτάκι μένει από κάτω του). Σε Android TV το πεδίο
   * δεν μπορεί να γράφεται ΕΠΙΤΟΠΟΥ: ο άνθρωπος δεν βλέπει τι πληκτρολογεί.
   *
   * Η λύση του Jim, που είναι και ο κανόνας μας για TV ([[tv-long-lists-use-dialog]]): το πεδίο
   * ΔΕΝ γράφεται — δείχνει. Από κάτω τέσσερα κουμπιά με ring: Κωδικός (διάλογος με αριθμητικό
   * πληκτρολόγιο), URL (διάλογος με κανονικό), Επικόλληση, Καθαρισμός. Ο διάλογος κάθεται ΨΗΛΑ,
   * ώστε το πληκτρολόγιο του συστήματος να μην τον σκεπάζει.
   */
  codeAsk = $state<null | 'code' | 'url'>(null);
  codeAskValue = $state('');
  codePasteErr = $state('');

  /** Ο κωδικός Downloader ΤΗΣ ΓΡΑΜΜΗΣ (δικός μας ή γνωστού launcher) — μόνο ψηφία, αλλιώς κενό. */
  private get rowCode(): string {
    const pkg = this.appRow?.package ?? '';
    const src = shortCodeForPackage(pkg) ?? knownLauncherSource(pkg) ?? '';
    return isShortCode(src) ? src : '';
  }
  openCodeAsk(kind: 'code' | 'url') {
    this.codePasteErr = '';
    // Ξεκινά από ό,τι υπάρχει ΗΔΗ, αλλά μόνο αν ταιριάζει στο είδος: ένα URL μέσα σε αριθμητικό
    // πληκτρολόγιο δεν διορθώνεται, μόνο ενοχλεί. Αν δεν ταιριάζει, ο ΚΩΔΙΚΟΣ ΤΗΣ ΓΡΑΜΜΗΣ (Jim,
    // 10/10/2026: «πρέπει να τον έχεις όταν ανοίγω το code dialog, π.χ. 5530657»).
    const cur = this.codeInput.trim();
    const fits = kind === 'code' ? isShortCode(cur) : !isShortCode(cur);
    this.codeAskValue = fits ? cur : kind === 'code' ? this.rowCode : '';
    this.codeAsk = kind;
  }
  /**
   * ΤΟ «DONE» ΔΕΝ ΣΒΗΝΕΙ ΤΗΝ ΑΠΑΝΤΗΣΗ (Jim, 10/10/2026, Projectivy: ο κωδικός ήταν στο πεδίο αλλά το
   * «Download and install» είχε χαθεί). Πριν, κάθε Done — ακόμη και με τον ΙΔΙΟ κωδικό — γύριζε το
   * πεδίο σε «άλυτο» και το κουμπί σε «Βρες το αρχείο». Τώρα: ίδιο κείμενο → μένει όπως ήταν· άλλο
   * κείμενο → λύνεται ΑΜΕΣΩΣ, ώστε το επόμενο πάτημα να είναι πάντα το κατέβασμα.
   */
  commitCodeAsk() {
    const v = this.codeAskValue.trim();
    this.codeAsk = null;
    if (!v) return;
    if (v === this.codeInput.trim() && (this.codeState === 'ready' || this.codeState === 'page' || this.codeState === 'resolving')) return;
    this.setCodeInput(v);
    void this.resolveAppCode();
  }
  cancelCodeAsk() {
    this.codeAsk = null;
  }
  /** Ό,τι έχει το πρόχειρο. Κενό πρόχειρο το λέει, αντί να μοιάζει ότι δεν πατήθηκε τίποτα. */
  async pasteCode() {
    this.codePasteErr = '';
    const v = (await this.paste()).trim();
    if (!v) {
      this.codePasteErr = this.t('ka_cPasteEmpty');
      return;
    }
    this.setCodeInput(v);
    void this.resolveAppCode();
  }
  clearCode() {
    this.codePasteErr = '';
    this.setCodeInput('');
  }

  setCodeInput(v: string) {
    this.codeInput = v;
    this.codeFor = this.appRow?.package ?? '';
    // Κάθε πληκτρολόγηση ακυρώνει την προηγούμενη απάντηση: ένα «έτοιμο» δίπλα σε αλλαγμένο
    // κουτάκι θα κατέβαζε άλλο αρχείο από αυτό που διαβάζει ο άνθρωπος.
    this.codeState = 'idle';
    this.codeUrl = '';
    this.codeErr = '';
  }
  /** Το κουμπί κατεβάζει μόνο όταν έχουμε ΑΡΧΕΙΟ — όχι σελίδα, όχι μισολυμένο. */
  get codeReady(): boolean {
    return this.codeState === 'ready' && !!this.codeUrl;
  }

  /**
   * Ψηφία → κωδικός· ό,τι αρχίζει με http → διεύθυνση. Ο ίδιος διαχωρισμός με τον Downloader TV:
   * δεν ρωτάμε ΠΟΤΕ «κωδικός ή σύνδεσμος;» — φαίνεται από το ίδιο το κείμενο.
   */
  async resolveAppCode() {
    const typed = this.codeInput.trim();
    if (!typed || this.codeState === 'resolving') return;
    this.codeErr = '';
    this.codeUrl = '';

    // ΔΙΕΥΘΥΝΣΗ: καμία κλήση, καμία επαλήθευση ονόματος. Αν τα bytes δεν είναι APK το λέει το ίδιο
    // το box («δεν είναι έγκυρο APK») — καλύτερα από δικό μας μάντεμα πάνω σε κατάληξη, γιατί
    // πλήθος αληθινών συνδέσμων λήψης δεν τελειώνουν σε `.apk`.
    if (!isShortCode(typed)) {
      if (!isDownloadableUrl(typed)) {
        this.codeState = 'error';
        this.codeErr = this.t('ka_cBadInput');
        return;
      }
      this.codeState = 'ready';
      this.codeUrl = typed;
      this.log('info', `apk source: ${typed}`);
      // Μετά το κλείσιμο του διαλόγου (εκείνος γυρνά το focus στο κουμπί που τον άνοιξε, σε setTimeout 0).
      setTimeout(() => ringTo('primary'), 120);
      return;
    }

    this.codeState = 'resolving';
    this.log('cmd', `$ short code ${typed} · ${isOurShortCode(typed) ? 'Smartago' : 'AFTVnews'}`);
    const r = await resolveShortCode(typed, (url) => this.hooks.getJson(url));
    if (!r.ok) {
      this.codeState = 'error';
      // «Δεν υπάρχει» και «δεν απάντησε κανείς» είναι διαφορετικά προβλήματα με διαφορετική
      // επόμενη κίνηση: έλεγξε τα ψηφία vs έλεγξε το δίκτυο.
      this.codeErr =
        r.reason === 'unreachable'
          ? this.t('ka_cUnreachable')
          : r.reason === 'invalid'
            ? this.t('ka_cBadInput')
            : this.t('ka_cNotFound', { code: typed });
      // ΤΟ ΙΔΙΟ ΠΟΥ ΚΑΝΕΙ Ο DOWNLOADER TV ΟΤΑΝ Ο SERVER ΔΕΝ ΞΕΡΕΙ ΤΟΝ ΚΩΔΙΚΟ: πέφτει στη σελίδα
      // του AFTVnews και αφήνει τον άνθρωπο να περπατήσει την ανακατεύθυνση. Εκείνος έχει δικό του
      // browser μέσα στην εφαρμογή· εμείς δεν έχουμε, οπότε δίνουμε τη διεύθυνση ως σύνδεσμο που
      // ανοίγει ΕΞΩ — και από εκεί γυρίζει η απευθείας διεύθυνση του .apk.
      if (r.reason === 'notfound' && !isOurShortCode(typed)) {
        this.codeUrl = aftvPage(typed);
        ringTo('ka-url-link'); // the way out of «not found» is that page
      }
      this.log('warn', `short code ${typed}: ${r.reason}`);
      return;
    }
    this.codeUrl = r.url;
    // ΣΕΛΙΔΑ, ΟΧΙ ΑΡΧΕΙΟ: ο κωδικός λύθηκε σωστά, απλώς δείχνει κάπου που διαλέγει ΑΝΘΡΩΠΟΣ. Το
    // λέμε και δίνουμε τη διεύθυνση γραμμένη, ώστε να ανοιχτεί αλλού και να γυρίσει το απευθείας.
    this.codeState = looksLikeApk(r.url) ? 'ready' : 'page';
    this.log('info', `short code ${typed} → ${r.url}${this.codeState === 'page' ? ' (page)' : ''}`);
    // ΤΟ RING ΠΑΕΙ ΣΤΟ ΕΠΟΜΕΝΟ ΛΟΓΙΚΟ ΠΑΤΗΜΑ (Jim, 9/10, emulator: μετά το «Βρες το αρχείο» το
    // ring πήδηξε στην κάρτα του Google Play). Αρχείο → το χρυσό κουμπί που το κατεβάζει·
    // σελίδα → η διεύθυνση, που με OK ανοίγει στον browser του box, αν έχει.
    ringTo(this.codeState === 'page' ? 'ka-url-link' : 'primary');
  }

  /** «Κατέβασε και εγκατάστησε»: από εδώ και κάτω είναι ο δρόμος του APK, ίδιος. */
  async installFromCode() {
    if (!this.codeReady) return;
    this.userInitiated++;
    try {
      await this.installApkFrom(this.codeUrl);
    } finally {
      this.userInitiated--;
    }
  }

  get kioskCta(): { kind: 'install' | 'play' | 'recheck' | 'retry' | 'lock' | 'account' | 'pick' | 'app'; label: string; sub: string; blocked?: boolean } | null {
    const r = this.kioskRow;
    if (!r) return { kind: 'pick', label: this.t('wk_ctaPick'), sub: this.t('wk_pickFirst') };
    const lockHere = !!r.family; // the device owner is OUR app: only ours can be locked here
    // The lock cannot start while a Google account is on the box. We open Accounts on the TV; the
    // person removes it with the remote; then the button reads the box again.
    if (lockHere && this.kioskAccounts > 0) {
      if (this.accountsSent) return { kind: 'recheck', label: this.t('wl_ctaRecheck'), sub: this.t('wk_subRecheckAcc') };
      return { kind: 'account', label: this.t('wk_ctaAcc'), sub: this.t('wk_nAcc') };
    }
    // The app has a screen of its own — so this button's only job is to open it. It must NOT
    // inherit the blocks of the old inline road: a box without Google Play used to end here on a
    // dead button, when that is exactly the case the APK road on the next screen was made for.
    if (this.appScreen) return { kind: 'app', label: this.t('wk_ctaNext', { app: r.name }), sub: this.t(r.installed ? 'ka_subHave' : 'ka_subGet', { app: r.name }) };
    // The line under the button says what THIS press does: the lock only where this edition locks.
    const note = lockHere ? this.t('wk_nOurs') : this.t('wk_nThird');
    if (r.id === 'custom' && !r.component) {
      return { kind: 'lock', label: this.t('wk_ctaLock'), sub: this.t(r.installed ? 'wk_customNoHome' : 'wk_customMissing', { pkg: r.package }), blocked: true };
    }
    if (r.current && lockHere && this.kioskLocked) return { kind: 'lock', label: this.t('wk_ctaLockX', { app: r.name }), sub: this.t('wk_subLockedAlready'), blocked: true };
    // Ours: the next screens ask where the box goes and what goes on it; the lock runs from there.
    if (r.family && (r.installed || (this.canDirectInstall && this.hotelApkKnown))) return { kind: r.installed ? 'lock' : 'install', label: this.t(this.unlockDone ? 'wk_ctaRelock' : 'wk_ctaNext', { app: r.name }), sub: note };
    if (r.installed) return { kind: 'lock', label: lockHere ? this.t('wk_ctaLockX', { app: r.name }) : this.t('wl_ctaSet', { app: r.name }), sub: note };
    // Its Play page is open on the TV: the only move left is to read the box again.
    if (this.launcherSent === r.package) return { kind: 'recheck', label: this.t('wl_ctaRecheck'), sub: this.t('wl_subRecheck') };
    // Ours is fetched by us — from OUR manifest — wherever a download is allowed at all, and only
    // when that manifest actually lists the APK (`hotelApkKnown`): a promise the press can keep.
    if (r.family && this.canDirectInstall && this.hotelApkKnown) return { kind: 'install', label: lockHere ? this.t('wk_ctaInstall', { app: r.name }) : this.t('wl_ctaInstall', { app: r.name }), sub: [this.t('wl_subVerified'), note].join(' · ') };
    // Where we may install, ours comes from OUR list — and if the list did not arrive, the honest
    // answer is exactly that, with a button that tries again (not a Play badge under an app we
    // fetch ourselves: Jim, 25/9, saw "Get it on Google Play — Hotel TV Launcher" on the sideload
    // edition and it was a promise nothing could keep there).
    if (r.family) {
      const url = hotelTarget().manifestUrl.replace(/^https:\/\//, '');
      // `undefined` = the list is still on its way (the screen asks for it as it opens); `null` = it
      // came back empty-handed. A button that says "try again" while nobody has tried yet is noise.
      if (this.canDirectInstall && this.hotelManifest === undefined) return { kind: 'retry', label: this.t('wk_ctaWaitList'), sub: this.t('wk_waitList', { url }), blocked: true };
      if (this.canDirectInstall) return { kind: 'retry', label: this.t('wk_ctaRetry'), sub: this.t('wk_noList', { url }) };
      // …AND IN THE GOOGLE PLAY EDITION IT GOES THROUGH PLAY, like any other launcher. This branch
      // used to say "{app} is not on Google Play" and block: true — written on the morning of 25/9,
      // hours before Hotel TV went LIVE on Play the same day. Since then the Play copy answered a
      // reviewer who pressed "Kiosk" on a clean box with a dead end, about an app that is one
      // remote press away on the television itself.
      if (this.check && !this.check.hasPlay) return { kind: 'play', label: this.t('wl_ctaPlay', { app: r.name }), sub: this.t('wl_subNoPlay', { app: r.name }), blocked: true };
      return { kind: 'play', label: this.t('wl_ctaPlay', { app: r.name }), sub: this.t('wl_subPlay') };
    }
    if (this.check && !this.check.hasPlay) return { kind: 'play', label: this.t('wl_ctaPlay', { app: r.name }), sub: this.t('wl_subNoPlay', { app: r.name }), blocked: true };
    return { kind: 'play', label: this.t('wl_ctaPlay', { app: r.name }), sub: this.t('wl_subPlay') };
  }
  /** Does a manifest we can read list the hotel launcher's APK? The hotel target's own manifest always does. */
  get hotelApkKnown(): boolean {
    const hotel = hotelTarget();
    if (hotel.launcherPackage === this.launcherPkg) return true;
    return !!this.hotelManifest?.apps.some((a) => a.pkg === hotel.launcherPackage);
  }
  /** Read the hotel launcher's manifest once, so the button knows whether "Install" is a promise it can keep. */
  async loadHotelManifest(): Promise<void> {
    const hotel = hotelTarget();
    void this.loadHotelListApps();
    if (hotel.launcherPackage === this.launcherPkg || this.hotelManifest !== undefined) return;
    try {
      this.hotelManifest = validateManifest(await (await fetch(hotel.manifestUrl)).json());
      if (!this.hotelApkKnown) this.log('info', `${hotel.launcherName}: no APK in ${hotel.manifestUrl} yet — its row opens Play`);
    } catch (e) {
      this.hotelManifest = null;
      this.log('warn', `hotel manifest: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  /**
   * Η λίστα του admin, μία φορά ανά συνεδρία, στη γλώσσα του εργαλείου (ο server πέφτει στο US).
   * Περνά από το `getJson` του host: στο Android app αυτό είναι ο CapacitorHttp, όχι το WebView.
   * Ό,τι πετιέται, πετιέται ΜΕ ΛΟΓΟ στην κονσόλα — ποτέ σιωπηλά.
   */
  async loadHotelListApps(): Promise<void> {
    if (this.hotelListApps !== undefined) return;
    this.hotelListApps = null;
    const url = hotelAppsListUrl(this.i18n.lang);
    try {
      const res = (await this.hooks.getJson(url)) as { data?: unknown };
      const rows = Array.isArray(res?.data) ? (res.data as Parameters<typeof appsFromList>[0]) : [];
      const { apps, rejected } = appsFromList(rows);
      for (const why of rejected) this.log('warn', `apps list: ${why}`);
      this.hotelListApps = apps;
      this.log('info', `apps list: ${apps.length} app(s) from the admin list${rejected.length ? `, ${rejected.length} rejected` : ''}`);
    } catch (e) {
      this.log('warn', `apps list: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  /** Open the Accounts screen on the TV, so the Google account can be removed with the remote. */
  async openAccountsOnTv() {
    if (!this.engine) {
      this.launcherError = this.t('wl_noBox');
      return;
    }
    this.launcherError = null;
    const r = await this.execAs(ACCOUNTS_INTENT);
    if (!r?.ran || /Error|unable to resolve/i.test(r.output)) {
      this.launcherError = this.t('wk_accFailed');
      return;
    }
    this.accountsSent = true;
    this.log('ok', 'Accounts is open on the TV — remove the Google account, then read the box again');
  }
  async runKioskCta() {
    const c = this.kioskCta;
    const r = this.kioskRow;
    if (!c || this.launcherBusy || c.blocked) return;
    if (c.kind === 'pick') return;
    if (c.kind === 'account') return void this.openAccountsOnTv();
    if (c.kind === 'recheck') {
      this.accountsSent = false;
      return void this.recheckLaunchers();
    }
    // The list is fetched once and remembered; a retry has to forget the failure first.
    if (c.kind === 'retry') {
      this.hotelManifest = undefined;
      this.launcherError = null;
      return void this.loadHotelManifest().then(() => {
        if (!this.hotelApkKnown) this.launcherError = this.t('wk_noList', { url: hotelTarget().manifestUrl.replace(/^https:\/\//, '') });
      });
    }
    if (!r) return;
    if (!this.engine) {
      this.launcherError = this.t('wl_noBox');
      return;
    }
    this.launcherError = null;
    // The app gets a screen of its own first (third party always, ours in the Play copy): what
    // is on the box, what will run, and — when it is not there — how it gets there.
    if (c.kind === 'app' || this.appScreen) {
      this.kioskAppError = null;
      this.kioskWaiting = false;
      return this.goStep(W.kioskApp);
    }
    if (c.kind === 'play') return void this.openOnBox(r);
    // Ours: two questions first (where it goes, what goes on it). The Install screen runs the lock.
    if (r.family) return this.goStep(W.use);
    this.launcherBusy = true;
    this.userInitiated++;
    try {
      this.stageText = this.t('wl_stageHome');
      const ok = await this.runTask('launcher', this.ctx, this.brand.homeMethods[0]);
      if (!ok) throw new Error(this.t('wl_homeFailed'));
      // Ours gets every permission its wizard would ask for, by adb, in EVERY edition — the hotel
      // launcher's wizard asks for all of them, and after this it has nothing left to ask (Jim,
      // 24/9). The context names the HOTEL brand: `{pkg}`, `{notif}`, `{acs}` are its. Idempotent,
      // so it runs whether the app was just installed or was already there.
      if (r.family) {
        this.stageText = this.t('wl_stageGrant');
        await this.runTask('configure', { ...this.ctx, brand: hotelTarget(), profile: 'open', homeTarget: undefined });
      }
      this.finishKioskTask(r.name);
    } catch (e) {
      this.launcherError = e instanceof Error ? e.message : String(e);
      this.log('err', this.launcherError);
    } finally {
      this.userInitiated--;
      this.launcherBusy = false;
      this.stageText = null;
      this.installPhase = null;
    }
  }

  /**
   * The app screen's one button. Four answers, in the order the road takes them:
   *   \u00b7 it is not there and no file is picked \u2192 open its page on the television's Play
   *   \u00b7 a file is picked \u2192 install it from here
   *   \u00b7 it is there and it is ours \u2192 on to the two questions (where it goes, what goes on it)
   *   \u00b7 it is there and it is somebody else's \u2192 set it as HOME, which is all we honestly do
   */
  get kioskAppCta(): { kind: 'play' | 'search' | 'apk' | 'boxapk' | 'file' | 'next' | 'home' | 'recheck' | 'wait' | 'code' | 'getcode'; label: string; sub: string; blocked?: boolean } {
    const r = this.appRow;
    if (!r) return { kind: 'play', label: this.t('wk_ctaPick'), sub: '', blocked: true };
    // Ο ΔΡΟΜΟΣ ΤΟΥ ΚΩΔΙΚΟΥ ΠΡΟΗΓΕΙΤΑΙ ΟΛΩΝ ΟΣΟ ΕΙΝΑΙ ΔΙΑΛΕΓΜΕΝΟΣ: μία κάρτα, δύο ενέργειες —
    // πρώτα «βρες το αρχείο», μετά «κατέβασέ το». Το ίδιο κουμπί, γιατί η δεύτερη δεν έχει νόημα
    // πριν την πρώτη και δύο χρυσά κουμπιά σε μία οθόνη δεν υπάρχουν πουθενά αλλού στο εργαλείο.
    if (this.codeRoad && (r.kind === 'ask' || !r.installed)) {
      // ΕΝΑ ΠΑΤΗΜΑ, ΟΠΩΣ ΣΤΟ PLUI (Jim, 10/10/2026): γνωστός launcher → εγκατάσταση ΚΑΙ HOME μαζί.
      if (this.codeReady && r.kind !== 'ask' && !r.family) return { kind: 'code', label: this.t('wl_ctaInstall', { app: r.name }), sub: this.t('wl_subSet'), blocked: this.kioskApkBusy };
      if (this.codeReady) return { kind: 'code', label: this.t('ka_ctaCode'), sub: this.t('ka_noteCode'), blocked: this.kioskApkBusy };
      return {
        kind: 'getcode',
        label: this.t(this.codeState === 'resolving' ? 'ka_ctaCodeBusy' : 'ka_ctaFind'),
        sub: this.t('ka_noteFind'),
        blocked: !this.codeInput.trim() || this.codeState === 'resolving',
      };
    }
    // Not on Google Play: the code road is the road; a closed one only waits for its address.
    if (r.kind === 'known' && r.play === false && !r.installed) {
      return { kind: 'getcode', label: this.t('ka_ctaFind'), sub: this.t('ka_noteFind'), blocked: !this.codeInput.trim() };
    }
    // "Another launcher": three roads, and the button follows the one that is chosen. The APK is
    // first in the order that matters, because it is the likeliest thing to be in hand.
    if (r.kind === 'ask') {
      if (this.boxApkPick) return { kind: 'boxapk', label: this.t('ka_ctaBox'), sub: this.t('ka_noteBox'), blocked: this.boxApkBusy };
      if (this.kioskApkName) return { kind: 'apk', label: this.t('ka_ctaApk'), sub: this.t('ka_noteApk'), blocked: this.kioskApkBusy };
      if (this.pickInstalled) return { kind: 'home', label: this.t('wl_ctaAsk'), sub: this.t('wl_subAsk') };
      if (this.searchSent) return { kind: 'recheck', label: this.t('wl_ctaRecheck'), sub: this.t('ka_afterSearch') };
      if (this.check && !this.check.hasPlay) {
        if (this.canPickApk) return { kind: 'file', label: this.t('ka_ctaFile'), sub: this.t('ka_noteFile') };
        return { kind: 'search', label: this.t('ka_ctaSearch'), sub: this.t('ka_noPlayAny'), blocked: true };
      }
      return { kind: 'search', label: this.t('ka_ctaSearch'), sub: this.t('ka_noteSearch') };
    }
    if (!r.installed) {
      if (this.boxApkPick) return { kind: 'boxapk', label: this.t('ka_ctaBox'), sub: this.t('ka_noteBox'), blocked: this.boxApkBusy };
      if (this.kioskApkName) return { kind: 'apk', label: this.t('ka_ctaApk'), sub: this.t('ka_noteApk'), blocked: this.kioskApkBusy };
      if (this.kioskWaiting) return { kind: 'wait', label: this.t('ka_ctaWaiting'), sub: this.t('ka_pressInstall'), blocked: true };
      // A box with no Google Play has ONE road, so the gold button IS that road: it opens the
      // file picker instead of offering to open a page that cannot open (seen on the mock's
      // Xiaomi box, 29/9). Where this copy may not install at all (Google Play edition) the card
      // above is not drawn either, and the honest answer stays the one below.
      if (this.canPickApk && this.check && !this.check.hasPlay) return { kind: 'file', label: this.t('ka_ctaFile'), sub: this.t('ka_noteFile') };
      // No Play on the box AND no download allowed (the Google Play edition): there is no road we
      // can honestly offer, so the button says it instead of opening nothing on the television.
      if (this.check && !this.check.hasPlay) return { kind: 'play', label: this.t('ka_ctaPlay'), sub: this.t('wl_subNoPlay', { app: r.name }), blocked: true };
      return { kind: 'play', label: this.t('ka_ctaPlay'), sub: this.t('ka_notePlay') };
    }
    if (r.family) return { kind: 'next', label: this.t('wk_ctaNext', { app: r.name }), sub: this.t('wk_nOurs') };
    // "we set it as HOME and nothing more" is the kiosk door's promise; on the launcher door the
    // line under the button is the launcher one, because no lock was ever on the table there.
    return { kind: 'home', label: this.t('wl_ctaSet', { app: r.name }), sub: this.t(this.hubTask === 'kiosk' ? 'wk_nThird' : 'wl_subSet') };
  }
  async runKioskAppCta() {
    const c = this.kioskAppCta;
    if (c.blocked || this.launcherBusy) return;
    // 'file' is the screen's own job — the picker lives in the component, not in the session.
    if (c.kind === 'file') return;
    if (c.kind === 'search') return void this.openPlaySearch();
    if (c.kind === 'recheck') {
      this.searchSent = false;
      return void this.recheckLaunchers();
    }
    if (c.kind === 'play') return void this.openKioskPlay();
    if (c.kind === 'getcode') return void this.resolveAppCode();
    if (c.kind === 'code') return void this.installFromCode();
    if (c.kind === 'apk') return void this.installKioskApk();
    if (c.kind === 'boxapk') return void this.installBoxApk();
    if (c.kind === 'next') return this.goStep(W.use);
    return this.setHomeForAppRow();
  }
  /** Ο launcher της γραμμής γίνεται HOME με εντολή (σιωπηλά, όπως ο δικός μας) και η οθόνη κλείνει. */
  private async setHomeForAppRow() {
    // somebody else's app: the one command we run, and the report says so
    let r = this.appRow;
    if (!r || !this.engine) return;
    // ΧΩΡΙΣ COMPONENT ΔΕΝ ΤΡΕΧΕΙ ΤΙΠΟΤΑ (μετρήθηκε 10/10/2026 στο mock): το `ctx` ορίζει `homeTarget`
    // μόνο όταν η γραμμή ξέρει το component της, αλλιώς η εντολή πέφτει στον ΔΙΚΟ ΜΑΣ launcher — και
    // ο άνθρωπος που διάλεξε Projectivy θα έβλεπε `set-home-activity com.premium.tv.launcher.ui/…`.
    // Ξαναδιαβάζουμε το box μία φορά· αν ακόμη δεν φαίνεται ως εφαρμογή αρχικής, το λέμε.
    if (r.kind !== 'ask' && !r.family && !r.component) {
      await this.recheckLaunchers();
      r = this.appRow;
      if (!r || !r.component) {
        this.kioskAppError = this.t('wl_homeFailed');
        this.log('err', `${r?.package ?? '?'}: not listed as a HOME app — nothing was set`);
        return;
      }
    }
    this.launcherBusy = true;
    this.userInitiated++;
    try {
      // "Another launcher" ends in the television's own chooser, which is a different wait.
      this.stageText = this.t(r.kind === 'ask' ? 'wl_stageAskTv' : 'wl_stageHome');
      const ok = await this.runTask('launcher', this.ctx, this.brand.homeMethods[0]);
      if (!ok) throw new Error(this.t('wl_homeFailed'));
      // The kiosk door hands over to the automatic run; the launcher door shows the verdict and
      // the way back to Tasks. Same command, two endings — the one the road asked for.
      if (this.hubTask === 'kiosk') this.finishKioskTask(r.name);
      else {
        // Η ετυμηγορία «Έγινε — το HOME ανοίγει πλέον τον X» ζει στη λίστα των launcher, όπως στο
        // PLUI: εκεί γυρνάμε, αντί να μείνει η οθόνη της εφαρμογής με ένα κουμπί που δεν έχει πια δουλειά.
        // ΠΡΩΤΑ η μετάβαση, ΜΕΤΑ η ετυμηγορία: η είσοδος στη λίστα σβήνει το `launcherDone`.
        if (this.step !== this.appHome) this.goStep(this.appHome);
        this.finishLauncherTask(r.name);
        // Το ring στο «Πίσω στις εργασίες» της ετυμηγορίας — αλλιώς η νέα οθόνη ανοίγει χωρίς στόχο.
        setTimeout(() => ringTo('primary'), 120);
      }
    } catch (e) {
      this.kioskAppError = this.whyNotInstalled(e instanceof Error ? e.message : String(e));
      this.log('err', this.kioskAppError);
    } finally {
      this.userInitiated--;
      this.launcherBusy = false;
      this.stageText = null;
    }
  }

  /** The Hotel TV road: the kiosk door with OUR launcher picked, in any edition. */
  get onHotelRoad(): boolean {
    return this.hubTask === 'kiosk' && !!this.kioskRow?.family;
  }
  /** The download list the Install screen offers: the hotel manifest (the hotel target's). */
  get hotelApps(): UiApp[] {
    const m = hotelTarget().launcherPackage === this.launcherPkg ? this.manifest : this.hotelManifest;
    const own = (m?.apps ?? []) as UiApp[];
    // ΔΥΟ ΠΗΓΕΣ, ΜΙΑ ΛΙΣΤΑ (HOTELTV_INCLUDE_APPS_STUDY §2): ο launcher από το manifest, τα υπόλοιπα
    // από τον admin. Σε διπλό pkg νικά το manifest — έχει sha256 και versionCode μετρημένα από το
    // αρχείο. Το `use` της γραμμής κρύβει το app από χρήσεις που δεν το αφορούν.
    const have = new Set(own.map((a) => a.pkg));
    const extra = (this.hotelListApps ?? []).filter((a) => !have.has(a.pkg) && (!a.use.length || a.use.includes(this.hotelUse)));
    return [...own, ...extra];
  }
  /** The apps the chosen install type puts on the box. */
  get installApps(): UiApp[] {
    if (!this.installPick) return appsForType(this.hotelApps, this.installType);
    const pick = new Set(this.installPick);
    return this.hotelApps.filter((a) => a.required || pick.has(a.pkg));
  }
  /** A type is a preset: picking one drops the ticks made by hand. */
  chooseInstallType(t: InstallType) {
    this.installType = t;
    this.installPick = null;
  }
  /** Tick / untick one app. The launcher (required) stays. */
  toggleInstallApp(pkg: string) {
    const a = this.hotelApps.find((x) => x.pkg === pkg);
    if (!a || a.required) return;
    const now = new Set(this.installApps.map((x) => x.pkg));
    if (now.has(pkg)) now.delete(pkg);
    else now.add(pkg);
    this.installPick = [...now];
  }
  setResellerId(v: string) {
    this.resellerId = v;
    writeStored('tvlm.resellerId', v.trim());
  }
  /** The chip in the header on the Hotel TV screens: the app, and on Install the use too. */
  get hotelChip(): string | null {
    if (!this.onHotelRoad || (this.step !== W.use && this.step !== W.install)) return null;
    return this.step === W.use ? 'Hotel TV Launcher' : this.t(`hi_chip_${this.hotelUse}` as StrKey);
  }
  /** "3 apps · 65 MB" for a type — from the manifest's own sizes ("38 MB"). */
  installStat(type: InstallType): { n: number; mb: number } {
    const apps = appsForType(this.hotelApps, type);
    return { n: apps.length, mb: apps.reduce((t, a) => t + (parseFloat(a.size ?? '') || 0), 0) };
  }
  /**
   * What travels with PROVISION for the hotel app: the use and the settings of the Install screen.
   * The app reads what it knows (hotel session, HOTELTV_KIOSK_HANDOFF §7); Android ignores the rest.
   */
  get hotelExtras(): string {
    const w = this.hotelSw;
    return (
      ` --es use ${this.hotelUse}` +
      (this.hotelUse === 'hotel' ? ` --es where ${this.hotelWhere}` : '') +
      ` --ez adult ${w.adult} --es updates ${w.updates ? '03:00' : 'off'} --ez cec ${w.cec} --ei volMax ${w.volume ? 80 : 100}` +
      (this.hotelUse === 'reseller' && this.resellerId.trim() ? ` --es reseller ${this.resellerId.trim().replace(/[^\w-]/g, '')}` : '') +
      (this.hotelUse !== 'reseller' && /^\d{4,8}$/.test(this.adminPin) ? ` --es adminPin ${this.adminPin}` : '')
    );
  }
  /** The Install screen's gold button. */
  get installCta(): { label: string; sub: string; blocked?: boolean } {
    const n = this.installApps.length;
    const type = this.t(`hi_t_${this.installType}` as StrKey);
    if (!this.hotelApps.length) return { label: this.t('hi_ctaNone'), sub: this.t('hi_noList'), blocked: true };
    const missing = this.installApps.filter((a) => !this.check?.installedPackages.includes(a.pkg));
    if (missing.length && !this.canDirectInstall) return { label: this.t('hi_ctaNone'), sub: this.t('hi_playEd', { apps: missing.map((a) => a.name).join(', ') }), blocked: true };
    return { label: this.t(n === 1 ? 'hi_cta1' : 'hi_cta', { type, n: String(n) }), sub: this.t('hi_ctaSub') };
  }
  /**
   * The Install screen's press: the apps of the chosen type the box does not have, then the lock
   * (the automatic run: Device Owner, PROVISION with the settings, HOME, grants, tests).
   */
  async runHotelInstall() {
    const r = this.kioskRow;
    if (!r?.family || this.launcherBusy || this.installCta.blocked) return;
    if (!this.engine) {
      this.launcherError = this.t('wl_noBox');
      return;
    }
    this.launcherError = null;
    this.launcherBusy = true;
    this.userInitiated++;
    try {
      const have = new Set(this.check?.installedPackages ?? []);
      const todo = this.installApps.map((a) => a.pkg).filter((p) => !have.has(p));
      if (todo.length) {
        this.stageText = this.t('wl_stageInstall');
        await this.installHotelApps(todo);
        this.stageText = this.t('wl_stageRead');
        await this.startCheck();
      }
      this.finishKioskTask(r.name);
    } catch (e) {
      this.launcherError = e instanceof Error ? e.message : String(e);
      this.log('err', this.launcherError);
    } finally {
      this.userInitiated--;
      this.launcherBusy = false;
      this.stageText = null;
      this.installPhase = null;
    }
  }
  /** Install these packages from the hotel manifest (the hotel target's). */
  private async installHotelApps(pkgs: string[]) {
    const hotel = hotelTarget();
    const m = hotel.launcherPackage === this.launcherPkg ? await this.loadManifest() : (await this.loadHotelManifest(), this.hotelManifest);
    if (!m) throw new Error(this.manifestError ?? `could not read ${hotel.manifestUrl}`);
    this.lastEngineError = null;
    // ΕΝΑ manifest για τη μηχανή: το δικό του, συν ό,τι ζητήθηκε από τη λίστα του admin. Δεν περνά
    // από validateManifest — εκείνο ζητά sha256 για ΟΛΑ, ενώ τι σημαίνει «χωρίς digest» το κρίνει η
    // ίδια η μηχανή (ours over HTTPS → εγκατάσταση, ξένο → άρνηση).
    const fromList = this.hotelApps.filter((a) => (a as Partial<ListApp>).fromList && pkgs.includes(a.pkg) && !m.apps.some((x) => x.pkg === a.pkg));
    const merged: Manifest = fromList.length ? { ...m, apps: [...m.apps, ...fromList] } : m;
    const ok = await this.engine!.install(merged, this.role, { only: pkgs });
    if (!ok) throw new Error(this.lastEngineError ?? 'install failed');
    this.log('ok', `installed: ${pkgs.join(', ')}`);
  }
  /**
   * HOME is set. An edition that locks goes on to the lock — the automatic run (device owner,
   * persistent home, PIN) with the picked app as its home. The home road stops here with the
   * verdict and the door to the edition that locks.
   */
  private finishKioskTask(app: string) {
    this.homeSet = true;
    if (this.lockHere) {
      this.openWs('auto');
      // a task opened from the hub stands on its own: no sidebar, one way back
      this.taskOnly = this.brand.flow !== 'kiosk';
      this.after(600, () => void this.startAuto());
      return;
    }
    this.kioskDone = app;
    this.log('ok', `HOME now opens ${app} — the lock is the hotel launcher's job`);
  }
  /** A page that explains the lock, when the brand names one (none since 27/9/2026: the one tool locks). */
  get kioskLink(): string | null {
    return this.brand.taskLinks.kiosk ?? null;
  }
  async loadKioskIcons() {
    if (!this.selfTarget || !this.hooks.appIcons) return;
    const want = this.kioskList.filter((r) => r.installed && r.package).map((r) => r.package);
    const missing = want.filter((p) => !this.launcherIcons[p]);
    if (!missing.length) return;
    try {
      const got = await this.hooks.appIcons(missing);
      if (Object.keys(got).length) this.launcherIcons = { ...this.launcherIcons, ...got };
    } catch {
      // no icons, no problem: every row still has its letter tile
    }
  }
  /** Leave HOME exactly as it is — and keep the automatic run off it too (`keepHome`). */
  keepCurrentLauncher() {
    this.launcherPick = null;
    this.keepHome = true;
    this.log('info', 'home: left as it is');
    this.backToTasks();
  }
  /** Ours, straight from the manifest — the same stream → install as every other app, no digest gate. */
  private async installOurLauncher() {
    // The manifest download is the first thing that touches the network, and on a box with no route
    // out it is also the first thing that fails, so the message it throws is the one the user reads.
    const m = await this.loadManifest();
    if (!m) throw new Error(this.manifestError ?? 'no manifest');
    this.lastEngineError = null;
    const ok = await this.engine!.install(m, this.role, { only: [this.launcherPkg] });
    if (!ok) throw new Error(this.lastEngineError ?? 'install failed');
    this.log('ok', `${this.brand.launcherName} installed`);
  }
  /**
   * ΞΑΝΑΒΑΛΕ ΤΟ ΔΙΚΟ ΜΑΣ APK, ΚΙ ΑΣ ΥΠΑΡΧΕΙ ΗΔΗ (Jim, 3/10/2026). Το χρυσό κουμπί δίνει «Όρισε ως
   * HOME» μόλις το δει εγκατεστημένο — σωστό για ξένο launcher, αλλά για τον ΔΙΚΟ μας σημαίνει ότι
   * δεν υπάρχει δρόμος να μπει νεότερο build, ούτε να ξαναγραφτεί ένα χαλασμένο.
   *
   * Είναι `install -r` από το manifest, με τον ίδιο έλεγχο SHA-256: ΜΟΝΟ ο δικός μας, και μόνο όπου
   * η έκδοση επιτρέπεται να εγκαθιστά απευθείας. Αν το κουτί έχει ΝΕΟΤΕΡΗ έκδοση, το `pm` το κόβει
   * («VERSION_DOWNGRADE») και το μήνυμά του φτάνει στην οθόνη αυτούσιο.
   */
  async reinstallOurs() {
    const r = this.launcherRow;
    if (!r?.ours || !r.installed || !this.canDirectInstall || this.launcherBusy || !this.engine) return;
    this.launcherError = null;
    this.launcherBusy = true;
    this.userInitiated++;
    try {
      this.stageText = this.t('wl_stageInstall');
      await this.installOurLauncher();
      this.stageText = this.t('wl_stageRead');
      await this.refreshCheck();
      this.log('ok', `reinstalled ${r.package}`);
    } catch (e) {
      this.launcherError = e instanceof Error ? e.message : String(e);
      this.log('err', this.launcherError);
    } finally {
      this.userInitiated--;
      this.launcherBusy = false;
      this.stageText = null;
      this.installPhase = null;
    }
  }
  /** Το κουμπί της επανεγκατάστασης βγαίνει μόνο όπου έχει νόημα: ο δικός μας, ήδη μέσα. */
  get canReinstallOurs(): boolean {
    const r = this.launcherRow;
    return !!r?.ours && r.installed && this.canDirectInstall && !!this.engine;
  }

  /** Read the box again after the user installed something on it with the remote. */
  async recheckLaunchers() {
    this.launcherSent = null;
    await this.startCheck();
    void this.loadLauncherIcons();
  }
  /**
   * The picker's icons, from the box itself — only when the box IS this device. A phone setting up
   * a TV across the room cannot see that TV's icons, and the alternatives (shipping the logos,
   * fetching them from a store) are the two things this picker must not do.
   */
  /**
   * The pictures that could go on a picker row, best first: what the BOX renders (the only copy
   * that is certainly that device's), then a file shipped with the tool — by PACKAGE first, so
   * "ours" is right in both brands, then by row id, which is how the design package names the
   * launchers it drew (projectivy.png, monet.png, at4k.png, ask.png). The row falls back to its
   * letter tile when none of them loads.
   */
  /**
   * An asset's ABSOLUTE url. For `<img src>` the relative `assetBase` is enough, but a `url()` that
   * travels through a CSS custom property is resolved against the STYLESHEET, not the page — so in a
   * built bundle `./brand/icons/x.svg` became `/assets/brand/icons/x.svg` and the mask silently drew
   * nothing (measured in the packaged app, 25/9). Resolved here, the URL is the same everywhere.
   */
  assetUrl(path: string): string {
    try {
      return new URL(this.assetBase + path, document.baseURI).href;
    } catch {
      return this.assetBase + path;
    }
  }
  launcherArt(row: LauncherRow): string[] {
    const base = `${this.assetBase}launchers/`;
    return [this.launcherIcons[row.package], row.package ? `${base}${row.package}.png` : '', `${base}${row.id}.png`].filter(Boolean) as string[];
  }
  async loadLauncherIcons() {
    if (!this.selfTarget || !this.hooks.appIcons) return;
    const want = this.launcherList.filter((r) => r.installed && r.package).map((r) => r.package);
    const missing = want.filter((p) => !this.launcherIcons[p]);
    if (!missing.length) return;
    try {
      const got = await this.hooks.appIcons(missing);
      if (Object.keys(got).length) this.launcherIcons = { ...this.launcherIcons, ...got };
    } catch {
      // no icons, no problem: every row still has its letter tile
    }
  }

  // ------------------------------------------------------------------ step 2: which box (TV only)
  pickTarget(t: Target) {
    this.target = t;
    this.log('info', t === 'self' ? 'target: this TV' : 'target: another box on the network');
    if (t === 'self') void this.readSelf();
    else {
      this.debug = null;
      // What the TV filled in belongs to the TV: for another box the question is the user's again.
      if (this.boxAuto) {
        this.box = null;
        this.boxAuto = false;
      }
    }
  }
  /**
   * Ask this TV about itself, once. A host that cannot answer leaves `selfInfo` as it was: the
   * wizard then behaves exactly as it does for any other box (see `selfBlocked`).
   */
  async readSelf(): Promise<void> {
    if (!this.hooks.selfInfo) return;
    try {
      const info = await this.hooks.selfInfo();
      if (!info) return;
      const was = this.selfInfo;
      this.selfInfo = info;
      // The set knows what it is; asking a human to pick it from a list of brands would be theatre.
      // In self mode the detection always wins — the question is never put, so a pick left over
      // from an earlier "another box" answer must not keep the step alive for ever.
      if (this.selfTarget) {
        const b = this.selfBox;
        if (b && (b !== this.box || !this.boxAuto)) {
          this.box = b;
          this.boxAuto = true;
          this.log('info', `box: ${b} (home = ${info.home || 'unknown'})`);
        }
      }
      if (info.developer && !was?.developer) this.log('ok', 'developer options are on');
      if ((info.adb || info.wirelessAdb) && !(was?.adb || was?.wirelessAdb)) this.log('ok', `debugging is on (${info.wirelessAdb ? 'wireless' : 'adb'})`);
    } catch {
      // the host cannot answer right now — say nothing, the screen stays open and asks again
    }
  }
  /** Poll while a screen that waits on this TV is open; stop everywhere else. */
  private watchSelf(on: boolean) {
    if (this.selfTimer) {
      clearInterval(this.selfTimer);
      this.selfTimer = null;
    }
    if (!on || !this.canTargetSelf || !this.hooks.selfInfo) return;
    void this.readSelf();
    this.selfTimer = setInterval(() => void this.readSelf(), 1500);
  }
  /** Open a settings screen on THIS TV. Some sets answer an intent with a stub that does nothing. */
  async openSelfSettings(screen: SettingsScreen) {
    this.settingsFailed = false;
    this.log('cmd', `$ am start -a android.settings.${screen === 'about' ? 'DEVICE_INFO' : screen === 'dev' ? 'APPLICATION_DEVELOPMENT' : screen === 'wifi' ? 'WIFI' : ''}_SETTINGS`);
    try {
      const ok = (await this.hooks.openSettingsScreen?.(screen)) ?? false;
      this.settingsFailed = !ok;
      if (!ok) this.log('warn', `nothing on this TV answered the ${screen} settings screen`);
    } catch (e) {
      this.settingsFailed = true;
      this.log('err', e instanceof Error ? e.message : String(e));
    }
  }

  // ------------------------------------------------------------------ step 6: find the box
  startScan() {
    if (this.webBridge) {
      this.scan = 'idle';
      this.devices = [];
      this.devSel = null;
      this.log('warn', 'browser cannot open TCP sockets — bridge required for Wi-Fi');
      return;
    }
    this.scan = 'scanning';
    this.devices = [];
    this.devSel = null;
    const usbOnly = this.isWeb && !this.bridged;
    this.log('cmd', usbOnly ? '$ navigator.usb.requestDevice() · WebUSB' : '$ mdns browse _adb-tls-connect._tcp · scan 192.168.1.0/24:5555');
    const myStep = this.step;
    const myMode = this.mode;
    void this.transport
      .discover({ paths: usbOnly ? ['usb'] : undefined })
      .then((all) => {
        if (this.step !== myStep || this.mode !== myMode) return;
        const list = this.boxes(all);
        if (!list.length) throw new NoDevicesError(usbOnly ? 'usb-driver' : 'none');
        this.devices = list;
        // Setting up THIS TV: the set the tool runs on is the answer, wherever it is in the list.
        const mine = this.selfTarget ? list.findIndex((d) => d.self) : -1;
        this.devSel = mine >= 0 ? mine : 0;
        this.scan = 'found';
        this.log('ok', `found ${list.length} device(s)`);
      })
      .catch((e: unknown) => {
        if (this.step !== myStep || this.mode !== myMode) return;
        this.scan = 'empty';
        this.scanHint = e instanceof NoDevicesError ? e.hint : 'none';
        this.log('warn', `no devices found (${this.scanHint === 'usb-driver' ? 'USB driver?' : this.scanHint === 'client-isolation' ? 'client isolation?' : e instanceof Error ? e.message : 'unknown'})`);
      });
  }
  rescan() {
    this.startScan();
  }
  /**
   * The browser's own device chooser (WebUSB). A page is not allowed to see a USB device until the
   * person picks it in Chrome's dialog, and that dialog only opens inside a click — so on the web
   * "Scan again" can never find a cable that was never granted. This is the button that can
   * (Jim, 23/9: "I plugged a box into USB and it does not see it").
   */
  get canPickUsb(): boolean {
    return !!this.transport.pick && this.debug === 'usb';
  }
  /** What the chooser answered, in words, ON THE SCREEN — the console dock is closed on a TV. */
  pickMsg = $state<StrKey | null>(null);
  async pickUsb() {
    if (!this.transport.pick) return;
    this.pickMsg = null;
    this.log('cmd', '$ usb: choose a device');
    try {
      const info = await this.transport.pick();
      if (!info) {
        // Chrome closed with nothing picked — including the case where it had nothing to offer,
        // which is exactly what a box with no data USB port looks like from in here.
        this.pickMsg = 'w6_pickNone';
        return this.log('info', 'no device picked');
      }
      this.devices = [info, ...this.devices.filter((d) => d.id !== info.id)];
      this.devSel = 0;
      this.scan = 'found';
      this.log('ok', `usb: ${info.name}`);
    } catch (e) {
      // Granted, but nothing on it speaks ADB: the honest answer, said out loud.
      this.pickMsg = 'w6_pickNoAdb';
      this.log('err', e instanceof Error ? e.message : String(e));
    }
  }

  // ------------------------------------------------------------------ the W6 guides (help.ts)
  /** Open a guide sheet. The driver one also asks the host why USB is unavailable. */
  openHelp(topic: HelpTopic) {
    this.help = topic;
    this.log('info', `guide: ${topic}`);
    if (topic === 'driver') void this.loadUsbReason();
  }
  closeHelp() {
    this.help = null;
  }
  /** "Scan again" from inside a guide: close it, run the scan the user came here for. */
  helpRescan() {
    this.closeHelp();
    this.rescan();
  }
  /** "Switch to network debugging": back to W5 with TCP picked, where the TV-side steps live. */
  helpUseNetwork() {
    this.closeHelp();
    this.debug = 'tcp';
    this.goStep(W.debug);
  }
  /** Open a page or a system-settings deep link outside the app (the host decides how). */
  openExternal(url: string) {
    this.log('info', `open ${url}`);
    try {
      if (this.hooks.openExternal) this.hooks.openExternal(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      this.log('err', `could not open ${url}`);
    }
  }
  /** The transport may know why USB is dead (Electron asks the Node side). Optional — duck-typed. */
  private async loadUsbReason() {
    const t = this.transport as { usbHint?: () => Promise<string | null> };
    if (typeof t.usbHint !== 'function') return;
    try {
      this.usbReason = await t.usbHint();
    } catch {
      this.usbReason = null;
    }
  }
  /**
   * The browser cannot open TCP sockets, so Wi-Fi needs `tvlm bridge` running on this computer.
   * The button does exactly what it says: it opens the download page. It does NOT claim the bridge
   * exists — `bridged` flips only when the bridge answers, which `waitForBridge` polls for.
   * Measured 20/9 on the live site: claiming it early walked the user into an empty scan with
   * nothing to act on, and no file had been downloaded at all.
   */
  bridgeDesktop() {
    this.openExternal(`https://${this.brand.domain}/#download`);
    this.bridgeQr = false;
    void this.waitForBridge();
  }
  /** Poll the local bridge while the user downloads and starts it. */
  async waitForBridge(tries = 40) {
    if (!this.hooks.connectBridge) {
      this.bridgeFailed = true;
      this.log('warn', 'this host has no bridge connector');
      return;
    }
    const mySeq = ++this.bridgeSeq;
    this.bridgeWait = true;
    this.bridgeFailed = false;
    this.log('cmd', '$ tvlm bridge · ws://127.0.0.1:15555');
    for (let i = 0; i < tries; i++) {
      if (mySeq !== this.bridgeSeq) return;
      try {
        const t = await this.hooks.connectBridge();
        if (mySeq !== this.bridgeSeq) return;
        this.transport = t;
        this.bridged = true;
        this.bridgeWait = false;
        this.log('ok', 'bridge connected');
        this.startScan();
        return;
      } catch {
        await new Promise<void>((r) => this.after(2000, r));
      }
    }
    if (mySeq !== this.bridgeSeq) return;
    this.bridgeWait = false;
    this.bridgeFailed = true;
    this.log('warn', 'bridge not running — download it, start it, then try again');
  }
  /** Stop waiting (the user picked another route). */
  bridgeCancel() {
    this.bridgeSeq++;
    this.bridgeWait = false;
    this.bridgeFailed = false;
  }
  bridgePhone() {
    this.bridgeCancel();
    this.bridgeQr = true;
  }
  bridgeUsb() {
    this.bridgeCancel();
    this.debug = 'usb';
    this.bridgeQr = false;
    this.startScan();
  }
  async connectManual() {
    const ip = this.ip.trim() || '192.168.1.50';
    this.manualError = null;
    if (this.debug === 'wireless') {
      const hostPort = `${ip}:${this.pairPort.trim() || '37099'}`;
      this.log('cmd', `$ adb pair ${hostPort}`);
      try {
        if (this.transport.pair) await this.transport.pair(hostPort, this.pair.trim());
        this.log('ok', 'paired');
      } catch (e) {
        this.manualError = 'w6_pairFail';
        this.log('err', e instanceof Error ? e.message : String(e));
        return;
      }
    }
    // ΜΙΑ ΓΡΑΜΜΕΝΗ IP ΕΙΝΑΙ ΠΑΝΤΑ ΔΙΚΤΥΟ. Έγραφε `this.debug`, οπότε όποιος είχε απαντήσει «USB
    // debugging» και μετά πληκτρολογούσε διεύθυνση έπαιρνε στόχο με method 'usb' και διεύθυνση
    // `host:port` — και από εκεί κρέμονται δύο οθόνες: το «Το box δεν απάντησε» έδινε συμβουλές για
    // καλώδιο σε δικτυακή διεύθυνση, και το «Άνοιξε και το δίκτυο» εμφανιζόταν σε box που ΗΔΗ είναι
    // στο δίκτυο. Καλώδιο δεν γράφεται σε πλαίσιο IP.
    const method: DebugPath = this.debug === 'wireless' ? 'wireless' : 'tcp';
    this.devices = [{ id: `${ip}:5555`, name: 'Manual', addr: `${ip}:5555`, method }];
    this.devSel = 0;
    this.scan = 'found';
    this.goStep(W.allow);
  }

  // ------------------------------------------------------------------ step 7: Allow on the TV
  /** The exact words the transport used when the connection failed — on the screen, not in a log. */
  allowError = $state<string | null>(null);
  async startAllow() {
    // NEVER invent an address. This used to fall back to `192.168.1.50:5555`, the placeholder from
    // the manual field — which on the first real network we tried was the IP of the PC itself, so
    // the wizard spent its life dialling the computer it was running on and reporting "try 0"
    // (Jim, 23/9). No selection is a state with a name, not a default.
    const target = this.selectedDevice;
    if (!target) {
      this.allowFailed = true;
      this.allowError = this.t('w7_noTarget');
      this.log('err', 'no device selected — nothing to connect to');
      return;
    }
    const addr = typeof target === 'string' ? target : target.addr;
    this.allowError = null;
    this.allowTries = 0;
    this.authorized = false;
    this.allowFailed = false;
    this.allowSilent = false;
    this.connectAbort?.abort();
    const ac = new AbortController();
    this.connectAbort = ac;
    this.log('cmd', `$ adb connect ${addr}`);
    try {
      const dev = await this.transport.connect(target, {
        waitForAuth: true,
        signal: ac.signal,
        onUnauthorized: (n) => {
          if (ac.signal.aborted) return;
          this.allowTries = n;
          this.log('out', `$ adb devices → ${addr}\tunauthorized`);
        },
      });
      if (ac.signal.aborted) {
        await dev.close();
        return;
      }
      this.attach(dev);
      this.authorized = true;
      this.log('ok', 'device authorized');
      this.after(1000, () => {
        if (this.step === W.allow && this.mode === 'wizard') this.goStep(W.check);
      });
    } catch (e) {
      if (ac.signal.aborted) return;
      this.allowFailed = true;
      if (e instanceof UnauthorizedError) this.log('warn', `still unauthorized after ${e.attempts} tries`);
      else {
        // The box never answered / refused / the address was wrong: say WHICH, where it can be read.
        // And stop pointing at the remote — there is no dialog to press when nothing answered.
        this.allowSilent = true;
        this.allowError = e instanceof Error ? e.message : String(e);
        this.log('err', this.allowError);
      }
    }
  }
  // ------------------------------------------------------------- «Άνοιξε και το δίκτυο» (adb tcpip)
  /** Τα παλιά box δεν έχουν διακόπτη «Network debugging» — ανοίγει ΜΟΝΟ από μια σύνδεση που ήδη έχεις. */
  // 'linking' = το δίκτυο ΑΝΟΙΞΕ και ξαναμπαίνουμε ασύρματα. Χωρίς αυτό το στάδιο η οθόνη έλεγε
  // «δεν μπήκε μόνο του» για όσο ακόμη προσπαθούσε — ψέμα, και ο χρήστης έβγαζε το καλώδιο νωρίς.
  netState = $state<'idle' | 'working' | 'linking' | 'open' | 'noip' | 'failed'>('idle');
  /** `ip:port` όπου απαντά πλέον το κουτί — μόνο στο 'open'. */
  netAddr = $state<string | null>(null);
  /** Μπήκαμε ξανά ασύρματα μόνοι μας, άρα το καλώδιο μπορεί να φύγει τώρα. */
  netBack = $state(false);
  netError = $state<string | null>(null);
  get canOpenNetwork(): boolean {
    return !!this.device?.openNetwork && this.device.info.method === 'usb' && !this.device.info.self;
  }
  async openNetwork(port = 5555) {
    const dev = this.device;
    if (!dev?.openNetwork || this.netState === 'working') return;
    this.netState = 'working';
    this.netError = null;
    this.netAddr = null;
    this.netBack = false;
    this.log('cmd', `$ adb tcpip ${port}`);
    try {
      const { addresses } = await dev.openNetwork(port);
      const ip = addresses[0];
      this.log('ok', `adbd restarted on ${port}${ip ? ` · ${ip}` : ' (address unknown)'}`);
      if (!ip) {
        // Το δίκτυο ΑΝΟΙΞΕ — απλώς το κουτί δεν είπε πού. Ο άνθρωπος τη διαβάζει από την οθόνη του.
        this.netState = 'noip';
        return;
      }
      const addr = `${ip}:${port}`;
      this.netAddr = addr;
      this.netState = 'linking';
      // Ο daemon ξαναξεκινά και ΑΥΤΗ η σύνδεση πέθανε. Δώσε του χρόνο και μπες ασύρματα με το ΙΔΙΟ
      // κλειδί — είναι ήδη εγκεκριμένο στο κουτί, οπότε δεν ξαναβγαίνει διάλογος.
      await new Promise((r) => setTimeout(r, 2500));
      const ac = new AbortController();
      const giveUp = setTimeout(() => ac.abort(new Error(`no answer at ${addr}`)), 25_000);
      try {
        const next = await this.transport.connect({ id: addr, name: dev.info.name, addr, method: 'tcp' }, { waitForAuth: true, signal: ac.signal });
        this.attach(next);
        this.netBack = true;
        this.log('ok', `reconnected without the cable · ${addr}`);
      } catch (e) {
        // Το δίκτυο ΑΝΟΙΞΕ· απλώς δεν μπήκαμε μόνοι μας. Η διεύθυνση μένει στην οθόνη.
        this.log('warn', e instanceof Error ? e.message : String(e));
      } finally {
        clearTimeout(giveUp);
        this.netState = 'open';
      }
    } catch (e) {
      this.netState = 'failed';
      this.netError = e instanceof Error ? e.message : String(e);
      this.log('err', this.netError);
    }
  }

  private attach(dev: AdbDevice) {
    // Το παλιό μπορεί να είναι ΗΔΗ νεκρό (μετά από tcpip ο daemon ξαναξεκίνησε): το close() τότε
    // απορρίπτεται, και μια ασυγκράτητη απόρριψη ρίχνει τη σελίδα στον desktop.
    void this.device?.close().catch(() => {});
    this.device = dev;
    this.report.meta.device = { serial: dev.serial, model: dev.info.name, addr: dev.info.addr };
    this.engine = new ProvisionEngine({
      brand: this.brand,
      shell: dev,
      report: this.report,
      // ΤΟ ΦΡΕΝΟ ΤΗΣ ΕΚΔΟΣΗΣ PLAY, ΣΤΗΝ ΠΥΛΗ: η έκδοση Play κρύβει τη σελίδα Debloat, αλλά μια
      // κρυμμένη σελίδα δεν είναι περιορισμός — η κονσόλα δέχεται ελεύθερες εντολές, οπότε το
      // `pm uninstall` γραμμένο με το χέρι ξανάνοιγε την ίδια πόρτα (μελέτη Play §3.4).
      playBuild: !this.canDirectInstall,
      confirm: (cmd, step) => this.onConfirm(cmd, step),
      human: (what, step) => this.onHuman(what, step),
      // Η αλυσίδα του launcher κλείνει ΠΡΩΤΑ τον εργοστασιακό· μια σιωπηλή διακοπή στη μέση αφήνει
      // την τηλεόραση χωρίς αρχική οθόνη. Ο άνθρωπος αποφασίζει, με την απάντηση του κουτιού μπροστά.
      onFailure: (step, cmd, output) =>
        new Promise<boolean>((resolve) => {
          this.failAsk = {
            label: step.label,
            cmd,
            out: (output || '').trim() || this.t('fa_silent'),
            resolve: (go) => {
              this.failAsk = null;
              this.log(go ? 'warn' : 'err', go ? 'continuing after a failed step (operator)' : 'stopped after a failed step (operator)');
              resolve(go);
            },
          };
        }),
      // Count the bytes as they pass. The engine tees this stream (hash + install), so the
      // transform sits BEFORE the tee and every byte is counted exactly once.
      fetchApk: async (url) => {
        const { stream, size } = await this.hooks.fetchApk(url);
        this.dlDone = 0;
        this.dlTotal = size ?? 0;
        const counted = stream.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform: (chunk, ctrl) => {
              this.dlDone += chunk.byteLength;
              ctrl.enqueue(chunk);
            },
          }),
        );
        return { stream: counted, size };
      },
      sha256: this.hooks.sha256,
      onEvent: (e) => this.onEngineEvent(e),
      // ΤΙ ΕΣΠΑΣΕ ΚΑΙ ΣΕ ΤΙ (2/10/2026): χωρίς αυτό δεν ξέραμε ποτέ ότι ένα βήμα απέτυχε σε
      // αληθινό box — μόνο ο χρήστης το έβλεπε. Στέλνουμε το βήμα και την ΤΑΥΤΟΤΗΤΑ ΤΟΥ ΚΟΥΤΙΟΥ,
      // που είναι ακριβώς ό,τι χρειάζεται μια διόρθωση: μοντέλο, Android, πλατφόρμα, ποιος κρατά
      // το HOME. Η έξοδος κόβεται στα 200 — ένα μήνυμα σφάλματος, όχι dump. Τίποτα προσωπικό.
      onStepFailed: (step, output) =>
        this.hooks.reportError?.('STEP_FAILED', step.id, {
          model: this.check?.model ?? '',
          manufacturer: this.check?.manufacturer ?? '',
          android: this.check?.androidVersion ?? '',
          sdk: this.check?.sdk ?? 0,
          platform: this.check?.platform ?? '',
          home: this.check?.currentHome ?? '',
          stock: this.check?.stockLauncher ?? '',
          out: (output || '').trim().slice(0, 200),
        }),
    });
  }

  // ------------------------------------------------------------------ step 8: check (read-only)
  async startCheck() {
    if (!this.engine) return;
    this.checking = true;
    this.checkStuck = null;
    this.checkN = 0;
    this.check = null;
    this.checkPartial = null;
    this.checkFrom = this.entries.length;
    try {
      const c = await this.engine.check();
      this.check = c;
      this.checkN = CHECK_ROWS;
      // ΜΕΤΑ ΑΠΟ ΕΠΙΤΥΧΗ ΕΛΕΓΧΟ ΤΟ RING ΠΑΕΙ ΣΤΟ «ΣΥΝΕΧΕΙΑ» (Jim, 9/10, emulator: το ring είχε μείνει στο
      // chip γλώσσας του header όσο το κουμπί ήταν ανενεργό). Το επόμενο πάτημα είναι το προφανές.
      ringTo('primary');
      // The box itself answered: this always wins now that nobody is asked the question.
      this.box = c.platform === 'googletv' ? 'googletv' : c.platform === 'firetv' ? 'firetv' : c.manufacturer.toLowerCase() === 'xiaomi' ? 'xiaomi' : c.platform === 'androidtv' ? 'androidtv' : 'other';
    } catch (e) {
      this.log('err', e instanceof Error ? e.message : String(e));
      if (e instanceof CheckTimeoutError) {
        // ΠΟΙΑ ΕΝΤΟΛΗ ΣΩΠΑΣΕ, ΣΕ ΠΟΙΟ ΚΟΥΤΙ (Jim, 9/10/2026, κινητό Android 11: ο κύκλος γύριζε για
        // πάντα και κανείς δεν ήξερε γιατί). Η οθόνη το λέει με το όνομά του, και το ίδιο μαθαίνει η
        // τηλεμετρία — μαζί με ό,τι πρόλαβε να απαντήσει το κουτί, που είναι η ταυτότητά του.
        this.checkStuck = e.cmd;
        // `checkPartial` is refilled by updateCheckPartial() while the commands run; TS only sees the
        // `= null` above and narrows the field to `null`, hence the cast.
        const part = this.checkPartial as unknown as BoxCheck | null;
        this.hooks.reportError?.('CHECK_TIMEOUT', e.cmd, {
          ms: e.ms,
          model: part?.model ?? '',
          manufacturer: part?.manufacturer ?? '',
          android: part?.androidVersion ?? '',
          sdk: part?.sdk ?? 0,
          platform: part?.platform ?? '',
        });
      }
    } finally {
      this.checking = false;
    }
  }
  /** «Δοκιμή ξανά» after a check that stuck: a FRESH connection, since the stream that stopped answering is not to be trusted. */
  retryCheck() {
    this.checkStuck = null;
    this.goStep(W.allow);
    void this.startAllow();
  }
  /** Rows appear one by one while the check's commands run (the prototype's `checkN`). */
  private updateCheckPartial() {
    const outputs: CheckOutputs = {};
    const es = this.entries.slice(this.checkFrom);
    let done = 0;
    for (let i = 0; i < es.length; i++) {
      const e = es[i]!;
      if (e.kind !== 'cmd') continue;
      const key = (Object.keys(CHECK_COMMANDS) as Array<keyof typeof CHECK_COMMANDS>).find((k) => CHECK_COMMANDS[k] === e.text);
      if (!key) continue;
      const next = es[i + 1];
      outputs[key] = next && next.kind === 'out' ? next.text : '';
      done++;
    }
    // the command in flight has no output yet — every earlier one is complete
    const complete = Math.max(0, done - 1);
    this.checkPartial = buildCheck(outputs, this.launcherPkg);
    this.checkN = complete === 0 ? 0 : Math.min(CHECK_ROWS, complete + 1);
  }

  // ------------------------------------------------------------------ step 9: Google account block (brand.accountCheck)
  async openAccounts() {
    if (!this.engine) return;
    this.accScreen = true;
    await this.engine.exec('am start -a android.settings.SYNC_SETTINGS');
  }
  async recheckAcc() {
    if (!this.engine) return;
    const r = await this.engine.exec('dumpsys account');
    const accounts = parseAccounts(r.output);
    if (accounts.length === 0) {
      this.log('ok', '0 accounts');
      this.accRemoved = true;
      this.accScreen = false;
      if (this.check) this.check = { ...this.check, accounts: [] };
    } else {
      this.log('warn', `${accounts.length} account(s) still on the box`);
    }
  }
  continueOpen() {
    this.setupMode = 'auto';
    this.profile = 'open';
    this.setupOpen = true;
  }

  // ------------------------------------------------------------------ workspace
  openWs(task: TaskPage = 'over') {
    this.mode = 'workspace';
    this.task = task;
    this.taskOnly = false;
    if (!this.device && !this.wsConnecting) void this.bootstrapWorkspace();
    void this.loadManifest();
  }
  /** "Skip the guide": find the first box, wait for Allow, check — the prototype's `seedWs()`, for real. */
  private async bootstrapWorkspace() {
    this.wsConnecting = true;
    this.wsError = null;
    this.log('cmd', '$ adb devices');
    try {
      const usbOnly = this.isWeb && !this.bridged;
      const list = this.boxes(await this.transport.discover({ paths: usbOnly ? ['usb'] : undefined }));
      const first = list[0];
      if (!first) throw new NoDevicesError(usbOnly ? 'usb-driver' : 'none');
      this.devices = list;
      this.devSel = 0;
      this.scan = 'found';
      this.debug = this.debug ?? first.method;
      this.log('out', `${first.addr}\tdevice`);
      const dev = await this.transport.connect(first, { waitForAuth: true, onUnauthorized: (n) => (this.allowTries = n) });
      this.attach(dev);
      this.authorized = true;
      await this.startCheck();
    } catch (e) {
      this.wsError = e instanceof Error ? e.message : String(e);
      this.log('warn', this.wsError);
    } finally {
      this.wsConnecting = false;
    }
  }
  async loadManifest(): Promise<Manifest | null> {
    if (this.manifest) return this.manifest;
    if (!this.manifestPromise) {
      this.log('cmd', `$ GET ${this.manifestUrl}`);
      const src = this.hooks.manifest;
      this.manifestPromise = typeof src === 'function' ? src() : src ? Promise.resolve(src) : fetch(this.manifestUrl).then((r) => r.json()).then(validateManifest);
    }
    try {
      this.manifest = await this.manifestPromise;
      this.manifestError = null;
      return this.manifest;
    } catch (e) {
      this.manifestError = e instanceof Error ? e.message : String(e);
      this.log('err', `manifest: ${this.manifestError}`);
      this.manifestPromise = null;
      return null;
    }
  }

  // ---- the engine's callbacks
  private onConfirm(cmd: string, _step: ShellStep): Promise<boolean> {
    // Το σβήσιμο της συσκευής ρωτιέται ΠΑΝΤΑ, ακόμη κι όταν το πάτησε άνθρωπος: στην κονσόλα ένα
    // chip που κάνει factory reset κάθεται δίπλα στο `getprop` και δεν παίρνει πίσω.
    if (this.userInitiated > 0 && !isIrreversible(cmd)) return Promise.resolve(true);
    // A raw command (console / AI agent panel): shown in the gate panel, needs a human's Run.
    return new Promise<boolean>((resolve) => {
      const entry = this.entries.length - 1; // exec() added the `cmd` entry just before asking
      const ask: GateAsk = { id: ++this.gateSeq, entry, cmd, resolve: (ok) => {
        this.gateAsks = this.gateAsks.filter((a) => a.id !== ask.id);
        if (ok) this.log('ok', 'ok (approved by operator)');
        resolve(ok);
      } };
      this.gateAsks = [...this.gateAsks, ask];
    });
  }
  private onHuman(what: HumanWhat, step: ShellStep): Promise<void> {
    return new Promise<void>((resolve) => {
      // (The disable-launcher flow never reaches here: core's `disable-stock` chains set-home-activity
      // for that flow, so the TV is not asked — DESIGN_NOTES §14.)
      if (what === 'pickLauncher') {
        this.homeAsk = true;
        this.log('warn', 'TV will ask for a home app on next HOME press');
      }
      this.human = { what, step, resolve: () => {
        this.human = null;
        this.homeAsk = false;
        resolve();
      } };
    });
  }
  humanContinue() {
    this.human?.resolve();
  }
  private onEngineEvent(e: EngineEvent) {
    switch (e.type) {
      case 'task:start':
        // Οι εντολές ξεκινούν: ο διάλογος ανοίγει μόνος του, και ξεχνά ότι τον έκρυψαν την προηγούμενη φορά.
        this.openRunConsole();
        if (this.guided) this.autoTask = e.task;
        if (e.task === 'test') {
          // the engine's test task covers HOME/resolve/screenshot/reboot; the other three rows are what the
          // tool itself can vouch for (runTests() replaces them with real reads from the box beforehand)
          this.tests = {
            perms: this.tests.perms ?? this.cfgApplied,
            profile: this.tests.profile ?? (this.brand.flow !== 'kiosk' || this.profileApplied),
            apps: this.tests.apps ?? this.requiredOk,
          };
        }
        if (e.task === 'install') this.installing = true;
        if (e.task === 'launcher') this.homeBusy = true;
        if (e.task === 'configure') this.cfgBusy = true;
        if (e.task === 'profile') this.profileBusy = true;
        break;
      case 'task:done':
        // Όλα καλά → πράσινο ✓ για μια στιγμή και φεύγει μόνος του. Κάτι έσπασε → ΜΕΝΕΙ, να διαβαστεί.
        if (e.ok) {
          this.runOk = true;
          this.after(1600, () => {
            this.runConsole = false;
            this.runOk = false;
          });
        }
        if (e.task === 'profile') {
          this.profileBusy = false;
          if (e.ok) this.profileApplied = true;
        }
        if (e.task === 'install') {
          this.installing = false;
          this.currentInstallPkg = null;
          if (e.ok) this.log('ok', 'all packages installed');
        }
        if (e.task === 'launcher') this.homeBusy = false;
        if (e.task === 'configure') {
          this.cfgBusy = false;
          if (e.ok) this.cfgApplied = true;
        }
        if (this.guided) {
          if (e.ok && !this.autoDoneTasks.includes(e.task)) this.autoDoneTasks = [...this.autoDoneTasks, e.task];
          if (!e.ok && !this.autoFailedTasks.includes(e.task)) this.autoFailedTasks = [...this.autoFailedTasks, e.task];
        }
        break;
      case 'step:start':
        this.autoStepLabel = this.i18n.has(e.step.label) ? this.t(e.step.label) : e.step.label;
        if (e.step.id === 'test.home') this.tests = { ...this.tests, home: false };
        if (e.step.id === 'test.reboot') this.tests = { ...this.tests, reboot: false };
        break;
      case 'step:done':
        this.onStepDone(e.step, e.ok, e.output);
        break;
      case 'install:app': {
        const map: Record<typeof e.phase, InstStatus> = { download: 'ver', verify: 'ver', install: 'ing', done: 'ok', skip: 'ok' };
        this.currentInstallPkg = e.phase === 'done' || e.phase === 'skip' ? null : e.app.pkg;
        this.installPhase = e.phase === 'done' || e.phase === 'skip' ? null : e.phase;
        this.inst = { ...this.inst, [e.app.pkg]: map[e.phase] };
        if (e.phase === 'install') this.log('info', `installing · ${e.app.pkg}`); // no digest gate: whatever the list names goes straight in
        break;
      }
      case 'log':
        if (e.kind === 'err' && this.currentInstallPkg) this.inst = { ...this.inst, [this.currentInstallPkg]: 'err' };
        // The engine catches the real reason (`INSTALL_FAILED_…`, a sha mismatch, a socket that
        // died) and puts it in the log. Keep the last one: the picker used to throw the word
        // "install failed" and the reason stayed in a console dock nobody has open (Jim, 23/9).
        if (e.kind === 'err') this.lastEngineError = e.text;
        break;
      default:
        break;
    }
  }
  private onStepDone(step: ShellStep, ok: boolean, output: string) {
    switch (step.id) {
      case 'home.verify': {
        const home = parseResolvedHome(output);
        this.curHome = home;
        if (home) this.homeSet = home.startsWith(this.launcherPkg + '/');
        break;
      }
      case 'home.persistent':
        if (ok) this.homeSet = true;
        break;
      case 'home.disableStock':
        if (ok) this.stockDisabled = true;
        break;
      case 'test.resolve': {
        const home = parseResolvedHome(output);
        this.tests = { ...this.tests, home: ok && !!home && home.startsWith(this.launcherPkg + '/') };
        break;
      }
      case 'test.reboot':
        this.tests = { ...this.tests, reboot: ok };
        break;
      case 'handover.debugOff':
        if (ok) this.log('ok', 'debugging off · box sealed');
        break;
      default:
        break;
    }
  }

  /** Run one task on the user's behalf (their click is the confirmation). */
  private async runTask(task: Exclude<TaskId, 'install'>, ctx: StepContext = this.ctx, homeMethod?: HomeMethod): Promise<boolean> {
    if (!this.engine) return false;
    this.userInitiated++;
    try {
      return await this.engine.runTask(task, ctx, homeMethod);
    } finally {
      this.userInitiated--;
    }
  }
  private async execAs(cmd: string, opts: { stepId?: string; handoverLastStep?: boolean } = {}) {
    if (!this.engine) return null;
    this.userInitiated++;
    try {
      return await this.engine.exec(cmd, opts);
    } finally {
      this.userInitiated--;
    }
  }

  // ---- tasks
  async applyProfile() {
    if (!this.profile || this.profileBusy) return;
    await this.runTask('profile', { ...this.ctx, profile: this.profile });
  }
  async installAll() {
    if (!this.engine || this.installing) return;
    const m = await this.loadManifest();
    if (!m) return;
    const picked = pickApps(m, { role: this.role, choices: this.choices });
    const inst: Record<string, InstStatus> = {};
    for (const a of picked) inst[a.pkg] = 'wait';
    this.inst = inst;
    this.installing = true;
    this.userInitiated++;
    try {
      await this.engine.install(m, this.role, { choices: this.choices });
    } finally {
      this.userInitiated--;
      this.installing = false;
    }
  }
  pickAirplay(a: UiApp) {
    if (a.group) this.choices = { ...this.choices, [a.group]: a.pkg };
  }
  async setHome() {
    const m = this.homeSel;
    if (!m || this.homeBtnDisabled) return;
    this.homeSet = false;
    await this.runTask('launcher', this.ctx, m);
  }
  async verifyHome() {
    const r = await this.execAs('cmd package resolve-activity --brief -c android.intent.category.HOME');
    if (!r) return;
    const home = parseResolvedHome(r.output);
    this.curHome = home;
    this.homeSet = !!home && home.startsWith(this.launcherPkg + '/');
    if (!home && this.stockDisabled) this.log('out', 'No activity found');
  }
  homePicked() {
    // the human said they chose our app on the TV chooser (Always): trust it, log it, Verify tells the truth later
    this.log('ok', `home = ${this.brand.launcherHomeComponent} (chosen on TV · Always)`);
    this.homeSet = true;
    this.homeAsk = false;
    this.human?.resolve();
  }
  async restoreStock() {
    const r = await this.execAs(`pm enable ${this.stockLauncher}`);
    if (r?.ran) {
      this.stockDisabled = false;
      this.homeAsk = false;
      this.homeSet = false;
    }
  }
  /**
   * The stock launcher back, from the picker itself. A box we have already set up has exactly one
   * home app left — ours — so "Other" has nothing to offer and the way out promised three lines
   * higher ("restore the stock launcher in one click") existed only in the workspace.
   */
  get canRestoreStock(): boolean {
    return !!this.stockLauncher && !!this.check && !this.check.homeApps.some((a) => a.package === this.stockLauncher);
  }
  async restoreStockAndRecheck() {
    if (this.launcherBusy) return;
    this.launcherBusy = true;
    this.launcherError = null;
    try {
      await this.restoreStock();
      await this.recheckLaunchers();
      this.log('ok', `${this.stockLauncher} enabled again`);
    } finally {
      this.launcherBusy = false;
    }
  }
  setCfg(id: string, on: boolean) {
    this.cfg = { ...this.cfg, [id]: on };
  }
  async applyConfig() {
    if (!this.engine || this.cfgBusy) return;
    const ctx = this.ctx;
    const enabled = this.perms.filter((p) => p.on).map((p) => `cfg.${p.id}`);
    const all = this.perms.every((p) => p.on || p.off);
    this.cfgBusy = true;
    try {
      let ok: boolean;
      if (all) ok = await this.runTask('configure', ctx);
      else {
        // some toggles off → the enabled steps of the core table, one by one, through the same gate
        ok = true;
        for (const step of STEPS.filter((s) => s.task === 'configure' && enabled.includes(s.id) && (!s.when || s.when(ctx)))) {
          const r = await this.execAs(renderCommand(step, ctx), { stepId: step.id });
          if (!r || !r.ran || !stepSucceeded(step, r.output)) {
            ok = false;
            this.log('err', step.onFail);
          }
        }
      }
      // PROVISION (skipWizard + TV language) and LINK (owner) — the same step templates the core uses
      const bc = STEPS.find((s) => s.id === 'profile.broadcast')!;
      const r = await this.execAs(renderCommand(bc, ctx), { stepId: bc.id });
      if (!r || !stepSucceeded(bc, r.output)) ok = false;
      if (ctx.linkCode) {
        const link = STEPS.find((s) => s.id === 'profile.link')!;
        const l = await this.execAs(renderCommand(link, ctx), { stepId: link.id });
        if (!l || !stepSucceeded(link, l.output)) ok = false;
      }
      if (ok) this.cfgApplied = true;
    } finally {
      this.cfgBusy = false;
    }
  }
  async runTests() {
    if (!this.engine || this.testsBusy) return;
    this.testsBusy = true;
    this.tests = {};
    try {
      // what the tool itself can vouch for, plus two read-only facts from the box
      this.tests = { ...this.tests, perms: false };
      this.tests = { ...this.tests, perms: this.cfgApplied };
      this.tests = { ...this.tests, profile: false };
      if (this.effectiveProfile === 'kiosk') {
        const r = await this.execAs('dumpsys device_policy');
        const owner = r ? parseDeviceOwner(r.output) : null;
        this.tests = { ...this.tests, profile: !!owner && owner.startsWith(this.launcherPkg) };
      } else this.tests = { ...this.tests, profile: this.brand.flow !== 'kiosk' || this.profileApplied };
      this.tests = { ...this.tests, apps: false };
      const p = await this.execAs('pm list packages --show-versioncode');
      const have = p ? parsePackages(p.output) : new Map<string, number | null>();
      const need = this.pickedApps.length ? this.pickedApps.map((a) => a.pkg) : [this.launcherPkg];
      this.tests = { ...this.tests, apps: need.every((pkg) => have.has(pkg)) };
      // HOME + resolve + screenshot + reboot (the core's test task; the reboot waits for Allow)
      await this.runTask('test', this.ctx);
      this.log(this.testsAll ? 'ok' : 'warn', this.testsAll ? 'all tests passed · exit 0' : 'tests finished with failures · exit 1');
    } finally {
      this.testsBusy = false;
    }
  }
  confirmHome() {
    this.tests = { ...this.tests, home: true };
  }
  async takeShot() {
    if (!this.device) return;
    this.log('cmd', '$ adb exec-out screencap -p > tv.png');
    try {
      const png = await this.device.screencap();
      if (this.shot && this.shot.startsWith('blob:')) URL.revokeObjectURL(this.shot);
      // a real PNG has a full header; the mock hands back 4 bytes → the placeholder home screen
      this.shot = png.byteLength > 64 ? URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' })) : 'mock';
      this.log('ok', `${png.byteLength} bytes`);
    } catch (e) {
      this.log('err', e instanceof Error ? e.message : String(e));
    }
  }
  async nextBox() {
    if (this.adbOffEffective && this.engine) {
      await this.runTask('handover', { ...this.ctx, debugOff: true });
    }
    await this.device?.close();
    this.device = null;
    this.engine = null;
    this.authorized = false;
    this.check = null;
    this.checkPartial = null;
    this.checkN = 0;
    this.profile = null;
    this.profileApplied = false;
    this.inst = {};
    this.cfgApplied = false;
    this.tests = {};
    this.shot = null;
    this.homeMethod = null;
    this.homeSet = false;
    this.stockDisabled = false;
    this.homeAsk = false;
    this.curHome = null;
    this.autoDone = false;
    this.autoDoneTasks = [];
    this.autoFailedTasks = [];
    this.autoTask = null;
    this.guided = false;
    this.accRemoved = false;
    this.accScreen = false;
    this.setupOpen = false;
    this.maintActive = false;
    this.removed = false;
    this.removeArmed = false;
    this.consoleFrom = this.entries.length;
    this.mode = 'wizard';
    this.goStep(W.find);
  }
  pinTap(d: string) {
    this.pin = (this.pin + d).slice(0, 4);
  }
  pinClear() {
    this.pin = '';
  }
  async startMaint() {
    if (this.pin.length < 4 || this.maintBusy) return;
    this.maintBusy = true;
    try {
      const ok = await this.runTask('maintenance', { ...this.ctx, pin: this.pin, minutes: 15 });
      if (ok) {
        this.maintActive = true;
        this.log('ok', 'maintenance mode until 15 min · kiosk returns automatically');
      }
    } finally {
      this.maintBusy = false;
      this.pin = '';
    }
  }
  async removeAll() {
    if (!this.removeArmed) {
      this.removeArmed = true;
      this.after(4000, () => (this.removeArmed = false));
      return;
    }
    this.removeArmed = false;
    // THE STOCK LAUNCHER GOES BACK ON FIRST (Jim asked the right question on 23/9: "does it put the
    // launcher back?"). Our own run disabled it, so uninstalling ours on its own would leave a
    // television with NO home app at all — a black screen the tool cannot fix afterwards, because
    // the box it needs to talk to has nothing to come back to. Enabling it before the uninstall
    // also means Android has exactly one home app left and falls to it by itself, with nothing to
    // press on the TV.
    if (this.stockLauncher && this.stockDisabled) {
      await this.restoreStock();
      this.log('ok', `${this.stockLauncher} enabled again — the TV has a home screen after this`);
    }
    const pkgs = this.pickedApps.length ? this.pickedApps.map((a) => a.pkg) : [this.launcherPkg];
    for (const pkg of pkgs) await this.execAs(`pm uninstall ${pkg}`);
    // Say out loud what the box will open on HOME now. A removal that quietly left nothing is
    // exactly the failure this whole block exists to prevent, so it is read back, not assumed.
    const r = await this.execAs('cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME');
    const home = r?.ran ? parseResolvedHome(r.output) : null;
    this.log(home ? 'ok' : 'warn', home ? `home is now ${home}` : 'no home app answers on this box — install one before unplugging it');
    this.removed = true;
    this.inst = {};
    this.homeSet = false;
  }
  /** A raw command from the console / AI agent panel: through the gate, shown with Run/Deny when needed. */
  /**
   * What was typed on this box, newest first. It is the session's, not the console page's, so it
   * survives walking away to another task and back — and it is the row that turns "a remote is a
   * slow keyboard" into one press the second time (the incumbent shipped exactly this in its v1.12,
   * docs/COMPETITOR_TASKS_STUDY.md).
   */
  cmdHistory = $state<string[]>([]);
  async runRaw(cmd: string) {
    if (!this.engine || !cmd.trim()) return;
    const c = cmd.trim();
    this.cmdHistory = [c, ...this.cmdHistory.filter((h) => h !== c)].slice(0, 10);
    await this.engine.exec(c);
  }
  /** Every package the box reported — what the console completes a half-typed package name from. */
  get knownPackages(): string[] {
    return this.check?.installedPackages ?? [];
  }
  async startAuto() {
    if (!this.engine || this.guided) return;
    if (this.wsBlocked) return;
    this.guided = true;
    this.autoDone = false;
    this.autoDoneTasks = [];
    this.autoFailedTasks = [];
    this.autoTask = null;
    const profile = this.effectiveProfile;
    this.profile = profile;
    this.log('ok', 'automatic setup started');
    const m = await this.loadManifest();
    this.userInitiated++;
    let exit = 1;
    try {
      const order = this.autoTasks;
      const res = await this.engine.autoRun({ ...this.ctx, profile, debugOff: false }, m, this.role, order);
      exit = order.every((t) => res[t] !== false) ? 0 : 1;
    } catch (e) {
      this.log('err', e instanceof Error ? e.message : String(e));
    } finally {
      this.userInitiated--;
      this.guided = false;
      this.autoTask = null;
      this.autoDone = true;
    }
    this.log(exit === 0 ? 'ok' : 'warn', `automatic setup finished · exit ${exit}`);
    this.after(1800, () => {
      if (this.task === 'auto' && exit === 0) this.task = 'hand';
    });
  }
}
