// Μετά την εγκατάσταση: τι δέχεται η γραμμή της λίστας, τι πετά ΜΕ ΛΟΓΟ, και τι στέλνει η μηχανή στο
// κουτί — μόνο μετά από `Success`, ποτέ από την έκδοση Play.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAfter, parseLaunchComponent, planIsEmpty } from './afterinstall.js';
import { loadBrand } from './brand.js';
import { ProvisionEngine } from './engine.js';
import { appsFromList } from './listapps.js';
import type { Manifest } from './manifest.js';
import { SessionReport } from './report.js';

describe('parseAfter', () => {
  it('η σύντομη μορφή: overlay + open', () => {
    const { plan, problems } = parseAfter(['overlay', 'open']);
    expect(problems).toEqual([]);
    expect(plan).toEqual({ appops: ['SYSTEM_ALERT_WINDOW'], grant: [], open: true });
  });

  it('η πλήρης μορφή: appops, grant (σύντομο όνομα → android.permission.*), open', () => {
    const { plan, problems } = parseAfter({ appops: ['system_alert_window'], grant: ['POST_NOTIFICATIONS', 'com.example.perm.X'], open: true });
    expect(problems).toEqual([]);
    expect(plan.appops).toEqual(['SYSTEM_ALERT_WINDOW']);
    expect(plan.grant).toEqual(['android.permission.POST_NOTIFICATIONS', 'com.example.perm.X']);
    expect(plan.open).toBe(true);
  });

  it('ΠΟΤΕ εντολή: ό,τι δεν είναι σκέτο όνομα πετιέται με λόγο', () => {
    const { plan, problems } = parseAfter({ appops: ['SYSTEM_ALERT_WINDOW; reboot', 'A B'], grant: ['x && rm -rf /'], open: 'yes', run: 'reboot' });
    expect(planIsEmpty(plan)).toBe(true);
    expect(problems.join('\n')).toMatch(/unknown key "run"/);
    expect(problems.join('\n')).toMatch(/not an appop name/);
    expect(problems.join('\n')).toMatch(/not a permission name/);
    expect(problems.join('\n')).toMatch(/open must be true or false/);
  });

  it('τα ονόματα που κάνουν μια ξένη εφαρμογή διαχειριστή του κουτιού δεν δίνονται ποτέ', () => {
    const { plan, problems } = parseAfter({ appops: ['REQUEST_INSTALL_PACKAGES'], grant: ['WRITE_SECURE_SETTINGS', 'android.permission.READ_LOGS'] });
    expect(planIsEmpty(plan)).toBe(true);
    expect(problems).toHaveLength(3);
  });

  it('άγνωστη σύντομη λέξη → λόγος, οι υπόλοιπες μένουν', () => {
    const { plan, problems } = parseAfter(['overlay', 'root']);
    expect(plan.appops).toEqual(['SYSTEM_ALERT_WINDOW']);
    expect(problems[0]).toMatch(/"root"/);
  });

  it('το component ανήκει ΜΟΝΟ στο πακέτο που ρωτήσαμε', () => {
    expect(parseLaunchComponent('priority=0 preferredOrder=0\nio.github.jqssun.airplay/.MainActivity\n', 'io.github.jqssun.airplay')).toBe('io.github.jqssun.airplay/.MainActivity');
    expect(parseLaunchComponent('No activity found', 'io.github.jqssun.airplay')).toBeNull();
    expect(parseLaunchComponent('com.other/.Main', 'io.github.jqssun.airplay')).toBeNull();
  });
});

describe('η γραμμή της λίστας', () => {
  it('το AirPlay: after περνά στο app, size σε bytes γίνεται MB, οι κακές λέξεις αναφέρονται και η γραμμή μένει', () => {
    const tag = { pkg: 'io.github.jqssun.airplay', url: 'https://tvboxtools.com/dl/apps/airplay.apk', install_type: 'typical', size: 25866040, after: ['overlay', 'open', 'bogus'] };
    const { apps, rejected } = appsFromList([{ comboId: '12', body: 'AirPlay Server', tag: JSON.stringify(tag) }]);
    expect(apps).toHaveLength(1);
    expect(apps[0]!.after).toEqual({ appops: ['SYSTEM_ALERT_WINDOW'], grant: [], open: true });
    expect(apps[0]!.size).toBe('24.7 MB');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatch(/row 12 .*"bogus"/);
  });

  it('χωρίς after: τίποτα', () => {
    const { apps } = appsFromList([{ comboId: '10', body: 'D', tag: JSON.stringify({ pkg: 'com.a.b', url: 'https://smartago.net/a.apk' }) }]);
    expect(apps[0]!.after).toBeUndefined();
  });
});

describe('η μηχανή', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (installOut: string, playBuild = false, selfPackage: string | null = null) => {
    const sent: string[] = [];
    const shell = {
      shell: async (cmd: string) => {
        sent.push(cmd);
        if (cmd.includes('LEANBACK_LAUNCHER') && cmd.endsWith('com.tv.launcher.manager.adb.tvboxtools')) return 'com.tv.launcher.manager.adb.tvboxtools/tv.launcher.manager.MainActivity\n';
        if (cmd.includes('LEANBACK_LAUNCHER')) return 'io.github.jqssun.airplay/.MainActivity\n';
        if (cmd.startsWith('am start')) return 'Starting: Intent { cmp=io.github.jqssun.airplay/.MainActivity }\n';
        return '';
      },
      install: async () => installOut,
    };
    const engine = new ProvisionEngine({
      brand: loadBrand('launcher'),
      shell,
      report: new SessionReport({ brand: 'launcher', tool: 'test', version: '0', startedAt: 0 }),
      fetchApk: async () => ({ stream: new ReadableStream<Uint8Array>({ start: (c) => c.close() }), size: 0 }),
      confirm: async () => true,
      selfPackage: () => selfPackage,
    });
    const manifest = {
      schema: 1,
      tool: { version: '1', minVersion: '1' },
      apps: [{ pkg: 'io.github.jqssun.airplay', name: 'AirPlay', url: 'https://tvboxtools.com/dl/apps/airplay.apk', sha256: '', versionCode: 0, required: false, role: ['owner', 'reseller'], after: { appops: ['SYSTEM_ALERT_WINDOW'], grant: [], open: true } }],
    } as unknown as Manifest;
    return { sent, run: () => engine.install(manifest, 'owner', { only: ['io.github.jqssun.airplay'] }) };
  };

  const finish = async (p: Promise<boolean>) => {
    await vi.runAllTimersAsync();
    return p;
  };

  it('μετά από Success: appops, μετά άνοιγμα από το component του κουτιού, μετά HOME', async () => {
    const { sent, run } = setup('Success');
    expect(await finish(run())).toBe(true);
    expect(sent).toEqual([
      'appops set io.github.jqssun.airplay SYSTEM_ALERT_WINDOW allow',
      'cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER io.github.jqssun.airplay',
      'am start -n io.github.jqssun.airplay/.MainActivity',
      'input keyevent KEYCODE_HOME',
    ]);
  });

  it('το εργαλείο τρέχει στο ίδιο box: γυρνά ΣΤΟ ΕΡΓΑΛΕΙΟ, όχι στην αρχική (βίντεο Jim 12/10)', async () => {
    const { sent, run } = setup('Success', false, 'com.tv.launcher.manager.adb.tvboxtools');
    expect(await finish(run())).toBe(true);
    expect(sent.slice(-2)).toEqual([
      'cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LEANBACK_LAUNCHER com.tv.launcher.manager.adb.tvboxtools',
      'am start -n com.tv.launcher.manager.adb.tvboxtools/tv.launcher.manager.MainActivity',
    ]);
    expect(sent).not.toContain('input keyevent KEYCODE_HOME');
  });

  it('αποτυχημένη εγκατάσταση: ΤΙΠΟΤΑ μετά', async () => {
    const { sent, run } = setup('Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]');
    expect(await finish(run())).toBe(false);
    expect(sent).toEqual([]);
  });

  it('αντίγραφο Play του εργαλείου (12/10): ΙΔΙΑ βήματα με το sideload — η ομάδα 2 είναι ανοιχτή', async () => {
    const { sent, run } = setup('Success', true);
    expect(await finish(run())).toBe(true);
    expect(sent[0]).toBe('appops set io.github.jqssun.airplay SYSTEM_ALERT_WINDOW allow');
    expect(sent).toContain('am start -n io.github.jqssun.airplay/.MainActivity');
  });
});
