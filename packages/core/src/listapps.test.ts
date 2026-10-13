// Ο μετατροπέας της λίστας: τι περνά, τι πετιέται, και ΓΙΑΤΙ — κάθε απόρριψη έχει λόγο.
import { describe, expect, it } from 'vitest';
import { appsForType } from './manifest.js';
import { appsFromList, hotelAppsListUrl, iconUrl, installTypeToIn } from './listapps.js';

const row = (tag: unknown, extra: Record<string, unknown> = {}) => ({
  comboId: '10',
  sortOrderId: 1,
  iconCode: '/media/icons/x.png',
  body: 'Downloader TV',
  subBody: 'Download & install with code, link, apk',
  tag: typeof tag === 'string' ? tag : JSON.stringify(tag),
  ...extra,
});

describe('listapps', () => {
  it('install_type → in, με typical ως προεπιλογή', () => {
    expect(installTypeToIn('all')).toEqual(['min', 'typ', 'full']);
    expect(installTypeToIn('typical')).toEqual(['typ', 'full']);
    expect(installTypeToIn('full')).toEqual(['full']);
    expect(installTypeToIn('none')).toEqual([]);
  });

  it('μια σωστή γραμμή γίνεται ManifestApp με τα κείμενα της γραμμής', () => {
    const { apps, rejected } = appsFromList([row({ pkg: 'com.esaba.downloader', url: 'https://tvboxtools.com/dl/apps/d.apk', install_type: 'full', size: '8 MB' })]);
    expect(rejected).toEqual([]);
    expect(apps).toHaveLength(1);
    const a = apps[0]!;
    expect(a.pkg).toBe('com.esaba.downloader');
    expect(a.name).toBe('Downloader TV');
    expect(a.summary).toBe('Download & install with code, link, apk');
    expect(a.icon).toBe('https://smartago.net/media/icons/x.png');
    expect(a.in).toEqual(['full']);
    expect(a.required).toBe(false);
    expect(a.role).toEqual(['owner', 'reseller']);
    expect(a.sha256).toBe(''); // χωρίς digest: κρίνει η μηχανή, όχι ο μετατροπέας
    expect(a.size).toBe('8 MB');
    expect(a.fromList).toBe(true);
  });

  it('πετάει ΜΕ ΛΟΓΟ: όχι JSON, χωρίς pkg, χωρίς https, διπλό pkg', () => {
    const { apps, rejected } = appsFromList([
      row('edo to json data'),
      row({ url: 'https://x/y.apk' }),
      row({ pkg: 'com.a.b', url: 'http://x/y.apk' }),
      row({ pkg: 'com.a.b', url: 'https://x/y.apk' }),
      row({ pkg: 'com.a.b', url: 'https://x/z.apk' }, { comboId: '11' }),
    ]);
    expect(apps.map((a) => a.pkg)).toEqual(['com.a.b']);
    expect(rejected).toHaveLength(4);
    expect(rejected[0]).toMatch(/not a JSON object/);
    expect(rejected[1]).toMatch(/pkg missing/);
    expect(rejected[2]).toMatch(/not https/);
    expect(rejected[3]).toMatch(/appears twice/);
  });

  it('άγνωστο install_type → typical, και το λέει', () => {
    const { apps, rejected } = appsFromList([row({ pkg: 'com.a.b', url: 'https://x/y.apk', install_type: 'sometimes' })]);
    expect(apps[0]!.in).toEqual(['typ', 'full']);
    expect(rejected[0]).toMatch(/install_type "sometimes" unknown/);
  });

  it('τα apps της λίστας μπαίνουν στο appsForType όπως του manifest', () => {
    const launcher = { pkg: 'com.hotel', name: 'Hotel', url: 'https://h/x.apk', sha256: 'a'.repeat(64), versionCode: 1, required: true, role: ['owner' as const] };
    const { apps } = appsFromList([
      row({ pkg: 'com.all', url: 'https://x/a.apk', install_type: 'all' }, { comboId: '1' }),
      row({ pkg: 'com.typ', url: 'https://x/b.apk', install_type: 'typical' }, { comboId: '2' }),
      row({ pkg: 'com.full', url: 'https://x/c.apk', install_type: 'full' }, { comboId: '3' }),
      row({ pkg: 'com.none', url: 'https://x/d.apk', install_type: 'none' }, { comboId: '4' }),
    ]);
    const all = [launcher, ...apps];
    expect(appsForType(all, 'min').map((a) => a.pkg)).toEqual(['com.hotel', 'com.all']);
    expect(appsForType(all, 'typ').map((a) => a.pkg)).toEqual(['com.hotel', 'com.all', 'com.typ']);
    expect(appsForType(all, 'full').map((a) => a.pkg)).toEqual(['com.hotel', 'com.all', 'com.typ', 'com.full']);
  });

  it('εικονίδιο: πλήρης διεύθυνση μένει, διαδρομή πάει στο smartago.net, κενό = τίποτα', () => {
    expect(iconUrl('https://cdn.x/a.png')).toBe('https://cdn.x/a.png');
    expect(iconUrl('/media/a.png')).toBe('https://smartago.net/media/a.png');
    expect(iconUrl('media/a.png')).toBe('https://smartago.net/media/a.png');
    expect(iconUrl('')).toBe('');
  });

  it('η διεύθυνση της λίστας μιλά τη γλώσσα του εργαλείου, EN = US', () => {
    expect(hotelAppsListUrl('el')).toContain('lag=EL&listKey=HOTELTV_APPS_INLCUDE_SETUP');
    expect(hotelAppsListUrl('en')).toContain('lag=US&');
  });
});
