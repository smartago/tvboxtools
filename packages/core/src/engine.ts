// ProvisionEngine — runs tasks against a shell, through the gate, into the report.
// It knows nothing about transports (packages/adb) or UI (packages/ui): it only needs `AdbShell`.

import type { BrandConfig, HomeMethod } from './brand.js';
import { buildCheck, CHECK_COMMANDS, type BoxCheck, type CheckOutputs } from './check.js';
import { classifyCommand, type GateVerdict } from './gate.js';
import { ourFile, pickApps, type Manifest, type PickedApp, type Role } from './manifest.js';
import { SessionReport } from './report.js';
import { autoRunOrder, renderCommand, stepSucceeded, stepsFor, type ShellStep, type StepContext, type TaskId } from './steps.js';

/** The minimum a transport must offer. `install` takes bytes so the phone never stores an APK (Play policy). */
export interface AdbShell {
  shell(cmd: string): Promise<string>;
  /** `adb install -r` from a byte stream. Resolves to the installer's output ("Success"). */
  install(apk: ReadableStream<Uint8Array>, opts?: { size?: number; name?: string }): Promise<string>;
  /** PNG bytes of the TV screen. */
  screencap?(): Promise<Uint8Array>;
}

export type EngineEvent =
  | { type: 'step:start'; step: ShellStep; cmd: string; verdict: GateVerdict }
  | { type: 'step:confirm'; step: ShellStep; cmd: string }
  | { type: 'step:done'; step: ShellStep; ok: boolean; output: string }
  | { type: 'step:human'; step: ShellStep; what: NonNullable<ShellStep['humanAfter']> }
  | { type: 'task:start'; task: TaskId }
  | { type: 'task:done'; task: TaskId; ok: boolean }
  | { type: 'install:app'; app: PickedApp; phase: 'download' | 'verify' | 'install' | 'done' | 'skip'; detail?: string }
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
   * Αυτό το αντίγραφο ήρθε από το Google Play. Η πύλη τότε αρνείται ό,τι η έκδοση δεν κάνει
   * (uninstall/disable), ώστε η κονσόλα να μην ξεκλειδώνει ό,τι κρύβει η οθόνη.
   */
  playBuild?: boolean;
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
    const g = classifyCommand(cmd, { handoverLastStep: opts.handoverLastStep, playBuild: this.o.playBuild });
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
    for (const [key, cmd] of Object.entries(CHECK_COMMANDS) as Array<[keyof typeof CHECK_COMMANDS, string]>) {
      const r = await this.exec(cmd);
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
      const g = classifyCommand(cmd, { handoverLastStep: step.handoverLastStep, playBuild: this.o.playBuild });
      this.emit({ type: 'step:start', step, cmd, verdict: g.verdict });
      if (g.verdict === 'confirm') this.emit({ type: 'step:confirm', step, cmd });
      const r = await this.exec(cmd, { stepId: step.id, handoverLastStep: step.handoverLastStep, expectsDisconnect: step.expectsDisconnect });
      const ok = r.ran && stepSucceeded(step, r.output, step.expectRendered ? renderCommand({ ...step, cmd: step.expectRendered }, ctx) : undefined);
      this.emit({ type: 'step:done', step, ok, output: r.output });
      if (!ok) {
        allOk = false;
        this.o.report.add('err', step.onFail);
        if (task !== 'configure') break; // grants are independent; everything else stops at the first failure
        continue;
      }
      if (step.humanAfter) {
        this.emit({ type: 'step:human', step, what: step.humanAfter });
        await this.o.human?.(step.humanAfter, step);
      }
    }
    this.emit({ type: 'task:done', task, ok: allOk });
    return allOk;
  }

  /** Install from the manifest: stream → sha256 → `install`. Never touches the phone's storage. */
  async install(manifest: Manifest, role: Role, opts: { choices?: Record<string, string>; installed?: Map<string, number | null>; only?: string[] } = {}): Promise<boolean> {
    this.emit({ type: 'task:start', task: 'install' });
    const { fetchApk, sha256 } = this.o;
    if (!fetchApk || !sha256) {
      this.emit({ type: 'log', kind: 'err', text: 'install: host gave no fetchApk/sha256' });
      this.emit({ type: 'task:done', task: 'install', ok: false });
      return false;
    }
    let allOk = true;
    for (const app of pickApps(manifest, { role, choices: opts.choices, installed: opts.installed, only: opts.only })) {
      if (app.action === 'skip-current') {
        this.emit({ type: 'install:app', app, phase: 'skip', detail: 'up to date' });
        this.o.report.add('info', `${app.pkg} up to date (${app.versionCode})`);
        continue;
      }
      try {
        this.emit({ type: 'install:app', app, phase: 'download' });
        const { stream, size } = await fetchApk(app.url);
        const [forHash, forInstall] = stream.tee();
        this.emit({ type: 'install:app', app, phase: 'verify' });
        const hex = await sha256(forHash);
        if (hex.toLowerCase() !== app.sha256.toLowerCase()) {
          // Ours, over HTTPS: the transport already proved where the bytes came from, and a digest
          // written at publish time says nothing about a build published since. Say it out loud and
          // carry on. Somebody else's file with the wrong digest is still refused.
          if (ourFile(app.url)) {
            this.emit({ type: 'log', kind: 'warn', text: `${app.pkg}: newer build than the manifest knows (sha256 differs) — installing it anyway, it is ours over HTTPS` });
            this.o.report.add('warn', `${app.pkg}: manifest sha256 is out of date (${app.sha256.slice(0, 12)}… vs ${hex.slice(0, 12)}…)`);
          } else {
            await forInstall.cancel();
            throw new Error(`sha256 mismatch for ${app.pkg}`);
          }
        }
        this.emit({ type: 'install:app', app, phase: 'install' });
        this.o.report.add('cmd', `install -r ${app.name} (${app.pkg} ${app.versionCode})`, { verdict: 'confirm', stepId: `install.${app.pkg}` });
        const out = await this.o.shell.install(forInstall, { size, name: app.pkg });
        this.o.report.add('out', out.trimEnd());
        if (!/Success/i.test(out)) throw new Error(out.trim() || 'install failed');
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
   * An APK the person picked off their own disk — the "Install my APK" tile (TASKS_HUB_PLAN §4),
   * and the one thing every sideloader opens a tool for. No manifest, no digest to compare against:
   * the file is theirs, they chose it, and the report says what was sent. It is written down the
   * same way an install from the manifest is, so a box's report is still the whole story.
   */
  async installFile(apk: ReadableStream<Uint8Array>, opts: { size?: number; name?: string } = {}): Promise<string> {
    this.o.report.add('cmd', `install -r ${opts.name ?? 'local file'}${opts.size ? ` (${opts.size} bytes)` : ''}`, { verdict: 'confirm', stepId: 'install.local' });
    const out = await this.o.shell.install(apk, opts);
    this.o.report.add(/Success/i.test(out) ? 'out' : 'err', out.trim() || 'install failed');
    return out;
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
