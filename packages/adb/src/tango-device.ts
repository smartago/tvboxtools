// The one `AdbDevice` over a Tango `Adb` — shared by WebUSB (browser), Node TCP/USB and the adb-server
// fallback. Browser-safe: no `node:` imports here.
import type { Adb } from '@yume-chan/adb';
import { PackageManager } from '@yume-chan/android-bin';
import type { AdbDevice, AuthState, ConnectOptions, DeviceInfo } from './index.js';
import { UnauthorizedError } from './index.js';

export class TangoDevice implements AdbDevice {
  #gone = false;
  constructor(
    readonly info: DeviceInfo,
    readonly adb: Adb,
    private readonly onClose?: () => void | Promise<void>,
  ) {
    adb.disconnected.then(
      () => (this.#gone = true),
      () => (this.#gone = true),
    );
  }

  get serial(): string {
    return this.adb.serial;
  }

  /** We only ever hand out authenticated devices; the only later state is "gone". */
  async authState(): Promise<AuthState> {
    return this.#gone ? 'offline' : 'authorized';
  }

  /**
   * `exec:` (raw, no pty): stdout+stderr as bytes, `\n` untouched — what the check parsers expect.
   * The command is passed as a single argv element so Tango's `splitCommand` never strips quotes.
   */
  async shell(cmd: string): Promise<string> {
    return this.adb.subprocess.noneProtocol.spawnWaitText([cmd]);
  }

  /** `pm install -r -S <size>` streamed over the socket (Android 7+), push+install below that. */
  async install(apk: ReadableStream<Uint8Array>, opts: { size?: number; name?: string } = {}): Promise<string> {
    const pm = new PackageManager(this.adb);
    let stream: ReadableStream<Uint8Array> = apk;
    let size = opts.size;
    if (size === undefined) {
      // `pm install -S` needs the byte count up front; buffer when the host could not tell us.
      const chunks: Uint8Array[] = [];
      const reader = apk.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      size = chunks.reduce((n, c) => n + c.byteLength, 0);
      stream = new ReadableStream<Uint8Array>({
        pull(c) {
          const next = chunks.shift();
          if (next) c.enqueue(next);
          else c.close();
        },
      });
    }
    // Tango's stream types are structurally the web ones; the cast only bridges the two declarations.
    await pm.installStream(size, stream as unknown as Parameters<PackageManager['installStream']>[1]);
    return `Success${opts.name ? ` (${opts.name})` : ''}\n`;
  }

  /** `adb pull` over the sync service — one file, into memory (an APK is tens of megabytes). */
  async pull(path: string): Promise<Uint8Array> {
    const sync = await this.adb.sync();
    try {
      const chunks: Uint8Array[] = [];
      const reader = (sync.read(path) as unknown as ReadableStream<Uint8Array>).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const size = chunks.reduce((n, c) => n + c.byteLength, 0);
      const out = new Uint8Array(size);
      let at = 0;
      for (const c of chunks) {
        out.set(c, at);
        at += c.byteLength;
      }
      return out;
    } finally {
      await sync.dispose();
    }
  }

  async screencap(): Promise<Uint8Array> {
    return this.adb.subprocess.noneProtocol.spawnWait(['screencap', '-p']);
  }

  async reboot(): Promise<void> {
    await this.adb.power.reboot();
  }

  async close(): Promise<void> {
    try {
      await this.adb.close();
    } finally {
      await this.onClose?.();
    }
  }
}

/** Tango's authenticate throws this when the daemon keeps asking (the user pressed Deny, or the key changed). */
export function isAuthRefusal(e: unknown): boolean {
  return e instanceof Error && /No authenticator can handle|Connection closed unexpectedly/i.test(e.message);
}

/**
 * Tango's `authenticate` simply pends while the TV shows "Allow USB debugging?". This turns that into the
 * transport contract: tick every `tickMs` calling `onUnauthorized(attempt)`; without `waitForAuth` give up
 * after the first tick with `UnauthorizedError`; abort on `signal`; when the daemon refuses (Deny) start over.
 *
 * `start` must open a FRESH connection each time it is called; `cleanup` tears the current one down.
 */
export async function authenticateWithAllow<T>(
  start: () => Promise<T>,
  opts: ConnectOptions & { tickMs?: number; maxAttempts?: number },
  cleanup: () => void | Promise<void>,
): Promise<T> {
  const tickMs = opts.tickMs ?? 2000;
  const maxAttempts = opts.maxAttempts ?? 90; // 3 minutes at 2 s
  let attempt = 0;
  let pending = start();
  pending.catch(() => {}); // we race it; a late rejection after we bailed out must not be "unhandled"
  for (;;) {
    if (opts.signal?.aborted) {
      await cleanup();
      throw opts.signal.reason instanceof Error ? opts.signal.reason : new Error('aborted');
    }
    const outcome = await Promise.race<{ kind: 'ok'; value: T } | { kind: 'err'; error: unknown } | { kind: 'tick' } | { kind: 'abort' }>([
      pending.then(
        (value) => ({ kind: 'ok', value }) as const,
        (error) => ({ kind: 'err', error }) as const,
      ),
      new Promise<{ kind: 'tick' }>((r) => setTimeout(() => r({ kind: 'tick' }), tickMs)),
      new Promise<{ kind: 'abort' }>((r) => opts.signal?.addEventListener('abort', () => r({ kind: 'abort' }), { once: true })),
    ]);
    if (outcome.kind === 'ok') return outcome.value;
    if (outcome.kind === 'abort') {
      await cleanup();
      throw opts.signal?.reason instanceof Error ? opts.signal.reason : new Error('aborted');
    }
    attempt++;
    opts.onUnauthorized?.(attempt);
    if (outcome.kind === 'err' && !isAuthRefusal(outcome.error)) {
      await cleanup();
      throw outcome.error;
    }
    if (!opts.waitForAuth || attempt >= maxAttempts) {
      await cleanup();
      throw new UnauthorizedError(attempt);
    }
    if (outcome.kind === 'err') {
      // Denied (or the socket dropped): reconnect so the TV shows the dialog again.
      await cleanup();
      pending = start();
      pending.catch(() => {});
    }
  }
}
