<script lang="ts">
  // W3 Box brand: Android TV / Google TV / Xiaomi / Other / Fire TV. Fire TV is blocked or supported per brand.fireTv.
  import { getSession } from '../context.js';
  import { BOXES } from '../state.svelte.js';
  import Card from '../components/Card.svelte';
  import Notice from '../components/Notice.svelte';
  import type { StrKey } from '../i18n/index.svelte.js';
  const S = getSession();
  const boxes = $derived(
    BOXES.map((b) => ({
      ...b,
      title: S.t(`b_${b.id}` as StrKey),
      desc: b.id === 'firetv' && S.brand.fireTv === 'supported' ? S.t('b_firetvDPlui') : S.t(`b_${b.id}D` as StrKey),
      opacity: b.id === 'firetv' && S.brand.fireTv === 'blocked' ? 0.75 : 1,
    })),
  );
</script>

<div class="screen w3">
  <div class="left">
    <h2 class="h2" style="font-size:38px">{S.t('w3_title')}</h2>
    <p class="lead" style="margin-top:16px">{S.t('w3_body')}</p>
    {#if S.fireSupported}<div style="margin-top:26px"><Notice kind="info">{S.t('w3_firePlui')}</Notice></div>{/if}
    {#if S.fireBlocked}<div style="margin-top:26px"><Notice kind="danger" bold>{S.t('w3_fire')}</Notice></div>{/if}
  </div>
  <div class="grid">
    {#each boxes as b (b.id)}
      <Card sel={S.box === b.id} padding="14px 16px" opacity={b.opacity} onpick={() => S.pickBox(b.id)}>
        <span class="tile" style:background={b.tile}>{b.tileText}</span>
        <span class="txt"><b>{b.title}</b><span>{b.desc}</span></span>
      </Card>
    {/each}
  </div>
</div>

<style>
  .w3 { display: grid; grid-template-columns: 440px 1fr; gap: 56px; align-content: start; }
  .left { padding-top: 20px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 20px; align-content: start; }
  .tile { width: 64px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; text-align: center; font: 700 11px/1.1 var(--font-display); letter-spacing: .5px; color: #fff; flex: none; }
  .txt { display: flex; flex-direction: column; gap: 3px; text-align: left; flex: 1; min-width: 0; }
  .txt b { font: 700 17px var(--font-display); }
  .txt span { font-size: 13px; color: rgba(255,255,255,.62); }
</style>
