<script lang="ts">
  // W9 Mode: Automatic / Manual · the Google-account block (brand.accountCheck) with 3 options · "What will run".
  import { getSession } from '../context.js';
  import Card from '../components/Card.svelte';
  import Notice from '../components/Notice.svelte';
  import PillButton from '../components/PillButton.svelte';
  import AutoRows from '../workspace/AutoRows.svelte';
  const S = getSession();
  const modes = $derived([
    { id: 'auto' as const, title: S.t('w9_auto'), desc: S.t('w9_autoD'), icon: 'pi-wand' },
    { id: 'manual' as const, title: S.t('w9_man'), desc: S.t('w9_manD'), icon: 'pi-settings' },
  ]);
</script>

<div class="screen w9">
  <div class="left">
    <h2 class="h2">{S.t('w9_title')}</h2>
    <div class="modes">
      {#each modes as m (m.id)}
        <Card sel={S.setupMode === m.id} column padding="20px" minHeight="170px" onpick={() => (S.setupMode = m.id)}>
          <div class="top"><span class="ico-circle"><i class="plui-icon {m.icon}"></i></span>{#if S.setupMode === m.id}<span class="check-badge"><i class="base-icon bi-check"></i></span>{/if}</div>
          <b class="ttl">{m.title}</b>
          <span class="desc">{m.desc}</span>
        </Card>
      {/each}
    </div>

    {#if S.autoBlocked}
      <div class="acc tvlm-fade">
        <div class="ah"><i class="base-icon bi-warning-fill" style="color:var(--danger-alt);font-size:20px"></i><b>{S.t('w9_acc')}</b><span class="mono who">{S.accountName}</span></div>
        <span class="ad">{S.t('w9_accD')}</span>
        <div class="opts">
          <button type="button" class="opt gold" data-nav onclick={() => S.openAccounts()}><b>{S.t('w9_rm')}</b><span>{S.t('w9_rmD')}</span></button>
          <div class="opt static"><b>{S.t('w9_reset')}</b><span>{S.t('w9_resetD')}</span></div>
          <button type="button" class="opt" data-nav onclick={() => S.continueOpen()}><b>{S.t('w9_open')}</b><span>{S.t('w9_openD')}</span></button>
        </div>
        {#if S.accScreen}
          <div class="accrow tvlm-fade">
            <div class="mini">
              <div class="mbg"></div>
              <div class="mpanel">
                <div class="mt">{S.t('w9_tvAcc')}</div>
                <div class="mrow">{S.accountName}</div>
                <div class="mrow hi tvlm-blink">{S.t('w9_tvRm')}</div>
                <div class="mrow">Sync now</div>
              </div>
            </div>
            <div class="accact">
              <span class="mono dim" style="font-size:12px">$ adb shell am start -a android.settings.SYNC_SETTINGS</span>
              <PillButton size="sm" onclick={() => S.recheckAcc()}>{S.t('w9_recheck')}</PillButton>
            </div>
          </div>
        {/if}
      </div>
    {/if}
    {#if S.accCleared}<Notice kind="ok" center>{S.t('w9_cleared')}</Notice>{/if}
    {#if S.brand.flow === 'disable-launcher'}<Notice kind="info" center>{S.t('w9_autoPlui')}</Notice>{/if}
    <!-- why the run is one row shorter here: a copy that came from Play never downloads an APK -->
    {#if !S.canDirectInstall}<Notice kind="info" center>{S.t('w9_playEd')}</Notice>{/if}
  </div>

  <div class="panel sum">
    <b class="st">{S.t('w9_sum')}</b>
    <AutoRows compact />
  </div>
</div>

<style>
  .w9 { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 40px; align-content: start; padding-top: 10px; }
  .left { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .top { display: flex; align-items: center; justify-content: space-between; width: 100%; }
  .ttl { font: 700 22px var(--font-display); margin-top: 14px; text-align: left; }
  .desc { font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.68); text-align: left; margin-top: 6px; }
  .acc { display: flex; flex-direction: column; gap: 12px; padding: 18px 20px; border-radius: 16px; background: rgba(224,36,36,.12); border: 1px solid rgba(240,82,82,.5); }
  .ah { display: flex; align-items: center; gap: 12px; }
  .ah b { font: 700 19px var(--font-display); }
  .who { font-size: 13px; color: rgba(255,255,255,.7); margin-left: auto; }
  .ad { font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.85); }
  .opts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .opt { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; padding: 14px; border-radius: 12px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); color: #fff; text-align: left; }
  .opt:not(.static):hover { background: rgba(255,255,255,.1); }
  .opt.gold { background: rgba(200,144,58,.16); border-color: rgba(200,144,58,.55); }
  .opt.gold:hover { background: rgba(200,144,58,.26); }
  .opt b { font: 700 14px var(--font-display); }
  .opt span { font-size: 12px; line-height: 1.45; color: rgba(255,255,255,.7); }
  .accrow { display: flex; align-items: center; gap: 14px; }
  .mini { width: 300px; height: 169px; border-radius: 8px; background: var(--tv-bg); position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,.1); flex: none; font-family: var(--font-label); }
  .mbg { position: absolute; inset: 0; background: radial-gradient(ellipse at 30% 60%, #243B4A 0%, #0B0E13 70%); }
  .mpanel { position: absolute; top: 0; right: 0; bottom: 0; width: 150px; background: var(--tv-panel); padding: 10px 0 0; }
  .mt { font-size: 11px; color: var(--tv-text); padding: 0 12px 8px; }
  .mrow { padding: 5px 12px; font-size: 9px; color: var(--tv-row); }
  .mrow.hi { margin: 2px 6px; padding: 5px 8px; border-radius: 4px; background: var(--tv-text); color: #111; }
  .accact { display: flex; flex-direction: column; gap: 10px; flex: 1; align-items: flex-start; }
  .sum { align-self: start; margin-top: 64px; gap: 10px; }
  .st { font: 600 15px var(--font-display); color: rgba(255,255,255,.85); }
</style>
