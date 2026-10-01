<script lang="ts">
  // The developer step when the box IS this television (Session.selfTarget).
  //
  // W4DevMode asks the installer to find the Build row on a box they are looking at from across the
  // room, and then to tell us they did it. Here the set is the device the app runs on, so it can be
  // sent straight to the screen that matters and then asked what it sees: the wizard reads
  // Settings.Global and opens the way forward when this TV reports debugging on (`selfBlocked`).
  // Nobody has to be believed, and nobody is left guessing which menu it was.
  import { getSession } from '../context.js';
  import Notice from '../components/Notice.svelte';
  const S = getSession();
  const path = $derived([S.t('ws_p1'), S.t('ws_p2'), S.t('ws_p3')]);
  const dbg = $derived(S.selfInfo?.wirelessAdb ? S.t('ws_dbgW') : S.t('ws_dbgU'));
</script>

<div class="screen ws">
  <div class="left">
    <h2 class="h2">{S.t('ws_title')}</h2>
    <p class="lead" style="margin-top:10px">{S.t('ws_body')}</p>
    <ol class="path">
      {#each path as p, i (p)}
        <li class:active={i === 0 ? !S.selfDev : i === 2 ? S.selfDev && !S.selfDebugOn : false}>
          <span class="n">{i + 1}</span><span class="lbl">{p}</span>
        </li>
      {/each}
    </ol>
    <div class="acts">
      <button type="button" class="btn {S.selfDev ? 'btn-outline' : 'btn-gold'}" data-nav data-primary={S.selfDev ? null : true} onclick={() => S.openSelfSettings('about')}>
        <i class="base-icon bi-solid-arrow-right"></i>&nbsp; {S.t('ws_about')}
      </button>
      {#if S.selfDev || S.selfDebugOn}
        <button type="button" class="btn {S.selfDebugOn ? 'btn-outline' : 'btn-gold'}" data-nav data-primary={S.selfDebugOn ? null : true} onclick={() => S.openSelfSettings('dev')}>
          <i class="base-icon bi-solid-arrow-right"></i>&nbsp; {S.t('ws_dev')}
        </button>
      {/if}
      <button type="button" class="btn btn-ghost" data-nav onclick={() => S.openSelfSettings('wifi')}>{S.t('ws_wifi')}</button>
    </div>
    {#if S.settingsFailed}
      <div style="margin-top:16px"><Notice kind="warn">{S.t('ws_noOpen')}</Notice></div>
    {/if}
  </div>

  <div class="right">
    <div class="panel state">
      <div class="sh"><b>{S.t('ws_state')}</b>{#if S.selfInfo}<span class="mono dim">{S.selfName}</span>{/if}</div>

      <!-- The menu flag, not the gate: some sets never set it although debugging works, so once the
           daemon is on this row stops spinning and says so instead of nagging about a menu. -->
      <div class="srow" class:on={S.selfDev}>
        <span class="mark">
          {#if S.selfDev}<i class="base-icon bi-check"></i>{:else if S.selfBlocked}<i class="base-icon bi-spinner tvlm-spin"></i>{:else}<i class="base-icon bi-caret-down"></i>{/if}
        </span>
        <span class="st"><b>{S.t('c_dev')}</b><span>{S.selfDev ? S.t('ws_devOn') : S.selfBlocked ? S.t('ws_devOff') : S.t('ws_devUnread')}</span></span>
      </div>

      <div class="srow" class:on={S.selfDebugOn}>
        <span class="mark">
          {#if S.selfDebugOn}<i class="base-icon bi-check"></i>{:else}<i class="base-icon bi-spinner tvlm-spin"></i>{/if}
        </span>
        <span class="st"><b>{S.t('s_debug')}</b><span>{S.selfDebugOn ? S.t('ws_dbgOn', { m: dbg }) : S.t('ws_dbgOff')}</span></span>
      </div>

      {#if !S.selfInfo}
        <Notice kind="info">{S.t('ws_noRead')}</Notice>
      {:else if S.selfBlocked}
        <Notice kind="gold">{S.t('ws_hint')}</Notice>
      {:else}
        <Notice kind="ok">{S.t('ws_ready')}</Notice>
      {/if}
    </div>
  </div>
</div>

<style>
  .ws { display: grid; grid-template-columns: 1fr 440px; gap: 48px; align-content: start; padding-top: 12px; }
  .left { min-width: 0; }
  .path { margin: 20px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; max-width: 560px; }
  .path li { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 12px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
  .path li.active { background: rgba(200,144,58,.14); border-color: rgba(200,144,58,.55); }
  .n { width: 26px; height: 26px; border-radius: 13px; display: flex; align-items: center; justify-content: center; font: 700 13px var(--font-display); background: rgba(255,255,255,.1); color: rgba(255,255,255,.7); flex: none; }
  .path li.active .n { background: var(--wiz-gold); color: var(--wiz-gold-text); }
  .lbl { font-size: 16px; }
  .acts { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 22px; }
  .acts .btn { height: 52px; padding: 0 22px; font: 600 15px var(--font-display); }
  .right { min-width: 0; }
  .state { display: flex; flex-direction: column; gap: 14px; padding: 22px 24px; }
  .sh { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .sh b { font: 600 17px var(--font-display); }
  .sh .mono { font-size: 12px; }
  .srow { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 12px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
  .srow.on { background: rgba(0,161,169,.12); border-color: rgba(0,161,169,.4); }
  .mark { width: 34px; height: 34px; border-radius: 17px; flex: none; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.08); color: rgba(255,255,255,.6); font-size: 14px; }
  .srow.on .mark { background: rgba(0,161,169,.25); color: var(--wiz-teal-check); }
  .st { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .st b { font: 600 16px var(--font-display); }
  .st span { font-size: 13px; line-height: 1.45; color: rgba(255,255,255,.7); }
</style>
