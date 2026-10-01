// Which AdbTransport this bundle uses — the same bundle ships in the desktop app (Electron), the
// Android app (Capacitor) and the browser, so the host is detected at runtime (DESIGN_NOTES §13):
//   desktop  → ElectronTransport   (IPC to the Node main process: USB + TCP + adb-server fallback)
//   android  → CapacitorTransport  (the AdbSocket Kotlin plugin: TCP, TLS, Kadb pairing)
//   browser  → WebUsbTransport     (USB straight from Chrome, §12) or BridgeTransport (`tvlm bridge`
//              on this computer for Wi‑Fi, ws://127.0.0.1:15555)
//   mock     → MockTransport       (the prototype's scenarios; the dev default and `?transport=mock`)
import type { AdbTransport } from '@tvlm/adb';
import { MockTransport, type MockScenario } from '@tvlm/adb/mock';
import { electronAvailable, ElectronTransport } from '@tvlm/adb/electron';
import { CapacitorTransport, isCapacitorNative } from '@tvlm/adb/capacitor';
import { WebUsbTransport, webUsbSupported } from '@tvlm/adb/webusb';
import { BridgeTransport } from '@tvlm/adb/bridge';

export type TransportKind = 'auto' | 'mock' | 'electron' | 'capacitor' | 'webusb' | 'bridge';
export type HostPlatform = 'desktop' | 'web' | 'android';

export interface TransportOptions {
  scenario: MockScenario;
  box: 'googletv' | 'androidtv' | 'xiaomi' | 'other' | 'firetv';
  /** 0 = instant (tests), 1 = the prototype's timings. */
  speed: number;
  launcherPackage: string;
  /** `?transport=auto|mock|electron|capacitor|webusb|bridge`. */
  kind: string;
  /** Mock only: include the box the tool runs on, as a television does (`?self=1`). */
  self?: boolean;
}

/** Where this bundle is running. The UI's `platform` prop follows it unless the query overrides. */
export function detectPlatform(): HostPlatform {
  if (electronAvailable()) return 'desktop';
  if (isCapacitorNative()) return 'android';
  return 'web';
}

export function createTransport(o: TransportOptions): AdbTransport {
  const kind = (['auto', 'mock', 'electron', 'capacitor', 'webusb', 'bridge'].includes(o.kind) ? o.kind : 'auto') as TransportKind;
  if (kind === 'mock') return mock(o);
  if (kind === 'electron' || (kind === 'auto' && electronAvailable())) return new ElectronTransport();
  if (kind === 'capacitor' || (kind === 'auto' && isCapacitorNative())) return new CapacitorTransport();
  if (kind === 'bridge') return new BridgeTransport();
  if (kind === 'webusb' || (kind === 'auto' && webUsbSupported())) return new WebUsbTransport();
  // A browser without WebUSB (Firefox, Safari): the bridge is the only road. Its connect() explains
  // itself (BridgeUnavailableError) when `tvlm bridge` is not running.
  return new BridgeTransport();
}

function mock(o: TransportOptions): AdbTransport {
  return new MockTransport({ scenario: o.scenario, box: o.box, speed: o.speed, launcherPackage: o.launcherPackage, self: o.self });
}

/**
 * Connect to `tvlm bridge` on this computer (ws://127.0.0.1:15555) and prove it answers.
 * Rejects while nothing is listening — the wizard polls this while the user installs the tool,
 * and only then does it call the session "bridged".
 */
export async function connectBridge(): Promise<AdbTransport> {
  const t = new BridgeTransport();
  await t.discover();
  return t;
}
