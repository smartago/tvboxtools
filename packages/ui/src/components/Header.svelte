<script lang="ts">
  // The 64px header: brand logo + platform chip · (workspace) device pill + Automatic + Guide · (wizard) role/box chips · language.
  import { getSession } from '../context.js';
  const S = getSession();
</script>

<div class="hdr">
  <div class="brand">
    <!-- a dark wordmark (brand.logo.onLight) gets its own light plate: the header is dark glass and
         a navy logo would simply disappear on it. No recolouring of anyone's artwork. -->
    <span class="mark" class:plate={S.brand.logo.onLight}>
      <img src="{S.assetBase}{S.brand.logo.wordmark}" alt={S.brand.name} class="logo" />
    </span>
    <span class="chip">{S.platformChip}</span>
  </div>
  <div style="flex:1"></div>
  {#if S.mode === 'workspace'}
    <div class="dev">
      <span class="led" class:off={!S.device}></span>
      <b>{S.devName}</b>
      {#if S.devIsSelf}<span class="tag tag-gold" style="font-size:11px;padding:2px 8px">{S.t('w6_self')}</span>{/if}
      <span class="dim">{S.devAddr}</span>
      <span class="teal">{S.device ? S.t('authorized') : S.wsConnecting ? S.t('ws_connecting') : S.t('ws_noDev')}</span>
    </div>
    {#if S.brand.flow === 'kiosk'}<button type="button" class="btn btn-gold xs" onclick={() => S.openWs('auto')}><i class="plui-icon pi-wand" style="font-size:14px"></i>{S.t('t_auto')}</button>{/if}
    <button type="button" class="btn btn-ghost xs" onclick={() => S.backToTasks()}>{S.t('tasks')}</button>
    <button type="button" class="btn btn-ghost xs" onclick={() => S.restartGuide()}>{S.t('guide')}</button>
  {:else}
    <!-- the Hotel TV screens (Use, Install): which app, and on Install the use too — as in the design -->
    {#if S.hotelChip}<span class="pchip hchip"><img src="{S.assetBase}launchers/com.hotel.bnb.smart.hospitality.tv.launcher.png" alt="" />{S.hotelChip}</span>{/if}
    {#if S.showRoleChip}<span class="pchip">{S.role === 'owner' ? S.t('brand_role_owner') : S.t('brand_role_res')}</span>{/if}
    {#if S.showBoxChip}<span class="pchip">{S.boxTitle}</span>{/if}
    <!-- PHONE: the door to the workspace. It used to live on the language screen ("Skip the guide"),
         and that screen does not exist on a phone any more — so the door moved here, where it is
         open at every step instead of only the first (Jim, 28/9). -->
    {#if S.phone}<button type="button" class="btn btn-ghost xs" onclick={() => S.landing()}>{S.t('workspace')}</button>{/if}
  {/if}
  <button type="button" class="lang tvlm-focus" onclick={() => S.toggleLang()} title={S.t('s_lang')}><img class="fl" src="{S.assetBase}flags/{S.i18n.flag}.svg" alt="" /><span class="code">{S.i18n.code}</span>▾</button>
</div>

<style>
  .hdr { position: relative; height: 64px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 40px; }
  :global(.app.tv) .hdr { padding: 0 48px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .mark { display: flex; align-items: center; }
  .mark.plate { background: #F3FAF8; border-radius: 8px; padding: 6px 12px; }
  /* +20% (Jim, 23/9): the lockup's letters read small at 30px next to the robot */
  .logo { height: 44px; display: block; max-width: 380px; object-fit: contain; }
  .plate .logo { height: 22px; }
  .hchip { display: inline-flex; align-items: center; gap: 8px; }
  .hchip img { width: 22px; height: 22px; border-radius: 6px; }
  .chip { font: 500 13px var(--font-display); color: rgba(255,255,255,.55); padding: 3px 9px; border: 1px solid rgba(255,255,255,.18); border-radius: 6px; white-space: nowrap; }
  .dev { display: flex; align-items: center; gap: 10px; padding: 6px 14px 6px 10px; border-radius: 999px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.12); font-size: 13px; white-space: nowrap; flex: none; }
  .dev b { font-weight: 600; }
  .led { width: 9px; height: 9px; border-radius: 50%; background: var(--success); box-shadow: 0 0 8px var(--success); }
  .led.off { background: var(--warning); box-shadow: 0 0 8px var(--warning); }
  .teal { color: var(--wiz-teal-soft); }
  .pchip { font-size: 13px; color: rgba(255,255,255,.6); padding: 7px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14); }
  .lang { height: 36px; padding: 0 12px; border-radius: 8px; background: rgba(255,255,255,.1); border: 1px solid var(--gray-700); color: #fff; font: 400 14px var(--font-display); display: flex; align-items: center; gap: 8px; }
  .lang:hover { background: rgba(255,255,255,.16); }
  .code { font-size: 12px; padding: 1px 5px; border-radius: 4px; background: rgba(255,255,255,.15); }
  .fl { width: 24px; height: 16px; border-radius: 3px; object-fit: cover; display: block; }
</style>
