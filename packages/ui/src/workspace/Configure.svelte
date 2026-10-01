<script lang="ts">
  // WS Configure: permissions (silent grants, toggles) · skip first-run · TV language · PROVISION broadcast → Apply ·
  // Link to account (brands with a role step): room code (owner) or the QR-at-the-property note (reseller).
  import { getSession } from '../context.js';
  import TvSwitch from '../components/TvSwitch.svelte';
  import PillButton from '../components/PillButton.svelte';
  import Notice from '../components/Notice.svelte';
  const S = getSession();
</script>

<div class="conf">
  <div class="left">
    <h2 class="h2-ws">{S.t('c_title')}</h2>
    <div class="eyebrow">{S.t('c_perms')}</div>
    <!-- Jim, 22/9: we grant nothing to anybody else's launcher. Say so where the switches are, so
         the page is not read as "permissions for whatever is on HOME". -->
    {#if !S.oursIsTarget}
      <div style="margin-bottom:12px"><Notice kind="info">{S.t('c_onlyOurs', { ours: S.brand.launcherName, app: S.targetName })}</Notice></div>
    {/if}
    <div class="rows">
      {#each S.perms as p (p.id)}
        <div class="row" style:opacity={p.off ? 0.45 : 1}>
          <span class="txt"><b>{p.label}</b><span class="mono cmd">{p.cmd}</span></span>
          <TvSwitch on={p.on} disabled={p.off} onchange={(v) => S.setCfg(p.id, v)} />
        </div>
      {/each}
    </div>
    <div class="rows">
      <div class="row"><span class="lbl">{S.t('c_skip')}</span><TvSwitch on={true} disabled /></div>
      <div class="row"><span class="lbl">{S.t('c_lang')}</span><span class="sel">{S.i18n.langName} ▾</span></div>
      <div class="row"><span class="lbl">{S.t('c_bc')}</span><span class="mono dim" style="font-size:12px">am broadcast -a {S.launcherPkg}.PROVISION --es profile {S.effectiveProfile}</span></div>
    </div>
    <div class="acts">
      <PillButton disabled={S.cfgBusy || !S.device} onclick={() => S.applyConfig()}>{S.cfgBusy ? S.t('st_run') + '…' : S.t('apply')}</PillButton>
      {#if S.cfgApplied}<span class="ok"><i class="base-icon bi-check-circle-fill"></i>{S.t('c_applied')}</span>{/if}
    </div>
  </div>
  {#if S.brand.roleStep}
    <div class="panel link">
      <b class="lt">{S.t('c_link')}</b>
      {#if S.role === 'owner'}
        <label class="field"><span>{S.t('c_room')}</span><input class="tvlm-input room" bind:value={S.room} placeholder="3391-2854" /></label>
        <span class="dim" style="font-size:12px">{S.t('c_roomD')}</span>
        <span class="mono cmdbox">am broadcast -a {S.launcherPkg}.LINK --es code {S.room}</span>
      {:else}
        <div class="res"><i class="base-icon bi-check-circle-fill" style="color:var(--wiz-teal-soft);font-size:18px;margin-top:2px"></i>{S.t('c_linkRes')}</div>
        <div class="qr"></div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .conf { display: grid; grid-template-columns: 1fr 380px; gap: 28px; align-items: start; }
  .left { display: flex; flex-direction: column; gap: 16px; }
  .rows { display: flex; flex-direction: column; gap: 8px; }
  .row { padding: 10px 16px; }
  .txt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .txt b { font: 600 15px var(--font-display); }
  .cmd { font-size: 12px; color: rgba(255,255,255,.5); }
  .lbl { flex: 1; font: 600 15px var(--font-display); }
  .sel { font-size: 14px; padding: 6px 12px; border-radius: 8px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); }
  .acts { display: flex; align-items: center; gap: 14px; }
  .ok { display: flex; align-items: center; gap: 8px; color: var(--success); font-size: 14px; font-weight: 600; }
  .link { margin-top: 52px; }
  .lt { font: 700 18px var(--font-display); }
  .room { height: 50px; font: 600 22px var(--font-mono); letter-spacing: 3px; text-align: center; }
  .cmdbox { font-size: 12px; color: rgba(255,255,255,.55); padding: 10px 12px; border-radius: 8px; background: rgba(0,0,0,.3); word-break: break-all; }
  .res { display: flex; gap: 12px; align-items: flex-start; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.8); }
  .qr { align-self: center; width: 120px; height: 120px; border-radius: 10px; background: repeating-conic-gradient(#fff 0 25%, #1A2744 0 50%) 0 0/24px 24px; border: 6px solid #fff; opacity: .85; }
</style>
