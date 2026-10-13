// Per-brand launcher icons for the Android app — run `pnpm --filter @tvlm/android icons`.
//
// Reads brands/<id>.json (logo.icon → brands/assets/…, colors.gradient[0] → adaptive background)
// and writes into android/app/src/<brand>/res/:
//   mipmap-{m,h,x,xx,xxx}dpi/ic_launcher.png            legacy square (48·72·96·144·192 px)
//   mipmap-{m,h,x,xx,xxx}dpi/ic_launcher_round.png      legacy round (circle mask)
//   mipmap-{m,h,x,xx,xxx}dpi/ic_launcher_foreground.png adaptive foreground (108dp canvas,
//                                                        artwork in the 72dp safe zone)
//   mipmap-anydpi-v26/ic_launcher.xml + ic_launcher_round.xml
//   values/strings.xml                                 app_name, package_name, custom_url_scheme
// src/main/res carries NO icons on purpose: each brand is complete on its own.
//
//   drawable-xhdpi/banner.png                          Android TV banner (320×180, see BANNER)
// src/main/res carries NO icons on purpose: each brand is complete on its own.
//
// sharp comes from @capacitor/assets (already in the workspace); an SVG is rasterised at 1024 px
// first, a PNG is used as is.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.resolve('@capacitor/assets/package.json'));
const sharp = require('sharp');

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const brandsDir = join(repo, 'brands');

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const LEGACY_DP = 48;
const ADAPTIVE_DP = 108;
const SAFE_DP = 72; // adaptive icons: everything outside the inner 72dp may be masked away
// The Android TV banner is the tile in the leanback launcher. It must be exactly 320×180 and live
// in drawable-xhdpi, whatever the TV's density — Play rejects anything else (a rejection we have
// already had once). The wordmark sits on the brand's own gradient.
const BANNER = { w: 320, h: 180 };

async function source(brand) {
  const file = join(brandsDir, 'assets', brand.logo.icon);
  const buf = await readFile(file);
  // Rasterise once at 1024 (SVG) or take the PNG as is; everything below resizes from this.
  const master = file.endsWith('.svg') ? await sharp(buf, { density: 300 }).resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer() : buf;
  // Trim the transparent margin the artwork ships with, so the ICON decides the padding, not the
  // file. Play rejects a launcher icon that "does not fill the icon space", and the answer there is
  // always to make the artwork bigger (that rejection cost us a submission once).
  const trimmed = await sharp(master).ensureAlpha().trim({ threshold: 1 }).png().toBuffer();
  return sharp(trimmed);
}

function circleMask(size) {
  return Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
}

async function build(id) {
  const brand = JSON.parse(await readFile(join(brandsDir, `${id}.json`), 'utf8'));
  const bg = brand.colors.gradient[0];
  const art = await source(brand);
  const master = await art.toBuffer();
  const meta = await sharp(master).metadata();
  // Does the artwork already fill its canvas (opaque corners)? Then the legacy icon is the art
  // itself; otherwise it sits on the brand colour so it never shows a transparent square.
  const corner = await sharp(master).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  const opaque = corner[3] === 255;
  const resDir = join(here, '..', 'android', 'app', 'src', id, 'res');

  for (const [dpi, scale] of Object.entries(DENSITIES)) {
    const dir = join(resDir, `mipmap-${dpi}`);
    await mkdir(dir, { recursive: true });
    const legacy = Math.round(LEGACY_DP * scale);
    const adaptive = Math.round(ADAPTIVE_DP * scale);
    const safe = Math.round(SAFE_DP * scale);

    // legacy square: art on brand colour (or the opaque art itself), 10% inset when transparent
    const inset = opaque ? legacy : Math.round(legacy * 0.86);
    const artLegacy = await sharp(master).resize(inset, inset, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const square = await sharp({ create: { width: legacy, height: legacy, channels: 4, background: bg } })
      .composite([{ input: artLegacy, gravity: 'centre' }])
      .png()
      .toBuffer();
    await writeFile(join(dir, 'ic_launcher.png'), square);

    // legacy round: the same, circle-masked
    const round = await sharp(square).composite([{ input: circleMask(legacy), blend: 'dest-in' }]).png().toBuffer();
    await writeFile(join(dir, 'ic_launcher_round.png'), round);

    // adaptive foreground: art centred in the safe zone of a transparent 108dp canvas
    const artFg = await sharp(master).resize(safe, safe, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const fg = await sharp({ create: { width: adaptive, height: adaptive, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: artFg, gravity: 'centre' }])
      .png()
      .toBuffer();
    await writeFile(join(dir, 'ic_launcher_foreground.png'), fg);
  }

  // Android TV banner (320×180, drawable-xhdpi). A brand may ship a finished 16:9 banner
  // (`logo.banner`) — a dark wordmark needs its own light background and cannot sit on our
  // gradient. Otherwise the wordmark is composited on the brand gradient.
  const bannerDir = join(resDir, 'drawable-xhdpi');
  await mkdir(bannerDir, { recursive: true });
  let bannerFrom;
  if (brand.logo.banner) {
    bannerFrom = brand.logo.banner;
    await sharp(join(brandsDir, 'assets', brand.logo.banner))
      .resize(BANNER.w, BANNER.h, { fit: 'cover' })
      .flatten({ background: '#ffffff' })
      .png()
      .toFile(join(bannerDir, 'banner.png'));
  } else {
    bannerFrom = `${brand.logo.wordmark} on the brand gradient`;
    const [g1, g2, g3] = brand.colors.gradient;
    const bannerBg = Buffer.from(
      `<svg width="${BANNER.w}" height="${BANNER.h}" xmlns="http://www.w3.org/2000/svg">` +
        `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0%" stop-color="${g1}"/><stop offset="52%" stop-color="${g2}"/><stop offset="100%" stop-color="${g3}"/>` +
        `</linearGradient></defs><rect width="${BANNER.w}" height="${BANNER.h}" fill="url(#g)"/></svg>`,
    );
    const wordmarkFile = join(brandsDir, 'assets', brand.logo.wordmark);
    const wordmarkBuf = await readFile(wordmarkFile);
    const wordmark = await sharp(wordmarkFile.endsWith('.svg') ? await sharp(wordmarkBuf, { density: 600 }).png().toBuffer() : wordmarkBuf)
      .resize(Math.round(BANNER.w * 0.8), Math.round(BANNER.h * 0.55), { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await writeFile(join(bannerDir, 'banner.png'), await sharp(bannerBg).composite([{ input: wordmark, gravity: 'centre' }]).png().toBuffer());
  }

  const anydpi = join(resDir, 'mipmap-anydpi-v26');
  await mkdir(anydpi, { recursive: true });
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
  await writeFile(join(anydpi, 'ic_launcher.xml'), xml);
  await writeFile(join(anydpi, 'ic_launcher_round.xml'), xml);
  const colours = join(resDir, 'values');
  await mkdir(colours, { recursive: true });
  await writeFile(join(colours, 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${bg}</color>\n</resources>\n`);
  // The per-brand strings the Capacitor manifest references. Generated from the brand JSON too, so
  // a new brand is still just a JSON file plus artwork — never a hand-written XML to forget.
  const label = brand.desktopProductName ?? brand.name;
  await writeFile(
    join(colours, 'strings.xml'),
    `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">${label}</string>
    <string name="title_activity_main">${label}</string>
    <string name="package_name">${brand.androidAppId}</string>
    <string name="custom_url_scheme">${brand.androidAppId}</string>
</resources>
`,
  );
  console.log(`${id}: icon ${brand.logo.icon} (${meta.width}×${meta.height}, ${opaque ? 'opaque' : 'transparent'}) · TV banner ${BANNER.w}×${BANNER.h} from ${bannerFrom} → ${resDir}`);
}

for (const id of ['launcher']) await build(id);
