// W4 "Developer mode" — the animated TV mock per box brand, ported from the prototype's devScreen()/devPath().
// Placeholder until real screen recordings per brand exist (DESIGN_NOTES §1 Ζ7).
import type { BoxId } from '../state.svelte.js';

export interface TvRow {
  label: string;
  sub: string;
  chev: boolean;
  hi: boolean;
  tapping: boolean;
}
export interface DevScreen {
  title: string;
  rows: TvRow[];
  toast: string;
  tapping: boolean;
  taps: number;
}

interface Screen {
  title: string;
  rows: string[];
  sub?: string[];
}

export function devScreen(box: BoxId | null, ph: number): DevScreen {
  const b = box ?? 'androidtv';
  const G = b === 'googletv';
  const F = b === 'firetv';
  let A: Screen, B: Screen, C: Screen, aHi: number;
  if (F) {
    A = { title: 'Settings', rows: ['Notifications', 'Inputs', 'Live TV', 'My Fire TV', 'Preferences'] };
    aHi = 3;
    B = { title: 'My Fire TV', rows: ['About', 'Sleep', 'Restart', 'Reset to Factory Defaults'] };
    C = { title: 'About', rows: ['Fire TV Stick 4K', 'Storage', 'Network', 'Legal & Compliance'], sub: ['Tap 7× · Build 7.6.9.3', '5.2 GB free', 'Connected', ''] };
  } else {
    A = { title: 'Settings', rows: G ? ['Accounts & sign-in', 'Privacy', 'Apps', 'System', 'Remotes & accessories'] : ['Network & Internet', 'Accounts & sign-in', 'Apps', 'Device Preferences', 'Remotes & accessories'] };
    aHi = 3;
    B = { title: G ? 'System' : 'Device Preferences', rows: ['About', 'Date & time', 'Language', 'Keyboard', 'Storage', 'Home screen'] };
    const build = G ? 'Android TV OS build' : 'Build';
    C = G
      ? { title: 'About', rows: ['Device name', 'System update', 'Status', 'Legal information', 'Model', 'Android TV OS version', build], sub: ['Chromecast', '', '', '', 'Chromecast', '14', 'UTT3.240...'] }
      : { title: 'About', rows: ['System update', 'Device name', 'Status', 'Legal information', 'Model', 'Android version', build], sub: ['', 'MIBOX4', '', '', 'MIBOX4', '9', 'PI.5257.2024'] };
  }
  let scr: Screen;
  let hi: number;
  let taps = 0;
  let toast = '';
  if (ph <= 0) {
    scr = A;
    hi = aHi;
  } else if (ph === 1) {
    scr = B;
    hi = 0;
  } else if (ph <= 9) {
    scr = C;
    hi = F ? 0 : C.rows.length - 1;
    taps = Math.max(0, ph - 2);
    if (taps > 0 && taps < 7) toast = F ? `You are ${7 - taps} steps away from being a developer.` : `You are now ${7 - taps} steps away from being a developer.`;
    if (taps >= 7) toast = F ? 'No need, you are already a developer.' : 'You are now a developer!';
  } else {
    scr = F ? { title: B.title, rows: ['About', 'Developer options', 'Sleep', 'Restart', 'Reset to Factory Defaults'] } : { title: B.title, rows: [...B.rows, 'Developer options'] };
    hi = F ? 1 : B.rows.length;
  }
  const tapping = ph >= 2 && ph <= 9;
  return {
    title: scr.title,
    rows: scr.rows.map((label, i) => ({ label, sub: scr.sub?.[i] ?? '', chev: !scr.sub, hi: i === hi, tapping: i === hi && taps > 0 && tapping })),
    toast,
    tapping,
    taps,
  };
}

/**
 * The four presses, numbered. No highlight here: the list walks itself, one step every couple of
 * seconds, and the component owns that clock.
 *
 * It used to follow the MOCK's phase counter — which keeps running behind a real recording that
 * knows nothing about it, so the list pointed at step 2 while the film was elsewhere (Jim, 23/9).
 * Four presses in order, on a loop, say the same thing and cannot fall out of step with anything.
 */
export function devPath(box: BoxId | null): Array<{ n: number; label: string }> {
  const b = box ?? 'androidtv';
  const G = b === 'googletv';
  const F = b === 'firetv';
  const p = F ? ['Settings', 'My Fire TV', 'About', 'Fire TV Stick 4K × 7 OK'] : ['Settings', G ? 'System' : 'Device Preferences', 'About', `${G ? 'Android TV OS build' : 'Build'} × 7 OK`];
  return p.map((label, i) => ({ n: i + 1, label }));
}
