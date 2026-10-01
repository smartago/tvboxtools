<script lang="ts">
  // The automatic-run rows: W9's "What will run" (compact) and the Automatic setup page (live status per stage).
  import { getSession } from '../context.js';
  interface Props {
    compact?: boolean;
  }
  let { compact = false }: Props = $props();
  const S = getSession();
  const color = (r: (typeof S.autoList)[number]) => (r.blocked || r.failed ? 'var(--danger-alt)' : r.done ? 'var(--success)' : r.running ? 'var(--wiz-gold-text)' : 'var(--wiz-gold-light)');
  const bg = (r: (typeof S.autoList)[number]) => (r.blocked || r.failed ? 'rgba(240,82,82,.25)' : r.done ? 'rgba(34,197,94,.25)' : r.running ? 'var(--wiz-gold)' : 'rgba(200,144,58,.25)');
  const text = (r: (typeof S.autoList)[number]) => (r.blocked || r.failed ? 'var(--danger-alt)' : r.done ? 'var(--success)' : 'rgba(255,255,255,.85)');
</script>

<div class="rows" class:compact>
  {#each S.autoList as r (r.task)}
    <div class="arow" class:running={r.running}>
      <span class="num" class:big={!compact} style:background={bg(r)} style:color={color(r)}>
        {#if r.running}<i class="base-icon bi-spinner tvlm-spin" style="font-size:14px"></i>{:else if r.done}<i class="base-icon bi-check" style="font-size:13px"></i>{:else if r.failed}<i class="base-icon bi-x" style="font-size:12px"></i>{:else}{r.n}{/if}
      </span>
      <span class="lbl" style:color={text(r)}>{r.label}{#if !compact && r.running && S.autoStepLabel}<span class="sub"> · {S.autoStepLabel}</span>{/if}</span>
    </div>
  {/each}
</div>

<style>
  .rows { display: flex; flex-direction: column; gap: 8px; }
  .compact { gap: 10px; }
  .arow { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 12px; background: var(--row-bg); border: 1px solid var(--row-border); }
  .compact .arow { gap: 12px; padding: 9px 12px; border-radius: 10px; background: rgba(255,255,255,.04); }
  .arow.running { background: rgba(200,144,58,.14); border-color: rgba(200,144,58,.55); }
  .num.big { width: 32px; height: 32px; border-radius: 16px; font-size: 14px; }
  .lbl { flex: 1; font-size: 16px; font-weight: 500; }
  .compact .lbl { font-size: 14px; font-weight: 400; }
  .sub { font-size: 13px; font-weight: 400; color: rgba(255,255,255,.6); }
</style>
