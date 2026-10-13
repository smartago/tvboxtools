<script lang="ts">
  // @tvlm/ui root — the 1280×820 app window (DESIGN_NOTES §10): gradient, two glows, header, wizard or workspace.
  // Keyboard: ↑↓ (and ←→) move between the screen's [data-nav] controls, Enter selects (native), Esc = Back.
  import { onMount, untrack } from 'svelte';
  import type { BrandConfig, Manifest } from '@tvlm/core';
  import type { AdbTransport } from '@tvlm/adb';
  import { Session, type Mode, type Platform, type SelfInfo, type SettingsScreen } from './state.svelte.js';
  import { provideSession } from './context.js';
  import { NAV_DIR, jump, navGap, navOwner, navRule } from './nav.js';
  import Header from './components/Header.svelte';
  import LangSuggest from './components/LangSuggest.svelte';
  import LangAsk from './components/LangAsk.svelte';
  import HelpSheet from './components/HelpSheet.svelte';
  import RunDialog from './components/RunDialog.svelte';
  import ApkDone from './components/ApkDone.svelte';
  import ApkArrived from './components/ApkArrived.svelte';
  import UpdateAvailable from './components/UpdateAvailable.svelte';
  import CodeAsk from './components/CodeAsk.svelte';
  import Wizard from './wizard/Wizard.svelte';
  import Workspace from './workspace/Workspace.svelte';

  interface Props {
    brand: BrandConfig;
    transport: AdbTransport;
    platform?: Platform;
    lang?: string;
    /** The host already knows the language (the site's address says it) — do not ask again. */
    langLocked?: boolean;
    /** Test only: read the download list from here (`?manifest=`). */
    manifestOverride?: string;
    startIn?: Mode;
    fetchApk?: (url: string) => Promise<{ stream: ReadableStream<Uint8Array>; size?: number }>;
    sha256?: (stream: ReadableStream<Uint8Array>) => Promise<string>;
    /** Ένα JSON από το δίκτυο — στο Android ΟΧΙ μέσα από το WebView (δες SessionHooks). */
    getJson?: (url: string) => Promise<unknown>;
    /** Android: the app fetches its OWN apk and hands it to the system installer (see SessionHooks). */
    selfUpdate?: (url: string, onProgress?: (percent: number) => void) => Promise<boolean>;
    canSelfInstall?: () => Promise<boolean>;
    openSelfInstallPermission?: () => Promise<boolean>;
    manifest?: Manifest | (() => Promise<Manifest>);
    /** Η έκδοση του εργαλείου, από το package.json της όψης (δες `version` στο state). */
    version?: string;
    /**
     * Ο αριθμός build (πλήθος commit) — ΑΥΤΟΝ συγκρίνει ο έλεγχος ενημέρωσης, όχι το όνομα: το
     * όνομα είναι ημερήσιο και δύο builds της ίδιας μέρας το μοιράζονται (Jim, 3/10/2026).
     */
    build?: number;
    /** Open a guide link / system-settings deep link outside the app (default: `window.open`). */
    openExternal?: (url: string) => void;
    mirror?: (target: string) => Promise<{ ok: boolean; reason?: 'missing' | 'failed'; message?: string }>;
    /** Web only: connect to the local `tvlm bridge` (Wi-Fi needs it; a browser has no TCP). */
    connectBridge?: () => Promise<AdbTransport>;
    /** Android only: what this device says about itself (model + the developer switches). */
    selfInfo?: () => Promise<SelfInfo | null>;
    /** Android only: open a system settings screen on this device. */
    openSettingsScreen?: (screen: SettingsScreen) => Promise<boolean>;
    /** Android only: rendered icons of apps on this device, as data URLs. */
    appIcons?: (packages: string[]) => Promise<Record<string, string>>;
    /** What is on this device's clipboard — the paste button on the command console. */
    readClipboard?: () => Promise<string>;
    /** Μια γραμμή όταν ένα βήμα σπάσει στο box — ο host ξέρει από δίκτυο, το UI όχι. */
    reportError?: (command: string, message: string, details?: Record<string, unknown>) => void;
    assetBase?: string;
    /** Fill the viewport (web) or keep the fixed 1280×820 window (desktop). */
    fill?: boolean;
    /**
     * Running on a television: the 1280×820 canvas is scaled up to the screen inside a safe area,
     * and the focus ring stays visible without a keyboard "intent" (there is no mouse on a TV).
     */
    tv?: boolean;
  }
  let { brand, transport, platform = 'desktop', version, build, lang, langLocked = false, manifestOverride, startIn = 'wizard', fetchApk, sha256, getJson, selfUpdate, canSelfInstall, openSelfInstallPermission, manifest, openExternal, mirror, connectBridge, selfInfo, openSettingsScreen, appIcons, readClipboard, reportError, assetBase, fill = true, tv = false }: Props = $props();

  // the session is built once from the initial props (a brand/transport swap = a new <App>)
  /**
   * Decided here, before the session exists, because the session picks the first screen in its
   * constructor and on a phone there IS no language screen. Same rule as fitPhone().
   */
  const initialPhone = untrack(() => !tv && (((window.screen?.width || 0) > 0 && Math.min(window.screen.width, window.screen.height) <= 500) || window.innerWidth <= 780 || window.innerHeight <= 600));
  const S = provideSession(untrack(() => new Session({ brand, transport, platform, version, build, tv, phone: initialPhone, lang, langLocked, manifestOverride, startIn, fetchApk, sha256, getJson, selfUpdate, canSelfInstall, openSelfInstallPermission, manifest, openExternal, mirror, connectBridge, selfInfo, openSettingsScreen, appIcons, readClipboard, reportError, assetBase })));
  let root: HTMLDivElement | undefined = $state();

  /** The host can reach the state machine (dev tools, the prototype's "jump bar", tests): `mount(App, …).session()`. */
  export function session(): Session {
    return S;
  }

  // TV: fit the 1280×820 canvas to the screen, inside a 5% safe area (older sets overscan, and a
  // control touching the edge is a control the viewer cannot see).
  let scale = $state(1);
  /** The TV canvas's width: the screen's ratio, so nothing is left over on the sides. */
  let tvW = $state(1280);
  /** The keyboard is up: the viewport is a fraction of the screen and the canvas anchors to its top. */
  let keyboard = $state(false);
  function fitTv() {
    if (!tv) return;
    // The SCREEN, not the viewport. When the television's keyboard opens, the page's viewport is cut
    // to the top half (targetSdk 35+ hands the IME inset to the WebView and `adjustPan` in the
    // manifest no longer stops it). Scaling from that number shrank the whole app to half size the
    // moment someone typed — Jim, 28/9. The screen does not move, so the canvas keeps its size and
    // the keyboard simply covers its lower part, like the overlay it is meant to be.
    const sw = window.screen?.width || 0;
    const sh = window.screen?.height || 0;
    const w = Math.max(window.innerWidth, sw);
    const h = Math.max(window.innerHeight, sh);
    // FILL THE SCREEN (Jim, 29/9: "\u03bd\u03b1 \u03c0\u03b9\u03ac\u03bd\u03b5\u03b9 \u03cc\u03bb\u03bf \u03c4\u03bf screen \u03cc\u03c0\u03c9\u03c2 \u03c3\u03c4\u03bf exe"). The canvas is 1280\u00d7820 \u2014 1.56
    // against a television's 1.78 \u2014 so scaling by `min()` left a black bar on each side. On a TV the
    // canvas takes the SCREEN's ratio instead (the layout is elastic in width; that is exactly what
    // the desktop app shows at 1920), and the scale by height then fills it edge to edge.
    // FILL THE SCREEN (Jim, 29/9: «βγάλε εντελώς τα περιθώρια — δίνεις +20% στα μέσα»). The canvas
    // takes the SCREEN's ratio (1458×820 on 16:9) and the scale by height fills it edge to edge — no
    // band anywhere. The room against overscan comes from the layout's OWN padding, 20% wider on a
    // television (see the `:global(.app.tv)` rules in Wizard/Header/Stepper).
    tvW = h > 0 ? Math.min(1760, Math.max(1280, Math.round((820 * w) / h))) : 1280;
    scale = h / 820;
    // Anchored to the top while the keyboard is up: centring in a half-height viewport would push
    // the header — and the field being typed into — off the top of the screen.
    keyboard = sh > 0 && window.innerHeight < sh * 0.8;
  }

  /**
   * PHONE: the canvas cannot shrink to 400 px and stay readable (scaling it gives 5 px letters), so
   * below this size the app changes SHAPE instead — see portrait.css. The height test catches a
   * phone turned sideways, which is wide but only ~400 px tall.
   */
  const PHONE_W = 780;
  const PHONE_H = 600;
  /** A handset's short side. 411 on a phone, 768+ on the smallest laptop, 600–800 on a tablet. */
  const PHONE_SCREEN = 500;
  /** The TV frames in the guide are drawn at a fixed 720×405, so on a phone they are zoomed to fit. */
  let mockZoom = $state(1);
  function fitPhone() {
    if (tv) return;
    // `screen` FIRST, and this is not belt-and-braces: a phone answers `innerWidth = 1280` while the
    // old layout is still on screen, because a page whose content cannot fit makes Chrome widen the
    // layout viewport to the content. Asking innerWidth alone was a circle — 1280 wide so no phone
    // layout, no phone layout so 1280 wide (27/9/2026, found on the emulator with a title probe).
    // The screen's short side is a property of the device and says the same thing before, during and
    // after the change. innerWidth still has a vote, for a desktop window dragged narrow, where the
    // meta viewport plays no part and the number is honest.
    const short = Math.min(window.screen?.width || 0, window.screen?.height || 0);
    S.phone = (short > 0 && short <= PHONE_SCREEN) || window.innerWidth <= PHONE_W || window.innerHeight <= PHONE_H;
    // The host's own floor has to come off too, or #app keeps the page 1280 wide under our feet.
    document.documentElement.classList.toggle('phone', S.phone);
    const w = S.phone ? Math.min(window.innerWidth, short || window.innerWidth) : window.innerWidth;
    mockZoom = S.phone ? Math.round(Math.min(1, (w - 28) / 720) * 100) / 100 : 1;
  }
  function onResize() {
    fitTv();
    fitPhone();
  }

  /**
   * The canvas never scrolls sideways — it is `overflow: hidden` — but code can still scroll it, and
   * anything that calls `scrollIntoView` walks up and does exactly that. One such call left the whole
   * app 150 px off screen, header and footer with it. This puts it back, whoever moved it.
   */
  function snapBack() {
    if (root && root.scrollLeft !== 0) root.scrollLeft = 0;
  }

  /**
   * The remote's BACK button, called from MainActivity. Returns true when the page consumed it;
   * false lets the app close, which is what a TV viewer expects from BACK on the first screen.
   */
  function handleBack(): boolean {
    // Το BACK του τηλεχειριστηρίου: ό,τι είναι ΠΑΝΩ από την οθόνη κλείνει πρώτο.
    if (S.codeAsk) {
      S.cancelCodeAsk();
      return true;
    }
    if (S.help) {
      S.closeHelp();
      return true;
    }
    if (S.dbAsk) {
      // the question over the debloat list: BACK is "no", and nothing on the box changes
      S.closeAsk();
      return true;
    }
    if (S.human) return true; // waiting on the TV: BACK must not skip the step
    // the focused control may own BACK (data-nav-back, nav.ts): the ring goes where it says
    if (backRule()) return true;
    if (S.mode === 'workspace') {
      // ΠΙΣΩ ΣΤΙΣ ΕΡΓΑΣΙΕΣ, ΟΧΙ ΣΤΗΝ ΑΡΧΗ (Jim, 9/10, emulator: «πατάω back και πηδάει στο πρώτο
      // screen — πάλι από την αρχή;»). Το BACK από μια σελίδα εργασίας ξανάρχιζε τον οδηγό από το
      // Developer mode. Οι σελίδες ανοίγουν από τον πίνακα εργασιών, άρα εκεί γυρνούν. Μόνο το
      // kiosk brand, που προσγειώνεται απευθείας στον χώρο εργασίας, κρατά τον παλιό δρόμο.
      if (S.brand.flow === 'kiosk') S.restartGuide();
      else S.backToTasks();
      return true;
    }
    if (S.showBack) {
      S.back();
      return true;
    }
    return false;
  }

  onMount(() => {
    S.start();
    // ΥΠΑΡΧΕΙ ΝΕΟΤΕΡΗ ΕΚΔΟΣΗ; Με καθυστέρηση, ώστε η πρώτη οθόνη να μην περιμένει δίκτυο.
    setTimeout(() => void S.checkAppUpdate(), 6000);
    fitTv();
    fitPhone();
    const w = window as unknown as { __tvlmBack?: () => boolean };
    w.__tvlmBack = handleBack;
    return () => {
      delete w.__tvlmBack;
      S.destroy();
    };
  });

  /** BACK owned by the focused control (data-nav-back): true when the ring moved and the key is spent. */
  function backRule(): boolean {
    const owner = navOwner(root ?? null, document.activeElement);
    const rule = navRule(owner, 'back');
    return rule !== null && jump(navTargets(), rule, owner);
  }
  function navTargets(): HTMLElement[] {
    if (!root) return [];
    // A question over the page keeps the arrows: walking behind a scrim to press a row nobody can
    // see is how a remote does damage. The help sheet is a real <dialog> and handles its own.
    const modal = root.querySelector<HTMLElement>('[role="dialog"]');
    const scope: ParentNode = modal ?? root;
    return [...scope.querySelectorAll<HTMLElement>('[data-nav]:not(:disabled)')].filter((el) => el.offsetParent !== null);
  }
  function onKey(e: KeyboardEvent) {
    // a guide sheet is modal: it handles its own Tab/Escape, the wizard must not move behind it
    if (S.help) return;
    const t = e.target as HTMLElement | null;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
    if (e.key === 'Escape') {
      // ΠΡΩΤΑ Ο ΔΙΑΛΟΓΟΣ, ΜΕΤΑ Ο ΟΔΗΓΟΣ (Jim, 3/10/2026). Το Escape μέσα στο κουτάκι του κωδικού
      // έφτανε ως εδώ και πήγαινε τον ΟΔΗΓΟ ένα βήμα πίσω: ο διάλογος έκλεινε ΚΑΙ η οθόνη άλλαζε,
      // με το δαχτυλίδι να προσγειώνεται κάπου τρίτο.
      if (S.codeAsk) {
        e.preventDefault();
        S.cancelCodeAsk();
        return;
      }
      // the focused control may own BACK (data-nav-back): ring there, nothing else moves
      if (backRule()) {
        e.preventDefault();
        return;
      }
      if (S.mode === 'wizard' && S.showBack) {
        e.preventDefault();
        S.back();
      }
      return;
    }
    if (typing && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const dirs: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    const d = dirs[e.key];
    if (!d) return;
    // ΚΑΝΕΝΑ ΒΕΛΟΣ ΕΛΕΥΘΕΡΟ ΣΕ ΤΗΛΕΟΡΑΣΗ (Mi Box 4, 9/10/2026). Ένα βέλος που δεν καταναλώναμε
    // («δεν υπάρχει τίποτα προς τα εκεί») έμενε στο WebView: σε box χωρίς οθόνη αφής το Chromium
    // ανάβει τη δική του spatial navigation και μετακινεί το focus σε ό,τι εστιάζεται, με δικούς
    // του κανόνες και χωρίς δικό μας δαχτυλίδι. Εδώ το δαχτυλίδι το κουνάμε ΜΟΝΟ εμείς.
    if (tv) e.preventDefault();
    const list = navTargets();
    if (!list.length) return;
    const cur = document.activeElement as HTMLElement | null;

    // Ο ΚΑΝΟΝΑΣ ΤΟΥ PLUI (nav.ts): το εστιασμένο ξέρει ΕΚ ΤΩΝ ΠΡΟΤΕΡΩΝ πού πάει με κάθε βέλος.
    // Ένας δηλωμένος στόχος νικά τη γεωμετρία· χωρίς δήλωση, ή με στόχο που δεν είναι πάνω στην
    // οθόνη αυτή τη στιγμή, τρέχει η γεωμετρία πιο κάτω — όπως στο Compose.
    const owner = navOwner(root ?? null, cur);
    const dir = NAV_DIR[e.key];
    const rule = dir ? navRule(owner, dir) : null;
    if (dir && rule !== null) {
      if (jump(list, rule, owner)) {
        e.preventDefault();
        return;
      }
      navGap(owner, dir, rule);
    }

    // TWO COLUMNS, NOT ONE QUEUE (Jim, 28/9: «με d-pad δεν περνάν right να κάνει on-off»).
    // The workspace is a task list beside a page. Walking every `[data-nav]` in DOM order meant that
    // from a sidebar item the right arrow went to the NEXT SIDEBAR ITEM, and the page's own buttons
    // came only after the last of them — seven presses to reach the first "Turn off". Left and right
    // now cross between the two columns, up and down move inside the one you are in.
    const where = (el: HTMLElement | null) => (!el ? null : el.closest('.nav') ? 'nav' : el.closest('.page') ? 'page' : null);
    const side = where(cur);
    if (side === 'nav' && e.key === 'ArrowRight') {
      // never a text field: landing on one opens the television's keyboard, and crossing columns is
      // not the same as asking to type. The field stays reachable with up/down inside the page.
      const pageItems = list.filter((el) => where(el) === 'page');
      const intoPage = pageItems.find((el) => el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') ?? pageItems[0];
      if (intoPage) {
        e.preventDefault();
        intoPage.focus();
        return;
      }
    }
    if (side === 'page' && e.key === 'ArrowLeft') {
      // back to the task this page belongs to, not to the top of the list
      const back = root?.querySelector<HTMLElement>('.nav .nav-item.active') ?? list.find((el) => where(el) === 'nav');
      if (back) {
        e.preventDefault();
        back.focus();
        return;
      }
    }
    // inside one column when there is one; everything else is decided by what is ON SCREEN
    const scope = side ? list.filter((el) => where(el) === side) : list;
    if (!scope.length) return;

    // GEOMETRY, NOT DOM ORDER (Jim, 29/9, in front of the emulator: «δεν κάνει σωστό navi»).
    // The Tasks hub is a two-column GRID of tiles. Walking `[data-nav]` in document order meant that
    // "down" landed in the other column and "left" went to the previous tile in the markup — which
    // is above, beside or nowhere, depending on the row. A remote points at the screen, so the
    // answer has to come from the screen: the nearest focusable whose box lies in the direction
    // pressed, preferring the ones that overlap the current box on the other axis (same row for
    // left/right, same column for up/down).
    const horiz = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    const cr = cur && scope.includes(cur) ? cur.getBoundingClientRect() : null;
    let best: HTMLElement | null = null;
    if (cr) {
      let bestScore = Infinity;
      const cx = cr.left + cr.width / 2;
      const cy = cr.top + cr.height / 2;
      for (const el of scope) {
        if (el === cur) continue;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) continue; // hidden: not a place the ring can go
        const along = (horiz ? r.left + r.width / 2 - cx : r.top + r.height / 2 - cy) * d;
        if (along <= 2) continue; // behind us, or the same line: not in this direction
        // overlapping the current box on the other axis = the same row (or column): those win
        const overlap = horiz
          ? Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top)
          : Math.min(cr.right, r.right) - Math.max(cr.left, r.left);
        // ΑΠΟ ΦΑΡΔΙΑ ΚΑΡΤΑ ΠΡΟΣ ΠΛΑΚΙΔΙΑ (Mi Box, 9/10/2026): «Change launcher» πιάνει όλο το
        // πλάτος και το ▼ πήγαινε στη ΜΕΣΑΙΑ στήλη (Install APK), γιατί εκεί ήταν το κέντρο της.
        // Όποιος διαβάζει ξεκινά από αριστερά: όταν η κάρτα είναι πολύ φαρδύτερη από τον στόχο,
        // μετράμε από την αριστερή της άκρη, όχι από το κέντρο — και το ▼ πέφτει στο Debloat.
        const across = horiz
          ? Math.abs(r.top + r.height / 2 - cy)
          : overlap > 0 && cr.width > r.width * 1.5
            ? Math.abs(r.left - cr.left)
            : Math.abs(r.left + r.width / 2 - cx);
        // ΚΩΝΟΣ, ΟΧΙ ΜΙΣΟ ΕΠΙΠΕΔΟ (Mi Box, 9/10/2026, μετρημένο με screencap): «προς τα δεξιά» ήταν
        // ό,τι είχε κέντρο έστω 2px δεξιότερα, όσο ψηλά κι αν καθόταν — το ▶ από το «Continue»
        // πήγαινε στο κουμπί replay του βίντεο, 45px δεξιότερα και 200px ψηλότερα. Χωρίς επικάλυψη
        // ο στόχος πρέπει να είναι περισσότερο ΜΠΡΟΣΤΑ παρά ΠΛΑΓΙΑ (έως ~56° από τον άξονα)·
        // αλλιώς δεν είναι «προς τα εκεί» και το δαχτυλίδι μένει.
        if (overlap <= 0 && across > along * 1.5) continue;
        const score = along + across * (overlap > 0 ? 0.2 : 2.5);
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
    }
    // NOTHING THAT WAY = STAY PUT. A remote that teleports the ring to the other end of the screen
    // because there was nothing below is worse than one that does nothing: the person presses down
    // once more and is somewhere they never looked (emulator, 29/9 — six presses down the language
    // list ended on "Skip the guide" at the far left). The flat walk is only for the FIRST press,
    // when there is no ring anywhere yet.
    if (!best && !cr) {
      // ΟΧΙ το πρώτο στοιχείο του DOM (Mi Box, 9/10/2026): αυτό ήταν το κουμπί play του βίντεο, το
      // δαχτυλίδι γινόταν κουκκίδα 30px και το OK πάγωνε το κλιπ. Το πρώτο πάτημα πάει εκεί που θα
      // έβαζε το δαχτυλίδι και η αυτόματη τοποθέτηση: επιλεγμένη κάρτα, αλλιώς το κύριο κουμπί.
      const auto = autoTarget();
      if (auto && list.includes(auto)) best = auto;
      else {
        const i = d > 0 ? -1 : 0;
        best = scope[(i + d + scope.length) % scope.length] ?? null;
      }
    }
    if (best) {
      e.preventDefault();
      best.focus();
    }
  }
  // when a wizard step changes, put the focus on the selected card (or the first control) so ↑↓ + Enter just work
  /**
   * WHERE THE RING SITS, AND WHY IT IS RECOMPUTED.
   *
   * Half of what a screen knows arrives AFTER it is drawn: the region answers which language this
   * is, the box answers that the commands get through. The ring used to be placed once, on the
   * screen's first frame, so it landed on the best target THAT INSTANT and stayed there — the ring
   * on English while the tick moved to Ελληνικά (the region answered a moment later), the ring on
   * «Back» while «Continue» went from disabled to enabled behind it.
   *
   * So the ring is placed again whenever a BETTER target appears — but only while it is still
   * sitting where WE put it. The moment the person moves it themselves, it is theirs and nothing
   * here touches it again.
   */
  let ringAuto: HTMLElement | null = null;
  /** Where the ring belongs on this screen when nobody has put it anywhere — best first. */
  function autoTarget(): HTMLElement | null {
    // ΜΟΝΟ ΟΡΑΤΟΙ ΥΠΟΨΗΦΙΟΙ (emulator, 9/10/2026, μετρημένο μέσα από το DevTools): το
    // `querySelector('.card.sel')` έβρισκε την κάρτα «English» ΜΕΣΑ ΣΤΟ ΚΛΕΙΣΤΟ <dialog> του
    // επιλογέα γλώσσας στο header, το `focus()` πάνω της δεν έπιανε (κλειστός διάλογος = τίποτα
    // δεν εστιάζεται), το activeElement έμενε στο body και η οθόνη άνοιγε ΧΩΡΙΣ δαχτυλίδι —
    // σε κάθε βήμα, σε κάθε συσκευή, από την πρώτη μέρα. Το ίδιο φίλτρο με τα βέλη.
    const list = navTargets();
    const pick = (sel: string) => list.find((el) => el.matches(sel)) ?? null;
    // Where the ring goes, best first. Without the middle ones the ring landed on the first
    // control in the DOM — which in the workspace is the FIRST nav item, so opening "Automatic
    // setup" left the ring sitting on "Overview", pointing at the wrong page.
    return (
      // ΤΟ ΣΠΙΤΙ ΤΟΥ RING ΣΕ ΑΥΤΗ ΤΗΝ ΟΘΟΝΗ, ΔΗΛΩΜΕΝΟ (nav.ts): ο πίνακας εργασιών ανοίγει με το ring
      // στην πρώτη κάρτα, όχι στο κουμπί του footer (emulator, 9/10: «εδώ πρέπει να είναι η
      // προεπιλογή»). Μια οθόνη που το λέει νικά κάθε μαντεψιά πιο κάτω.
      pick('[data-nav-first]') ??
      pick('.card.sel') ??
      // a list whose FIRST row is the answer the screen is asking for (the launchers): the offer
      // deserves the ring, not the way out that changes nothing
      pick('[data-focus-list] .card') ??
      pick('[data-primary]') ??
      pick('.nav-item.active') ??
      // ΠΟΤΕ ΤΟ CHIP ΓΛΩΣΣΑΣ ΩΣ ΠΡΟΕΠΙΛΟΓΗ (Jim, 9/10, οθόνη Ελέγχου): όσο το Continue ήταν
      // ανενεργό, «το πρώτο [data-nav] του DOM» ήταν το chip στο header, και εκεί έμενε το ring.
      // Το «Πίσω» είναι το τίμιο σπίτι όσο η οθόνη δουλεύει· το header μόνο αν δεν υπάρχει τίποτα άλλο.
      pick('[data-nav-id="back"]') ??
      list.find((el) => !el.closest('.hdr')) ??
      list[0] ??
      null
    );
  }
  function placeAuto(entering = false) {
    if (!root) return;
    const active = document.activeElement as HTMLElement | null;
    const parked = active && active !== document.body && root.contains(active);
    // ΜΠΑΙΝΟΝΤΑΣ ΣΕ ΟΘΟΝΗ ΜΕ ΔΗΛΩΜΕΝΟ ΣΠΙΤΙ, ΤΟ RING ΠΑΕΙ ΕΚΕΙ (Jim, 9/10, emulator): τα κουμπιά του
    // footer είναι τα ΙΔΙΑ στοιχεία σε κάθε βήμα, οπότε μετά το «Συνέχεια» το focus έμενε πάνω στο
    // κουμπί και ο πίνακας εργασιών άνοιγε με το ring στο «Επιλογή — Αλλαγή launcher» αντί στην
    // πρώτη κάρτα — «δεν ξέρουμε τι θέλει ο χρήστης ακόμη». Το σπίτι (`data-nav-first`) νικά το
    // «είναι δικό του» μόνο τη στιγμή της εισόδου· μετά, ό,τι κουνήσει ο άνθρωπος μένει δικό του.
    if (entering) {
      const first = navTargets().find((el) => el.matches('[data-nav-first]')) ?? null;
      if (first) {
        if (first !== active) {
          ringAuto = first;
          first.focus({ preventScroll: true });
        }
        return;
      }
    }
    if (parked && active !== ringAuto) return; // the person moved it — it is theirs now
    const target = autoTarget();
    if (!target || target === active) return;
    ringAuto = target;
    target.focus({ preventScroll: true });
  }
  let lastScreen = '';
  $effect(() => {
    const screen = `${S.mode}/${S.step}/${S.task}`;
    // the two answers that arrive late and change which control deserves the ring
    void S.i18n.lang;
    void S.primaryDisabled;
    const entering = screen !== lastScreen;
    lastScreen = screen;
    queueMicrotask(() => placeAuto(entering));
  });

  /**
   * ΠΟΤΕ ΟΘΟΝΗ ΧΩΡΙΣ ΔΑΧΤΥΛΙΔΙ (Mi Box 4, 9/10/2026, μετρημένο). Ο Jim εναλλάσσει PLUI και εργαλείο
   * με το HOME: όταν το app ξαναέρχεται μπροστά, το focus έχει μείνει στο body και η οθόνη δεν έχει
   * δαχτυλίδι πουθενά — το επόμενο πλήκτρο ξεκινά «από το πουθενά». Το ίδιο όταν φύγει από το DOM
   * το στοιχείο που το κρατούσε. Το effect πιο πάνω τρέχει μόνο σε αλλαγή βήματος ή γλώσσας, άρα
   * δεν το έπιανε. Εδώ: σε κάθε επιστροφή και σε κάθε χαμένο focus, το δαχτυλίδι ξανά στη θέση
   * του — στην ίδια, αν το στοιχείο ζει ακόμη, αλλιώς εκεί που θα το έβαζε η αυτόματη τοποθέτηση.
   * Και σε τηλεόραση ένας φύλακας ανά δευτερόλεπτο, γιατί το Chrome ΔΕΝ στέλνει focusout όταν ο
   * εστιασμένος κόμβος απλώς αφαιρεθεί. Σε υπολογιστή (ποντίκι) το body ΕΙΝΑΙ νόμιμη θέση — εκεί
   * μόνο ξαναδείχνουμε ό,τι ήταν ήδη εστιασμένο, δεν επιβάλλουμε τίποτα.
   */
  /** The last control the ring sat on — where it goes back to when the WebView drops the focus. */
  let lastFocus: HTMLElement | null = null;
  function onFocusIn(e: FocusEvent) {
    const t = e.target as HTMLElement | null;
    if (t && root && t !== document.body && root.contains(t)) lastFocus = t;
  }
  function alive(el: HTMLElement | null): el is HTMLElement {
    return !!el && !!root && root.contains(el) && el.offsetParent !== null && !el.matches(':disabled');
  }
  function ensureRing() {
    if (!root) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body && root.contains(active)) {
      // still there: make the ring show again (never a text field — that would open the keyboard)
      if (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA') active.focus({ preventScroll: true });
      return;
    }
    if (!tv) return;
    // where the person was (emulator, 9/10: after HOME and back the ring sat on the suggested
    // language instead of «Switch to English», where it had been left), else where we had put it
    const target = alive(lastFocus) ? lastFocus : alive(ringAuto) ? ringAuto : autoTarget();
    if (!target) return;
    if (target !== lastFocus) ringAuto = target;
    target.focus({ preventScroll: true });
  }
  function lostFocus(): boolean {
    return document.activeElement === null || document.activeElement === document.body;
  }
  function onFocusOut() {
    // after the browser has settled on the next focus — act only when it settled on nothing
    if (tv) setTimeout(() => lostFocus() && ensureRing(), 0);
  }
  function onVisible() {
    if (document.visibilityState === 'visible') setTimeout(ensureRing, 50);
  }
  onMount(() => {
    if (!tv) return;
    const guard = setInterval(() => document.visibilityState === 'visible' && lostFocus() && ensureRing(), 1000);
    return () => clearInterval(guard);
  });
</script>

<svelte:window onkeydown={onKey} onresize={onResize} onfocus={ensureRing} onpageshow={ensureRing} onfocusin={onFocusIn} onfocusout={onFocusOut} />
<svelte:document onvisibilitychange={onVisible} />

<div class="app" class:fill={fill && !tv} class:tv class:keyboard={tv && keyboard} class:phone={S.phone} bind:this={root} onscrollcapture={snapBack} style:--app-scale={tv ? scale : null} style:--app-w={tv ? `${tvW}px` : null} style:--mock-zoom={S.phone ? mockZoom : null} style:--g1={brand.colors.gradient[0]} style:--g2={brand.colors.gradient[1]} style:--g3={brand.colors.gradient[2]} style:--wiz-gold={brand.colors.cta} style:--wiz-gold-text={brand.colors.ctaText} style:--wiz-teal={brand.colors.confirm} style:--wiz-teal-soft={brand.colors.confirmSoft} style:--focus={brand.colors.focus}>
  <div class="glow a"></div>
  <div class="glow b"></div>
  <Header />
  <!-- asked once, above whatever screen is open, and only when something suggested a language we have -->
  <LangSuggest />
  <!-- phone, first run: the language question as a dialog over the first step (no screen) -->
  <LangAsk />
  {#if S.mode === 'wizard'}
    <Wizard />
  {:else}
    <Workspace />
  {/if}
  <HelpSheet />
  <!-- Πάνω από ΟΛΑ, οδηγό και χώρο εργασίας: τι τρέχει τώρα στο κουτί, και η ερώτηση όταν σκάει. -->
  <RunDialog />
  <ApkDone />
  <ApkArrived />
  <UpdateAvailable />
  <CodeAsk />
</div>

<style>
  .app { position: relative; width: var(--app-w); height: var(--app-h); border-radius: 14px; overflow: hidden; box-shadow: 0 30px 80px rgba(26,39,68,.35), 0 2px 6px rgba(0,0,0,.2); background: linear-gradient(145deg, var(--g1) 0%, var(--g2) 52%, var(--g3) 100%); color: #fff; font-family: var(--font-ui); display: flex; flex-direction: column; }
  /* A browser window is not a television: past the cap the app stops stretching and centres, the
     way the public site's `--wrap` does. Filling 1920 or 2560 px scatters a four-row list across
     arm's length of screen and the eye loses it (Jim, 22/9). The canvas is designed at 1280; 1520
     gives the sidebar and the content column air without letting the rows drift apart. Below the
     cap nothing changes, and `min-width` keeps the old behaviour on a narrow window: scroll. */
  .app.fill { width: 100%; max-width: var(--app-max, 1520px); margin: 0 auto; height: 100%; min-width: var(--app-w); min-height: var(--app-h); border-radius: 0; box-shadow: none; }
  /* A phone: the floor comes off, because 1280 px of it would simply hang off the right edge. The
     app then fills whatever there is and portrait.css changes the shape inside. */
  .app.fill.phone { min-width: 0; min-height: 0; max-width: none; }
  /* Only once there is something beside it: the edge makes it read as a window instead of a page
     that failed to fill. */
  @media (min-width: 1560px) {
    .app.fill { box-shadow: 0 0 0 1px rgba(255,255,255,.07), 0 30px 90px rgba(0,0,0,.45); }
  }
  /* TV: the fixed canvas, scaled to the screen and centred. Scaling beats stretching — every size
     in the design keeps its proportion, so text stays readable from the sofa. */
  .app.tv { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(var(--app-scale, 1)); transform-origin: center; border-radius: 0; box-shadow: none; }
  /* keyboard up: the canvas keeps its size and hangs from the top, so the header and whatever is
     being typed into stay on screen while the keyboard covers the bottom. */
  .app.tv.keyboard { top: 0; transform: translate(-50%, 0) scale(var(--app-scale, 1)); transform-origin: top center; }
  .glow { position: absolute; border-radius: 50%; pointer-events: none; }
  .glow.a { left: -200px; top: -260px; width: 820px; height: 820px; background: radial-gradient(circle, rgba(0,161,169,.28) 0%, rgba(0,161,169,0) 70%); }
  .glow.b { right: -160px; bottom: -320px; width: 900px; height: 900px; background: radial-gradient(circle, rgba(200,144,58,.22) 0%, rgba(200,144,58,0) 70%); }
</style>
