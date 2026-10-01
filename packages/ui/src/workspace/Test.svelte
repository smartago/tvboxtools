<script lang="ts">
  // WS Test: the five checks · "Press HOME — did it come up?" · Reboot & test · TV screenshot (adb screencap).
  import { getSession } from '../context.js';
  import { TEST_IDS } from '../state.svelte.js';
  import PillButton from '../components/PillButton.svelte';
  import MockHome from './MockHome.svelte';
  import type { StrKey } from '../i18n/index.svelte.js';
  const S = getSession();
  const labels: Record<(typeof TEST_IDS)[number], StrKey> = { home: 'x1', perms: 'x2', profile: 'x3', apps: 'x4', reboot: 'x5' };
</script>

<div class="test">
  <div class="left">
    <h2 class="h2-ws">{S.t('x_title')}</h2>
    <div class="rows">
      {#each S.testIds as id (id)}
        {@const v = S.tests[id]}
        <div class="row">
          <i class="base-icon {v === true ? 'bi-check-circle-fill' : v === false ? 'bi-spinner tvlm-spin' : 'bi-plus'}" style:color={v === true ? 'var(--success)' : v === false ? 'var(--wiz-gold-light)' : 'rgba(255,255,255,.45)'}></i>
          <!-- the row names the launcher being tested, whoever it is (GENERIC_TOOL_PLAN D1) -->
          <span class="lbl">{S.t(labels[id], { app: S.targetName })}</span>
        </div>
      {/each}
    </div>
    <div class="notice notice-gold center">
      <i class="base-icon bi-remote" style="font-size:22px"></i>
      <span style="flex:1;line-height:1.45">{S.t('x_home', { app: S.targetName })}</span>
      <PillButton size="sm" onclick={() => S.confirmHome()}>{S.t('x_yes')}</PillButton>
    </div>
    <div><PillButton disabled={S.testsBusy || !S.device} onclick={() => S.runTests()}>{S.testsBusy ? S.t('st_run') + '…' : S.t('x_reboot')}</PillButton></div>
  </div>
  <div class="right">
    <div class="sh"><b>{S.t('x_shot')}</b><span class="dim" style="font-size:12px">{S.t('x_live')} ›</span></div>
    <MockHome mode={S.shot === 'mock' ? 'ours' : S.shot ? 'image' : 'empty'} src={S.shot} />
    <PillButton kind="ghost" size="sm" style="width:100%;font:400 14px var(--font-ui)" disabled={!S.device} onclick={() => S.takeShot()}>{S.t('x_shotB')}</PillButton>
  </div>
</div>

<style>
  .test { display: grid; grid-template-columns: 1fr 440px; gap: 28px; align-items: start; }
  .left { display: flex; flex-direction: column; gap: 16px; }
  .rows { display: flex; flex-direction: column; gap: 8px; }
  .row { padding: 13px 16px; }
  .row i { font-size: 18px; width: 22px; text-align: center; }
  .lbl { flex: 1; font-size: 15px; font-weight: 500; }
  .right { display: flex; flex-direction: column; gap: 10px; margin-top: 52px; }
  .sh { display: flex; align-items: center; justify-content: space-between; }
  .sh b { font: 600 15px var(--font-display); color: rgba(255,255,255,.85); }
</style>
