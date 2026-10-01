// Argument parsing for `tvlm` — `node:util` parseArgs, no dependency. Pure, so tests can call it.
import { parseArgs } from 'node:util';
import { isTargetId, targetConfig, type BrandId, type HomeMethod, type Profile, type Role, type TargetId } from '@tvlm/core';
import type { MockScenario } from '@tvlm/adb';

export const COMMANDS = ['discover', 'check', 'provision', 'install', 'launcher', 'configure', 'test', 'handover', 'link', 'screenshot', 'pair', 'report', 'bridge', 'mcp', 'help', 'version'] as const;
export type Command = (typeof COMMANDS)[number];
export const MOCK_SCENARIOS = ['happy', 'unauthorized', 'accounts', 'nodevices'] as const satisfies readonly MockScenario[];
export const MOCK_BOXES = ['googletv', 'androidtv', 'xiaomi', 'other', 'firetv'] as const;
export type MockBox = (typeof MOCK_BOXES)[number];
const PROFILES = ['kiosk', 'open', 'install-only'] as const satisfies readonly Profile[];
const ROLES = ['owner', 'reseller'] as const satisfies readonly Role[];
const METHODS = ['set-home-activity', 'device-owner', 'disable-stock'] as const satisfies readonly HomeMethod[];

export interface CliOptions {
  command: Command;
  positionals: string[];
  json: boolean;
  /** The product. There is one (27/9/2026). */
  brand: BrandId;
  /** What the run addresses: the product's own launcher, or the hotel launcher (the hotel road). */
  target: TargetId;
  /** Set = use the mock transport with this scenario (no box needed). */
  mock?: MockScenario;
  box?: MockBox;
  connect?: string;
  usb: boolean;
  serial?: string;
  profile: Profile;
  lang: string;
  link?: string;
  debugOff: boolean;
  yes: boolean;
  manifest?: string;
  method?: HomeMethod;
  out?: string;
  port?: number;
  role: Role;
  timeout?: number;
  subnet?: string;
  pin?: string;
  minutes?: number;
  /** provision: stop before this task (keeps the session alive). */
  stopBefore?: 'test' | 'handover';
  help: boolean;
  version: boolean;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

function oneOf<T extends string>(name: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new UsageError(`--${name} must be one of ${allowed.join(', ')} (got "${value}")`);
}

function int(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || String(n) !== value.trim()) throw new UsageError(`--${name} must be an integer (got "${value}")`);
  return n;
}

/** `--mock [scenario]`: an optional value — parseArgs has no such thing, so it is rewritten first. */
function normalizeMock(argvIn: string[]): string[] {
  // `pnpm cli -- check` forwards a bare `--`; parseArgs would make it a positional.
  const argv = argvIn.slice();
  while (argv[0] === '--') argv.shift();
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--mock') {
      const next = argv[i + 1];
      if (next && (MOCK_SCENARIOS as readonly string[]).includes(next)) {
        out.push(`--mock=${next}`);
        i++;
      } else out.push('--mock=happy');
    } else out.push(a);
  }
  return out;
}

export function parseCli(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: normalizeMock(argv),
    strict: true,
    allowPositionals: true,
    allowNegative: true,
    options: {
      json: { type: 'boolean', default: false },
      brand: { type: 'string' },
      target: { type: 'string' },
      mock: { type: 'string' },
      box: { type: 'string' },
      connect: { type: 'string' },
      usb: { type: 'boolean', default: false },
      serial: { type: 'string' },
      profile: { type: 'string' },
      lang: { type: 'string', default: 'en' },
      link: { type: 'string' },
      'debug-off': { type: 'boolean', default: true },
      yes: { type: 'boolean', short: 'y', default: false },
      manifest: { type: 'string' },
      method: { type: 'string' },
      out: { type: 'string' },
      port: { type: 'string' },
      role: { type: 'string' },
      timeout: { type: 'string' },
      subnet: { type: 'string' },
      pin: { type: 'string' },
      minutes: { type: 'string' },
      'stop-before': { type: 'string' },
      mcp: { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });

  let command: Command;
  const first = positionals[0];
  if (values.help) command = 'help';
  else if (values.version) command = 'version';
  else if (values.mcp) command = 'mcp';
  else if (values.check) command = 'check';
  else if (first === undefined) command = 'help';
  else if ((COMMANDS as readonly string[]).includes(first)) command = first as Command;
  else throw new UsageError(`unknown command "${first}" — one of ${COMMANDS.join(', ')}`);

  // ONE product since 27/9/2026. `--brand launcher` is still accepted (scripts wrote it); the old
  // `--brand kiosk` gets the new spelling instead of a silent default.
  const brandValue = values.brand ?? process.env['TVLM_BRAND'];
  if (brandValue === 'kiosk') throw new UsageError('the kiosk edition is gone — it is one tool now: use --target hotel (and --link CODE for the room)');
  if (brandValue !== undefined && brandValue !== 'launcher') throw new UsageError(`--brand must be launcher (got "${brandValue}")`);
  const brand: BrandId = 'launcher';
  // The hotel road is asked for by name, or implied by what only it can use: a room code, the
  // kiosk profile, or the owner role.
  const targetValue = values.target ?? process.env['TVLM_TARGET'];
  if (targetValue !== undefined && !isTargetId(targetValue)) throw new UsageError(`--target must be launcher or hotel (got "${targetValue}")`);
  const target: TargetId = targetValue ?? (values.link !== undefined || values.profile === 'kiosk' || values.role === 'owner' ? 'hotel' : 'launcher');

  return {
    command,
    positionals: command === first ? positionals.slice(1) : positionals,
    json: values.json,
    brand,
    target,
    mock: values.mock === undefined ? undefined : oneOf('mock', values.mock, MOCK_SCENARIOS, 'happy'),
    box: values.box === undefined ? undefined : oneOf('box', values.box, MOCK_BOXES, 'xiaomi'),
    connect: values.connect,
    usb: values.usb,
    serial: values.serial,
    // The default profile is the target's own first profile: the product's launcher only does
    // `open`, the hotel launcher leads with `kiosk`. A fixed default would contradict brands/*.json.
    profile: values.profile === undefined ? targetConfig(target).profiles[0]! : oneOf('profile', values.profile, PROFILES, 'kiosk'),
    lang: values.lang,
    link: values.link,
    debugOff: values['debug-off'],
    yes: values.yes,
    manifest: values.manifest,
    method: values.method === undefined ? undefined : oneOf('method', values.method, METHODS, 'set-home-activity'),
    out: values.out,
    port: int('port', values.port),
    role: oneOf('role', values.role, ROLES, 'reseller'),
    timeout: int('timeout', values.timeout),
    subnet: values.subnet,
    pin: values.pin,
    minutes: int('minutes', values.minutes),
    stopBefore: values['stop-before'] === undefined ? undefined : oneOf('stop-before', values['stop-before'], ['test', 'handover'] as const, 'test'),
    help: values.help,
    version: values.version,
  };
}

export const USAGE = `tvlm — TV Box Tools / TV Launcher Manager CLI (one tool, every box)

Usage: tvlm <command> [options]

Commands
  discover                 find boxes: USB + mDNS + subnet scan (:5555)
  check                    read-only box facts (also: tvlm --check)
  provision                the automatic run: profile → install → launcher → configure → test → handover
  install                  install the manifest's APKs (SHA-256 verified, streamed)
  launcher                 make our launcher the HOME app (--method)
  configure                silent permission grants
  test                     HOME key · resolve · screenshot · reboot
  handover                 turn debugging off
  link CODE                send the LINK broadcast (owner)
  screenshot [--out f.png] PNG of the TV screen
  pair host:port CODE      Android 11+ wireless-debugging pairing (needs platform-tools adb)
  report [--out file]      the last session report
  bridge [--port 15555]    local WebSocket bridge for the web app (ws://127.0.0.1:15555)
  mcp  (or --mcp)          Model Context Protocol server on stdio, for AI agents

Target (check/provision/…): --connect host:port | --usb | --serial X   (none = discover, one box expected)
Options: --target launcher|hotel (hotel = the hotel road; implied by --link, --role owner or --profile kiosk)
         --profile kiosk|open|install-only  --lang xx  --link CODE  --role owner|reseller
         --manifest URL|file  --method set-home-activity|device-owner|disable-stock  --no-debug-off
         --stop-before test|handover  --subnet 192.168.1.0/24  --port N  --timeout ms  --yes/-y  --json
         --mock [happy|unauthorized|accounts|nodevices] [--box googletv|androidtv|xiaomi|other|firetv]
`;
