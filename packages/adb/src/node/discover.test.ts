import { describe, expect, it } from 'vitest';
import { ADB_TCP_SERVICE, ADB_TLS_SERVICE, buildMdnsQuery, collectAdbServices, discoverNetwork, DnsType, expandSubnet, localSubnets, parseDnsMessage, parseSubnet } from './discover.js';

function name(n: string): number[] {
  return [...n.split('.').flatMap((l) => [l.length, ...Buffer.from(l)]), 0];
}

describe('mDNS packets', () => {
  it('builds a legacy-unicast PTR query for both ADB services', () => {
    const q = buildMdnsQuery([{ name: ADB_TLS_SERVICE }, { name: ADB_TCP_SERVICE }], { unicastResponse: true });
    const msg = parseDnsMessage(q);
    expect(msg.id).toBe(0);
    expect(msg.flags).toBe(0);
    expect(msg.questions.map((x) => x.name)).toEqual([ADB_TLS_SERVICE, ADB_TCP_SERVICE]);
    expect(msg.questions[0]!.type).toBe(DnsType.PTR);
    // QU bit set on the wire (the parser strips it from the class)
    const buf = Buffer.from(q);
    expect(buf.readUInt16BE(12 + name(ADB_TLS_SERVICE).length + 2) & 0x8000).toBe(0x8000);
    expect(msg.questions[0]!.cls).toBe(1);
  });

  it('parses a response with PTR + SRV + A and compression pointers', () => {
    // header: id 0, flags 0x8400 (response, AA), qd 0, an 1, ns 0, ar 2
    const head = [0, 0, 0x84, 0x00, 0, 0, 0, 1, 0, 0, 0, 2];
    const svc = name(ADB_TLS_SERVICE); // the service name starts at offset 12
    const ptrHead = [...svc, 0, 12, 0x80, 0x01, 0, 0, 0, 120]; // PTR, IN + cache-flush, ttl 120
    const instance = Buffer.from('adb-7F3A9C12B04E-abcdef');
    const ptrData = [instance.length, ...instance, 0xc0, 12]; // instance label + pointer to offset 12
    const ptrRr = [...ptrHead, 0, ptrData.length, ...ptrData];
    const instanceOffset = 12 + ptrHead.length + 2; // where the instance name starts inside rdata
    const srvData = [0, 0, 0, 0, 0x15, 0xb3, ...name('mibox.local')]; // port 5555
    const srvRr = [0xc0, instanceOffset, 0, 33, 0, 1, 0, 0, 0, 120, 0, srvData.length, ...srvData];
    const aRr = [...name('mibox.local'), 0, 1, 0, 1, 0, 0, 0, 120, 0, 4, 192, 168, 1, 73];
    const packet = Uint8Array.from([...head, ...ptrRr, ...srvRr, ...aRr]);
    const msg = parseDnsMessage(packet);
    expect(msg.answers).toHaveLength(1);
    expect(msg.answers[0]).toMatchObject({ name: ADB_TLS_SERVICE, type: DnsType.PTR, cls: 1, data: `adb-7F3A9C12B04E-abcdef.${ADB_TLS_SERVICE}` });
    expect(msg.additionals[0]).toMatchObject({ type: DnsType.SRV, name: `adb-7F3A9C12B04E-abcdef.${ADB_TLS_SERVICE}`, data: { port: 5555, target: 'mibox.local' } });
    expect(msg.additionals[1]).toMatchObject({ type: DnsType.A, name: 'mibox.local', data: '192.168.1.73' });
    const svcs = collectAdbServices([msg]);
    expect(svcs).toEqual([{ instance: 'adb-7F3A9C12B04E-abcdef', service: ADB_TLS_SERVICE, host: 'mibox.local', port: 5555, ip: '192.168.1.73' }]);
  });

  it('joins a PTR-only answer with a later SRV/A answer (the follow-up query)', () => {
    const head1 = [0, 0, 0x84, 0x00, 0, 0, 0, 1, 0, 0, 0, 0];
    const inst = Buffer.from('adb-XYZ-1');
    const ptrData = [inst.length, ...inst, ...name(ADB_TCP_SERVICE)];
    const m1 = parseDnsMessage(Uint8Array.from([...head1, ...name(ADB_TCP_SERVICE), 0, 12, 0, 1, 0, 0, 0, 120, 0, ptrData.length, ...ptrData]));
    const head2 = [0, 0, 0x84, 0x00, 0, 0, 0, 2, 0, 0, 0, 0];
    const srvData = [0, 0, 0, 0, 0x15, 0xb3, ...name('box.local')];
    const m2 = parseDnsMessage(
      Uint8Array.from([...head2, ...name(`adb-XYZ-1.${ADB_TCP_SERVICE}`), 0, 33, 0, 1, 0, 0, 0, 120, 0, srvData.length, ...srvData, ...name('box.local'), 0, 1, 0, 1, 0, 0, 0, 120, 0, 4, 10, 0, 0, 9]),
    );
    expect(collectAdbServices([m1])).toEqual([{ instance: 'adb-XYZ-1', service: ADB_TCP_SERVICE }]);
    expect(collectAdbServices([m1, m2])).toEqual([{ instance: 'adb-XYZ-1', service: ADB_TCP_SERVICE, host: 'box.local', port: 5555, ip: '10.0.0.9' }]);
  });

  it('rejects truncated packets instead of hanging', () => {
    expect(() => parseDnsMessage(new Uint8Array([0, 0, 0x84]))).toThrow();
    const q = Buffer.from(buildMdnsQuery([{ name: ADB_TCP_SERVICE }]));
    expect(() => parseDnsMessage(q.subarray(0, q.length - 3))).toThrow();
  });
});

describe('subnet enumeration', () => {
  const fake = {
    Ethernet: [{ address: '192.168.1.5', netmask: '255.255.255.0', family: 'IPv4', mac: '', internal: false, cidr: '192.168.1.5/24' }],
    'Wi-Fi': [{ address: '10.0.0.17', netmask: '255.255.0.0', family: 'IPv4', mac: '', internal: false, cidr: '10.0.0.17/16' }],
    'Loopback Pseudo-Interface 1': [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '', internal: true, cidr: '127.0.0.1/8' }],
    'vEthernet (WSL)': [{ address: '172.20.0.1', netmask: '255.255.240.0', family: 'IPv4', mac: '', internal: false, cidr: '172.20.0.1/20' }],
    'TAP-Windows Adapter V9': [{ address: '10.8.0.2', netmask: '255.255.255.0', family: 'IPv4', mac: '', internal: false, cidr: '10.8.0.2/24' }],
    Tailscale: [{ address: '100.101.102.103', netmask: '255.192.0.0', family: 'IPv4', mac: '', internal: false, cidr: '100.101.102.103/10' }],
    'Ethernet 2': [
      { address: '169.254.10.20', netmask: '255.255.0.0', family: 'IPv4', mac: '', internal: false, cidr: '169.254.10.20/16' },
      { address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', mac: '', internal: false, cidr: 'fe80::1/64', scopeid: 1 },
    ],
  } as unknown as Parameters<typeof localSubnets>[0];

  it('keeps real LAN /24s, drops loopback, link-local, CGNAT and VPN/virtual adapters, never wider than /24', () => {
    expect(localSubnets(fake)).toEqual([
      { base: '192.168.1.0', prefix: 24, self: '192.168.1.5', iface: 'Ethernet' },
      { base: '10.0.0.0', prefix: 24, self: '10.0.0.17', iface: 'Wi-Fi' },
    ]);
  });

  it('expands a /24 to 253 hosts without self, network and broadcast', () => {
    const hosts = expandSubnet({ base: '192.168.1.0', prefix: 24 }, ['192.168.1.5']);
    expect(hosts).toHaveLength(253);
    expect(hosts[0]).toBe('192.168.1.1');
    expect(hosts.at(-1)).toBe('192.168.1.254');
    expect(hosts).not.toContain('192.168.1.5');
    expect(expandSubnet({ base: '192.168.1.0', prefix: 30 })).toEqual(['192.168.1.1', '192.168.1.2']);
    expect(expandSubnet({ base: '192.168.1.50', prefix: 32 })).toEqual(['192.168.1.50']);
  });

  it('parses subnet arguments', () => {
    expect(parseSubnet('192.168.1.77/24')).toEqual({ base: '192.168.1.0', prefix: 24 });
    expect(parseSubnet('10.1.2.3')).toEqual({ base: '10.1.2.0', prefix: 24 });
    expect(() => parseSubnet('nope')).toThrow();
    expect(() => parseSubnet('10.0.0.0/8')).toThrow();
  });

  it('scan respects the budget: an unrouted range returns within the timeout', async () => {
    const t0 = Date.now();
    // TEST-NET-1 (192.0.2.0/24) is never routed: the connects must time out, not hang.
    const list = await discoverNetwork({ subnet: '192.0.2.0/29', mdns: false, timeoutMs: 1500, connectTimeoutMs: 200 });
    expect(list).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
