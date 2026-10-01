// MCP server (stdio) for AI agents — DESIGN_NOTES §8, plan §ΣΤ: the instructions live INSIDE the tool
// descriptions (one source of truth; /boxsetupai shrinks). Same engine, same gate, same report as the UI.
// `createTools` is the testable core; `createMcpServer` registers it; `runMcp` serves it on stdio.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { NoDevicesError, UnauthorizedError, type AdbDevice, type AdbTransport } from '@tvlm/adb';
import { autoRunOrder, classifyCommand, targetConfig, renderCommand, stepsFor, type BoxCheck, type BrandConfig, type HomeMethod, type Manifest, type StepContext, type TargetId, type TaskId } from '@tvlm/core';
import { createSession, loadManifest, reconnectAfterReboot, stepContext, type Io, type Session } from './session.js';

export interface McpContext {
  transport: AdbTransport;
  brand: BrandConfig;
  version: string;
  mock?: boolean;
  log?: (m: string) => void;
}

export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  title: string;
  description: string;
  inputSchema: S;
  readOnly?: boolean;
  handler: (args: z.infer<z.ZodObject<S>>) => Promise<CallToolResult>;
}

/** Keeps each tool's `args` typed from its own inputSchema. */
const tool = <S extends z.ZodRawShape>(def: ToolDef<S>): ToolDef<S> => def;

const ok = (data: unknown): CallToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (data: unknown): CallToolResult => ({ isError: true, content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const errInfo = (e: unknown) => ({
  error: e instanceof Error ? e.message : String(e),
  kind: e instanceof UnauthorizedError ? 'unauthorized' : e instanceof NoDevicesError ? `no-devices:${e.hint}` : 'error',
  ...(e instanceof UnauthorizedError ? { next: 'Tell the human to press Allow on the TV ("Always allow from this computer"), then call connect again.' } : {}),
  ...(e instanceof NoDevicesError
    ? { next: e.hint === 'usb-driver' ? 'USB: is it a data cable, is USB debugging on, does Windows need a driver? Or use Wi-Fi.' : 'Wi-Fi: same network as the TV? Guest/hotel networks isolate clients — use the phone hotspot or USB. Is Network debugging on (Android 11+: Wireless debugging → pair first)?' }
    : {}),
});

function stepPlan(ctx: StepContext, tasks: TaskId[], method?: HomeMethod) {
  return tasks
    .filter((t) => t !== 'install')
    .map((task) => ({
      task,
      steps: stepsFor({ task, homeMethod: task === 'launcher' ? method : undefined }, ctx).map((s) => {
        const cmd = renderCommand(s, ctx);
        return { id: s.id, cmd, verdict: classifyCommand(cmd, { handoverLastStep: s.handoverLastStep }).verdict };
      }),
    }));
}

export function createTools(ctx: McpContext) {
  const { brand, transport } = ctx;
  const io: Io = { out: () => {}, err: (m) => ctx.log?.(m), isTTY: false, ask: async () => '' };
  let session: Session | undefined;
  let lastCheck: BoxCheck | undefined;
  let manifest: Manifest | undefined;
  /** The gate's `confirm` hook answers this: true only inside a sanctioned flow or a `confirmed: true` shell call. */
  let allowConfirm = false;

  const need = (): Session => {
    if (!session) throw new Error('not connected — call connect first (discover lists the boxes)');
    return session;
  };
  const sanctioned = async <T>(fn: () => Promise<T>): Promise<T> => {
    allowConfirm = true;
    try {
      return await fn();
    } finally {
      allowConfirm = false;
    }
  };
  const getManifest = async (url?: string) => {
    if (url || !manifest) manifest = await loadManifest({ manifest: url, mock: ctx.mock ? 'happy' : undefined }, brand);
    return manifest;
  };
  const ctxFor = (a: { profile?: string; lang?: string; linkCode?: string; debugOff?: boolean }): StepContext =>
    stepContext({ profile: (a.profile as StepContext['profile']) ?? brand.profiles[0] ?? 'open', lang: a.lang ?? 'en', link: a.linkCode, debugOff: a.debugOff ?? true }, brand, lastCheck ?? null);
  const reconnectIfRebooted = async () => {
    const s = need();
    if (s.rebooted && !(await reconnectAfterReboot(s, transport, io))) throw new Error('the box did not come back after the reboot — wait and call connect again');
  };

  const order = autoRunOrder(brand);
  const tools = {
    discover: tool({
      title: 'Find TV boxes',
      readOnly: true,
      description: `Find Android TV boxes reachable from this computer: USB (adb interface), mDNS (_adb._tcp / _adb-tls-connect._tcp) and a TCP scan of the local /24 on :5555. Takes a few seconds. BEFORE calling: the human must have enabled Developer options on the TV (Settings › Device Preferences › About › Build ×7) and USB debugging or Network/Wireless debugging. Returns DeviceInfo[] — pass one's "id" (or "host:port") to connect. method "wireless" with tls=true is Android 11+ Wireless debugging: call pair first with the code shown on the TV. Empty list: same Wi-Fi as the TV? Hotel/guest networks isolate clients (use the phone hotspot or USB). ${brand.fireTv === 'blocked' ? 'Fire TV is not supported by this brand.' : 'Fire TV: Settings › My Fire TV › About › device name ×7, then ADB debugging.'}`,
      inputSchema: {
        paths: z.array(z.enum(['usb', 'tcp', 'wireless'])).optional().describe('Limit to these paths; default all'),
        subnet: z.string().optional().describe('Scan this range instead of the local /24s, e.g. 192.168.1.0/24'),
      },
      handler: async (a) => {
        try {
          const list = await transport.discover({ paths: a.paths, subnet: a.subnet });
          return ok({ devices: list, next: 'call connect with a device id' });
        } catch (e) {
          if (e instanceof NoDevicesError) return ok({ devices: [], ...errInfo(e) });
          return fail(errInfo(e));
        }
      },
    }),
    pair: tool({
      title: 'Pair (Android 11+ wireless debugging)',
      description: 'Only for Android 11+ "Wireless debugging" (discover shows tls=true). On the TV: Developer options › Wireless debugging › "Pair device with pairing code" shows host:port and a 6-digit code — ask the human for both. Not needed for USB or classic Network debugging (:5555). Needs Google platform-tools adb on this computer.',
      inputSchema: { hostPort: z.string().describe('The PAIRING host:port shown on the TV (not the connect port)'), code: z.string().regex(/^\d{6}$/).describe('6-digit pairing code') },
      handler: async (a) => {
        try {
          if (!transport.pair) throw new Error('this transport cannot pair');
          await transport.pair(a.hostPort, a.code);
          return ok({ paired: a.hostPort, next: 'call discover, then connect to the wireless device' });
        } catch (e) {
          return fail(errInfo(e));
        }
      },
    }),
    connect: tool({
      title: 'Connect to a box',
      description: `Open the ADB session to one box. target = a device id from discover, "host:port" (Wi-Fi), or a USB serial. The FIRST time, the TV shows "Allow USB debugging?": tell the human to tick "Always allow from this computer" and press Allow — this call waits up to waitSeconds for that (default 60). On "unauthorized" ask the human to press Allow and call connect again. Replaces any previous session. After connecting call check.`,
      inputSchema: { target: z.string().describe('device id / host:port / serial'), waitSeconds: z.number().int().min(0).max(600).optional() },
      handler: async (a) => {
        try {
          if (session) await session.device.close().catch(() => {});
          session = undefined;
          lastCheck = undefined;
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(new Error('timed out waiting for Allow')), (a.waitSeconds ?? 60) * 1000);
          let attempts = 0;
          let device: AdbDevice;
          try {
            device = await transport.connect(a.target, { waitForAuth: true, signal: ac.signal, onUnauthorized: (n) => (attempts = n) });
          } finally {
            clearTimeout(timer);
          }
          session = createSession({
            brand,
            device,
            io,
            autoConfirm: false,
            mock: Boolean(ctx.mock),
            confirm: async () => allowConfirm, // read at call time
            human: async () => {}, // recorded in humanActions; the agent relays them
          });
          session.transport = transport;
          return ok({ connected: true, device: device.info, serial: device.serial, allowAttempts: attempts, next: 'call check' });
        } catch (e) {
          return fail(errInfo(e));
        }
      },
    }),
    check: tool({
      title: 'Check the box (read-only)',
      readOnly: true,
      description: `Read-only facts about the connected box: model, Android version, platform (googletv/androidtv/firetv/other), Google accounts, free space, whether ${brand.launcherName} (${brand.launcherPackage}) is installed and its versionCode, the current HOME app, device owner, developer options / adb state. Run it after connect and again after provision to verify. ${brand.flow === 'kiosk' ? 'Kiosk profile REQUIRES accounts=[] (device owner cannot be set with a Google account present — the human removes it in Settings › Accounts) and platform != firetv.' : ''} Only allowlisted commands run (getprop, dumpsys, pm list, settings get, df, cmd package resolve-activity).`,
      inputSchema: {},
      handler: async () => {
        try {
          await reconnectIfRebooted();
          lastCheck = await need().engine.check();
          const warnings: string[] = [];
          if (brand.flow === 'kiosk' && lastCheck.accounts.length) warnings.push(`accounts present (${lastCheck.accounts.join(', ')}) — kiosk (device owner) will be refused; remove them on the TV or use profile "open"`);
          if (brand.fireTv === 'blocked' && lastCheck.platform === 'firetv') warnings.push('Fire TV is not supported by this brand');
          if (!lastCheck.isTv) warnings.push('this does not look like a TV build');
          return ok({ check: lastCheck, warnings, next: lastCheck.launcherInstalled ? 'the launcher is installed — provision (or launcher/configure) to finish, or test to verify' : 'call provision (everything) or install' });
        } catch (e) {
          return fail(errInfo(e));
        }
      },
    }),
    install: tool({
      title: 'Install the apps',
      description: `Download the brand manifest (${brand.manifestUrl}, or manifestUrl), verify each APK's SHA-256 and stream it into "pm install -r" on the box — nothing is stored on this computer. Installs the required apps for the role (owner|reseller): ${brand.launcherName}, TVS, one AirPlay receiver. Up-to-date apps are skipped. Needs internet on this computer.`,
      inputSchema: { role: z.enum(['owner', 'reseller']).default('reseller'), manifestUrl: z.string().optional().describe('override: URL or local path of manifest.json') },
      handler: async (a) => {
        try {
          await reconnectIfRebooted();
          const s = need();
          const m = await getManifest(a.manifestUrl);
          const installed = lastCheck ? new Map(lastCheck.installedPackages.map((p) => [p, null as number | null])) : undefined;
          const done = await sanctioned(() => s.engine.install(m, a.role, { installed }));
          return done ? ok({ ok: true, apps: m.apps.map((x) => x.pkg), next: 'call check, then launcher/configure or provision' }) : fail({ ok: false, reportTail: s.report.toText().split('\n').slice(-12) });
        } catch (e) {
          return fail(errInfo(e));
        }
      },
    }),
    provision: tool({
      title: 'Provision (the automatic run)',
      description: `The whole setup in the brand's order: ${order.join(' → ')}. ${brand.flow === 'kiosk' ? 'profile: kiosk (device owner + persistent HOME, guests cannot leave), open (accessibility HOME, adb stays on), install-only.' : 'This brand has one flow (profile is ignored): install → disable the stock launcher + set HOME → grants → test.'} lang = the launcher UI language. linkCode = the owner's 8-digit code (owner role only; resellers provision WITHOUT link). debugOff = turn ADB off as the very last step (brand default ${brand.debugOffAtHandover ? 'on' : 'off'}) — after it you lose the connection, so do it last. IMPORTANT: "test" REBOOTS the box and "handover" turns debugging off; pass stopBefore:"test" to keep the session for screenshots/checks and run test/handover later. Every command runs through the same gate as the UI and is written to the report. Returns per-task true/false/null(not reached) and humanActions the human must do on the TV (pick the launcher, press Allow again after the reboot). Ask the human only for Allow / HOME / picking the launcher — never paste commands to them. dryRun lists the commands without running.`,
      inputSchema: {
        profile: z.enum(['kiosk', 'open', 'install-only']).optional(),
        lang: z.string().default('en'),
        linkCode: z.string().optional(),
        role: z.enum(['owner', 'reseller']).default('reseller'),
        debugOff: z.boolean().optional(),
        stopBefore: z.enum(['test', 'handover']).optional(),
        homeMethod: z.enum(['set-home-activity', 'device-owner', 'disable-stock']).optional().describe(`default = the brand's first: ${brand.homeMethods[0]}`),
        manifestUrl: z.string().optional(),
        dryRun: z.boolean().default(false),
      },
      handler: async (a) => {
        try {
          const s = need();
          if (!lastCheck) lastCheck = await s.engine.check();
          const sc = ctxFor({ profile: a.profile, lang: a.lang, linkCode: a.linkCode, debugOff: a.debugOff ?? brand.debugOffAtHandover });
          const tasks = a.stopBefore ? order.slice(0, order.indexOf(a.stopBefore)) : order.slice();
          if (a.dryRun) return ok({ dryRun: true, profile: sc.profile, plan: stepPlan(sc, tasks, a.homeMethod), install: tasks.includes('install') ? 'from the manifest' : 'no' });
          if (brand.flow === 'kiosk' && sc.profile === 'kiosk' && lastCheck.accounts.length) return fail({ ok: false, reason: `Google account present (${lastCheck.accounts.join(', ')}): kiosk needs none. Ask the human to remove it (Settings › Accounts) or use profile "open".` });
          const result: Record<TaskId, boolean | null> = { profile: null, install: null, launcher: null, configure: null, test: null, handover: null, maintenance: null };
          await sanctioned(async () => {
            for (const task of tasks) {
              await reconnectIfRebooted();
              if (task === 'install') {
                const m = await getManifest(a.manifestUrl);
                result.install = await s.engine.install(m, a.role, { installed: new Map(lastCheck!.installedPackages.map((p) => [p, null])) });
                if (!result.install) break;
                continue;
              }
              result[task] = await s.engine.runTask(task, sc, task === 'launcher' ? a.homeMethod : undefined);
              if (!result[task] && task !== 'configure' && task !== 'test') break;
            }
          });
          const ran = Object.entries(result).filter(([, v]) => v !== null);
          const allOk = ran.every(([, v]) => v === true);
          const out = {
            ok: allOk,
            profile: sc.profile,
            tasks: result,
            humanActions: s.humanActions.splice(0),
            rebooted: s.rebooted,
            next: allOk ? (a.stopBefore ? `stopped before ${a.stopBefore} — call test (reboots) and then handover when ready` : s.rebooted ? 'the box is rebooting: wait ~60 s, call connect and check to verify' : 'call check to verify') : 'see report; fix and call the failing task tool (launcher/configure/test) or provision again',
          };
          return allOk ? ok(out) : fail({ ...out, reportTail: s.report.toText().split('\n').slice(-15) });
        } catch (e) {
          return fail(errInfo(e));
        }
      },
    }),
    link: tool({
      title: 'Link the box to the owner account',
      description: `Send the LINK broadcast to ${brand.launcherName} with the 8-digit code from the owner's account page (${brand.domain}). Owner role only — resellers hand over without a link; the owner links later. The launcher must be installed first.`,
      inputSchema: { code: z.string().min(4).max(16) },
      handler: async (a) => {
        try {
          await reconnectIfRebooted();
          const s = need();
          const sc = { ...ctxFor({}), linkCode: a.code };
          const step = stepsFor({ task: 'profile' }, sc).find((x) => x.id === 'profile.link');
          if (!step) return fail({ ok: false, reason: 'this brand has no link step' });
          const r = await sanctioned(() => s.engine.exec(renderCommand(step, sc), { stepId: step.id }));
          const done = r.ran && /Broadcast completed/i.test(r.output);
          return done ? ok({ ok: true, code: a.code }) : fail({ ok: false, output: r.output.trim() });
        } catch (e) {
          return fail(errInfo(e));
        }
      },
    }),
    test: tool({
      title: 'Test the setup (reboots the box)',
      description: 'HOME key → resolve the HOME app → screenshot on the box → REBOOT. After it the connection drops: wait about 60 s, call connect again, then check (does our launcher come back as HOME after a reboot? — that is what breaks most often). The human may need to press Allow again after the reboot.',
      inputSchema: {},
      handler: async () => {
        try {
          await reconnectIfRebooted();
          const s = need();
          const done = await sanctioned(() => s.engine.runTask('test', ctxFor({})));
          return (done ? ok : fail)({ ok: done, humanActions: s.humanActions.splice(0), next: 'wait ~60 s for the reboot, then connect + check' });
        } catch (e) {
          return fail(errInfo(e));
        }
      },
    }),
    screenshot: tool({
      title: 'Screenshot of the TV',
      readOnly: true,
      description: 'PNG of what the TV shows right now (image content). Use it to confirm the launcher is on screen, or to see which dialog the box is waiting on (Allow, pick launcher).',
      inputSchema: {},
      handler: async () => {
        try {
          await reconnectIfRebooted();
          const png = await need().device.screencap();
          return { content: [{ type: 'image', data: Buffer.from(png).toString('base64'), mimeType: 'image/png' }, { type: 'text', text: JSON.stringify({ bytes: png.byteLength }) }] };
        } catch (e) {
          return fail(errInfo(e));
        }
      },
    }),
    report: tool({
      title: 'Session report',
      readOnly: true,
      description: 'Everything this session did on the box: each command, its gate verdict (auto/confirm/blocked), its output, errors. Show it to the human at the end, or read it when something failed.',
      inputSchema: { format: z.enum(['text', 'json']).default('text') },
      handler: async (a) => {
        if (!session) return ok({ report: null });
        return a.format === 'json' ? ok(session.report.toJSON()) : { content: [{ type: 'text', text: session.report.toText() }] };
      },
    }),
    shell: tool({
      title: 'Raw shell (gated)',
      description: `Run one "adb shell" command on the box through the command gate. AUTO commands run at once: getprop, dumpsys, pm list/path/dump, settings get/list, am start (no extras), input keyevent, cmd package resolve-activity/list, df, screencap, ls, echo, whoami, id, uptime, wm size/density, ip addr/route, netstat. ANYTHING ELSE needs a human: the first call returns {needsConfirmation:true, command, reason} and does NOT run — show the exact command to the human, get their explicit yes, then call again with confirmed:true. BLOCKED, no exception even with confirmed:true: reboot bootloader/recovery, fastboot, rm -rf, dd, wipe, su, dpm remove-active-admin / clear-*, factory reset, "settings put global adb_enabled 0" (only handover may), development_settings_enabled 0, pm uninstall/disable of system packages. Do not try to work around the gate (no chaining, no am broadcast MASTER_CLEAR). Prefer the task tools; use shell for diagnosis.`,
      inputSchema: { command: z.string().min(1), confirmed: z.boolean().default(false).describe('true ONLY after a human explicitly approved this exact command') },
      handler: async (a) => {
        try {
          const g = classifyCommand(a.command);
          if (g.verdict === 'blocked') {
            // Refused — but the attempt still goes into the report (contract §6: everything is recorded).
            if (session) await session.engine.exec(a.command);
            return fail({ ran: false, blocked: true, command: a.command, reason: g.reason });
          }
          if (g.verdict === 'confirm' && !a.confirmed) return ok({ ran: false, needsConfirmation: true, command: a.command, reason: g.reason, how: 'show this command to the human; if they approve, call shell again with confirmed:true' });
          await reconnectIfRebooted();
          const s = need();
          allowConfirm = g.verdict === 'confirm' && a.confirmed;
          try {
            const r = await s.engine.exec(a.command);
            return ok({ ran: r.ran, verdict: r.verdict, output: r.output });
          } finally {
            allowConfirm = false;
          }
        } catch (e) {
          return fail(errInfo(e));
        }
      },
    }),
  };

  return tools;
}

export type Tools = ReturnType<typeof createTools>;

export function createMcpServer(ctx: McpContext): { server: McpServer; tools: Tools } {
  const server = new McpServer(
    { name: `${ctx.brand.cli}-${ctx.brand.id}`, version: ctx.version },
    {
      instructions: `${ctx.brand.name}: provisions Android TV boxes over ADB for ${ctx.brand.launcherName}. Typical run: discover → connect (the human presses Allow on the TV) → check → provision (stopBefore "test" to keep the session) → screenshot → test → connect again → check → report. Ask the human only for what must happen on the TV (Allow, HOME, picking the launcher, removing a Google account). Never paste adb commands for the human to run; use the tools. shell is gated: confirm-level commands need the human's explicit approval, blocked ones never run.`,
    },
  );
  const tools = createTools(ctx);
  for (const [name, t] of Object.entries(tools) as unknown as Array<[string, ToolDef]>) {
    server.registerTool(name, { title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: t.readOnly === true, destructiveHint: !t.readOnly, openWorldHint: false } }, (args) => t.handler(args as never));
  }
  return { server, tools };
}

export async function runMcp(ctx: McpContext): Promise<void> {
  const { server } = createMcpServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
    process.stdin.once('end', () => resolve());
  });
}

/** Build a context from ids (tests, `--target`). `brand` is the run's TARGET; the product is the one tool. */
export function mcpContextFor(transport: AdbTransport, target: TargetId, version: string, mock = false): McpContext {
  return { transport, brand: targetConfig(target), version, mock };
}
