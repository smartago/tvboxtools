<script lang="ts">
  // WS Profile (brands with more than one profile): Kiosk / Open / Install only → Apply profile.
  import { getSession } from '../context.js';
  import Card from '../components/Card.svelte';
  import Notice from '../components/Notice.svelte';
  import PillButton from '../components/PillButton.svelte';
  const S = getSession();
  const kioskBlocked = $derived(S.hasAcc && S.brand.accountCheck);
</script>

<div class="prof">
  <h2 class="h2-ws">{S.t('p_title')}</h2>
  {#if S.brand.flow === 'disable-launcher'}<Notice kind="info" center>{S.t('p_plui')}</Notice>{/if}
  <div class="grid">
    {#each S.profiles as p (p.id)}
      <Card sel={S.profile === p.id} column padding="20px" minHeight="190px" disabled={p.disabled} onpick={() => (S.profile = p.id)}>
        <div class="top"><span class="ico-circle"><i class="plui-icon {p.icon}"></i></span>{#if S.profile === p.id}<span class="check-badge"><i class="base-icon bi-check"></i></span>{/if}</div>
        <b class="ttl">{p.title}</b>
        <span class="desc">{p.desc}</span>
      </Card>
    {/each}
  </div>
  {#if kioskBlocked}<Notice kind="danger"><span><b>{S.t('p_blocked')}</b> {S.t('p_factory')}</span></Notice>{/if}
  {#if S.profile === 'kiosk'}<Notice kind="info" icon="bi-wifi" center><span style="color:rgba(255,255,255,.8)">{S.t('p_wifi')}</span></Notice>{/if}
  <div class="foot">
    <PillButton disabled={!S.profile || S.profileBusy || !S.device} onclick={() => S.applyProfile()}>{S.profileBusy ? S.t('st_run') + '…' : S.t('p_apply')}</PillButton>
    {#if S.profileApplied}<span class="ok"><i class="base-icon bi-check-circle-fill"></i>{S.t('p_applied')}</span>{/if}
  </div>
</div>

<style>
  .prof { display: flex; flex-direction: column; gap: 18px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .top { display: flex; align-items: center; justify-content: space-between; width: 100%; }
  .ttl { font: 700 20px var(--font-display); margin-top: 14px; text-align: left; }
  .desc { font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.68); text-align: left; margin-top: 6px; flex: 1; }
  .foot { display: flex; align-items: center; gap: 14px; }
  .ok { display: flex; align-items: center; gap: 8px; color: var(--success); font-size: 14px; font-weight: 600; }
</style>
