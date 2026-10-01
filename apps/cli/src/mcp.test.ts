import { describe, expect, it } from 'vitest';
import { MockTransport } from '@tvlm/adb';
import { TOOL_VERSION } from '@tvlm/core';
import { createMcpServer, createTools, mcpContextFor } from './mcp.js';

function text(r: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const t = r.content.find((c) => c.type === 'text')?.text ?? '{}';
  return JSON.parse(t);
}

async function connected(scenario: 'happy' | 'accounts' = 'happy', target: 'hotel' | 'launcher' = 'hotel') {
  const t = new MockTransport({ speed: 0, scenario });
  const tools = createTools(mcpContextFor(t, target, TOOL_VERSION, true));
  const c = await tools.connect.handler({ target: '192.168.1.50:5555', waitSeconds: 5 });
  expect(c.isError).toBeFalsy();
  return { t, tools };
}

describe('MCP tools (mock transport)', () => {
  it('discover → connect → check', async () => {
    const t = new MockTransport({ speed: 0 });
    const tools = createTools(mcpContextFor(t, 'hotel', TOOL_VERSION, true));
    const d = text(await tools.discover.handler({}));
    expect((d.devices as unknown[]).length).toBe(3);
    const noDev = createTools(mcpContextFor(new MockTransport({ speed: 0, scenario: 'nodevices' }), 'hotel', TOOL_VERSION, true));
    expect(text(await noDev.discover.handler({})).devices).toEqual([]);
    // check before connect is an error, not a crash
    expect((await tools.check.handler({})).isError).toBe(true);
    const c = text(await tools.connect.handler({ target: '192.168.1.50:5555' }));
    expect(c.connected).toBe(true);
    const chk = text(await tools.check.handler({}));
    expect(chk.check).toMatchObject({ platform: 'androidtv', launcherInstalled: false });
  });

  it('shell gate: auto runs, confirm needs confirmed:true, blocked never runs', async () => {
    const { t, tools } = await connected();
    const auto = text(await tools.shell.handler({ command: 'getprop ro.product.model', confirmed: false }));
    expect(auto).toMatchObject({ ran: true, verdict: 'auto' });
    expect(String(auto.output)).toContain('MIBOX4');

    const cmd = 'settings put secure enabled_accessibility_services x/y';
    const ask = text(await tools.shell.handler({ command: cmd, confirmed: false }));
    expect(ask).toMatchObject({ ran: false, needsConfirmation: true, command: cmd });
    expect(t.box.secure['enabled_accessibility_services']).toBeUndefined(); // did NOT run

    const run = text(await tools.shell.handler({ command: cmd, confirmed: true }));
    expect(run).toMatchObject({ ran: true, verdict: 'confirm' });
    expect(t.box.secure['enabled_accessibility_services']).toBe('x/y');

    for (const bad of ['reboot bootloader', 'settings put global adb_enabled 0', 'pm uninstall com.android.settings', 'rm -rf /data', 'dpm remove-active-admin x/y']) {
      const r = await tools.shell.handler({ command: bad, confirmed: true });
      expect(r.isError).toBe(true);
      expect(text(r)).toMatchObject({ ran: false, blocked: true });
    }
    // and the report carries all of it
    const rep = await tools.report.handler({ format: 'text' });
    const body = rep.content[0]!.type === 'text' ? rep.content[0]!.text : '';
    expect(body).toContain('$ getprop ro.product.model   (auto)');
    expect(body).toContain('(confirm)');
    expect(body).toContain('blocked:');
  });

  it('provision: dryRun lists the plan; the real run completes and reports human actions', async () => {
    const { t, tools } = await connected();
    const dry = text(await tools.provision.handler({ profile: 'kiosk', lang: 'el', role: 'reseller', dryRun: true }));
    expect(dry.dryRun).toBe(true);
    const plan = dry.plan as Array<{ task: string; steps: Array<{ cmd: string; verdict: string }> }>;
    expect(plan.map((p) => p.task)).toEqual(['profile', 'launcher', 'configure', 'test', 'handover']);
    expect(plan[0]!.steps[0]!.cmd).toMatch(/^dpm set-device-owner/);
    expect(plan[0]!.steps[0]!.verdict).toBe('confirm');
    expect(t.box.deviceOwner).toBeNull(); // dry run touched nothing

    const r = text(await tools.provision.handler({ profile: 'kiosk', lang: 'el', role: 'reseller', dryRun: false, stopBefore: 'test' }));
    expect(r.ok).toBe(true);
    expect(r.tasks).toMatchObject({ profile: true, install: true, launcher: true, configure: true, test: null, handover: null });
    expect(t.box.deviceOwner).toContain('HotelDeviceAdminReceiver');
    expect(t.box.adbEnabled).toBe(true); // stopped before handover

    const tst = text(await tools.test.handler({}));
    expect(tst.ok).toBe(true);
    expect((tst.humanActions as Array<{ what: string }>).map((h) => h.what)).toEqual(['reboot']);
  });

  it('provision refuses kiosk when a Google account is present', async () => {
    const { tools } = await connected('accounts');
    await tools.check.handler({});
    const r = await tools.provision.handler({ profile: 'kiosk', lang: 'en', role: 'reseller', dryRun: false });
    expect(r.isError).toBe(true);
    expect(String(text(r).reason)).toMatch(/Google account present/);
  });

  it('screenshot returns image content; link sends the LINK broadcast', async () => {
    const { t, tools } = await connected();
    const shot = await tools.screenshot.handler({});
    expect(shot.content[0]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    const link = text(await tools.link.handler({ code: 'ABCD1234' }));
    expect(link.ok).toBe(true);
    expect(t.box.broadcasts.some((b) => b.includes('.LINK') && b.includes('--es code ABCD1234'))).toBe(true);
  });

  it('registers every tool on an McpServer with the instructions in the descriptions', () => {
    const { server, tools } = createMcpServer(mcpContextFor(new MockTransport({ speed: 0 }), 'launcher', TOOL_VERSION, true));
    expect(Object.keys(tools).sort()).toEqual(['check', 'connect', 'discover', 'install', 'link', 'pair', 'provision', 'report', 'screenshot', 'shell', 'test']);
    expect(tools.shell.description).toMatch(/confirmed:true/);
    expect(tools.provision.description).toMatch(/stopBefore/);
    expect(server.isConnected()).toBe(false);
  });
});
