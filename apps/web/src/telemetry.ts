// Ο αποστολέας: μαζεύει τα γεγονότα της συσκευής και τα δίνει στο `@tvlm/core/telemetry`.
//
// ΤΡΕΙΣ ΟΨΕΙΣ, ΜΙΑ ΣΕΙΡΑ ΣΤΟΝ ADMIN: το APK, το πρόγραμμα του υπολογιστή και η σελίδα στέλνουν
// το ΙΔΙΟ payload με τα αδέρφια (UNI, REMAP, Send-to-TV-Quick), οπότε τα διαγράμματα τα
// διαβάζουν χωρίς καμία αλλαγή στον server.
//
// ΤΟ ΔΙΚΤΥΟ ΠΕΡΝΑ ΑΠΟ ΤΟ NATIVE ΣΤΟ ANDROID (CapacitorHttp): το WebView ενός TV box είναι συχνά
// παγωμένο Chrome του 2022 που δεν φτάνει σε σύγχρονο HTTPS — το μάθαμε στη γεω-γλώσσα, και η
// τηλεμετρία δεν έχει λόγο να το ξαναμάθει.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { activationPayload, actionPayload, mapCpuArch, newVisitorId, shouldPulse, type TelemetryFace, type TelemetryFacts, type TelemetryHost } from '@tvlm/core';

const API = 'https://api.smartago.net';
const ACTIVATION_URL = `${API}/api/multi/activation-static`;
const ACTION_URL = `${API}/api/multi/send-action`;

const K_VISITOR = 'tvlm.visitorId';
const K_DEVICE = 'tvlm.deviceUID';
const K_LAST = 'tvlm.activationLastRun';

/** Το localStorage μπορεί να είναι κλειδωμένο (ιδιωτικό παράθυρο, σβησμένα site data). */
function ls(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}
function lsSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* χωρίς μνήμη ο παλμός ξαναστέλνεται — ενοχλητικό, όχι λάθος */
  }
}

/** Ποια όψη μιλά. Το `window.tvlm` το βάζει μόνο το preload του Electron. */
export function face(): TelemetryFace {
  if (Capacitor.isNativePlatform()) return 'android';
  return (window as unknown as { tvlm?: unknown }).tvlm ? 'desktop' : 'web';
}

function hostOf(f: TelemetryFace): TelemetryHost {
  if (f === 'android') return 'Android';
  if (f === 'web') return 'Web';
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  return 'Linux';
}

/** Ό,τι μπορεί να πει ένας browser για τον εαυτό του, στη γραφή που στέλνουν τα αδέρφια. */
function browserLabel(): string {
  const ua = navigator.userAgent;
  const m =
    /Edg\/(\d+)/.exec(ua) ? ['EDGE', /Edg\/(\d+)/.exec(ua)![1]!] :
    /Firefox\/(\d+)/.exec(ua) ? ['FIREFOX', /Firefox\/(\d+)/.exec(ua)![1]!] :
    /Chrome\/(\d+)/.exec(ua) ? ['CHROME', /Chrome\/(\d+)/.exec(ua)![1]!] :
    /Version\/(\d+).*Safari/.exec(ua) ? ['SAFARI', /Version\/(\d+).*Safari/.exec(ua)![1]!] :
    ['???', '???'];
  return `${m[0]}: ${m[1]}`;
}

function osRelease(f: TelemetryFace): string {
  if (f === 'web') return browserLabel();
  const ua = navigator.userAgent;
  if (f === 'desktop') {
    const win = /Windows NT ([\d.]+)/.exec(ua);
    if (win) return `Windows NT ${win[1]}`;
    const mac = /Mac OS X ([\d_]+)/.exec(ua);
    if (mac) return (mac[1] ?? '').replace(/_/g, '.');
    return 'Linux';
  }
  return '';
}

/** Μία συσκευή = ένας επισκέπτης, και κρατιέται. */
function visitorId(f: TelemetryFace): string {
  let v = ls(K_VISITOR);
  if (!v) {
    v = newVisitorId(new Date(), f === 'web');
    lsSet(K_VISITOR, v);
  }
  return v;
}

/**
 * Η ταυτότητα της συσκευής. Στο Android θα ήταν το ANDROID_ID — όσο ο plugin δεν το δίνει,
 * κρατάμε δικό μας σταθερό id, που είναι ό,τι κάνει ούτως ή άλλως το desktop και το web.
 */
function deviceUid(f: TelemetryFace): string {
  let d = ls(K_DEVICE);
  if (!d) {
    d = visitorId(f);
    lsSet(K_DEVICE, d);
  }
  return d;
}

async function post(url: string, body: unknown): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.post({ url, headers: { 'Content-Type': 'application/json' }, data: body, connectTimeout: 8000, readTimeout: 8000 });
      return res.status >= 200 && res.status < 300;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface TelemetryDevice {
  /** Από το `selfInfo` του plugin: τι είναι αυτή η συσκευή. */
  isTv?: boolean;
  manufacturer?: string;
  model?: string;
  release?: string;
  sdk?: number;
  playBuild?: boolean;
}

/**
 * Ο παλμός: μία φορά την ώρα την ίδια μέρα, και πάντα την πρώτη εκκίνηση κάθε μέρας. Ποτέ δεν
 * ρίχνει τίποτα στον καλούντα — μια χαμένη σειρά στατιστικών δεν χαλάει μια εγκατάσταση.
 */
export async function pulse(version: string, dev: TelemetryDevice = {}): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const now = Date.now();
    const last = Number(ls(K_LAST) || 0);
    if (!shouldPulse(last, now)) return;

    const f = face();
    const facts: TelemetryFacts = {
      face: f,
      host: hostOf(f),
      version,
      deviceUID: deviceUid(f),
      visitorId: visitorId(f),
      osVersion: f === 'android' ? (dev.release ?? '') : osRelease(f),
      api: f === 'android' ? String(dev.sdk ?? 0) : '0',
      cpu: f === 'web' ? 'NONE' : mapCpuArch(cpuOf()),
      fromStore: f === 'android' ? !!dev.playBuild : false,
      manufacturer: dev.manufacturer,
      model: dev.model,
      sdk: dev.sdk,
      webview: f === 'web' ? browserLabel() : chromeVersion(),
    };
    const ok = await post(ACTIVATION_URL, activationPayload(facts, dev.isTv !== false));
    // Μία γραμμή στο logcat/console: χωρίς αυτήν, το «στέλνει;» απαντιέται μόνο από τον server,
    // και η πιο ακριβή ώρα να μάθεις ότι δεν έστελνε είναι έναν μήνα μετά (μάθημα DWTV).
    console.info(`[telemetry] activation ${ok ? 'ok' : 'failed'} — ${f}/${facts.host}`);
    if (!ok) return;
    lsSet(K_LAST, String(now));
    void post(
      ACTION_URL,
      actionPayload({
        visitorId: facts.visitorId,
        group: 'STATISTICS',
        command: 'ACTIVATE_DEVICE',
        value: `Successfully activated ${f} device.`,
        description: { appVersion: version, host: facts.host, face: f },
      }),
    );
  } catch {
    /* ποτέ προς τα έξω */
  }
}

function cpuOf(): string {
  const ua = navigator.userAgent;
  if (/arm64|aarch64/i.test(ua)) return 'arm64-v8a';
  if (/armv7|armeabi/i.test(ua)) return 'armeabi-v7a';
  if (/x86_64|Win64|WOW64|Intel Mac/i.test(ua)) return 'x86_64';
  return 'unknown';
}

function chromeVersion(): string {
  const m = /Chrome\/([\d.]+)/.exec(navigator.userAgent);
  return m ? m[1]! : '???';
}

/**
 * Ένα σφάλμα που αξίζει να το ξέρουμε. Ίδιος αγωγός με τα αδέρφια (`SYSTEM_ERRORS`), με το ίδιο
 * φρένο: ίδιο (command, μήνυμα) μέσα σε 5 δευτερόλεπτα πετιέται, γιατί ένας βρόχος σφαλμάτων
 * γεμίζει τον πίνακα σε ένα λεπτό.
 */
const recent = new Map<string, number>();
export function reportError(command: string, message: string, details?: Record<string, unknown>): void {
  try {
    const sig = `${command}|${message}`;
    const now = Date.now();
    const seen = recent.get(sig) ?? 0;
    if (now - seen < 5000) return;
    recent.set(sig, now);
    const f = face();
    void post(
      ACTION_URL,
      actionPayload({
        visitorId: visitorId(f),
        group: 'SYSTEM_ERRORS',
        command,
        value: message,
        description: { host: hostOf(f), face: f, ...(details ?? {}) },
      }),
    );
  } catch {
    /* ποτέ προς τα έξω */
  }
}
