<script lang="ts">
  // WS Overview: box line · task status rows · the "Guided run" card.
  import { getSession } from '../context.js';
  import { W } from '../state.svelte.js';
  import Notice from '../components/Notice.svelte';
  import PillButton from '../components/PillButton.svelte';
  import type { StrKey } from '../i18n/index.svelte.js';
  const S = getSession();
  const stColor = { done: 'var(--success)', run: 'var(--wiz-gold-light)', wait: 'var(--warning)', todo: 'rgba(255,255,255,.45)' } as const;
  const stIcon = { done: 'bi-check-circle-fill', run: 'bi-spinner', wait: 'bi-warning-fill', todo: 'bi-plus' } as const;
  const stLabel = { done: 'st_done', run: 'st_run', wait: 'st_wait', todo: 'st_todo' } as const satisfies Record<string, StrKey>;
  const debugChip = $derived(S.t(S.debug === 'usb' ? 'd_usb' : S.debug === 'wireless' ? 'd_wl' : 'd_tcp'));
</script>

<div class="over">
  <div class="left">
    <div>
      <h2 class="h2-ws">{S.device ? S.t('o_title') : S.wsConnecting ? S.t('ws_connecting') : S.t('ws_noDev')}</h2>
      <div class="mono dim sub">{S.devName} · {S.devAddr} · Android {S.androidVer} · {debugChip}</div>
    </div>
    {#if !S.device && !S.wsConnecting}
      <Notice kind="warn" center>
        <span style="flex:1">{S.wsError ?? S.t('ws_noDev')}</span>
        <PillButton size="xs" onclick={() => { S.mode = 'wizard'; S.goStep(W.find); }}>{S.t('ws_toGuide')} »</PillButton>
      </Notice>
    {/if}
    <div class="status">
      <div class="eyebrow">{S.t('o_status')}</div>
      {#each S.statusPages as id (id)}
        {@const st = S.status[id]}
        <button type="button" class="srow" data-nav onclick={() => (S.task = id)}>
          <i class="base-icon {stIcon[st]}" class:tvlm-spin={st === 'run'} style:color={stColor[st]}></i>
          <span class="lbl">{S.t(`t_${id}` as StrKey)}</span>
          <span class="st" style:color={stColor[st]}>{S.t(stLabel[st])}</span>
          <span class="chev">›</span>
        </button>
      {/each}
    </div>
  </div>
  <div class="guided">
    <b>{S.t('o_guided')}</b>
    <span>{S.t('o_guidedD')}</span>
    {#if S.brand.flow === 'kiosk'}<PillButton disabled={S.guided || !S.device} style="margin-top:6px" onclick={() => S.openWs('auto')}>{S.guided ? `${S.t('st_run')}…` : `${S.t('o_start')}  »`}</PillButton>{:else}<PillButton kind="outline" style="margin-top:6px" onclick={() => S.backToTasks()}>{S.t('wl_backTasks')}  »</PillButton>{/if}
  </div>
</div>

<style>
  .over { display: grid; grid-template-columns: 1fr 360px; gap: 28px; align-items: start; }
  .left { display: flex; flex-direction: column; gap: 18px; }
  .sub { margin-top: 6px; font-size: 13px; }
  .status { display: flex; flex-direction: column; gap: 8px; }
  .srow { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border-radius: 12px; background: var(--row-bg); border: 1px solid var(--row-border); color: #fff; text-align: left; width: 100%; }
  .srow:hover { border-color: rgba(255,255,255,.3); }
  .srow i { font-size: 18px; width: 22px; text-align: center; }
  .lbl { flex: 1; font-size: 15px; font-weight: 500; }
  .st { font-size: 12px; }
  .chev { color: rgba(255,255,255,.4); }
  .guided { display: flex; flex-direction: column; gap: 12px; padding: 22px; border-radius: 18px; background: rgba(200,144,58,.12); border: 1px solid rgba(200,144,58,.45); }
  .guided b { font: 700 20px var(--font-display); }
  .guided span { font-size: 14px; line-height: 1.55; color: rgba(255,255,255,.8); }
</style>
