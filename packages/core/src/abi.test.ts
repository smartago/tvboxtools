// Ένα APK ανά αρχιτεκτονική: ποιο αρχείο παίρνει κάθε κουτί, και τι γράφεται στην αναφορά.
import { describe, expect, it } from 'vitest';
import { parseAbiList, parseAbis, pickApkUrl } from './abi.js';
import { loadBrand } from './brand.js';
import { ProvisionEngine } from './engine.js';
import { appsFromList } from './listapps.js';
import type { Manifest } from './manifest.js';
import { SessionReport } from './report.js';

const V7 = 'https://tvboxtools.com/dl/apps/vlc.apk';
const A64 = 'https://tvboxtools.com/dl/apps/vlc-arm64.apk';
const vlc = { url: V7, abis: { 'arm64-v8a': A64, 'armeabi-v7a': V7 } };

describe('pickApkUrl', () => {
  it('arm64 κουτί → το arm64 αρχείο', () => {
    const c = pickApkUrl(vlc, parseAbiList('arm64-v8a,armeabi-v7a,armeabi\n'));
    expect(c.url).toBe(A64);
    expect(c.abi).toBe('arm64-v8a');
  });

  it('32-bit κουτί (και arm64 με 32-bit userspace — δεν αναφέρει arm64) → v7a', () => {
    const c = pickApkUrl(vlc, parseAbiList('armeabi-v7a,armeabi'));
    expect(c.url).toBe(V7);
    expect(c.abi).toBe('armeabi-v7a');
  });

  it('x86 → url, με λόγο', () => {
    const c = pickApkUrl(vlc, parseAbiList('x86_64,x86'));
    expect(c.url).toBe(V7);
    expect(c.abi).toBeNull();
    expect(c.why).toMatch(/none in the list/);
  });

  it('χωρίς abis → url', () => {
    expect(pickApkUrl({ url: V7 }, ['arm64-v8a']).url).toBe(V7);
  });

  it('κουτί που δεν είπε τίποτα → url', () => {
    expect(pickApkUrl(vlc, parseAbiList('')).url).toBe(V7);
  });
});

describe('parseAbis (η γραμμή της λίστας)', () => {
  it('κρατά μόνο https· άγνωστα ABI περνούν', () => {
    expect(parseAbis({ 'arm64-v8a': A64, 'armeabi-v7a': 'http://x/vlc.apk', riscv64: 'https://x/r.apk', 'bad key!': 'https://x' })).toEqual({ 'arm64-v8a': A64, riscv64: 'https://x/r.apk' });
  });

  it('τίποτα χρήσιμο → undefined (η γραμμή δουλεύει με το url)', () => {
    expect(parseAbis(undefined)).toBeUndefined();
    expect(parseAbis(['arm64-v8a'])).toBeUndefined();
    expect(parseAbis({ 'arm64-v8a': 'ftp://x' })).toBeUndefined();
  });

  it('η γραμμή 15 (VLC) όπως είναι ζωντανά', () => {
    const tag = { pkg: 'org.videolan.vlc', url: V7, install_type: 'typical', license: 'GPL-2.0', abis: { 'arm64-v8a': A64, 'armeabi-v7a': V7 } };
    const { apps, rejected } = appsFromList([{ comboId: '15', body: 'VLC', tag: JSON.stringify(tag) }]);
    expect(rejected).toEqual([]);
    expect(apps[0]!.abis).toEqual({ 'arm64-v8a': A64, 'armeabi-v7a': V7 });
    expect(apps[0]!.url).toBe(V7);
  });
});

describe('η μηχανή', () => {
  const setup = (abilist: string, withAbis = true) => {
    const sent: string[] = [];
    const fetched: string[] = [];
    const report = new SessionReport({ brand: 'launcher', tool: 'test', version: '0', startedAt: 0 });
    const engine = new ProvisionEngine({
      brand: loadBrand('launcher'),
      shell: {
        shell: async (cmd: string) => {
          sent.push(cmd);
          if (cmd === 'getprop ro.product.cpu.abilist') return abilist;
          if (cmd === 'getprop ro.product.cpu.abi') return 'armeabi-v7a\n';
          return '';
        },
        install: async () => 'Success',
      },
      report,
      fetchApk: async (url) => {
        fetched.push(url);
        return { stream: new ReadableStream<Uint8Array>({ start: (c) => c.close() }), size: 0 };
      },
      confirm: async () => true,
    });
    const app = (pkg: string) => ({ pkg, name: pkg, url: V7, sha256: '', versionCode: 0, required: false, role: ['owner', 'reseller'], ...(withAbis ? { abis: vlc.abis } : {}) });
    const manifest = { schema: 1, tool: { version: '1', minVersion: '1' }, apps: [app('org.videolan.vlc'), app('org.xbmc.kodi')] } as unknown as Manifest;
    return { sent, fetched, report, run: () => engine.install(manifest, 'owner', { only: ['org.videolan.vlc', 'org.xbmc.kodi'] }) };
  };

  it('arm64 κουτί: ρωτά ΜΙΑ φορά, κατεβάζει τα arm64, γράφει στην αναφορά ποιο και γιατί', async () => {
    const { sent, fetched, report, run } = setup('arm64-v8a,armeabi-v7a,armeabi\n');
    expect(await run()).toBe(true);
    expect(sent.filter((c) => c.startsWith('getprop'))).toEqual(['getprop ro.product.cpu.abilist']);
    expect(fetched).toEqual([A64, A64]);
    expect(report.entries.some((e) => e.kind === 'info' && /vlc-arm64\.apk \(box ABIs arm64-v8a,armeabi-v7a,armeabi → arm64-v8a\)/.test(e.text))).toBe(true);
  });

  it('παλιό κουτί χωρίς abilist: πέφτει στο ro.product.cpu.abi', async () => {
    const { sent, fetched, run } = setup('\n');
    expect(await run()).toBe(true);
    expect(sent.filter((c) => c.startsWith('getprop'))).toEqual(['getprop ro.product.cpu.abilist', 'getprop ro.product.cpu.abi']);
    expect(fetched).toEqual([V7, V7]);
  });

  it('γραμμές χωρίς abis: ούτε getprop, ούτε αλλαγή', async () => {
    const { sent, fetched, run } = setup('arm64-v8a', false);
    expect(await run()).toBe(true);
    expect(sent).toEqual([]);
    expect(fetched).toEqual([V7, V7]);
  });
});
