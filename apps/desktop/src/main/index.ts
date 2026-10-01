// Electron main (ESM, bundled by ../../build.mjs): one 1280×820 window with the web bundle of the brand,
// the real `createNodeTransport()` (USB + TCP + mDNS) in this process, IPC handlers for the preload.
import { app, BrowserWindow, ipcMain, net, protocol, shell, type IpcMainInvokeEvent } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
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

function serveWeb(request: Request): Promise<Response> | Response {
  const url = new URL(request.url);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  let file = normalize(join(webDir, pathname));
  if (!file.startsWith(normalize(webDir) + sep) && file !== normalize(webDir)) return new Response('forbidden', { status: 403 });
  if (!existsSync(file)) file = join(webDir, 'index.html'); // SPA fallback
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

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
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
