// Ο αναγνώστης του XAPK, πάνω σε ΑΛΗΘΙΝΟ zip — φτιαγμένο εδώ με τα ίδια εργαλεία του Node, ώστε να
// μην υπάρχει «δικό μας zip για δικό μας parser». Δοκιμάζονται τα τρία που χαλάνε στην πράξη:
// deflate και store στο ίδιο αρχείο, η ΣΕΙΡΑ (base πρώτο, κομμάτια μετά) και τα OBB.
import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { isMultiApk, readXapk, readZip } from './xapk.js';

/** Ένα zip με τα δοσμένα αρχεία. `store` = χωρίς συμπίεση, όπως το γράφουν πολλά XAPK για τα apk. */
function zip(files: Array<{ name: string; data: Uint8Array; store?: boolean }>): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let at = 0;
  const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
  for (const f of files) {
    const name = enc.encode(f.name);
    const body = f.store ? f.data : new Uint8Array(deflateRawSync(f.data));
    const crc = 0; // ο parser μας δεν ελέγχει CRC — ό,τι δεν διαβάζουμε, δεν το προσποιούμαστε
    const head = Uint8Array.from([
      0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(f.store ? 0 : 8), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(body.length), ...u32(f.data.length), ...u16(name.length), ...u16(0),
    ]);
    locals.push(head, name, body);
    central.push(
      Uint8Array.from([
        0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(f.store ? 0 : 8), ...u16(0), ...u16(0),
        ...u32(crc), ...u32(body.length), ...u32(f.data.length), ...u16(name.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(at),
      ]),
      name,
    );
    at += head.length + name.length + body.length;
  }
  const cdStart = at;
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = Uint8Array.from([
    0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(cdSize), ...u32(cdStart), ...u16(0),
  ]);
  const all = [...locals, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

const text = (s: string) => new TextEncoder().encode(s);

describe('xapk', () => {
  it('ξεχωρίζει τις καταλήξεις που είναι πακέτο', () => {
    expect(isMultiApk('app.xapk')).toBe(true);
    expect(isMultiApk('App.APKS')).toBe(true);
    expect(isMultiApk('x.apkm')).toBe(true);
    expect(isMultiApk('plain.apk')).toBe(false);
  });

  it('διαβάζει deflate ΚΑΙ store στο ίδιο αρχείο', async () => {
    const big = text('ΠΑΠΑΠΑ'.repeat(500)); // συμπιέζεται πολύ — αν το ξεφούσκωμα σπάσει, φαίνεται
    const blob = new Blob([zip([{ name: 'a.txt', data: big }, { name: 'b.txt', data: text('όπως είναι'), store: true }])]);
    const entries = await readZip(blob);
    expect(entries.map((e) => e.name)).toEqual(['a.txt', 'b.txt']);
    expect(entries[0]!.size).toBe(big.length);
    expect(await new Response(await entries[0]!.open()).text()).toBe('ΠΑΠΑΠΑ'.repeat(500));
    expect(await new Response(await entries[1]!.open()).text()).toBe('όπως είναι');
  });

  it('βάζει το base ΠΡΩΤΟ και αναγνωρίζει κομμάτια, OBB και manifest', async () => {
    const blob = new Blob([
      zip([
        { name: 'config.arm64_v8a.apk', data: text('split-abi') },
        { name: 'manifest.json', data: text('{"package_name":"com.example.app","name":"Example"}') },
        { name: 'com.example.app.apk', data: text('base-base-base') },
        { name: 'config.xxhdpi.apk', data: text('split-dpi') },
        { name: 'Android/obb/com.example.app/main.1.com.example.app.obb', data: text('data') },
        { name: 'icon.png', data: text('not an apk') },
      ]),
    ]);
    const x = await readXapk(blob);
    expect(x.pkg).toBe('com.example.app');
    expect(x.label).toBe('Example');
    expect(x.apks[0]!.name).toBe('com.example.app.apk'); // το base ΠΡΩΤΟ — αυτό θέλει το pm
    expect(x.apks.map((a) => a.name).sort()).toEqual(['com.example.app.apk', 'config.arm64_v8a.apk', 'config.xxhdpi.apk']);
    expect(x.obb).toHaveLength(1);
    expect(x.obb[0]!.target).toBe('/sdcard/Android/obb/com.example.app/main.1.com.example.app.obb');
  });

  it('διαλέγει το base-master του bundletool όταν υπάρχει', async () => {
    const blob = new Blob([
      zip([
        { name: 'splits/base-xxhdpi.apk', data: text('dpi') },
        { name: 'splits/base-master.apk', data: text('m') }, // ΜΙΚΡΟΤΕΡΟ: το όνομα νικά το μέγεθος
        { name: 'toc.pb', data: text('x') },
      ]),
    ]);
    const x = await readXapk(blob);
    expect(x.apks[0]!.name).toBe('splits/base-master.apk');
    expect(x.apks).toHaveLength(2);
  });
});
