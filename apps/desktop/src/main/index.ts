// Electron main (ESM, bundled by ../../build.mjs): one 1280×820 window with the web bundle of the brand,
// the real `createNodeTransport()` (USB + TCP + mDNS) in this process, IPC handlers for the preload.
import { app, BrowserWindow, ipcMain, net, protocol, shell, type IpcMainInvokeEvent } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NoDevicesError, UnauthorizedError, type AdbDevice, type DeviceInfo } from '@tvlm/adb';
import { createNodeTransport, type NodeTransport } from '@tvlm/adb/node';
import { configRead, configWrite, configPath } from './config.js';
import { TVLM_IPC, type IpcConnectArgs, type IpcConnectResult, type IpcDiscoverArgs, type IpcError, type IpcResult } from '../ipc.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const APP_SCHEME = 'tvlm';

interface BrandStamp {
  /** A brand id from brands/ — never an enum here, adding a brand is adding a JSON file. */
  brand: string;
  version: string;
  /** The product name for the window title, stamped in at build time. */
  name?: string;
  /** The brand's site as the title shows it ("TVBoxTools.com"), the build number and its minute. */
  site?: string;
  build?: string;
  builtAt?: string;
}

/**
 * What the title bar says: site, version with build number, and the minute it was built —
 * "TVBoxTools.com v:0.1.0.318 (09-25-26-12-56)" (Jim, 25/9). Every screenshot then answers
 * "which build is this?" without asking anyone.
 */
function windowTitle(): string {
  const name = stamp.site || stamp.name || 'TV Launcher Manager';
  const version = stamp.version + (stamp.build ? `.${stamp.build}` : '');
  return `${name} v:${version}` + (stamp.builtAt ? ` (${stamp.builtAt})` : '');
}

function readBrand(): BrandStamp {
  try {
    return JSON.parse(readFileSync(join(here, 'brand.json'), 'utf8')) as BrandStamp;
  } catch {
    return { brand: 'launcher', version: '0.0.0' };
  }
}

const stamp = readBrand();
/** Packaged: <resources>/web (electron-builder extraResources). Dev: apps/web/dist/<brand>. */
const webDir = app.isPackaged ? join(process.resourcesPath, 'web') : resolve(here, '../../../web/dist', stamp.brand);

// `tvlm://app/…` serves the web bundle: absolute `/assets/…` paths work with or without a Vite `base`.
protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false, stream: true } }]);

/**
 * ΤΑ ΒΙΝΤΕΟ ΤΟΥ ΟΔΗΓΟΥ ΔΕΝ ΕΠΑΙΖΑΝ ΣΤΟ DESKTOP (2/10/2026, Jim: «δεν φαίνεται το video στο exe»).
 *
 * Το `net.fetch(file://…)` επιστρέφει το αρχείο ΧΩΡΙΣ `Content-Type` που να αναγνωρίζει ο Chromium
 * ως media και ΧΩΡΙΣ απάντηση σε `Range`. Το `<video>` ζητά πάντα `Range: bytes=0-` και περιμένει
 * `206` με `Accept-Ranges` — αλλιώς μένει μαύρο. JS, CSS και PNG δεν το προσέχουν· το video ναι,
 * γι' αυτό έσπασε μόνο αυτό και μόνο στο exe (στο web και στο Android σερβίρει άλλος).
 *
 * Τα clips είναι ~400 KB, οπότε διαβάζονται ολόκληρα και κόβεται το κομμάτι που ζητήθηκε. Ό,τι δεν
 * είναι media μένει στον παλιό, φθηνό δρόμο.
 */
const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

function serveMedia(file: string, type: string, range: string | null): Response {
  const body = readFileSync(file);
  const total = body.byteLength;
  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!m) {
    return new Response(new Uint8Array(body), { status: 200, headers: { ...base, 'Content-Length': String(total) } });
  }
  // `bytes=500-` (ανοιχτό τέλος) και `bytes=-500` (τα τελευταία 500) είναι και τα δύο νόμιμα.
  const start = m[1] ? Number(m[1]) : m[2] ? Math.max(0, total - Number(m[2])) : 0;
  const end = m[1] && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
  if (start >= total || start > end) {
    return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${total}` } });
  }
  const slice = body.subarray(start, end + 1);
  return new Response(new Uint8Array(slice), {
    status: 206,
    headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(slice.byteLength) },
  });
}

function serveWeb(request: Request): Promise<Response> | Response {
  const url = new URL(request.url);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  let file = normalize(join(webDir, pathname));
  if (!file.startsWith(normalize(webDir) + sep) && file !== normalize(webDir)) return new Response('forbidden', { status: 403 });
  if (!existsSync(file)) file = join(webDir, 'index.html'); // SPA fallback
  const ext = extname(file).toLowerCase();
  const type = MIME[ext];
  if (type) {
    try {
      return serveMedia(file, type, request.headers.get('range'));
    } catch {
      // ένα σπασμένο clip δεν ρίχνει τη σελίδα — πέφτουμε στον παλιό δρόμο
    }
  }
  return net.fetch(pathToFileURL(file).toString());
}

// ---------------------------------------------------------------- transport + IPC

let transport: NodeTransport | undefined;
const devices = new Map<number, AdbDevice>();
const aborts = new Map<number, AbortController>();
interface InstallJob {
  device: AdbDevice;
  chunks: Uint8Array[];
  wake?: () => void;
  ended: boolean;
  result: Promise<string>;
}
const installs = new Map<number, InstallJob>();
/**
 * XAPK: ΠΟΛΛΑ ρεύματα, ΕΝΑ ΚΑΘΕ ΦΟΡΑ. Ο renderer στέλνει τα κομμάτια του part 0, λέει «τέλος
 * κομματιού», περνά στο 1. Η κύρια διεργασία έχει δώσει στο `installSplits` ένα ρεύμα ανά part·
 * το pm τα ζητά με τη σειρά, και κάθε `pull` περιμένει εδώ μέχρι να έρθει το επόμενο κομμάτι.
 */
interface SplitJob {
  /** `null` = ΣΥΝΟΡΟ: εδώ τελειώνει το ένα κομμάτι και αρχίζει το επόμενο. */
  chunks: Array<Uint8Array | null>;
  wake?: () => void;
  result: Promise<string>;
}
const splits = new Map<number, SplitJob>();
/**
 * ΤΟ ΣΥΝΟΡΟ ΜΠΑΙΝΕΙ ΣΤΗΝ ΟΥΡΑ, ΔΕΝ ΕΙΝΑΙ ΣΗΜΑΙΑ ΔΙΠΛΑ ΤΗΣ (7/10/2026, πρώτη δοκιμή με αληθινό
 * XAPK: η γραμμή κόλλησε στο «sending…»). Με σημαία, τα bytes του ΕΠΟΜΕΝΟΥ κομματιού που
 * έφταναν πριν προλάβει να κλείσει το ρεύμα του προηγούμενου έμπαιναν στο ΠΡΟΗΓΟΥΜΕΝΟ: το
 * `install-write -S <μέγεθος>` έπαιρνε περισσότερα από όσα δήλωσε και περίμενε για πάντα.
 * Ένα `null` στη θέση του συνόρου κρατά τη σειρά ακριβή: ό,τι είναι πριν ανήκει στο ένα κομμάτι,
 * ό,τι μετά στο άλλο, όση κι αν είναι η διαφορά ταχύτητας των δύο πλευρών.
 */
function splitStream(job: SplitJob): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      for (;;) {
        if (job.chunks.length) {
          const next = job.chunks.shift();
          if (next === null) {
            c.close();
            return;
          }
          c.enqueue(next!);
          return;
        }
        await new Promise<void>((r) => (job.wake = r));
        job.wake = undefined;
      }
    },
  });
}
let nextHandle = 1;
let nextJob = 1;

function toIpcError(e: unknown): IpcError {
  if (e instanceof UnauthorizedError) return { name: 'UnauthorizedError', message: e.message, attempts: e.attempts };
  if (e instanceof NoDevicesError) return { name: 'NoDevicesError', message: e.message, hint: e.hint };
  return { name: 'Error', message: e instanceof Error ? e.message : String(e) };
}

async function wrap<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: toIpcError(e) };
  }
}

function device(handle: number): AdbDevice {
  const d = devices.get(handle);
  if (!d) throw new Error('unknown device handle (reconnect)');
  return d;
}

function getTransport(): NodeTransport {
  transport ??= createNodeTransport();
  return transport;
}

function registerIpc(): void {
  ipcMain.handle(TVLM_IPC.brand, () => ({ brand: stamp.brand, version: stamp.version }));
  // The answers this computer already gave (language, reseller id, the box it sets up): the wizard
  // asks once and remembers. `send` for the write — nothing in the UI should wait on a disk.
  ipcMain.handle(TVLM_IPC.config, () => configRead());
  ipcMain.on(TVLM_IPC.configSet, (_e, patch: Record<string, string | null>) => {
    if (patch && typeof patch === 'object') configWrite(patch);
  });
  ipcMain.handle(TVLM_IPC.usbHint, () => getTransport().usbUnavailable?.message ?? null);

  // SEE THE TELEVISION IN A WINDOW. The Windows tool people actually download opens the box with
  // scrcpy, and it is the feature its thread thanks it for (docs/COMPETITOR_TASKS_STUDY.md §2.4).
  // We do not ship scrcpy: it is 40 MB per platform, it carries its own licence, and it starts its
  // own adb server, which would fight ours over a USB device. If the person has it, we open it with
  // the box already selected; if not, the page says where to get it. Nothing is downloaded by us.
  // ΤΟ ΚΑΤΕΒΑΣΜΑ ΓΙΝΕΤΑΙ ΕΔΩ, ΟΧΙ ΣΤΗ ΣΕΛΙΔΑ. Ο renderer είναι origin και κάθε ξένος host που δεν
  // στέλνει CORS του απαντά «Failed to fetch» — και η οθόνη του κωδικού υπόσχεται ΟΠΟΙΑΔΗΠΟΤΕ
  // διεύθυνση APK (Jim, 3/10/2026, με σύνδεσμο Dropbox). Το Node δεν έχει origin.
  ipcMain.handle(TVLM_IPC.fetchFile, async (_e: IpcMainInvokeEvent, url: string) => {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (!r.ok) return { ok: false as const, error: `GET ${url} \u2192 ${r.status}` };
      return { ok: true as const, data: await r.arrayBuffer() };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle(TVLM_IPC.mirror, async (_e: IpcMainInvokeEvent, target: string) => {
    const exe = process.platform === 'win32' ? 'scrcpy.exe' : 'scrcpy';
    try {
      const child = spawn(exe, target ? ['-s', target] : [], { detached: true, stdio: 'ignore', shell: false });
      return await new Promise<{ ok: boolean; reason?: 'missing' | 'failed'; message?: string }>((resolve) => {
        child.once('error', (err: NodeJS.ErrnoException) =>
          resolve({ ok: false, reason: err.code === 'ENOENT' ? 'missing' : 'failed', message: err.message }),
        );
        // it did not fail in the first moment: scrcpy is up and drawing its own window
        setTimeout(() => {
          child.unref();
          resolve({ ok: true });
        }, 600);
      });
    } catch (err) {
      return { ok: false, reason: 'failed' as const, message: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(TVLM_IPC.discover, (e: IpcMainInvokeEvent, a: IpcDiscoverArgs) =>
    wrap<DeviceInfo[]>(async () => {
      const ac = new AbortController();
      aborts.set(a.token, ac);
      try {
        return await getTransport().discover({ paths: a.paths, subnet: a.subnet, signal: ac.signal, onFound: (d) => !e.sender.isDestroyed() && e.sender.send(TVLM_IPC.discoverFound, a.token, d) });
      } finally {
        aborts.delete(a.token);
      }
    }),
  );

  ipcMain.handle(TVLM_IPC.connect, (e: IpcMainInvokeEvent, a: IpcConnectArgs) =>
    wrap<IpcConnectResult>(async () => {
      const ac = new AbortController();
      aborts.set(a.token, ac);
      try {
        const d = await getTransport().connect(a.target, { waitForAuth: a.waitForAuth, signal: ac.signal, onUnauthorized: (n) => !e.sender.isDestroyed() && e.sender.send(TVLM_IPC.connectUnauthorized, a.token, n) });
        const handle = nextHandle++;
        devices.set(handle, d);
        return { handle, info: d.info, serial: d.serial };
      } finally {
        aborts.delete(a.token);
      }
    }),
  );

  ipcMain.on(TVLM_IPC.abort, (_e, token: number) => aborts.get(token)?.abort(new Error('aborted')));
  ipcMain.handle(TVLM_IPC.pair, (_e, hostPort: string, code: string) => wrap(() => getTransport().pair(hostPort, code)));
  ipcMain.handle(TVLM_IPC.shell, (_e, handle: number, cmd: string) => wrap(() => device(handle).shell(cmd)));
  ipcMain.handle(TVLM_IPC.authState, (_e, handle: number) => wrap(() => device(handle).authState()));
  ipcMain.handle(TVLM_IPC.screencap, (_e, handle: number) => wrap(() => device(handle).screencap()));
  ipcMain.handle(TVLM_IPC.reboot, (_e, handle: number) => wrap(() => device(handle).reboot()));
  ipcMain.handle(TVLM_IPC.close, (_e, handle: number) =>
    wrap(async () => {
      const d = device(handle);
      devices.delete(handle);
      await d.close();
    }),
  );

  // Install: the renderer streams chunks; a pull-based ReadableStream feeds them to `device.install`.
  ipcMain.handle(TVLM_IPC.installBegin, (_e, handle: number, opts: { size?: number; name?: string }) =>
    wrap(async () => {
      const d = device(handle);
      const id = nextJob++;
      const job: InstallJob = { device: d, chunks: [], ended: false, result: Promise.resolve('') };
      const stream = new ReadableStream<Uint8Array>({
        async pull(c) {
          for (;;) {
            const chunk = job.chunks.shift();
            if (chunk) {
              c.enqueue(chunk);
              return;
            }
            if (job.ended) {
              c.close();
              return;
            }
            await new Promise<void>((r) => (job.wake = r));
            job.wake = undefined;
          }
        },
      });
      job.result = d.install(stream, opts);
      job.result.catch(() => {});
      installs.set(id, job);
      return id;
    }),
  );
  ipcMain.handle(TVLM_IPC.installChunk, (_e, id: number, chunk: Uint8Array) =>
    wrap(async () => {
      const job = installs.get(id);
      if (!job) throw new Error('unknown install job');
      job.chunks.push(new Uint8Array(chunk));
      job.wake?.();
    }),
  );
  // ---- XAPK: base + κομμάτια σε μία συνεδρία, και τα OBB με sync ----------------------------
  ipcMain.handle(TVLM_IPC.splitBegin, (_e, handle: number, parts: Array<{ name: string; size: number }>, opts: { name?: string }) =>
    wrap(async () => {
      const d = device(handle);
      if (!d.installSplits) throw new Error('this connection cannot install split APKs');
      const id = nextJob++;
      const job: SplitJob = { chunks: [], result: Promise.resolve('') };
      job.result = d.installSplits(
        parts.map((p) => ({ ...p, open: async () => splitStream(job) })),
        opts,
      );
      job.result.catch(() => {});
      splits.set(id, job);
      return id;
    }),
  );
  ipcMain.handle(TVLM_IPC.pushBegin, (_e, handle: number, path: string, size: number) =>
    wrap(async () => {
      const d = device(handle);
      if (!d.pushFile) throw new Error('this connection cannot push files');
      const id = nextJob++;
      const job: SplitJob = { chunks: [], result: Promise.resolve('') };
      job.result = d.pushFile(path, size, splitStream(job)).then(() => 'Success');
      job.result.catch(() => {});
      splits.set(id, job);
      return id;
    }),
  );
  ipcMain.handle(TVLM_IPC.splitChunk, (_e, id: number, chunk: Uint8Array) =>
    wrap(async () => {
      const job = splits.get(id);
      if (!job) throw new Error('unknown split job');
      job.chunks.push(new Uint8Array(chunk));
      job.wake?.();
    }),
  );
  ipcMain.handle(TVLM_IPC.splitPartEnd, (_e, id: number) =>
    wrap(async () => {
      const job = splits.get(id);
      if (!job) throw new Error('unknown split job');
      job.chunks.push(null); // το σύνορο, στη σειρά του
      job.wake?.();
    }),
  );
  ipcMain.handle(TVLM_IPC.splitEnd, (_e, id: number) =>
    wrap(async () => {
      const job = splits.get(id);
      if (!job) throw new Error('unknown split job');
      try {
        return await job.result;
      } finally {
        splits.delete(id);
      }
    }),
  );
  ipcMain.handle(TVLM_IPC.installEnd, (_e, id: number) =>
    wrap(async () => {
      const job = installs.get(id);
      if (!job) throw new Error('unknown install job');
      job.ended = true;
      job.wake?.();
      try {
        return await job.result;
      } finally {
        installs.delete(id);
      }
    }),
  );
}

// ---------------------------------------------------------------- window

/** Schemes the app may hand to the OS. Anything else (file:, javascript:, http:) is dropped. */
const EXTERNAL_SCHEMES = new Set(['https:', 'ms-settings:', 'x-apple.systempreferences:']);

function openExternal(url: string): void {
  let scheme: string;
  try {
    scheme = new URL(url).protocol;
  } catch {
    console.warn(`[tvlm] refused to open a malformed url`);
    return;
  }
  if (!EXTERNAL_SCHEMES.has(scheme)) {
    console.warn(`[tvlm] refused to open ${scheme} outside the app`);
    return;
  }
  console.log(`[tvlm] opening ${url} outside the app`);
  void shell.openExternal(url).catch((e: unknown) => console.error(`[tvlm] openExternal failed: ${String(e)}`));
}

/**
 * ΜΟΝΟ ΤΟ LINUX ΤΟ ΧΡΕΙΑΖΕΤΑΙ: στα Windows και στον Mac το εικονίδιο είναι μέσα στο ίδιο το
 * εκτελέσιμο (.ico / .icns), αλλά το tar.gz του Linux δεν φέρνει ούτε αρχείο .desktop να το
 * δηλώσει — χωρίς αυτό το παράθυρο έβγαινε με το γενικό εικονίδιο του Electron. Το `icon.png`
 * ταξιδεύει ως extraResource (βλ. electron-builder.config.mjs).
 */
function windowIcon(): string | undefined {
  if (process.platform !== 'linux') return undefined;
  const f = app.isPackaged ? join(process.resourcesPath, 'icon.png') : resolve(here, '../../build/launcher-icon.png');
  return existsSync(f) ? f : undefined;
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    icon: windowIcon(),
    width: 1280,
    height: 820,
    // 1280×820 is the CONTENT size (the UI's min size) — without this the frame and title bar eat ~40 px and the page scrolls.
    useContentSize: true,
    minWidth: 1024,
    minHeight: 700,
    title: windowTitle(),
    backgroundColor: '#1A2744',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // The W6 guides link out: driver pages (https) and the host's own settings (ms-settings: on
  // Windows, x-apple.systempreferences: on macOS). Everything else is refused, and nothing ever
  // navigates the app window away from the bundle.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(`${APP_SCHEME}://`)) return;
    e.preventDefault();
    openExternal(url);
  });
  // The page sets its own <title> on every load, which would wipe the build stamp out of the title
  // bar a second after the window opens. The title belongs to the build, not to the document.
  win.on('page-title-updated', (e) => {
    e.preventDefault();
    win.setTitle(windowTitle());
  });
  console.log(`[tvlm] config ${configPath()}`);
  win.webContents.on("did-finish-load", () => console.log(`[tvlm] loaded ${win.webContents.getURL()}`));
  win.webContents.on("did-fail-load", (_e, code, desc, url) => console.error(`[tvlm] failed to load ${url}: ${code} ${desc}`));
  const devUrl = process.env['TVLM_DEV_URL'];
  if (devUrl) void win.loadURL(devUrl.includes('?') ? devUrl : `${devUrl}?brand=${stamp.brand}`);
  else {
    // TVLM_MANIFEST: a download list somewhere else, for walking the whole flow with a build that
    // is not published yet (Jim, 23/9). Nothing reads it unless the environment sets it.
    const override = process.env.TVLM_MANIFEST ? `&manifest=${encodeURIComponent(process.env.TVLM_MANIFEST)}` : '';
    void win.loadURL(`${APP_SCHEME}://app/index.html?brand=${stamp.brand}${override}`);
  }
  return win;
}

void app.whenReady().then(() => {
  protocol.handle(APP_SCHEME, serveWeb);
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const d of devices.values()) d.close().catch(() => {});
  devices.clear();
  if (process.platform !== 'darwin') app.quit();
});
