<script lang="ts">
  // WS Handover: box ready · serial / profile / apps / tests · "turn debugging off" (default per brand) · report · Next box.
  import { getSession } from '../context.js';
  import TvSwitch from '../components/TvSwitch.svelte';
  import PillButton from '../components/PillButton.svelte';
  const S = getSession();
</script>

<div class="hand">
  <div class="left">
    <div class="head">
      <svg width="64" height="64" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="40" height="40" rx="20" fill="#495AFF" /><path d="M18 23.586L14.707 20.293L13.293 21.707L18 26.414L27.707 16.707L26.293 15.293L18 23.586Z" fill="white" /></svg>
      <div><h2 class="h2-ws">{S.t('h_ready')}</h2>{#if S.handSub}<div class="sub">{S.handSub}</div>{/if}</div>
    </div>
    <div class="facts">
      <div class="fact"><div class="fk">{S.t('h_serial')}</div><div class="fv mono">{S.serial}</div></div>
      <div class="fact"><div class="fk">{S.t('h_profile')}</div><div class="fv">{S.profileTitle}</div></div>
      <div class="fact"><div class="fk">{S.t('h_apps')}</div><div class="fv">{S.installedCount}</div></div>
      <div class="fact"><div class="fk">{S.t('h_tests')}</div><div class="fv">{S.testsCount}</div></div>
    </div>
    <div class="row">
      <i class="plui-icon pi-lock" style="font-size:18px;color:var(--wiz-teal-soft)"></i>
      <span class="txt"><b>{S.t('h_adbOff')}</b><span>{S.t('h_adbOffD')}</span></span>
      <TvSwitch on={S.adbOffEffective} onchange={(v) => (S.adbOff = v)} />
    </div>
    <div class="acts">
      <PillButton kind="ghost" size="sm" style="height:44px;font:400 14px var(--font-ui)" disabled>{S.t('h_pdf')}</PillButton>
      <PillButton kind="ghost" size="sm" style="height:44px;font:400 14px var(--font-ui)" onclick={() => S.copy(S.report.toText())}>{S.copied ? `${S.t('a_copied')} ✓` : S.t('h_copy')}</PillButton>
      <PillButton kind="ghost" size="sm" style="height:44px;font:400 14px var(--font-ui)" disabled>{S.t('h_label')}</PillButton>
      <PillButton kind="outline" size="sm" style="height:44px;margin-left:auto" onclick={() => S.backToTasks()}>{S.t('h_more')}</PillButton>
      <PillButton style="height:44px" onclick={() => S.nextBox()}>{S.t('h_next')} &nbsp;»</PillButton>
    </div>
  </div>
  <pre class="report">{S.reportText}</pre>
</div>

<style>
  .hand { display: grid; grid-template-columns: 1fr 400px; gap: 28px; align-items: start; }
  .left { display: flex; flex-direction: column; gap: 18px; }
  .head { display: flex; align-items: center; gap: 18px; }
  .sub { margin-top: 4px; font-size: 14px; color: rgba(255,255,255,.65); }
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .fact { padding: 14px 16px; border-radius: 12px; background: var(--row-bg); border: 1px solid var(--row-border); }
  .fk { font-size: 11px; letter-spacing: 2px; color: rgba(255,255,255,.45); }
  .fv { margin-top: 4px; font-size: 15px; font-weight: 500; }
  .txt { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .txt b { font: 600 15px var(--font-display); }
  .txt span { font-size: 12px; color: rgba(255,255,255,.55); }
  .acts { display: flex; gap: 10px; flex-wrap: wrap; }
  .report { margin: 8px 0 0; padding: 20px; border-radius: 14px; background: var(--gray-100); color: var(--ink); font: 400 12px/1.6 var(--font-mono); white-space: pre-wrap; }
</style>
