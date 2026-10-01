// `tvlm` — the same core from a terminal. `runCli(argv, io)` returns the exit code; bin/tvlm.mjs calls it.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { NoDevicesError, UnauthorizedError, type AdbDevice, type DeviceInfo } from '@tvlm/adb';
import { autoRunOrder, targetConfig, renderCommand, stepsFor, TOOL_VERSION, type BoxCheck, type Manifest, type TaskId } from '@tvlm/core';
import { runBridge } from './bridge.js';
import { parseCli, USAGE, UsageError, type CliOptions } from './cli.js';
import { runMcp } from './mcp.js';
import { createSession, createTransport, defaultIo, latestReport, loadManifest, pickDevice, reconnectAfterReboot, saveReport, stepContext, type Io, type Session } from './session.js';

type Json = Record<string, unknown>;

function table(rows: Array<[string, unknown]>): string {
  const w = Math.max(...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `${k.padEnd(w)}  ${Array.isArray(v) ? (v.length ? v.join(', ') : '—') : v === null || v === undefined || v === '' ? '—' : String(v)}`).join('\n');
}

function checkRows(c: BoxCheck): Array<[string, unknown]> {
  return [
    ['model', `${c.manufacturer} ${c.model}`.trim()],
    ['platform', c.platform + (c.isTv ? '' : ' (not a TV build)')],
    ['android', `${c.androidVersion} (API ${c.sdk})`],
    ['serial', c.serial],
    ['accounts', c.accounts],
    ['free', c.freeBytes === null ? null : `${(c.freeBytes / 1024 ** 3).toFixed(1)} GB of ${c.totalBytes === null ? '?' : (c.totalBytes / 1024 ** 3).toFixed(1)} GB`],
    ['launcher', c.launcherInstalled ? `installed (${c.launcherVersionCode ?? '?'})` : 'not installed'],
    ['home', c.currentHome],
    ['stock launcher', c.stockLauncher],
    ['device owner', c.deviceOwner],
    ['developer options', c.developerOptions ? 'on' : 'off'],
    ['adb', c.adbEnabled ? 'on' : 'off'],
    ['packages', c.installedPackages.length],
  ];
}

async function withSession<T>(o: CliOptions, io: Io, fn: (s: Session, check: BoxCheck) => Promise<T>): Promise<T> {
  const brand = targetConfig(o.target);
  const transport = createTransport(o);
  const device: AdbDevice = await pickDevice(transport, o, io);
  const session = createSession({ brand, device, io, autoConfirm: o.yes, mock: Boolean(o.mock), verbose: !o.json || o.mock === undefined });
  session.transport = transport;
  try {
    const check = await session.engine.check();
    session.report.meta.device = { serial: check.serial || device.serial, model: `${check.manufacturer} ${check.model}`.trim() || device.info.name, addr: device.info.addr };
    return await fn(session, check);
  } finally {
    if (!o.mock) await saveReport(session.report).then((p) => io.err(`report: ${p}.txt`)).catch(() => {});
    await session.device.close().catch(() => {});
  }
}

/** The automatic run, task by task (same rules as `ProvisionEngine.autoRun`, plus `--stop-before` and reboot re-connect). */
async function provision(o: CliOptions, io: Io, s: Session, check: BoxCheck, manifest: Manifest | null): Promise<Record<TaskId, boolean | null>> {
  const ctx = stepContext(o, s.brand, check);
  const result: Record<TaskId, boolean | null> = { profile: null, install: null, launcher: null, configure: null, test: null, handover: null, maintenance: null };
  for (const task of autoRunOrder(s.brand)) {
    if (o.stopBefore === task) break;
    if (s.rebooted && s.transport && !(await reconnectAfterReboot(s, s.transport, io))) {
      io.err(`the box did not come back after the reboot — ${task} skipped`);
      break;
    }
    if (task === 'install') {
      result.install = manifest ? await s.engine.install(manifest, o.role, { installed: new Map(check.installedPackages.map((p) => [p, null])) }) : false;
      if (!result.install) break;
      continue;
    }
    result[task] = await s.engine.runTask(task, ctx, task === 'launcher' ? o.method : undefined);
    if (!result[task] && task !== 'configure' && task !== 'test') break;
  }
  return result;
}

export async function runCli(argv: string[], ioIn: Partial<Io> = {}): Promise<number> {
  const io: Io = { ...defaultIo(), ...ioIn };
  let o: CliOptions;
  try {
    o = parseCli(argv);
  } catch (e) {
    io.err(e instanceof Error ? e.message : String(e));
    io.err(USAGE);
    return 2;
  }
  const emit = (json: Json, human: string) => io.out(o.json ? JSON.stringify(json) : human);
  // `brand` here is the TARGET of the run (the product is always the one tool): its launcher, its
  // home methods, its profiles. Reported as `brand` in JSON for the agents that already read it.
  const brand = targetConfig(o.target);

  try {
    switch (o.command) {
      case 'help':
        io.out(USAGE);
        return 0;
      case 'version':
        emit({ tool: brand.cli, version: TOOL_VERSION, brand: brand.id }, `${brand.cli} ${TOOL_VERSION} (${brand.name})`);
        return 0;

      case 'discover': {
        const transport = createTransport(o);
        const found: DeviceInfo[] = [];
        try {
          const list = await transport.discover({ paths: o.usb ? ['usb'] : undefined, subnet: o.subnet, onFound: (d) => !o.json && io.err(`found ${d.addr}  ${d.name}`) });
          found.push(...list);
        } catch (e) {
          if (!(e instanceof NoDevicesError)) throw e;
          if (!o.json) io.err(`no devices (${e.hint})`);
        }
        io.out(o.json ? JSON.stringify(found) : found.length ? table(found.map((d) => [d.addr, `${d.name}  [${d.method}${d.tls ? ', tls' : ''}]`])) : 'no devices');
        return 0;
      }

      case 'pair': {
        const [hostPort, code] = o.positionals;
        if (!hostPort || !code) throw new UsageError('pair needs host:port and the 6-digit code');
        const transport = createTransport(o);
        if (!transport.pair) throw new Error('this transport cannot pair');
        await transport.pair(hostPort, code);
        emit({ paired: hostPort }, `paired ${hostPort} — now: tvlm check --connect ${hostPort}`);
        return 0;
      }

      case 'check':
        return await withSession(o, io, async (s, check) => {
          emit({ ...check, brand: brand.id, tool: TOOL_VERSION } as Json, table(checkRows(check)));
          return 0;
        });

      case 'provision':
        return await withSession(o, io, async (s, check) => {
          let manifest: Manifest | null = null;
          try {
            manifest = await loadManifest(o, brand);
          } catch (e) {
            io.err(`manifest: ${e instanceof Error ? e.message : String(e)}`);
          }
          const result = await provision(o, io, s, check, manifest);
          const ran = Object.entries(result).filter(([, v]) => v !== null);
          const ok = ran.every(([, v]) => v === true);
          emit({ ok, tasks: result, humanActions: s.humanActions, profile: stepContext(o, brand, check).profile }, table(ran.map(([k, v]) => [k, v ? 'ok' : 'FAILED'])) + (ok ? '\nprovisioned' : '\nprovisioning stopped — see the report'));
          return ok ? 0 : 1;
        });

      case 'install':
        return await withSession(o, io, async (s, check) => {
          const manifest = await loadManifest(o, brand);
          const ok = await s.engine.install(manifest, o.role, { installed: new Map(check.installedPackages.map((p) => [p, null])) });
          emit({ ok, apps: manifest.apps.map((a) => a.pkg) }, ok ? 'installed' : 'install failed — see the report');
          return ok ? 0 : 1;
        });

      case 'launcher':
      case 'configure':
      case 'test':
      case 'handover':
        return await withSession(o, io, async (s, check) => {
          const task = o.command as Exclude<TaskId, 'install' | 'maintenance'>;
          const ok = await s.engine.runTask(task, stepContext(o, brand, check), task === 'launcher' ? o.method : undefined);
          emit({ ok, task, humanActions: s.humanActions }, `${task}: ${ok ? 'ok' : 'FAILED'}`);
          return ok ? 0 : 1;
        });

      case 'link':
        return await withSession(o, io, async (s, check) => {
          const code = o.positionals[0] ?? o.link;
          if (!code) throw new UsageError('link needs the code');
          const ctx = { ...stepContext(o, brand, check), linkCode: code };
          const step = stepsFor({ task: 'profile' }, ctx).find((x) => x.id === 'profile.link');
          if (!step) throw new Error('this target has no link step');
          const r = await s.engine.exec(renderCommand(step, ctx), { stepId: step.id });
          const ok = r.ran && /Broadcast completed/i.test(r.output);
          emit({ ok, code }, ok ? 'linked' : 'link failed');
          return ok ? 0 : 1;
        });

      case 'screenshot':
        return await withSession(o, io, async (s) => {
          const png = await s.device.screencap();
          const out = o.out ?? `tvlm-screenshot-${Date.now()}.png`;
          if (o.json && !o.out) emit({ png: Buffer.from(png).toString('base64'), bytes: png.byteLength }, '');
          else {
            await writeFile(out, png);
            emit({ file: out, bytes: png.byteLength }, `${out} (${png.byteLength} bytes)`);
          }
          return 0;
        });

      case 'report': {
        const r = await latestReport();
        if (!r) {
          emit({ report: null }, 'no report yet');
          return 1;
        }
        if (o.out) await writeFile(o.out, o.json ? r.json : r.text);
        io.out(o.out ? (o.json ? JSON.stringify({ file: o.out }) : `written ${o.out}`) : o.json ? r.json : r.text);
        return 0;
      }

      case 'bridge': {
        const transport = createTransport(o);
        const srv = await runBridge({ port: o.port, transport, brand: brand.id, version: TOOL_VERSION, log: (m) => io.err(m) });
        io.err(`bridge listening on ws://127.0.0.1:${srv.port} — leave this window open; Ctrl+C stops it`);
        await new Promise<void>((resolve) => {
          process.once('SIGINT', () => resolve());
          process.once('SIGTERM', () => resolve());
        });
        await srv.close();
        return 0;
      }

      case 'mcp':
        await runMcp({ transport: createTransport(o), brand, version: TOOL_VERSION, mock: Boolean(o.mock), log: (m) => io.err(m) });
        return 0;
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(e.message);
      return 2;
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (o.json) io.out(JSON.stringify({ error: msg, kind: e instanceof UnauthorizedError ? 'unauthorized' : e instanceof NoDevicesError ? `no-devices:${e.hint}` : 'error' }));
    else io.err(`error: ${msg}`);
    return 1;
  }
  return 0;
}

// Entry when executed directly (`tsx src/main.ts …`, the `start` script); bin/tvlm.mjs imports `runCli`.
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) process.exitCode = await runCli(process.argv.slice(2));
