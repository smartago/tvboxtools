<script lang="ts">
  // WS Device — what this box IS, and whether its clock is telling the truth.
  //
  // Every line is a read the tool was already allowed to make (`getprop`, `wm size`, `df`, `uptime`,
  // `date`), gathered in one place because the first question in every support mail is "what box is
  // it" and the answer today is a console session.
  //
  // The clock is here for a reason that cost us a day once (memory: tls-root-certificates): a box
  // whose date is wrong cannot verify any certificate, and what the person sees is not "wrong
  // clock", it is "nothing downloads" and "Trust anchor not found". We show the drift in plain
  // seconds and offer the one fix that works without root.
  import { untrack } from 'svelte';
  import { getSession } from '../context.js';
  import Notice from '../components/Notice.svelte';
  import PillButton from '../components/PillButton.svelte';
  const S = getSession();
  $effect(() => {
    const ready = !!S.device;
    untrack(() => {
      if (ready) void S.readDevice();
    });
  });
  /** More than two minutes out is not a rounding error — that is the clock that breaks TLS. */
  const clockBad = $derived(S.clockSkew !== null && Math.abs(S.clockSkew) > 120);
  const skewText = $derived.by(() => {
    const s = S.clockSkew;
    if (s === null) return '';
    const abs = Math.abs(s);
    const n = abs < 90 ? `${abs}s` : abs < 5400 ? `${Math.round(abs / 60)} min` : `${Math.round(abs / 3600)} h`;
    return s > 0 ? S.t('dv_behind', { n }) : S.t('dv_ahead', { n });
  });
</script>

<div class="dv">
  <div>
    <h2 class="h2-ws">{S.t('dv_title')}</h2>
    <div class="intro">{S.t('dv_body')}</div>
  </div>

  {#if !S.device}
    <Notice kind="info">{S.t('wl_noBox')}</Notice>
  {:else}
    <div class="rows">
      {#each S.devInfo as r (r.key)}
        <div class="row"><span class="k">{S.t(r.key)}</span><b class="v">{r.value}</b></div>
      {/each}
      {#if S.devInfo.length === 0}<div class="dim">{S.t('sp_reading')}</div>{/if}
    </div>

    <div class="clock" class:bad={clockBad}>
      <div class="ctop">
        <span class="ico-circle"><i class="plui-icon pi-settings"></i></span>
        <div class="ctxt">
          <b>{S.t('dv_clock')}</b>
          <span class="dim">
            {#if S.clockSkew === null}{S.t('dv_clockUnknown')}
            {:else if clockBad}{S.t('dv_clockBad', { drift: skewText })}
            {:else}{S.t('dv_clockOk')}{/if}
          </span>
          {#if S.ntpServer}<span class="dim mono" style="font-size:12px">ntp_server = {S.ntpServer}</span>{/if}
        </div>
      </div>
      {#if clockBad}
        <Notice kind="warn">{S.t('dv_clockWhy')}</Notice>
        <PillButton onclick={() => S.fixClock()}>{S.t('dv_clockFix')}</PillButton>
      {/if}
    </div>

    {#if S.canMirror}
      <!-- The one thing the Windows tool in the study does better than anyone: the television on
           the screen. scrcpy is not ours and is not bundled — this opens it when it is there. -->
      <div class="mirror">
        <span class="ico-circle"><i class="plui-icon pi-gallery"></i></span>
        <div class="ctxt">
          <b>{S.t('dv_mirror')}</b>
          <span class="dim">{S.t('dv_mirrorD')}</span>
          {#if S.mirrorMsg}<span class="mmsg">{S.mirrorMsg}</span>{/if}
        </div>
        <PillButton kind="ghost" onclick={() => S.mirrorBox()} disabled={S.mirrorBusy}>{S.t('dv_mirrorGo')}</PillButton>
      </div>
    {/if}

    <div class="acts">
      <PillButton kind="ghost" onclick={() => S.readDevice()} disabled={S.devBusy}>{S.t('dv_again')}</PillButton>
    </div>
    <div class="dim mono" style="font-size:12px">getprop · wm size · df /data · uptime · date</div>
  {/if}
</div>

<style>
  .dv { display: flex; flex-direction: column; gap: 18px; max-width: 900px; }
  .intro { margin-top: 6px; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.65); text-wrap: pretty; max-width: 640px; }
  .rows { display: flex; flex-direction: column; border: 1px solid rgba(255,255,255,.12); border-radius: 16px; overflow: hidden; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 18px; font-size: 14px; }
  .row + .row { border-top: 1px solid rgba(255,255,255,.08); }
  .k { color: rgba(255,255,255,.6); }
  .v { font: 600 14px var(--font-display); text-align: right; word-break: break-word; }
  .clock { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; border-radius: 16px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04); }
  .clock.bad { border-color: rgba(255,193,7,.45); background: rgba(255,193,7,.08); }
  .ctop { display: flex; align-items: flex-start; gap: 14px; }
  .ctxt { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .acts { display: flex; gap: 12px; }
  .mirror { display: flex; align-items: center; gap: 16px; padding: 16px 18px; border-radius: 16px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.12); }
  .mmsg { font-size: 12.5px; color: var(--wiz-teal-soft); }
</style>
