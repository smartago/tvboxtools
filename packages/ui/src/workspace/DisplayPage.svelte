<script lang="ts">
  // WS Screen — resolution, density and text size.
  //
  // The 500k-install app on Play calls this a "resolution manager" and puts it on the front page,
  // and the forums agree: a cheap 4K box that draws everything at 2160p is slow at everything, and
  // a TV whose text cannot be read from the sofa is a TV nobody uses. Both are one `wm` command.
  //
  // Everything here is an OVERRIDE on top of what the panel is. "Back to the panel" (`wm size reset`
  // + `wm density reset` + font 1.0) is always on screen, because a person who lands on a resolution
  // the box cannot draw must be able to get out without a factory reset. The density follows the
  // size by itself: halving the width and leaving the old dpi leaves a launcher with three icons.
  import { untrack } from 'svelte';
  import { getSession } from '../context.js';
  import Card from '../components/Card.svelte';
  import Notice from '../components/Notice.svelte';
  import PillButton from '../components/PillButton.svelte';
  const S = getSession();
  // see DebloatPage: the read must not be tracked by the effect that starts it
  $effect(() => {
    const ready = !!S.device;
    untrack(() => {
      if (ready) void S.readDisplay();
    });
  });
  /** The sizes worth offering: what the panel is, and the two steps down that make a box quicker. */
  const sizes = $derived.by(() => {
    const phys = S.dispPhysical;
    const all = ['3840x2160', '1920x1080', '1280x720'];
    const list = phys && !all.includes(phys) ? [phys, ...all] : all;
    // never offer a size larger than the panel: the box would draw what the television cannot show
    const w = Number(phys?.split('x')[0] ?? 0);
    return list.filter((s) => !w || Number(s.split('x')[0] ?? 0) <= w);
  });
  const current = $derived(S.dispOverride ?? S.dispPhysical);
  const fonts: Array<{ v: number; key: 'ds_fontS' | 'ds_fontM' | 'ds_fontL' | 'ds_fontXL' }> = [
    { v: 0.85, key: 'ds_fontS' },
    { v: 1, key: 'ds_fontM' },
    { v: 1.15, key: 'ds_fontL' },
    { v: 1.3, key: 'ds_fontXL' },
  ];
</script>

<div class="ds">
  <div>
    <h2 class="h2-ws">{S.t('ds_title')}</h2>
    <div class="intro">{S.t('ds_body')}</div>
  </div>

  {#if !S.device}
    <Notice kind="info">{S.t('wl_noBox')}</Notice>
  {:else}
    <div class="state">
      <span class="dim">{S.t('ds_now')}</span>
      <b>{current ?? S.t('sp_reading')}</b>
      {#if S.densOverride ?? S.densPhysical}<span class="dim">· {S.densOverride ?? S.densPhysical} dpi</span>{/if}
      {#if S.dispOverride}<span class="tag">{S.t('ds_overridden')}</span>{/if}
    </div>

    <div class="grid">
      {#each sizes as s (s)}
        <Card sel={current === s} column padding="18px" minHeight="120px" onpick={() => S.setResolution(s === S.dispPhysical ? null : s)}>
          <div class="top">
            <b class="ttl">{s.replace('x', ' × ')}</b>
            {#if current === s}<span class="check-badge"><i class="base-icon bi-check"></i></span>{/if}
          </div>
          <span class="desc">
            {#if s === S.dispPhysical}{S.t('ds_panel')}{:else}{S.t('ds_lower')}{/if}
          </span>
        </Card>
      {/each}
    </div>

    <div class="sect">
      <b class="sh">{S.t('ds_font')}</b>
      <div class="fonts">
        {#each fonts as f (f.v)}
          <button
            type="button"
            class="fbtn tvlm-focus"
            class:sel={(S.fontScale ?? 1) === f.v}
            data-nav
            disabled={S.dispBusy}
            onclick={() => S.setFontScale(f.v)}
          >
            <span style:font-size="{13 * f.v}px">{S.t(f.key)}</span>
          </button>
        {/each}
      </div>
    </div>

    {#if S.dispOverride || S.densOverride || (S.fontScale !== null && S.fontScale !== 1)}
      <div class="reset">
        <PillButton onclick={() => { void S.setResolution(null); void S.setFontScale(1); }} disabled={S.dispBusy}>{S.t('ds_reset')}</PillButton>
        <span class="dim">{S.t('ds_resetD')}</span>
      </div>
    {/if}
    <div class="dim mono" style="font-size:12px">wm size · wm density · settings put system font_scale</div>
  {/if}
</div>

<style>
  .ds { display: flex; flex-direction: column; gap: 18px; max-width: 900px; }
  .intro { margin-top: 6px; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.65); text-wrap: pretty; max-width: 640px; }
  .state { display: flex; align-items: center; gap: 10px; font-size: 14px; flex-wrap: wrap; }
  .tag { font: 700 11px var(--font-display); letter-spacing: 1px; padding: 3px 8px; border-radius: 999px; background: rgba(255,193,7,.16); color: var(--wiz-gold-light); }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .top { display: flex; align-items: center; justify-content: space-between; width: 100%; }
  .ttl { font: 700 18px var(--font-display); }
  .desc { margin-top: 6px; font-size: 13px; line-height: 1.5; color: rgba(255,255,255,.68); text-align: left; }
  .sect { display: flex; flex-direction: column; gap: 10px; }
  .sh { font: 600 15px var(--font-display); }
  .fonts { display: flex; gap: 10px; flex-wrap: wrap; }
  .fbtn { min-width: 92px; padding: 12px 16px; border-radius: 14px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.16); color: #fff; }
  .fbtn.sel { background: rgba(0,161,169,.2); border-color: rgba(0,161,169,.6); }
  .reset { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
</style>
