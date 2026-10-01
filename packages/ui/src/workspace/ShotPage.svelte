<script lang="ts">
  // WS Screenshot — what the television shows right now, on this screen.
  //
  // `screencap -p | base64` comes back as text through the same shell as everything else, so it
  // needs no file transfer that the transports do not all have. A read, nothing more; in every
  // edition. Save gives the PNG to the person — for a support mail, for the FAQ, for "is this
  // what you see?".
  import { getSession } from '../context.js';
  import PillButton from '../components/PillButton.svelte';
  import Notice from '../components/Notice.svelte';
  const S = getSession();
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  // `S.takeShot()` is the Test page's capture (the transport's real screencap channel → blob URL);
  // 'mock' is what the mock transport hands back, which is not a picture to draw here.
  let busy = $state(false);
  const img = $derived(S.shot && S.shot !== 'mock' ? S.shot : null);
  async function take() {
    busy = true;
    try {
      await S.takeShot();
    } finally {
      busy = false;
    }
  }
</script>

<div class="sh">
  <div class="head">
    <div>
      <h2 class="h2-ws">{S.t('sh_title')}</h2>
      <div class="intro">{S.t('sh_body')}</div>
    </div>
    <div class="acts">
      <PillButton size="sm" style="height:42px;padding:0 22px" disabled={!S.device || busy} onclick={take}>{busy ? S.t('sh_taking') : S.t('sh_take')}</PillButton>
      {#if img}
        <a class="btn btn-outline sm tvlm-focus" style="height:42px;display:inline-flex;align-items:center" href={img} download="tvboxtools-{stamp()}.png" data-nav>{S.t('sh_save')}</a>
      {/if}
    </div>
  </div>

  {#if !S.device}
    <Notice kind="info">{S.t('wl_noBox')}</Notice>
  {/if}

  {#if img}
    <div class="frame tvlm-fade"><img src={img} alt="" /></div>
  {:else if S.device && !busy}
    <div class="empty"><i class="plui-icon pi-opt-general" style="font-size:28px;opacity:.5"></i><span class="dim">{S.t('sh_empty')}</span></div>
  {/if}
</div>

<style>
  .sh { display: flex; flex-direction: column; gap: 16px; max-width: 1100px; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
  .intro { margin-top: 6px; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.65); text-wrap: pretty; max-width: 620px; }
  .acts { display: flex; gap: 10px; align-items: center; flex: none; }
  .frame { border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,.14); background: #000; }
  .frame img { display: block; width: 100%; height: auto; }
  .empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 60px 20px; border-radius: 14px; border: 1px dashed rgba(255,255,255,.18); }
</style>
