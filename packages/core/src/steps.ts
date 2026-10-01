// Provisioning steps AS DATA (DESIGN_NOTES §13 rule): command, success check, error message.
// The UI, the CLI, the MCP server and `/boxsetupai` all read this same table.
import type { BrandConfig, HomeMethod, Profile } from './brand.js';

export type TaskId = 'profile' | 'install' | 'launcher' | 'configure' | 'test' | 'handover' | 'maintenance';

export interface StepContext {
  brand: BrandConfig;
  profile: Profile;
  lang: string;
  /** Stock launcher package of this box (from the check), needed by `disable-stock`. */
  stockLauncher: string | null;
  /** Link code (owner role only). */
  linkCode?: string;
  /** Maintenance PIN + minutes. */
  pin?: string;
  minutes?: number;
  /** Whether to turn debugging off as the last handover step. */
  debugOff?: boolean;
  /**
   * The launcher to make home, when it is not ours (`pkg/.Activity`, from the picker). The tool
   * sets ANY launcher as home; the brand's own is just the default.
   */
  homeTarget?: string;
  /**
   * "Let the box ask": disable the stock launcher and stop there, so the TV shows its own
   * "Select a Home app" chooser. The honest answer for a launcher we do not know.
   */
  homeAsk?: boolean;
  /** Android API level of the box (from the check). Some grants change name with it. */
  sdk?: number;
  /**
   * Extra PROVISION arguments from the Install screen (`--es use bnb --ez adult false …`), already
   * rendered, leading space included. The app reads what it knows; the rest is ignored by Android.
   */
  provisionExtras?: string;
  /** "Change every setting from the web": grant WRITE_SECURE_SETTINGS (declared by the hotel APK). */
  grantSecureSettings?: boolean;
  /** "Keep it running in the background": the deviceidle whitelist. Absent = on. */
  keepBackground?: boolean;
  /** "Hide the stock launcher": switch it off after HOME is pinned (frees memory on small boxes). */
  hideStock?: boolean;
  /**
   * The box IS the device running this tool. Measured on the emulator 22/9: the reboot test then
   * restarts the tool as well — the run dies half way, with no report and nothing on screen to say
   * what happened. So the reboot is left to the person, who can do it whenever they like.
   */
  selfBox?: boolean;
}

export interface ShellStep {
  id: string;
  task: TaskId;
  /** Human label key (i18n key in packages/ui strings). */
  label: string;
  /** Command template. `{pkg}` `{home}` `{acs}` `{notif}` `{dpc}` `{stock}` `{lang}` `{profile}` `{code}` `{pin}` `{minutes}`. */
  cmd: string;
  /** Regex (string) that the output must match for success. Absent = exit without "Error"/"Failure". */
  expect?: string;
  /**
   * Like `expect`, but rendered against the context first (`{pkg}`, `{home}`…). A verification that
   * only checks "no Error" is not a verification: `home.verify` reported ok while HOME still opened
   * the stock launcher (25/9). The engine renders this and matches the output against it.
   */
  expectRendered?: string;
  /** Regex that means failure even if `expect` is absent. */
  fail?: string;
  /** i18n key of the message shown when it fails. */
  onFail: string;
  /** Only run when… */
  when?: (ctx: StepContext) => boolean;
  /** Needs the user's hands on the TV afterwards (Allow, HOME, pick launcher). */
  humanAfter?: 'allow' | 'home' | 'pickLauncher' | 'accounts' | 'reboot';
  /** The step that may legally turn adb off (gate exception). */
  handoverLastStep?: boolean;
  /**
   * The command takes the box away with it: the socket dies instead of answering, so waiting for a
   * reply waits for ever. Measured on a Mi Box 4 (23/9): `reboot` left the automatic run on
   * "Running…" with nothing to press, because the promise for its output never settled. A step
   * marked here counts as done the moment it has been sent — silence IS the expected answer.
   */
  expectsDisconnect?: boolean;
}

const pkg = (c: StepContext) => c.brand.launcherPackage;

export function renderCommand(step: ShellStep, ctx: StepContext): string {
  const map: Record<string, string> = {
    pkg: pkg(ctx),
    home: ctx.homeTarget || ctx.brand.launcherHomeComponent,
    acs: ctx.brand.launcherAccessibilityService,
    notif: ctx.brand.launcherNotificationListener,
    dpc: ctx.brand.launcherDeviceAdminReceiver ?? '',
    stock: ctx.stockLauncher ?? '',
    lang: ctx.lang,
    profile: ctx.profile,
    code: ctx.linkCode ?? '',
    extras: ctx.provisionExtras ?? '',
    pin: ctx.pin ?? '',
    minutes: String(ctx.minutes ?? 15),
  };
  return step.cmd.replace(/\{(\w+)\}/g, (_, k: string) => map[k] ?? `{${k}}`);
}

/**
 * `pkg/.Cls` and `pkg/pkg.Cls` ARE THE SAME COMPONENT — Android writes the short form, `dumpsys` and
 * `resolve-activity` answer with the long one. Expanding the leading dot is the whole difference
 * between "the box refused the home change" and "the box did exactly what we asked".
 */
export function expandComponent(s: string): string {
  const i = s.indexOf('/');
  if (i < 0) return s;
  const pkg = s.slice(0, i);
  const cls = s.slice(i + 1);
  return cls.startsWith('.') ? `${pkg}/${pkg}${cls}` : `${pkg}/${cls}`;
}

export function stepSucceeded(step: ShellStep, output: string, expectRendered?: string): boolean {
  if (step.fail && new RegExp(step.fail, 'i').test(output)) return false;
  // A rendered expectation is a literal (a component name), not a pattern — but a COMPONENT, not a
  // string. We ask with `com.x/.Main`; a real box answers `com.x/com.x.Main`, and a plain substring
  // test called that a failure while the home screen had in fact changed. (The mock echoed back
  // whatever we set, so nothing here ever caught it: a mock kinder than the device hides exactly
  // this class of bug — the same lesson this file learned about `resolve-activity` without MAIN.)
  if (expectRendered) {
    const hay = output.toLowerCase();
    const want = expectRendered.toLowerCase();
    if (hay.includes(want)) return true;
    const wantLong = expandComponent(expectRendered).toLowerCase();
    if (hay.includes(wantLong)) return true;
    // …and the mirror case: we asked with the long form, the box answered with the short one.
    return (output.match(/[\w.]+\/[.\w$]+/g) ?? []).some((c) => expandComponent(c).toLowerCase() === wantLong);
  }
  if (step.expect) return new RegExp(step.expect, 'i').test(output);
  return !/(^|\n)\s*(Error|Failure|Exception|SecurityException|java\.lang\.)/i.test(output);
}

// ---------------------------------------------------------------- the table

export const STEPS: ShellStep[] = [
  // ---- profile (the hotel road: the target has a device-admin receiver; PLUI has none)
  {
    id: 'kiosk.deviceOwner',
    task: 'profile',
    label: 'st_deviceOwner',
    cmd: 'dpm set-device-owner {dpc}',
    expect: 'Success|Active admin set|already set',
    fail: 'already several users|already some accounts|not allowed',
    onFail: 'err_deviceOwner',
    when: (c) => c.profile === 'kiosk' && !!c.brand.launcherDeviceAdminReceiver,
  },
  {
    id: 'profile.broadcast',
    task: 'profile',
    label: 'st_profile',
    // `keepAdb`: the hotel app's kiosk profile adds DISALLOW_DEBUGGING_FEATURES unless told not to
    // (hotel ProvisionReceiver, b6aab2d) — without it this broadcast cut adb in the middle of the
    // automatic run and every step after it failed. Cutting adb is the host's call, not this run's.
    // No `--es lang`: the tool's language is the RESELLER's. The box's language is the host's, and
    // the app suggests it from the IP the host connects from, on its own Language step (Jim, 24/9).
    cmd: 'am broadcast -a {pkg}.PROVISION -p {pkg} --es profile {profile} --ez skipWizard true --ez keepAdb true{extras}',
    expect: 'Broadcast completed',
    onFail: 'err_profile',
  },
  {
    id: 'profile.link',
    task: 'profile',
    label: 'st_link',
    cmd: 'am broadcast -a {pkg}.LINK -p {pkg} --es code {code}',
    expect: 'Broadcast completed',
    onFail: 'err_link',
    when: (c) => !!c.linkCode,
  },

  // ---- launcher (order per brand.homeMethods; the engine filters by method)
  {
    id: 'home.setHomeActivity',
    task: 'launcher',
    label: 'st_setHome',
    cmd: 'cmd package set-home-activity {home}',
    fail: 'Error|Exception|Unknown command',
    onFail: 'err_setHome',
  },
  {
    id: 'home.verify',
    task: 'launcher',
    label: 'st_verifyHome',
    cmd: 'cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME',
    // the box's answer must BE the home we asked for — `homeAsk` has no single answer to expect
    expectRendered: '{home}',
    onFail: 'err_verifyHome',
    when: (c) => !c.homeAsk,
  },
  {
    id: 'home.persistent',
    task: 'launcher',
    label: 'st_persistentHome',
    cmd: 'am broadcast -a {pkg}.PROVISION -p {pkg} --es profile kiosk --es home persistent --ez keepAdb true',
    expect: 'Broadcast completed',
    onFail: 'err_persistentHome',
    // Only our own app understands this broadcast, so a foreign home target skips it.
    when: (c) => c.profile === 'kiosk' && !c.homeTarget,
  },
  {
    // HOTELTV fallback (§4.3): the stock launcher goes off, the TV asks "Select a Home app" on the next HOME.
    id: 'home.disableStock',
    task: 'launcher',
    label: 'st_disableStock',
    cmd: 'pm disable-user --user 0 {stock}',
    expect: 'new state: disabled',
    onFail: 'err_disableStock',
    when: (c) => !!c.stockLauncher,
    humanAfter: 'pickLauncher',
  },
  {
    // PLUI default (§14): same command, but followed by set-home-activity so the TV never asks.
    id: 'home.disableStockSilent',
    task: 'launcher',
    label: 'st_disableStock',
    cmd: 'pm disable-user --user 0 {stock}',
    expect: 'new state: disabled',
    onFail: 'err_disableStock',
    when: (c) => !!c.stockLauncher,
  },

  // ---- configure (silent grants)
  { id: 'cfg.overlay', task: 'configure', label: 'st_overlay', cmd: 'appops set {pkg} SYSTEM_ALERT_WINDOW allow', onFail: 'err_grant' },
  // The box asked for this one by hand on the first real install (23/9): a launcher that can update
  // itself needs it, and appops grants it without a single screen on the television.
  { id: 'cfg.installUnknown', task: 'configure', label: 'st_installUnknown', cmd: 'appops set {pkg} REQUEST_INSTALL_PACKAGES allow', onFail: 'err_grant' },
  { id: 'cfg.usage', task: 'configure', label: 'st_usage', cmd: 'appops set {pkg} GET_USAGE_STATS allow', onFail: 'err_grant' },
  { id: 'cfg.notif', task: 'configure', label: 'st_notif', cmd: 'cmd notification allow_listener {notif}', onFail: 'err_grant' },
  { id: 'cfg.tvl', task: 'configure', label: 'st_tvl', cmd: 'pm grant {pkg} android.permission.READ_TV_LISTINGS', onFail: 'err_grant' },
  // The hotel launcher's wizard walks EVERY permission (docs/hoteltv.md: the guest must never see
  // a popup), so the tool grants every one of them here and that wizard has nothing left to ask
  // (Jim, 24/9). Battery: the "keep running in background" dialog. Photos: the runtime permission
  // whose name changed at API 33 — the box's own level decides which one exists to grant.
  { id: 'cfg.battery', task: 'configure', label: 'st_battery', cmd: 'dumpsys deviceidle whitelist +{pkg}', onFail: 'err_grant', when: (c) => c.brand.launcherAsksAllPermissions && c.keepBackground !== false },
  // Install screen, "only now, via ADB": what the app cannot give itself later.
  { id: 'cfg.secure', task: 'configure', label: 'st_secure', cmd: 'pm grant {pkg} android.permission.WRITE_SECURE_SETTINGS', onFail: 'err_grant', when: (c) => !!c.grantSecureSettings },
  {
    id: 'cfg.hideStock',
    task: 'configure',
    label: 'st_hideStock',
    cmd: 'pm disable-user --user 0 {stock}',
    expect: 'new state: disabled',
    onFail: 'err_disableStock',
    // only after HOME is ours: a box with the stock launcher off and nothing pinned has no home.
    // On the kiosk road the launcher task already switched it off — no need to say it twice.
    when: (c) => !!c.hideStock && !!c.stockLauncher && !c.homeTarget && c.profile !== 'kiosk',
  },
  { id: 'cfg.photos', task: 'configure', label: 'st_photos', cmd: 'pm grant {pkg} android.permission.READ_MEDIA_IMAGES', onFail: 'err_grant', when: (c) => c.brand.launcherAsksAllPermissions && (c.sdk ?? 33) >= 33 },
  { id: 'cfg.photosLegacy', task: 'configure', label: 'st_photos', cmd: 'pm grant {pkg} android.permission.READ_EXTERNAL_STORAGE', onFail: 'err_grant', when: (c) => c.brand.launcherAsksAllPermissions && (c.sdk ?? 33) < 33 },
  {
    id: 'cfg.acs',
    task: 'configure',
    label: 'st_acs',
    cmd: 'settings put secure enabled_accessibility_services {acs}',
    onFail: 'err_grant',
    when: (c) => c.profile === 'open' && c.brand.accessibilityHome,
  },
  {
    id: 'cfg.acsOn',
    task: 'configure',
    label: 'st_acsOn',
    cmd: 'settings put secure accessibility_enabled 1',
    onFail: 'err_grant',
    when: (c) => c.profile === 'open' && c.brand.accessibilityHome,
  },

  // ---- test
  { id: 'test.home', task: 'test', label: 'st_testHome', cmd: 'input keyevent KEYCODE_HOME', onFail: 'err_test' },
  { id: 'test.resolve', task: 'test', label: 'st_testResolve', cmd: 'cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME', onFail: 'err_test' },
  { id: 'test.shot', task: 'test', label: 'st_testShot', cmd: 'screencap -p /sdcard/tvlm-test.png', onFail: 'err_test' },
  { id: 'test.reboot', task: 'test', label: 'st_testReboot', cmd: 'reboot', onFail: 'err_test', humanAfter: 'reboot', expectsDisconnect: true, when: (c) => !c.selfBox },

  // ---- handover
  {
    id: 'handover.debugOff',
    task: 'handover',
    label: 'st_debugOff',
    cmd: 'settings put global adb_enabled 0',
    onFail: 'err_debugOff',
    when: (c) => !!c.debugOff,
    handoverLastStep: true,
  },

  // ---- maintenance
  {
    id: 'maint.pause',
    task: 'maintenance',
    label: 'st_maint',
    cmd: 'am broadcast -a {pkg}.MAINTENANCE -p {pkg} --es pin {pin} --ei minutes {minutes}',
    expect: 'Broadcast completed',
    onFail: 'err_maint',
    when: (c) => !!c.pin,
  },
];

/**
 * Which launcher steps apply for a home method. `disable-stock` differs by flow (§14): the
 * disable-launcher flow (PLUI) chains set-home-activity so the TV never asks; the kiosk flow
 * (HOTELTV) keeps it as the fallback that ends with the user picking the launcher on the TV.
 */
function homeSteps(method: HomeMethod, ctx: StepContext): string[] {
  const brand = ctx.brand;
  switch (method) {
    case 'set-home-activity':
      // Measured on an Android TV 11 box (25/9): `set-home-activity` answers **Success** and HOME
      // still opens the stock launcher — and so does the device owner's `addPersistentPreferredActivity`.
      // Device Owner gives powers, it does not win the HOME intent: an enabled stock launcher does.
      // A kiosk has to own HOME, so the stock one goes off first, silently (ours is already
      // installed, so the TV never has to ask). `home.disableStockSilent` drops itself on a box
      // with no stock launcher to switch off.
      return ctx.profile === 'kiosk'
        ? ['home.disableStockSilent', 'home.setHomeActivity', 'home.verify']
        : ['home.setHomeActivity', 'home.verify'];
    case 'device-owner':
      return ['home.persistent'];
    case 'disable-stock':
      // `homeAsk` = the user wants the TV's own chooser, so the silent chain would take the choice
      // away again. Disable the stock launcher and stop; the next HOME press is the question.
      return !ctx.homeAsk && brand.flow === 'disable-launcher' && brand.homeMethods.includes('set-home-activity')
        ? ['home.disableStockSilent', 'home.setHomeActivity', 'home.verify']
        : ['home.disableStock'];
  }
}

export interface StepsQuery {
  task: TaskId;
  /** For `launcher`: which method to use (defaults to the brand's first method). */
  homeMethod?: HomeMethod;
}

/** The steps to run for a task, in order, already filtered by brand/profile/context. */
export function stepsFor(q: StepsQuery, ctx: StepContext): ShellStep[] {
  let list = STEPS.filter((s) => s.task === q.task);
  if (q.task === 'launcher') {
    const method = q.homeMethod ?? ctx.brand.homeMethods[0];
    if (!method || !ctx.brand.homeMethods.includes(method)) return [];
    const ids = homeSteps(method, ctx);
    list = ids.map((id) => STEPS.find((s) => s.id === id)!).filter(Boolean);
  }
  // A target that cannot be owned (no device-admin receiver: PLUI) has no kiosk profile at all —
  // not a blacklist on the product, a fact about the app (27/9/2026, one product).
  if (q.task === 'profile' && ctx.profile === 'kiosk' && !ctx.brand.launcherDeviceAdminReceiver) return [];
  return list.filter((s) => !s.when || s.when(ctx));
}

/**
 * The automatic run (DESIGN_NOTES §2 / §14). The design lists "Profile → Install → …", but the
 * profile task's commands (`dpm set-device-owner`, the PROVISION broadcast) address the launcher
 * app, so on a real box the APK must be there first: install runs before profile. The profile
 * CHOICE (kiosk / open, the account check) still happens before the run starts, in the UI.
 * Both flows run the profile task — for PLUI it is only the PROVISION broadcast (open profile).
 */
export function autoRunOrder(_brand: BrandConfig): TaskId[] {
  return ['install', 'profile', 'launcher', 'configure', 'test', 'handover'];
}
