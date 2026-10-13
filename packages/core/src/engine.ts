// ProvisionEngine — runs tasks against a shell, through the gate, into the report.
// It knows nothing about transports (packages/adb) or UI (packages/ui): it only needs `AdbShell`.

import { ABI_FALLBACK_COMMAND, ABILIST_COMMAND, parseAbiList, pickApkUrl } from './abi.js';
import { appopCommand, grantCommand, HOME_COMMAND, OPEN_SETTLE_MS, parseLaunchComponent, planIsEmpty, resolveLaunchCommand, startCommand } from './afterinstall.js';
import type { BrandConfig, HomeMethod } from './brand.js';
import { buildCheck, CHECK_COMMANDS, type BoxCheck, type CheckOutputs } from './check.js';
import { classifyCommand, type GateVerdict } from './gate.js';
import { pickApps, type Manifest, type PickedApp, type Role } from './manifest.js';
import { SessionReport } from './report.js';
import { autoRunOrder, renderCommand, stepSucceeded, stepsFor, type ShellStep, type StepContext, type TaskId } from './steps.js';

/** The minimum a transport must offer. `install` takes bytes so the phone never stores an APK (Play policy). */
export interface AdbShell {
  shell(cmd: string): Promise<string>;
  /** `adb install -r` from a byte stream. Resolves to the installer's output ("Success"). */
  install(apk: ReadableStream<Uint8Array>, opts?: { size?: number; name?: string }): Promise<string>;
  /** PNG bytes of the TV screen. */
  screencap?(): Promise<Uint8Array>;
  /**
   * ΠΟΛΛΑ APK ΣΕ ΜΙΑ ΣΥΝΕΔΡΙΑ — base + splits ενός XAPK (`pm install-create` → `install-write` ανά
   * κομμάτι → `install-commit`). ΠΡΟΑΙΡΕΤΙΚΟ, όπως το `pull` της συσκευής: υπάρχει όπου το
   * transport μιλά στον daemon (USB/TCP/adb-server, η εφαρμογή Android, ο υπολογιστής) και λείπει
   * στη γέφυρα, που έχει μόνο ένα κανάλι RPC. Η σελίδα ρωτά πρώτα και το λέει.
   */
  installSplits?(parts: Array<{ name: string; size: number; open(): Promise<ReadableStream<Uint8Array>> }>, opts?: { name?: string }): Promise<string>;
  /** Ένα αρχείο στο κουτί (sync) — για τα OBB ενός XAPK. ΠΡΟΑΙΡΕΤΙΚΟ, ίδιος λόγος. */
  pushFile?(path: string, size: number, data: ReadableStream<Uint8Array>): Promise<void>;
}

export type EngineEvent =
  | { type: 'step:start'; step: ShellStep; cmd: string; verdict: GateVerdict }
  | { type: 'step:confirm'; step: ShellStep; cmd: string }
  | { type: 'step:done'; step: ShellStep; ok: boolean; output: string }
  | { type: 'step:human'; step: ShellStep; what: NonNullable<ShellStep['humanAfter']> }
  | { type: 'task:start'; task: TaskId }
  | { type: 'task:done'; task: TaskId; ok: boolean }
  | { type: 'install:app'; app: PickedApp; phase: 'download' | 'verify' | 'install' | 'after' | 'done' | 'skip'; detail?: string }
  | { type: 'log'; kind: 'info' | 'warn' | 'err'; text: string };

export interface EngineOptions {
  brand: BrandConfig;
  shell: AdbShell;
  report: SessionReport;
  /** Called for `confirm` verdicts. Resolve true to run, false to skip. Absent = skip everything that needs confirmation. */
  confirm?: (cmd: string, step: ShellStep) => Promise<boolean>;
  /** Called when the user must do something on the TV; resolve when done. */
  human?: (what: NonNullable<ShellStep['humanAfter']>, step: ShellStep) => Promise<void>;
  /** Fetch bytes for an APK (browser fetch / Node undici / Capacitor http). */
  fetchApk?: (url: string) => Promise<{ stream: ReadableStream<Uint8Array>; size?: number }>;
  /** SHA-256 of a stream — the host provides it (WebCrypto vs node:crypto). Returns hex. */
  sha256?: (stream: ReadableStream<Uint8Array>) => Promise<string>;
  onEvent?: (e: EngineEvent) => void;
  /**
   * ΕΝΑ ΒΗΜΑ ΑΠΕΤΥΧΕ ΣΤΟ BOX (2/10/2026). Μέχρι σήμερα αυτό έμενε ΜΟΝΟ στην τοπική αναφορά της
   * συνεδρίας — τηλεμετρία έφευγε μόνο για σφάλματα της ίδιας της JavaScript. Αποτέλεσμα: δεν
   * ξέραμε σε ΠΟΙΑ μοντέλα σπάει τι, και κάθε βελτίωση ήταν μαντεψιά. Ο host το συνδέει με τον
   * δικό του reporter· το core δεν ξέρει από δίκτυο.
   */
  onStepFailed?: (step: ShellStep, output: string) => void;
  /**
   * ΜΙΑ ΕΝΤΟΛΗ ΕΣΚΑΣΕ — ΣΥΝΕΧΙΖΟΥΜΕ; (Jim, 2/10/2026, από αληθινό box.)
   *
   * Μέχρι σήμερα η πρώτη αποτυχία σταματούσε ΣΙΩΠΗΛΑ όλη την αλυσίδα, και ο χρήστης έπαιρνε ένα
   * γενικό «δεν έγινε» χωρίς να μάθει ποια από τις τρεις εντολές έφταιγε. Χειρότερα: η αλυσίδα του
   * launcher κλείνει ΠΡΩΤΑ τον εργοστασιακό και ορίζει τον νέο ΜΕΤΑ — μια αποτυχία στη μέση αφήνει
   * την τηλεόραση χωρίς αρχική οθόνη. Τώρα ρωτάμε, με την εντολή και την απάντηση του κουτιού στα
   * χέρια του ανθρώπου.
   *
   * Χωρίς handler η συμπεριφορά μένει η παλιά (σταματά) — το CLI και τα tests δεν ρωτούν κανέναν.
   * Το `install` ΔΕΝ περνά από εδώ: είναι ξεχωριστή εργασία (`runInstall`), και χωρίς το APK δεν
   * έχει νόημα να προχωρήσει τίποτα.
   */
  onFailure?: (step: ShellStep, cmd: string, output: string) => Promise<boolean>;
  /**
   * ΤΟ ΕΡΓΑΛΕΙΟ ΤΡΕΧΕΙ ΠΑΝΩ ΣΤΟ ΙΔΙΟ ΤΟ BOX (Jim, 12/10/2026, βίντεο): το πακέτο του, αλλιώς null.
   * Μετά το «άνοιξέ το μία φορά» μιας εφαρμογής (afterinstall), το HOME έκρυβε το ίδιο το εργαλείο —
   * η εγκατάσταση συνέχιζε στο παρασκήνιο και ο άνθρωπος έμενε στην αρχική χωρίς να ξέρει τι έγινε.
   * Με αυτό, η μηχανή γυρνά ΣΤΟ ΕΡΓΑΛΕΙΟ αντί για HOME. Συνάρτηση, γιατί ο στόχος διαλέγεται μετά.
   */
  selfPackage?: () => string | null;
  /**
   * ΠΟΣΟ ΠΕΡΙΜΕΝΟΥΜΕ ΜΙΑ ΕΝΤΟΛΗ ΤΟΥ ΕΛΕΓΧΟΥ (Jim, 9/10/2026, κινητό Android 11 ως κουτί: «πάτησα
   * allow αλλά έμεινε εδώ» — ο κύκλος γύριζε για πάντα). Ο έλεγχος είναι εννιά εντολές ανάγνωσης
   * που απαντούν σε δευτερόλεπτα· μία που δεν απαντά ποτέ δεν πρέπει να παγώνει την οθόνη χωρίς
   * όνομα. Μετά από τόσα ms ο έλεγχος σκάει με `CheckTimeoutError` που λέει ΠΟΙΑ εντολή σώπασε.
   */
  checkTimeoutMs?: number;
}

/** The check asked the box something and the box never answered — `cmd` is what it was asked. */
export class CheckTimeoutError extends Error {
  constructor(
    readonly cmd: string,
    readonly ms: number,
  ) {
    super(`no answer to "${cmd}" after ${ms} ms`);
    this.name = 'CheckTimeoutError';
  }
}

/** Resolve with `p`, or reject with `err()` once `ms` have passed without an answer. */
async function withTimeout<T>(p: Promise<T>, ms: number, err: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(err()), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** The answer to a command that kills the connection: whatever arrived before the box went. */
async function sentAndGone(p: Promise<string>, ms = 8000): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p.catch(() => ''),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve(''), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export class ProvisionEngine {
  private readonly o: EngineOptions;
  constructor(o: EngineOptions) {
    this.o = o;
  }

  private emit(e: EngineEvent) {
    this.o.onEvent?.(e);
  }

  /** Run one raw command through the gate (UI console, MCP `shell`). */
  async exec(cmd: string, opts: { stepId?: string; handoverLastStep?: boolean; expectsDisconnect?: boolean } = {}): Promise<{ verdict: GateVerdict; output: string; ran: boolean }> {
    const g = classifyCommand(cmd, { handoverLastStep: opts.handoverLastStep });
    this.o.report.add('cmd', cmd, { verdict: g.verdict, stepId: opts.stepId });
    if (g.verdict === 'blocked') {
      this.o.report.add('err', `blocked: ${g.reason}`);
      return { verdict: g.verdict, output: '', ran: false };
    }
    if (g.verdict === 'confirm') {
      const ok = this.o.confirm ? await this.o.confirm(cmd, { id: opts.stepId ?? 'raw', task: 'maintenance', label: 'raw', cmd, onFail: 'err_raw' }) : false;
      if (!ok) {
        this.o.report.add('warn', 'skipped (not confirmed)');
        return { verdict: g.verdict, output: '', ran: false };
      }
    }
    // A command that takes the box down with it (`reboot`) answers by going quiet: the socket dies
    // and the promise never settles. Waiting eight seconds for an answer that cannot come is the
    // whole difference between a run that ends and a run that sits on "Running…" for ever.
    const output = opts.expectsDisconnect ? await sentAndGone(this.o.shell.shell(cmd)) : await this.o.shell.shell(cmd);
    if (output.trim()) this.o.report.add('out', output.trimEnd());
    return { verdict: g.verdict, output, ran: true };
  }

  /** Wizard step 8 / `tvlm --check`. Read-only. */
  async check(): Promise<BoxCheck> {
    const outputs: CheckOutputs = {};
    const ms = this.o.checkTimeoutMs ?? 20000;
    for (const [key, cmd] of Object.entries(CHECK_COMMANDS) as Array<[keyof typeof CHECK_COMMANDS, string]>) {
      // a read that never comes back is reported by name, not waited for ever (see checkTimeoutMs)
      const r = await withTimeout(this.exec(cmd), ms, () => new CheckTimeoutError(cmd, ms));
      outputs[key] = r.output;
    }
    return buildCheck(outputs, this.o.brand.launcherPackage);
  }

  /** One task (profile / launcher / configure / test / handover / maintenance) — the shell-step kind. */
  async runTask(task: Exclude<TaskId, 'install'>, ctx: StepContext, homeMethod?: HomeMethod): Promise<boolean> {
    this.emit({ type: 'task:start', task });
    let allOk = true;
    for (const step of stepsFor({ task, homeMethod }, ctx)) {
      const cmd = renderCommand(step, ctx);
      const g = classifyCommand(cmd, { handoverLastStep: step.handoverLastStep });
      this.emit({ type: 'step:start', step, cmd, verdict: g.verdict });
      if (g.verdict === 'confirm') this.emit({ type: 'step:confirm', step, cmd });
      const r = await this.exec(cmd, { stepId: step.id, handoverLastStep: step.handoverLastStep, expectsDisconnect: step.expectsDisconnect });
      const ok = r.ran && stepSucceeded(step, r.output, step.expectRendered ? renderCommand({ ...step, cmd: step.expectRendered }, ctx) : undefined);
      this.emit({ type: 'step:done', step, ok, output: r.output });
      if (!ok) {
        this.o.report.add('err', step.onFail);
        this.o.onStepFailed?.(step, r.output);
        if (task === 'configure') {
          allOk = false; // grants are independent: one refused appop stops nothing, but it is still a miss
          continue;
        }
        // Παλιά: `break` πάντα. Τώρα ρωτάμε όποιον μπορεί να απαντήσει· χωρίς handler, σταματά.
        if (await this.o.onFailure?.(step, cmd, r.output)) {
          // ΤΟ ΔΕΧΤΗΚΕ ΑΝΘΡΩΠΟΣ, άρα ΔΕΝ μολύνει το αποτέλεσμα. Χωρίς αυτό, η αλυσίδα συνέχιζε, το
          // HOME άλλαζε κανονικά, και το εργαλείο έλεγε παρ' όλα αυτά «δεν έγινε» — ένα ψέμα που
          // φάνηκε στην πρώτη κιόλας δοκιμή της ερώτησης (2/10/2026).
          this.emit({ type: 'log', kind: 'warn', text: `${step.id}: failed, carried on by the operator` });
          continue;
        }
        allOk = false;
        break;
      }
      if (step.humanAfter) {
        this.emit({ type: 'step:human', step, what: step.humanAfter });
        await this.o.human?.(step.humanAfter, step);
      }
    }
    this.emit({ type: 'task:done', task, ok: allOk });
    return allOk;
  }

  /** Install from the manifest: stream → `install`. Nothing in between. Never touches the phone's storage. */
  async install(manifest: Manifest, role: Role, opts: { choices?: Record<string, string>; installed?: Map<string, number | null>; only?: string[] } = {}): Promise<boolean> {
    this.emit({ type: 'task:start', task: 'install' });
    const { fetchApk } = this.o;
    if (!fetchApk) {
      this.emit({ type: 'log', kind: 'err', text: 'install: host gave no fetchApk' });
      this.emit({ type: 'task:done', task: 'install', ok: false });
      return false;
    }
    let allOk = true;
    // ΤΑ ABI ΤΟΥ ΚΟΥΤΙΟΥ — μόνο αν κάποιο app έχει αρχείο ανά αρχιτεκτονική (abi.ts), και μία φορά ανά εκτέλεση
    let boxAbis: string[] | null = null;
    for (const app of pickApps(manifest, { role, choices: opts.choices, installed: opts.installed, only: opts.only })) {
      if (app.action === 'skip-current') {
        this.emit({ type: 'install:app', app, phase: 'skip', detail: 'up to date' });
        this.o.report.add('info', `${app.pkg} up to date (${app.versionCode})`);
        continue;
      }
      try {
        this.emit({ type: 'install:app', app, phase: 'download' });
        let url = app.url;
        if (app.abis) {
          if (boxAbis === null) {
            const r = await this.exec(ABILIST_COMMAND, { stepId: 'install.abilist' });
            boxAbis = r.ran ? parseAbiList(r.output) : [];
            if (!boxAbis.length) {
              const r1 = await this.exec(ABI_FALLBACK_COMMAND, { stepId: 'install.abi' });
              boxAbis = r1.ran ? parseAbiList(r1.output) : [];
            }
          }
          const choice = pickApkUrl(app, boxAbis);
          url = choice.url;
          this.o.report.add('info', `${app.pkg}: ${url.split('/').pop()} (${choice.why})`);
          this.emit({ type: 'log', kind: 'info', text: `${app.pkg}: ${choice.abi ?? 'default'} file — ${choice.why}` });
        }
        const { stream, size } = await fetchApk(url);
        // ΚΑΝΕΝΑΣ ΕΛΕΓΧΟΣ ΕΔΩ (Jim, 9/10/2026): «κανένα επιπλέον check, απλά γίνεται install το apk —
        // αν υπάρχει virus θα το βρει το Play Protect, ακόμη και sideload να είναι». Ό,τι σερβίρει
        // δικός μας server πάνω από HTTPS είναι έμπιστο, και ένα digest γραμμένο τη μέρα της
        // δημοσίευσης λέει ψέματα για το build που ανέβηκε μετά στο ΙΔΙΟ σταθερό όνομα
        // (docs: stable download filenames). Το `sha256` του manifest μένει ως ιστορικό, όχι ως πύλη·
        // ξένοι hosts δεν μας αφορούν — ό,τι μπαίνει στη λίστα, εγκαθίσταται.
        this.emit({ type: 'install:app', app, phase: 'install' });
        this.o.report.add('cmd', `install -r ${app.name} (${app.pkg} ${app.versionCode})`, { verdict: 'confirm', stepId: `install.${app.pkg}` });
        const out = await this.o.shell.install(stream, { size, name: app.pkg });
        this.o.report.add('out', out.trimEnd());
        if (!/Success/i.test(out)) throw new Error(out.trim() || 'install failed');
        // Ό,τι ζητά η γραμμή ΜΕΤΑ: εδώ, και μόνο εδώ — το αντίγραφο το έβαλε μόλις αυτή η εκτέλεση.
        if (!planIsEmpty(app.after)) {
          this.emit({ type: 'install:app', app, phase: 'after' });
          await this.afterInstall(app);
        }
        this.emit({ type: 'install:app', app, phase: 'done' });
      } catch (e) {
        allOk = false;
        const msg = e instanceof Error ? e.message : String(e);
        this.o.report.add('err', msg);
        this.emit({ type: 'log', kind: 'err', text: msg });
      }
    }
    this.emit({ type: 'task:done', task: 'install', ok: allOk });
    return allOk;
  }

  /**
   * ΜΕΤΑ ΤΗΝ ΕΓΚΑΤΑΣΤΑΣΗ (afterinstall.ts): οι άδειες που ονομάζει η γραμμή της λίστας, και ένα άνοιγμα.
   * Τρέχει μόνο πάνω σε αντίγραφο που ΜΟΛΙΣ εγκατέστησε αυτή η εκτέλεση (ο καλών είναι το `install`,
   * μετά από `Success`) — σε κάθε έκδοση του εργαλείου από 12/10/2026, και στο αντίγραφο του Play
   * (Jim: η εγκατάσταση στο box είναι ίδια παντού). Μια άρνηση του κουτιού δεν
   * χαλάει την εγκατάσταση — το app είναι μέσα· γράφεται στην αναφορά ως αστοχία με όνομα.
   */
  private async afterInstall(app: PickedApp): Promise<void> {
    const plan = app.after;
    if (!plan) return;
    const miss = (what: string, out: string) => {
      const why = out.trim().split(/\r?\n/).find((l) => /exception|error|unknown|not/i.test(l)) ?? out.trim().slice(0, 160);
      this.o.report.add('err', `${app.pkg}: ${what} — ${why || 'no answer'}`);
      this.emit({ type: 'log', kind: 'warn', text: `${app.pkg}: ${what} refused by the box (${why || 'no answer'})` });
    };
    for (const op of plan.appops) {
      const r = await this.exec(appopCommand(app.pkg, op), { stepId: `after.${app.pkg}.appops` });
      // `appops set` answers nothing on success; any text is the box saying no
      if (!r.ran || /exception|error|unknown/i.test(r.output)) miss(`appops ${op}`, r.output);
      else this.emit({ type: 'log', kind: 'info', text: `${app.pkg}: ${op} allowed` });
    }
    for (const perm of plan.grant) {
      const r = await this.exec(grantCommand(app.pkg, perm), { stepId: `after.${app.pkg}.grant` });
      if (!r.ran || /exception|error|unknown|not a changeable|has not requested/i.test(r.output)) miss(`grant ${perm}`, r.output);
      else this.emit({ type: 'log', kind: 'info', text: `${app.pkg}: ${perm} granted` });
    }
    if (plan.open) {
      // ΤΟ COMPONENT ΤΟ ΛΕΕΙ ΤΟ ΚΟΥΤΙ: πρώτα η τηλεοπτική είσοδος, μετά η κανονική
      let component: string | null = null;
      for (const tv of [true, false]) {
        const r = await this.exec(resolveLaunchCommand(app.pkg, tv), { stepId: `after.${app.pkg}.resolve` });
        component = r.ran ? parseLaunchComponent(r.output, app.pkg) : null;
        if (component) break;
      }
      if (!component) {
        miss('open', 'no launcher screen declared');
        return;
      }
      const r = await this.exec(startCommand(component), { stepId: `after.${app.pkg}.open` });
      if (!r.ran || /Error|unable|does not exist/i.test(r.output)) {
        miss('open', r.output);
        return;
      }
      this.emit({ type: 'log', kind: 'info', text: `${app.pkg}: opened once (${component})` });
      await new Promise((res) => setTimeout(res, OPEN_SETTLE_MS));
      // ΠΙΣΩ: στο εργαλείο, αν τρέχει σε αυτό το box (singleTask — έρχεται μπροστά όπως ήταν, δεν
      // ξαναφορτώνει)· αλλιώς στην αρχική. Αν το δικό μας component δεν βρεθεί, HOME όπως πριν.
      const self = this.o.selfPackage?.() ?? null;
      let back: string | null = null;
      if (self) {
        for (const tv of [true, false]) {
          const r = await this.exec(resolveLaunchCommand(self, tv), { stepId: `after.${app.pkg}.self` });
          back = r.ran ? parseLaunchComponent(r.output, self) : null;
          if (back) break;
        }
      }
      if (back) await this.exec(startCommand(back), { stepId: `after.${app.pkg}.back` });
      else await this.exec(HOME_COMMAND, { stepId: `after.${app.pkg}.home` });
    }
  }

  /**
   * An APK the person picked off their own disk — the "Install my APK" tile (TASKS_HUB_PLAN §4),
   * and the one thing every sideloader opens a tool for. No manifest, no digest to compare against:
   * the file is theirs, they chose it, and the report says what was sent. It is written down the
   * same way an install from the manifest is, so a box's report is still the whole story.
   */
  async installFile(apk: ReadableStream<Uint8Array>, opts: { size?: number; name?: string } = {}): Promise<string> {
    // ΚΑΙ ΑΥΤΟ ΕΙΝΑΙ ΕΓΚΑΤΑΣΤΑΣΗ (Jim, 3/10/2026: «πατάω install, δεν κάνει τίποτα»). Χωρίς τα δύο
    // μηνύματα, ένα APK δεκάδων MB ανέβαινε στο κουτί ΧΩΡΙΣ καμία ένδειξη: ο διάλογος με τη ζωντανή
    // ροή ανοίγει στο `task:start`, και η επιτυχία ή η αποτυχία φαίνεται στο `task:done`.
    this.emit({ type: 'task:start', task: 'install' });
    this.o.report.add('cmd', `install -r ${opts.name ?? 'local file'}${opts.size ? ` (${opts.size} bytes)` : ''}`, { verdict: 'confirm', stepId: 'install.local' });
    try {
      const out = await this.o.shell.install(apk, opts);
      const ok = /Success/i.test(out);
      this.o.report.add(ok ? 'out' : 'err', out.trim() || 'install failed');
      this.emit({ type: 'task:done', task: 'install', ok });
      return out;
    } catch (e) {
      this.emit({ type: 'task:done', task: 'install', ok: false });
      throw e;
    }
  }

  /**
   * ΕΝΑ XAPK: base + κομμάτια ΜΑΖΙ, σε μία συνεδρία του `pm`, και μετά τα OBB αν υπάρχουν.
   * Ό,τι ισχύει για το `installFile` ισχύει και εδώ: δύο μηνύματα ώστε ο διάλογος να ανοίγει και
   * να κλείνει, και η κονσόλα να γράφει τι στάλθηκε.
   */
  async installBundle(
    parts: Array<{ name: string; size: number; open(): Promise<ReadableStream<Uint8Array>> }>,
    obb: Array<{ target: string; size: number; open(): Promise<ReadableStream<Uint8Array>> }> = [],
    opts: { name?: string } = {},
  ): Promise<string> {
    if (!this.o.shell.installSplits) throw new Error('err_noSplits');
    this.emit({ type: 'task:start', task: 'install' });
    const total = parts.reduce((n, p) => n + p.size, 0);
    this.o.report.add('cmd', `install-multiple ${opts.name ?? 'bundle'} (${parts.length} parts, ${total} bytes)`, { verdict: 'confirm', stepId: 'install.bundle' });
    try {
      const out = await this.o.shell.installSplits(parts, { name: opts.name });
      const ok = /Success/i.test(out);
      this.o.report.add(ok ? 'out' : 'err', out.trim() || 'install failed');
      // ΤΑ OBB ΜΕΤΑ, ΟΧΙ ΠΡΙΝ: αν η εγκατάσταση απέτυχε, δεν έχει νόημα να γεμίσουμε τον δίσκο του
      // κουτιού με δεδομένα εφαρμογής που δεν υπάρχει.
      if (ok && obb.length) {
        if (!this.o.shell.pushFile) {
          this.o.report.add('warn', `${obb.length} obb file(s) not sent: this connection cannot push files`);
        } else {
          for (const f of obb) {
            this.o.report.add('cmd', `push ${f.target} (${f.size} bytes)`, { verdict: 'confirm', stepId: 'install.obb' });
            await this.o.shell.pushFile(f.target, f.size, await f.open());
          }
        }
      }
      this.emit({ type: 'task:done', task: 'install', ok });
      return out;
    } catch (e) {
      this.emit({ type: 'task:done', task: 'install', ok: false });
      throw e;
    }
  }

  /** Μπορεί ΑΥΤΗ η σύνδεση να βάλει πολλαπλά apk; (η γέφυρα δεν μπορεί — δες AdbShell) */
  get canInstallSplits(): boolean {
    return !!this.o.shell.installSplits;
  }

  /** The "Automatic" run (DESIGN_NOTES §2): everything in the brand's order, stopping only for hands. */
  async autoRun(ctx: StepContext, manifest: Manifest | null, role: Role, order: TaskId[] = autoRunOrder(this.o.brand)): Promise<Record<TaskId, boolean | null>> {
    const result: Record<TaskId, boolean | null> = { profile: null, install: null, launcher: null, configure: null, test: null, handover: null, maintenance: null };
    for (const task of order) {
      if (task === 'install') {
        result.install = manifest ? await this.install(manifest, role) : false;
        if (!result.install) break;
        continue;
      }
      result[task] = await this.runTask(task, ctx);
      if (!result[task] && task !== 'configure' && task !== 'test') break;
    }
    return result;
  }
}
