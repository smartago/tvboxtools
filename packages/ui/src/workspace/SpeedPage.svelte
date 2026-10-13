<script lang="ts">
  // WS Speed up — the three animation scales, the one "fix" every slow-box thread ends with.
  //
  // `settings put global window_animation_scale / transition_animation_scale /
  // animator_duration_scale`: 1 is Android's default, 0 draws every transition instantly. It is a
  // read on entry and a reversible write on press — it lives in every edition, Play included,
  // because it is exactly the kind of setting a settings app is allowed to touch.
  import { untrack } from 'svelte';
  import { getSession } from '../context.js';
  import Card from '../components/Card.svelte';
  import Notice from '../components/Notice.svelte';
  const S = getSession();
  // see DebloatPage: the read must not be tracked by the effect that starts it
  $effect(() => {
    const ready = !!S.device;
    untrack(() => {
      if (ready) void S.readSpeed();
    });
  });
  const fast = $derived(S.animScale !== null && S.animScale === 0);
</script>

<div class="sp">
  <div>
    <h2 class="h2-ws">{S.t('sp_title')}</h2>
    <div class="intro">{S.t('sp_body')}</div>
  </div>

  {#if !S.device}
    <Notice kind="info">{S.t('wl_noBox')}</Notice>
  {:else}
    <div class="state">
      <span class="dim">{S.t('sp_state')}</span>
      <b>{S.animScale === null ? S.t('sp_reading') : fast ? S.t('sp_fast') : `${S.t('sp_normal')} · ${S.animScale}×`}</b>
    </div>
    <div class="modes">
      <Card sel={fast} column padding="20px" minHeight="150px" onpick={() => S.setSpeed(true)}>
        <div class="top"><span class="ico-circle"><i class="plui-icon pi-wand"></i></span>{#if fast}<span class="check-badge"><i class="base-icon bi-check"></i></span>{/if}</div>
        <b class="ttl">{S.t('sp_fast')}</b>
        <span class="desc">{S.t('sp_fastD')}</span>
      </Card>
      <Card sel={S.animScale !== null && !fast} column padding="20px" minHeight="150px" onpick={() => S.setSpeed(false)}>
        <div class="top"><span class="ico-circle"><i class="plui-icon pi-settings"></i></span>{#if S.animScale !== null && !fast}<span class="check-badge"><i class="base-icon bi-check"></i></span>{/if}</div>
        <b class="ttl">{S.t('sp_normal')}</b>
        <span class="desc">{S.t('sp_normalD')}</span>
      </Card>
    </div>
    <div class="dim mono" style="font-size:12px">settings put global window_animation_scale · transition_animation_scale · animator_duration_scale</div>
  {/if}
</div>

<style>
  .sp { display: flex; flex-direction: column; gap: 18px; max-width: 900px; }
  .intro { margin-top: 6px; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.65); text-wrap: pretty; max-width: 640px; }
  .state { display: flex; align-items: center; gap: 10px; font-size: 14px; }
  .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .top { display: flex; align-items: center; justify-content: space-between; width: 100%; }
  .ttl { font: 700 18px var(--font-display); margin-top: 12px; }
  .desc { margin-top: 4px; font-size: 13px; line-height: 1.5; color: rgba(255,255,255,.68); text-align: left; }
</style>
