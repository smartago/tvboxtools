// The session report: every command, its gate verdict and its output (DESIGN_NOTES §8 "all in the report").

import type { GateVerdict } from './gate.js';

export type ConsoleKind = 'cmd' | 'out' | 'ok' | 'warn' | 'err' | 'info';

export interface ReportEntry {
  /** Unique within a report — the UI keys its list on this, never on the timestamp. */
  id: number;
  t: number;
  kind: ConsoleKind;
  text: string;
  /** Present on `cmd` entries. */
  verdict?: GateVerdict;
  stepId?: string;
}

export interface ReportMeta {
  brand: string;
  tool: string;
  version: string;
  startedAt: number;
  device?: { serial: string; model: string; addr: string };
}

export class SessionReport {
  readonly entries: ReportEntry[] = [];
  constructor(readonly meta: ReportMeta) {}

  private seq = 0;
  add(kind: ConsoleKind, text: string, extra: Partial<Pick<ReportEntry, 'verdict' | 'stepId'>> = {}): ReportEntry {
    // `t` is not a key: two identical lines in the same millisecond are ordinary (a mock at full
    // speed, a double press on a tile) and they crashed the console's keyed list on 23/9.
    const e: ReportEntry = { id: ++this.seq, t: Date.now(), kind, text, ...extra };
    this.entries.push(e);
    return e;
  }

  toText(): string {
    const lines = [
      `${this.meta.tool} ${this.meta.version} — brand ${this.meta.brand}`,
      `started ${new Date(this.meta.startedAt).toISOString()}`,
      this.meta.device ? `device ${this.meta.device.model} (${this.meta.device.serial}) ${this.meta.device.addr}` : 'device —',
      '',
    ];
    for (const e of this.entries) {
      const ts = new Date(e.t).toISOString().slice(11, 19);
      const tag = e.kind === 'cmd' ? `$ ` : e.kind === 'out' ? '  ' : `[${e.kind}] `;
      lines.push(`${ts} ${tag}${e.text}${e.verdict ? `   (${e.verdict})` : ''}`);
    }
    return lines.join('\n');
  }

  toJSON(): { meta: ReportMeta; entries: ReportEntry[] } {
    return { meta: this.meta, entries: this.entries };
  }
}
