<script lang="ts">
  // WS Automatic setup: the stages live · the account block (the hotel road) · Start / Running… / Go to handover.
  import { getSession } from '../context.js';
  import AutoRows from './AutoRows.svelte';
  import PillButton from '../components/PillButton.svelte';
  const S = getSession();
</script>

<div class="auto">
  <div class="head">
    <div><h2 class="h2-ws">{S.t('t_auto')}</h2><div class="body">{S.t('au_body')}</div></div>
    {#if S.guided}<span class="pill run"><i class="base-icon bi-spinner tvlm-spin" style="color:var(--wiz-gold-light)"></i>{S.t('au_step')} {S.autoStage} / {S.autoList.length}</span>{/if}
    {#if S.autoDone && !S.guided}<span class="pill done"><i class="base-icon bi-check-circle-fill"></i>{S.t('au_done')}</span>{/if}
  </div>
  {#if S.wsBlocked}
    <div class="acc">
      <div class="ah"><i class="base-icon bi-warning-fill" style="color:var(--danger-alt);font-size:18px"></i><b>{S.t('w9_acc')}</b><span class="mono who">{S.accountName}</span></div>
      <span class="ad">{S.t('w9_accD')}</span>
      <div class="acts">
        <PillButton size="xs" onclick={() => S.openAccounts()}>{S.t('w9_rm')}</PillButton>
        {#if S.accScreen}<PillButton kind="ghost" size="xs" onclick={() => S.recheckAcc()}>{S.t('w9_recheck')}</PillButton>{/if}
        <PillButton kind="outline" size="xs" onclick={() => S.continueOpen()}>{S.t('w9_open')}</PillButton>
      </div>
    </div>
  {/if}
  <AutoRows />
  <div class="foot">
    {#if !S.guided && !S.autoDone}
      <PillButton size="lg" disabled={S.wsBlocked || !S.device} onclick={() => S.startAuto()}>{S.t('au_start')} &nbsp;»</PillButton><span class="time">{S.t('au_time')}</span>
    {:else if S.guided}
      <PillButton size="lg" disabled>{S.t('au_running')}</PillButton>
    {:else}
      <PillButton size="lg" onclick={() => (S.task = 'hand')}>{S.t('au_toHand')} &nbsp;»</PillButton>
      {#if S.autoFailedTasks.length}<PillButton kind="outline" size="sm" onclick={() => S.startAuto()}>{S.t('retry')}</PillButton>{/if}
    {/if}
  </div>
</div>

<style>
  .auto { display: flex; flex-direction: column; gap: 18px; max-width: 820px; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
  .body { margin-top: 6px; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.65); }
  .pill { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-radius: 999px; font-size: 13px; white-space: nowrap; flex: none; }
  .pill.run { background: rgba(200,144,58,.14); border: 1px solid rgba(200,144,58,.55); }
  .pill.done { gap: 8px; background: rgba(34,197,94,.14); border: 1px solid rgba(34,197,94,.45); color: var(--success); }
  .acc { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; border-radius: 14px; background: rgba(224,36,36,.12); border: 1px solid rgba(240,82,82,.5); }
  .ah { display: flex; align-items: center; gap: 12px; }
  .ah b { font: 700 16px var(--font-display); }
  .who { font-size: 13px; color: rgba(255,255,255,.7); margin-left: auto; }
  .ad { font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.85); }
  .acts { display: flex; gap: 10px; flex-wrap: wrap; }
  .foot { display: flex; align-items: center; gap: 14px; }
  .time { font-size: 13px; color: rgba(255,255,255,.5); }
</style>
