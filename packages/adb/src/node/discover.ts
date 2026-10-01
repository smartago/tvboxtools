// Network discovery without a dependency: (a) a hand-written multicast DNS query for
// `_adb-tls-connect._tcp.local` (Android 11+ wireless debugging → tls) and `_adb._tcp.local`
// (adb over TCP), (b) a parallel TCP scan of the local /24s on :5555. Both bounded by `timeoutMs`.
import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { connect as netConnect } from 'node:net';
import { networkInterfaces } from 'node:os';
import type { DeviceInfo } from '../index.js';

export const ADB_TLS_SERVICE = '_adb-tls-connect._tcp.local';
export const ADB_TCP_SERVICE = '_adb._tcp.local';
export const MDNS_ADDR = '224.0.0.251';
export const MDNS_PORT = 5353;
export const DEFAULT_ADB_PORT = 5555;

// ---------------------------------------------------------------- DNS wire format (RFC 1035 + 6762)

export const DnsType = { A: 1, PTR: 12, TXT: 16, SRV: 33, ANY: 255 } as const;

export interface DnsQuestion {
  name: string;
  type: number;
  cls: number;
}
export interface DnsSrv {
  port: number;
  priority: number;
  weight: number;
  target: string;
}
export interface DnsRecord {
  name: string;
  type: number;
  cls: number;
  ttl: number;
  /** PTR → target name; SRV → { port, target }; A → dotted IPv4; TXT → strings; else raw bytes. */
  data: string | DnsSrv | string[] | Uint8Array;
}
export interface DnsMessage {
  id: number;
  flags: number;
  questions: DnsQuestion[];
  answers: DnsRecord[];
  authorities: DnsRecord[];
  additionals: DnsRecord[];
}

function encodeName(name: string): Uint8Array {
  const parts = name.replace(/\.$/, '').split('.').filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const b = Buffer.from(p, 'utf8');
    if (b.length > 63) throw new Error(`label too long: ${p}`);
    out.push(b.length, ...b);
  }
  out.push(0);
  return Uint8Array.from(out);
}

/** A standard query, id 0, no recursion — several questions in one packet. `unicastResponse` sets the QU bit. */
export function buildMdnsQuery(questions: Array<{ name: string; type?: number }>, opts: { unicastResponse?: boolean; id?: number } = {}): Uint8Array {
  const head = Buffer.alloc(12);
  head.writeUInt16BE(opts.id ?? 0, 0);
  head.writeUInt16BE(0, 2); // flags: standard query
  head.writeUInt16BE(questions.length, 4);
  const qs = questions.map((q) => {
    const tail = Buffer.alloc(4);
    tail.writeUInt16BE(q.type ?? DnsType.PTR, 0);
    tail.writeUInt16BE((opts.unicastResponse ? 0x8000 : 0) | 1, 2); // IN (+ QU)
    return Buffer.concat([encodeName(q.name), tail]);
  });
  return new Uint8Array(Buffer.concat([head, ...qs]));
}

function readName(buf: Buffer, offset: number, depth = 0): { name: string; next: number } {
  const labels: string[] = [];
  let pos = offset;
  for (;;) {
    if (pos >= buf.length) throw new Error('dns: name runs past the packet');
    const len = buf[pos]!;
    if (len === 0) {
      pos++;
      return { name: labels.join('.'), next: pos };
    }
    if ((len & 0xc0) === 0xc0) {
      if (depth > 16) throw new Error('dns: pointer loop');
      if (pos + 1 >= buf.length) throw new Error('dns: pointer runs past the packet');
      const ptr = ((len & 0x3f) << 8) | buf[pos + 1]!;
      const r = readName(buf, ptr, depth + 1);
      if (r.name) labels.push(r.name);
      return { name: labels.join('.'), next: pos + 2 };
    }
    if (pos + 1 + len > buf.length) throw new Error('dns: label runs past the packet');
    labels.push(buf.subarray(pos + 1, pos + 1 + len).toString('utf8'));
    pos += 1 + len;
  }
}

function readRecord(buf: Buffer, offset: number): { rr: DnsRecord; next: number } {
  const { name, next } = readName(buf, offset);
  if (next + 10 > buf.length) throw new Error('dns: record header runs past the packet');
  const type = buf.readUInt16BE(next);
  const cls = buf.readUInt16BE(next + 2) & 0x7fff; // strip the cache-flush bit
  const ttl = buf.readUInt32BE(next + 4);
  const rdlen = buf.readUInt16BE(next + 8);
  const rd = next + 10;
  if (rd + rdlen > buf.length) throw new Error('dns: rdata runs past the packet');
  let data: DnsRecord['data'];
  switch (type) {
    case DnsType.PTR:
      data = readName(buf, rd).name;
      break;
    case DnsType.SRV:
      data = { priority: buf.readUInt16BE(rd), weight: buf.readUInt16BE(rd + 2), port: buf.readUInt16BE(rd + 4), target: readName(buf, rd + 6).name };
      break;
    case DnsType.A:
      data = rdlen === 4 ? `${buf[rd]}.${buf[rd + 1]}.${buf[rd + 2]}.${buf[rd + 3]}` : new Uint8Array(buf.subarray(rd, rd + rdlen));
      break;
    case DnsType.TXT: {
      const strings: string[] = [];
      for (let p = rd; p < rd + rdlen; ) {
        const l = buf[p]!;
        strings.push(buf.subarray(p + 1, p + 1 + l).toString('utf8'));
        p += 1 + l;
      }
      data = strings;
      break;
    }
    default:
      data = new Uint8Array(buf.subarray(rd, rd + rdlen));
  }
  return { rr: { name, type, cls, ttl, data }, next: rd + rdlen };
}

export function parseDnsMessage(bytes: Uint8Array): DnsMessage {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 12) throw new Error('dns: short packet');
  const msg: DnsMessage = { id: buf.readUInt16BE(0), flags: buf.readUInt16BE(2), questions: [], answers: [], authorities: [], additionals: [] };
  const counts = [buf.readUInt16BE(4), buf.readUInt16BE(6), buf.readUInt16BE(8), buf.readUInt16BE(10)];
  let pos = 12;
  for (let i = 0; i < counts[0]!; i++) {
    const { name, next } = readName(buf, pos);
    if (next + 4 > buf.length) throw new Error('dns: question runs past the packet');
    msg.questions.push({ name, type: buf.readUInt16BE(next), cls: buf.readUInt16BE(next + 2) & 0x7fff });
    pos = next + 4;
  }
  const sections = [msg.answers, msg.authorities, msg.additionals];
  for (let s = 0; s < sections.length; s++) {
    for (let i = 0; i < counts[s + 1]!; i++) {
      const { rr, next } = readRecord(buf, pos);
      sections[s]!.push(rr);
      pos = next;
    }
  }
  return msg;
}

function isSrv(d: DnsRecord['data']): d is DnsSrv {
  return typeof d === 'object' && !Array.isArray(d) && !(d instanceof Uint8Array);
}

export interface AdbService {
  /** `adb-<serial>-XXXXXX` */
  instance: string;
  service: typeof ADB_TLS_SERVICE | typeof ADB_TCP_SERVICE;
  host?: string;
  port?: number;
  ip?: string;
}

/** Pull the ADB service instances (with SRV/A when present) out of one or more responses. */
export function collectAdbServices(messages: DnsMessage[]): AdbService[] {
  const byInstance = new Map<string, AdbService>();
  const hostIps = new Map<string, string>();
  const all = messages.flatMap((m) => [...m.answers, ...m.additionals, ...m.authorities]);
  for (const rr of all) if (rr.type === DnsType.A && typeof rr.data === 'string') hostIps.set(rr.name.toLowerCase(), rr.data);
  for (const rr of all) {
    if (rr.type === DnsType.PTR && typeof rr.data === 'string') {
      const svc = rr.name.toLowerCase();
      if (svc !== ADB_TLS_SERVICE && svc !== ADB_TCP_SERVICE) continue;
      const full = rr.data;
      const instance = full.slice(0, full.length - svc.length - 1);
      if (!byInstance.has(full.toLowerCase())) byInstance.set(full.toLowerCase(), { instance, service: svc });
    }
  }
  for (const rr of all) {
    if (rr.type === DnsType.SRV && isSrv(rr.data)) {
      const key = rr.name.toLowerCase();
      let s = byInstance.get(key);
      if (!s) {
        // Some responders answer SRV without repeating the PTR.
        const svc = key.endsWith(ADB_TLS_SERVICE) ? ADB_TLS_SERVICE : key.endsWith(ADB_TCP_SERVICE) ? ADB_TCP_SERVICE : null;
        if (!svc) continue;
        s = { instance: rr.name.slice(0, rr.name.length - svc.length - 1), service: svc };
        byInstance.set(key, s);
      }
      s.port = rr.data.port;
      s.host = rr.data.target;
      s.ip = hostIps.get(rr.data.target.toLowerCase());
    }
  }
  return [...byInstance.values()];
}

// ---------------------------------------------------------------- local subnets

export interface LocalSubnet {
  /** `192.168.1.0` */
  base: string;
  prefix: number;
  /** Our own address on it ('' when the subnet came from an argument). */
  self: string;
  iface: string;
}

const VIRTUAL_IFACE = /\b(tap|tun|vpn|wireguard|wg\d|zerotier|tailscale|docker|veth|vethernet|virtual|hyper-v|vmware|vbox|virtualbox|utun|ppp|bridge|br-|nordlynx|proton|npcap|loopback)\b/i;

function ipToInt(ip: string): number {
  return ip.split('.').reduce((n, o) => ((n << 8) | (parseInt(o, 10) & 0xff)) >>> 0, 0) >>> 0;
}
function intToIp(n: number): string {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
}
function maskOf(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

/** The /24s worth scanning: IPv4, not loopback, not link-local, not CGNAT, not a VPN/virtual adapter. */
export function localSubnets(ifaces: ReturnType<typeof networkInterfaces> = networkInterfaces()): LocalSubnet[] {
  const out: LocalSubnet[] = [];
  for (const [name, list] of Object.entries(ifaces)) {
    if (!list || VIRTUAL_IFACE.test(name)) continue;
    for (const a of list) {
      if (a.family !== 'IPv4' && (a.family as unknown) !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.') || a.address.startsWith('127.')) continue;
      const [o1, o2] = a.address.split('.').map((x) => parseInt(x, 10));
      if (o1 === 100 && o2! >= 64 && o2! <= 127) continue; // CGNAT / tailscale
      const cidrPrefix = a.cidr ? parseInt(a.cidr.split('/')[1]!, 10) : 24;
      const prefix = Math.max(cidrPrefix, 24); // never wider than a /24 per interface
      const base = intToIp((ipToInt(a.address) & maskOf(prefix)) >>> 0);
      if (!out.some((s) => s.base === base && s.prefix === prefix)) out.push({ base, prefix, self: a.address, iface: name });
    }
  }
  return out;
}

/** Every host address in the range except network, broadcast and `exclude`. */
export function expandSubnet(s: Pick<LocalSubnet, 'base' | 'prefix'>, exclude: readonly string[] = []): string[] {
  const size = 2 ** (32 - s.prefix);
  const start = ipToInt(s.base);
  const skip = new Set(exclude);
  const hosts: string[] = [];
  const from = s.prefix >= 31 ? 0 : 1;
  const to = s.prefix >= 31 ? size : size - 1;
  for (let i = from; i < to; i++) {
    const ip = intToIp((start + i) >>> 0);
    if (!skip.has(ip)) hosts.push(ip);
  }
  return hosts;
}

/** Parse `192.168.1.0/24` (or a bare address → its /24). */
export function parseSubnet(text: string): Pick<LocalSubnet, 'base' | 'prefix'> {
  const [ip, p] = text.split('/');
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) throw new Error(`bad subnet: ${text}`);
  const prefix = p ? parseInt(p, 10) : 24;
  if (!(prefix >= 16 && prefix <= 32)) throw new Error(`subnet prefix must be /16../32: ${text}`);
  return { base: intToIp((ipToInt(ip) & maskOf(prefix)) >>> 0), prefix };
}

// ---------------------------------------------------------------- the two probes

/** TCP connect with a hard timeout; resolves true when the port accepted. */
export function portOpen(host: string, port: number, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const s = netConnect({ host, port });
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      s.destroy();
      signal?.removeEventListener('abort', onAbort);
      resolve(ok);
    };
    const onAbort = () => done(false);
    signal?.addEventListener('abort', onAbort, { once: true });
    s.setTimeout(timeoutMs, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

/** Run `fn` over `items` with bounded concurrency; stops scheduling when `signal` aborts. */
export async function parallelMap<T, R>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      if (signal?.aborted) return;
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return results;
}

export interface MdnsOptions {
  windowMs?: number;
  signal?: AbortSignal;
  /** Which interface addresses to send on; default = every local subnet's own address. */
  interfaces?: string[];
}

/** One legacy-unicast query per interface (source port ≠ 5353 → responders answer us directly, RFC 6762 §6.7). */
export async function mdnsQuery(opts: MdnsOptions = {}): Promise<AdbService[]> {
  const windowMs = opts.windowMs ?? 2000;
  const ifaces = opts.interfaces ?? localSubnets().map((s) => s.self);
  const messages: DnsMessage[] = [];
  const socket: UdpSocket = createSocket({ type: 'udp4', reuseAddr: true });
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, () => resolve());
  });
  socket.on('message', (m) => {
    try {
      const msg = parseDnsMessage(m);
      if (msg.flags & 0x8000) messages.push(msg);
    } catch {
      /* not for us */
    }
  });
  socket.on('error', () => {});
  const send = (packet: Uint8Array, iface?: string) =>
    new Promise<void>((resolve) => {
      try {
        if (iface) socket.setMulticastInterface(iface);
      } catch {
        /* interface gone */
      }
      socket.send(packet, MDNS_PORT, MDNS_ADDR, () => resolve());
    });
  const targets: Array<string | undefined> = ifaces.length ? ifaces : [undefined];
  const query = buildMdnsQuery([{ name: ADB_TLS_SERVICE }, { name: ADB_TCP_SERVICE }], { unicastResponse: true });
  for (const i of targets) await send(query, i);
  // Follow-up: instances that came back PTR-only get an SRV + A question.
  const followUp = async () => {
    const svcs = collectAdbServices(messages).filter((s) => !s.port || !s.ip);
    if (!svcs.length) return;
    const qs = svcs.flatMap((s) => [{ name: `${s.instance}.${s.service}`, type: DnsType.SRV }, ...(s.host ? [{ name: s.host, type: DnsType.A }] : [])]);
    const q = buildMdnsQuery(qs, { unicastResponse: true });
    for (const i of targets) await send(q, i);
  };
  await new Promise<void>((resolve) => {
    const half = setTimeout(() => void followUp(), Math.min(700, windowMs / 2));
    const end = setTimeout(resolve, windowMs);
    opts.signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(half);
        clearTimeout(end);
        resolve();
      },
      { once: true },
    );
  });
  socket.close();
  return collectAdbServices(messages);
}

export interface NetworkDiscoverOptions {
  /** `192.168.1.0/24`; default = every local /24. */
  subnet?: string;
  port?: number;
  /** Whole-operation budget (mDNS window + scan). Default 4000. */
  timeoutMs?: number;
  signal?: AbortSignal;
  onFound?: (d: DeviceInfo) => void;
  /** Skip mDNS (tests) / skip the scan. */
  mdns?: boolean;
  scan?: boolean;
  /** Called for every open port to tell tcp from wireless(tls) and to name it; default = plain `tcp`. */
  classify?: (host: string, port: number, signal?: AbortSignal) => Promise<{ method: 'tcp' | 'wireless'; name?: string } | null>;
  concurrency?: number;
  connectTimeoutMs?: number;
}

/** mDNS + subnet scan together; both stop at `timeoutMs`. Returns tcp/wireless `DeviceInfo`s, deduped by host:port. */
export async function discoverNetwork(opts: NetworkDiscoverOptions = {}): Promise<DeviceInfo[]> {
  const port = opts.port ?? DEFAULT_ADB_PORT;
  const timeoutMs = opts.timeoutMs ?? 4000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('discover timeout')), timeoutMs);
  opts.signal?.addEventListener('abort', () => ac.abort(opts.signal?.reason), { once: true });
  const signal = ac.signal;
  const found = new Map<string, DeviceInfo>();
  const emit = (d: DeviceInfo) => {
    if (found.has(d.id)) return;
    found.set(d.id, d);
    opts.onFound?.(d);
  };

  const subnets: LocalSubnet[] = opts.subnet ? [{ ...parseSubnet(opts.subnet), self: '', iface: 'arg' }] : localSubnets();
  // Addresses that are this machine. The subnet scan already skips them; mDNS can still answer for
  // us, and a hand-typed 127.0.0.1 is the same thing. The UI shows those as "This device".
  const mine = new Set<string>([...localSubnets().map((s) => s.self).filter(Boolean), '127.0.0.1', 'localhost']);

  const mdnsTask =
    opts.mdns === false
      ? Promise.resolve()
      : mdnsQuery({ windowMs: Math.min(2000, timeoutMs), signal, interfaces: subnets.map((s) => s.self).filter(Boolean) })
          .then((svcs) => {
            for (const s of svcs) {
              if (!s.ip || !s.port) continue;
              const tls = s.service === ADB_TLS_SERVICE;
              emit({ id: `${s.ip}:${s.port}`, name: s.instance, addr: `${s.ip}:${s.port}`, method: tls ? 'wireless' : 'tcp', ...(tls ? { tls: true } : {}), ...(mine.has(s.ip) ? { self: true } : {}) });
            }
          })
          .catch(() => {});

  const scanTask =
    opts.scan === false
      ? Promise.resolve()
      : (async () => {
          const hosts = subnets.flatMap((s) => expandSubnet(s, s.self ? [s.self] : []));
          await parallelMap(
            hosts,
            opts.concurrency ?? 64,
            async (host) => {
              if (!(await portOpen(host, port, opts.connectTimeoutMs ?? 300, signal))) return;
              if (found.has(`${host}:${port}`)) return;
              const c = opts.classify ? await opts.classify(host, port, signal).catch(() => null) : { method: 'tcp' as const };
              if (!c) return;
              emit({ id: `${host}:${port}`, name: c.name ?? host, addr: `${host}:${port}`, method: c.method, ...(c.method === 'wireless' ? { tls: true } : {}) });
            },
            signal,
          );
        })();

  await Promise.all([mdnsTask, scanTask]);
  clearTimeout(timer);
  return [...found.values()];
}
