import { describe, expect, it } from 'vitest';
import { parseCli, UsageError } from './cli.js';

describe('parseCli', () => {
  it('defaults: help without a command, the launcher target, its own profile, debug-off on', () => {
    const o = parseCli([]);
    expect(o.command).toBe('help');
    expect(o.brand).toBe('launcher');
    expect(o.target).toBe('launcher');
    expect(o.profile).toBe('open'); // PLUI has no kiosk profile
    expect(o.debugOff).toBe(true);
    expect(o.json).toBe(false);
    expect(o.mock).toBeUndefined();
  });

  it('the hotel target leads with the kiosk profile, and is implied by a room code', () => {
    expect(parseCli(['provision', '--target', 'hotel']).profile).toBe('kiosk');
    expect(parseCli(['provision', '--link', 'ABCD1234']).target).toBe('hotel');
    expect(parseCli(['provision', '--role', 'owner']).target).toBe('hotel');
    expect(parseCli(['provision', '--profile', 'open']).target).toBe('launcher');
  });

  it('the old spelling is refused with the new one in the message', () => {
    expect(() => parseCli(['provision', '--brand', 'kiosk'])).toThrow(/--target hotel/);
  });

  it('reads the command from the first positional and keeps the rest', () => {
    const o = parseCli(['pair', '192.168.1.50:37123', '123456', '--json']);
    expect(o.command).toBe('pair');
    expect(o.positionals).toEqual(['192.168.1.50:37123', '123456']);
    expect(o.json).toBe(true);
  });

  it('--mock takes an optional scenario', () => {
    expect(parseCli(['check', '--mock']).mock).toBe('happy');
    expect(parseCli(['check', '--mock', 'accounts']).mock).toBe('accounts');
    expect(parseCli(['check', '--mock', '--json']).mock).toBe('happy');
    expect(parseCli(['discover', '--mock', 'nodevices', '--json']).mock).toBe('nodevices');
    expect(() => parseCli(['check', '--mock=weird'])).toThrow(UsageError);
  });

  it('provision options: --profile --lang --link --no-debug-off --yes --stop-before', () => {
    const o = parseCli(['provision', '--profile', 'open', '--lang', 'el', '--link', 'ABCD1234', '--no-debug-off', '--yes', '--stop-before', 'test', '--role', 'owner']);
    expect(o).toMatchObject({ command: 'provision', profile: 'open', lang: 'el', link: 'ABCD1234', debugOff: false, yes: true, stopBefore: 'test', role: 'owner', target: 'hotel' });
    expect(() => parseCli(['provision', '--profile', 'locked'])).toThrow(/--profile must be one of/);
  });

  it('flags --mcp and --check select the command; --brand/--target validated', () => {
    expect(parseCli(['--mcp', '--mock']).command).toBe('mcp');
    expect(parseCli(['--check', '--json']).command).toBe('check');
    expect(parseCli(['check', '--brand', 'launcher']).brand).toBe('launcher');
    expect(() => parseCli(['check', '--brand', 'sony'])).toThrow(UsageError);
    expect(() => parseCli(['check', '--target', 'sony'])).toThrow(UsageError);
    expect(() => parseCli(['fly'])).toThrow(/unknown command/);
  });

  it('numbers are integers', () => {
    expect(parseCli(['bridge', '--port', '15556']).port).toBe(15556);
    expect(() => parseCli(['bridge', '--port', 'x'])).toThrow(UsageError);
    expect(parseCli(['discover', '--timeout', '2500']).timeout).toBe(2500);
  });
});
