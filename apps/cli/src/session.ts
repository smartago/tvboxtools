// One session = transport → device → engine (+ report). Shared by the commands and the MCP server.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Readable } from 'node:stream';
import { MockTransport, NoDevicesError, type AdbDevice, type AdbTransport, type DeviceInfo } from '@tvlm/adb';
import { createNodeTransport } from '@tvlm/adb/node';
import { targetConfig, ProvisionEngine, SessionReport, TOOL_VERSION, validateManifest, type AdbShell, type BoxCheck, type BrandConfig, type EngineEvent, type Manifest, type ShellStep, type StepContext } from '@tvlm/core';
import type { CliOptions } from './cli.js';

export interface Io {
  /** stdout — the answer (JSON in --json mode). */
  out: (s: string) => void;
  /** stderr — progress, warnings. */
  err: (s: string) => void;
  isTTY: boolean;
  ask: (question: string) => Promise<string>;
}

export function defaultIo(): Io {
  return {
    out: (s) => process.stdout.write(s + '\n'),
    err: (s) => process.stderr.write(s + '\n'),
    isTTY: Boolean(process.stdin.isTTY && process.stderr.isTTY),
    ask: async (q) => {
      const rl = createInterface({ input: process.stdin, output: process.stderr });
      try {
        return await rl.question(q);
      } finally {
        rl.close();
      }
    },
  };
}

export const REPORTS_DIR = join(homedir(), '.tvlm', 'reports');

export function createTransport(o: Pick<CliOptions, 'mock' | 'box' | 'brand' | 'target' | 'port' | 'timeout'>): AdbTransport {
  if (o.mock) return new MockTransport({ speed: 0, scenario: o.mock, box: o.box ?? 'xiaomi', launcherPackage: targetConfig(o.target).launcherPackage });
  return createNodeTransport({ port: o.port, discoverTimeoutMs: o.timeout });
}

/** Resolve the target box: --connect / --serial / --usb, else discover and expect exactly one. */
export async function pickDevice(transport: AdbTransport, o: Pick<CliOptions, 'connect' | 'usb' | 'serial' | 'subnet' | 'yes'>, io: Io, signal?: AbortSignal): Promise<AdbDevice> {
  let target: DeviceInfo | string;
  if (o.connect) target = o.connect;
  else if (o.serial) target = { id: o.serial, name: o.serial, addr: `USB · ${o.serial}`, method: 'usb' };
  else {
    const list = await transport.discover({ paths: o.usb ? ['usb'] : undefined, subnet: o.subnet, signal });
    if (list.length === 0) throw new NoDevicesError('none');
    if (list.length > 1 && transport.kind !== 'mock') {
      // The mock (prototype) always takes its first box; a real run must be told which.
      if (!o.yes) throw new Error(`several boxes found — pick one with --connect/--serial:\n${list.map((d) => `  ${d.addr}  ${d.name}`).join('\n')}`);
      io.err(`several boxes; --yes takes the first: ${list[0]!.addr}`);
    }
    target = list[0]!;
  }
  io.err(`connecting to ${typeof target === 'string' ? target : target.addr} … (press Allow on the TV if asked)`);
  return transport.connect(target, {
    waitForAuth: true,
    signal,
    onUnauthorized: (n) => io.err(n === 1 ? 'waiting for Allow on the TV…' : n === 3 ? 'still waiting — on the TV tick "Always allow" and press Allow' : `waiting… (${n})`),
  });
}

/** A shell that survives a reboot: `swap()` points it at the reconnected device. */
export class ReconnectingShell implements AdbShell {
  constructor(public current: AdbDevice) {}
  shell(cmd: string): Promise<string> {
    return this.current.shell(cmd);
  }
  install(apk: ReadableStream<Uint8Array>, opts?: { size?: number; name?: string }): Promise<string> {
    return this.current.install(apk, opts);
  }
  screencap(): Promise<Uint8Array> {
    return this.current.screencap();
  }
  swap(d: AdbDevice): void {
    this.current = d;
  }
}

/** SHA-256 of a stream, consumed fully (a tee branch must be consumed, never cancelled). */
export async function sha256Stream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const h = createHash('sha256');
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    h.update(value);
  }
  return h.digest('hex');
}

/** http(s) via fetch, or a local file (path / file://). Never buffered on disk. */
export async function fetchApk(url: string): Promise<{ stream: ReadableStream<Uint8Array>; size?: number }> {
  if (/^https?:/i.test(url)) {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`download failed: ${res.status} ${url}`);
    const len = res.headers.get('content-length');
    return { stream: res.body as ReadableStream<Uint8Array>, size: len ? parseInt(len, 10) : undefined };
  }
  const path = url.startsWith('file://') ? new URL(url) : url;
  const size = (await stat(path)).size;
  return { stream: Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>, size };
}

/** The manifest: --manifest URL|file, else the brand's URL. `--mock` gets a built-in one whose hashes match `fetchApk`. */
export async function loadManifest(o: Pick<CliOptions, 'manifest' | 'mock'>, brand: BrandConfig): Promise<Manifest> {
  if (o.mock && !o.manifest) return mockManifest(brand);
  const src = o.manifest ?? brand.manifestUrl;
  let text: string;
  if (/^https?:/i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`manifest: ${res.status} ${src}`);
    text = await res.text();
  } else text = await readFile(src.startsWith('file://') ? new URL(src) : src, 'utf8');
  return validateManifest(JSON.parse(text));
}

export const MOCK_APK_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x74, 0x76, 0x6c, 0x6d, 0x00, 0x00]);
export const MOCK_APK_URL = 'mock://apk';

export function mockManifest(brand: BrandConfig): Manifest {
  const sha256 = createHash('sha256').update(MOCK_APK_BYTES).digest('hex');
  return {
    schema: 1,
    tool: { version: TOOL_VERSION, minVersion: TOOL_VERSION, downloads: {}, sha256: {} },
    apps: [
      { pkg: brand.launcherPackage, name: brand.launcherName, url: MOCK_APK_URL, sha256, versionCode: 1002, required: true, role: ['owner', 'reseller'] },
      { pkg: 'com.tv.setup.suite', name: 'TVS — TV Setup Suite', url: MOCK_APK_URL, sha256, versionCode: 1069, required: true, role: ['owner', 'reseller'] },
      { pkg: 'io.github.jqssun.airplay', name: 'AirPlay receiver', url: MOCK_APK_URL, sha256, versionCode: 31, required: true, role: ['owner', 'reseller'], group: 'airplay', license: 'GPL-3.0' },
    ],
  };
}

export interface SessionOptions {
  brand: BrandConfig;
  device: AdbDevice;
  io: Io;
  /** `confirm` verdicts: true = run without asking (--yes / MCP-confirmed), false = ask on the TTY, skip otherwise. */
  autoConfirm: boolean;
  mock: boolean;
  /** Print step events (stderr). */
  verbose?: boolean;
  onEvent?: (e: EngineEvent) => void;
  /** Override the whole confirm hook (the MCP server decides per call). */
  confirm?: (cmd: string, step: ShellStep) => Promise<boolean>;
  /** Override the human hook (the MCP server cannot wait for hands). */
  human?: (what: NonNullable<ShellStep['humanAfter']>, step: ShellStep) => Promise<void>;
}

export interface Session {
  brand: BrandConfig;
  transport?: AdbTransport;
  device: AdbDevice;
  shell: ReconnectingShell;
  engine: ProvisionEngine;
  report: SessionReport;
  /** Steps that needed the human's hands, in order. */
  humanActions: Array<{ what: NonNullable<ShellStep['humanAfter']>; step: string }>;
  rebooted: boolean;
}

export function createSession(o: SessionOptions): Session {
  const report = new SessionReport({ brand: o.brand.id, tool: o.brand.cli, version: TOOL_VERSION, startedAt: Date.now(), device: { serial: o.device.serial, model: o.device.info.name, addr: o.device.info.addr } });
  const shell = new ReconnectingShell(o.device);
  const humanActions: Session['humanActions'] = [];
  const session: Session = { brand: o.brand, device: o.device, shell, report, humanActions, rebooted: false, engine: undefined as unknown as ProvisionEngine };
  session.engine = new ProvisionEngine({
    brand: o.brand,
    shell,
    report,
    confirm: async (cmd, step) => {
      if (o.confirm) return o.confirm(cmd, step);
      if (o.autoConfirm) return true;
      if (!o.io.isTTY) {
        o.io.err(`skipped (needs confirmation, no TTY — use --yes): ${cmd}`);
        return false;
      }
      const a = await o.io.ask(`run on the TV?  ${cmd}\n[y/N] `);
      return /^y(es)?$/i.test(a.trim());
    },
    human: async (what, step) => {
      humanActions.push({ what, step: step.id });
      if (step.id === 'test.reboot') session.rebooted = true;
      if (o.human) return o.human(what, step);
      const text = { allow: 'the box reboots — when it is back, press Allow on the TV if it asks again', home: 'press HOME on the remote', pickLauncher: 'on the TV pick our launcher and "Always"', accounts: 'remove the Google account on the TV (Settings › Accounts)', reboot: 'the box is restarting — wait for the picture to come back' }[what];
      o.io.err(`→ on the TV: ${text}`);
      if (o.io.isTTY && !o.autoConfirm) await o.io.ask('press Enter when done ');
    },
    fetchApk: o.mock ? async () => ({ stream: new Blob([MOCK_APK_BYTES]).stream() as ReadableStream<Uint8Array>, size: MOCK_APK_BYTES.byteLength }) : fetchApk,
    sha256: sha256Stream,
    onEvent: (e) => {
      o.onEvent?.(e);
      if (!o.verbose) return;
      if (e.type === 'task:start') o.io.err(`== ${e.task}`);
      else if (e.type === 'step:start') o.io.err(`$ ${e.cmd}   (${e.verdict})`);
      else if (e.type === 'step:done') o.io.err(e.ok ? `  ok` : `  FAILED: ${e.output.trim().split('\n')[0] ?? ''}`);
      else if (e.type === 'install:app') o.io.err(`  ${e.phase} ${e.app.name}${e.detail ? ` — ${e.detail}` : ''}`);
      else if (e.type === 'log') o.io.err(`  [${e.kind}] ${e.text}`);
      else if (e.type === 'task:done') o.io.err(`== ${e.task}: ${e.ok ? 'done' : 'failed'}`);
    },
  });
  return session;
}

export function stepContext(o: Pick<CliOptions, 'profile' | 'lang' | 'link' | 'debugOff' | 'pin' | 'minutes'>, brand: BrandConfig, check: BoxCheck | null): StepContext {
  return {
    brand,
    profile: brand.profiles.includes(o.profile) ? o.profile : (brand.profiles[0] ?? 'open'),
    lang: o.lang,
    stockLauncher: check?.stockLauncher ?? null,
    linkCode: o.link,
    pin: o.pin,
    minutes: o.minutes,
    debugOff: brand.debugOffAtHandover && o.debugOff,
  };
}

/** After `test.reboot`: wait for the box to come back and swap the session's device. */
export async function reconnectAfterReboot(session: Session, transport: AdbTransport, io: Io, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<boolean> {
  const deadline = Date.now() + (opts.timeoutMs ?? 150_000);
  const info = session.device.info;
  io.err('waiting for the box to reboot…');
  await new Promise((r) => setTimeout(r, transport.kind === 'mock' ? 0 : 15_000));
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) return false;
    try {
      const d = await transport.connect(info, { waitForAuth: true, signal: opts.signal, onUnauthorized: (n) => n === 1 && io.err('press Allow on the TV again') });
      session.shell.swap(d);
      session.device = d;
      session.rebooted = false;
      io.err('reconnected');
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, transport.kind === 'mock' ? 0 : 3000));
    }
  }
  return false;
}

// ---------------------------------------------------------------- reports on disk

export async function saveReport(report: SessionReport): Promise<string> {
  await mkdir(REPORTS_DIR, { recursive: true });
  const stamp = new Date(report.meta.startedAt).toISOString().replace(/[:.]/g, '-');
  const serial = (report.meta.device?.serial ?? 'nodevice').replace(/[^\w.-]/g, '_');
  const base = join(REPORTS_DIR, `${stamp}-${serial}`);
  await writeFile(`${base}.json`, JSON.stringify(report.toJSON(), null, 2));
  await writeFile(`${base}.txt`, report.toText());
  return base;
}

export async function latestReport(): Promise<{ json: string; text: string; path: string } | null> {
  let names: string[];
  try {
    names = (await readdir(REPORTS_DIR)).filter((n) => n.endsWith('.json')).sort();
  } catch {
    return null;
  }
  const last = names.at(-1);
  if (!last) return null;
  const path = join(REPORTS_DIR, last);
  return { path, json: await readFile(path, 'utf8'), text: await readFile(path.replace(/\.json$/, '.txt'), 'utf8').catch(() => '') };
}
