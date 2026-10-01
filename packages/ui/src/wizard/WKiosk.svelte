<script lang="ts">
  // Kiosk — the screen behind the hub's kiosk card, built to the design session's "Kiosk Pick"
  // (23/9/2026) in the shape of the launcher picker, because it asks the same kind of question:
  // which app takes control of a box in a hotel, a BnB or a public place. Left: what the lock does,
  // and the way back. Right: what the box is now, the offers, and ONE gold action.
  //
  // One screen, every edition. With OUR launcher in control the action installs it if the box
  // lacks it and then locks — the automatic run (Device Owner, PROVISION kiosk, HOME, grants,
  // tests), on screen. A third party's row opens ITS Play page on the television when missing
  // and is set as HOME when present; nobody else's APK is ever fetched, and nobody else's app is
  // locked (not here yet — the note under the button says so).
  import { getSession } from '../context.js';
  import type { LauncherRow } from '@tvlm/core';
  import Card from '../components/Card.svelte';
  import Notice from '../components/Notice.svelte';
  const S = getSession();
  const cta = $derived(S.kioskCta);
  const c = $derived(S.check);
  const ready = $derived(S.kioskAccounts === 0);
  const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase();
  const descOf = (r: LauncherRow): string => {
    if (r.kind === 'ours') return S.t('wk_oursD');
    const k = ('wk_d_' + r.id) as Parameters<typeof S.t>[0];
    return r.kind === 'known' ? S.t(k) : r.package;
  };
  let missing = $state<Record<string, boolean>>({});
  // "My own app": the field opens when its card is picked; typing builds the `custom` row.
  const customOpen = $derived(S.kioskPick === 'custom');
  const pickCustom = () => {
    S.chooseKiosk('custom');
  };
  const points = $derived([
    ['pi-lock', S.t('wk_p1')],
    ['pi-cat-all', S.t('wk_p2')],
    ['pi-users-group', S.t('wk_p3')],
  ] as const);
</script>

<!--
  "Back to factory" — the second way out (Jim, 25/9), under whichever button the screen is showing.
  It needs the Admin PIN only while the box is still locked; on a box we merely set up it is a plain
  undo, so the PIN gate is passed in rather than decided here.
-->
{#snippet reset(needsPin: boolean)}
  {#if S.canResetBox}
    <button type="button" class="reset tvlm-focus" data-nav disabled={S.launcherBusy || needsPin} onclick={() => S.unlockBox('reset')}>{S.t('wk_resetCta')} ↺</button>
    <div class="ctasub small">{S.t('wk_resetSub')}</div>
  {/if}
{/snippet}

<div class="screen wk">
  <div class="left">
    <div class="eye">{S.t('wk_eyebrow')}</div>
    <h2 class="title">{S.t('wk_title')}</h2>
    <p class="body">{S.t('wk_body')}</p>
    <div class="ticks">
      {#each points as [icon, text] (text)}
        <div class="tick"><span class="tk"><i class="plui-icon {icon}"></i></span><span>{text}</span></div>
      {/each}
    </div>
    <div style="flex:1"></div>
    {#if S.launcherError}
      <div style="margin-bottom:14px"><Notice kind="danger">{S.t('wl_failed')} <span class="mono">{S.launcherError}</span></Notice></div>
    {/if}
    <button type="button" class="keep tvlm-focus" data-nav onclick={() => S.backToTasks()}>← {S.t('wk_notNow')}</button>
  </div>

  <div class="right">
    <!-- the box now: locked or not, what opens on HOME, and whether the lock could start -->
    <div class="nowhead">{S.t('wk_nowOn')}</div>
    <div class="now">
      <span class="nico"><i class="plui-icon pi-lock"></i></span>
      <span class="ntxt">
        <b>{S.kioskLocked ? S.t('wk_locked') : S.t('wk_unlocked')}</b>
        <span class="sub">{S.currentHomeName} · {S.kioskLocked ? S.t('wk_ownerIs', { app: S.deviceOwnerName }) : S.t('wk_unlockedD')}</span>
      </span>
      <span class="pill" class:ok={ready} class:warn={!ready}>
        <i class="base-icon {ready ? 'bi-check' : 'bi-warning-fill'}"></i>
        {ready ? S.t('wk_ready0') : S.t('wk_ready1', { n: String(S.kioskAccounts) })}
      </span>
    </div>

    <div class="head"><span class="lh">{S.t('wk_pick')}</span><span class="hint">{S.t('w1_hint')}</span></div>

    {#snippet tile(r: LauncherRow, small: boolean)}
      {@const src = S.launcherArt(r).find((x) => !missing[x])}
      <span class="tile" class:sm={small} class:img={!!src} style:background={!src && r.tint ? r.tint : null}>
        {#if src}<img {src} alt="" onerror={() => (missing = { ...missing, [src]: true })} />{:else}{initial(r.name)}{/if}
      </span>
    {/snippet}

    <div class="list">
      <!-- ours: the full row, recommended, with its install state -->
      {#if S.kioskOurs}
        {@const o = S.kioskOurs}
        <Card sel={S.kioskPick === o.id} padding="10px 16px" onpick={() => S.chooseKiosk(o.id)}>
          {@render tile(o, false)}
          <span class="txt">
            <span class="nm"><b>{o.name}</b><span class="tag rec">{S.t('wk_rec')}</span></span>
            <span class="sub">{descOf(o)}</span>
          </span>
          <span class="tag" class:on={o.installed} class:dim={!o.installed}>{o.current ? S.t('wl_current') : o.installed ? S.t('wk_inst') : S.t('wl_notInst')}</span>
        </Card>
      {/if}

      <div class="sep">{S.t('wk_sepHosp')}</div>
      <div class="grid3">
        {#each S.kioskHosp as r (r.id)}
          <Card sel={S.kioskPick === r.id} padding="7px 12px" check={false} onpick={() => S.chooseKiosk(r.id)}>
            {@render tile(r, true)}
            <span class="txt">
              <b class="sm">{r.name}</b>
              <span class="sub">{r.installed ? S.t('wk_inst') : descOf(r)}</span>
            </span>
          </Card>
        {/each}
      </div>

      <div class="sep">{S.t('wk_sepOwn')}</div>
      <div class="grid2">
        <!-- other hotel TV solutions: what the box already has that can be HOME -->
        {#if S.kioskFound.length}
          {#each S.kioskFound as r (r.id)}
            <Card sel={S.kioskPick === r.id} padding="7px 12px" check={false} onpick={() => S.chooseKiosk(r.id)}>
              {@render tile(r, true)}
              <span class="txt"><b class="sm">{r.name}</b><span class="sub">{S.t('wk_otherHotelD')}</span></span>
            </Card>
          {/each}
        {:else}
          <Card disabled padding="7px 12px" check={false}>
            <span class="tile sm ask"><i class="base-icon bi-caret-down"></i></span>
            <span class="txt"><b class="sm">{S.t('wk_otherHotel')}</b><span class="sub">{S.t('wk_otherNone')}</span></span>
          </Card>
        {/if}
        <Card sel={customOpen} padding="7px 12px" check={false} onpick={pickCustom}>
          <span class="tile sm ask code">&lt;/&gt;</span>
          <span class="txt">
            <b class="sm">{S.t('wk_custom')}</b>
            {#if customOpen}
              <!-- svelte-ignore a11y_autofocus -->
              <input class="pkg mono" type="text" bind:value={S.kioskCustom} placeholder={S.t('wk_customPh')} spellcheck="false" autofocus onclick={(e) => e.stopPropagation()} />
            {:else}
              <span class="sub">{S.t('wk_customD')}</span>
            {/if}
          </span>
        </Card>
      </div>
    </div>

    {#if S.unlockDone}
      <!-- just unlocked: say so, and leave the road open — locking again is one press away -->
      <div class="done tvlm-fade">
        <span class="check-badge lg"><i class="base-icon bi-check"></i></span>
        <span class="dtxt"><b>{S.t(S.unlockDone === 'reset' ? 'wk_resetDoneT' : 'wk_unlockDoneT')}</b><span>{S.t(S.unlockDone === 'reset' ? 'wk_resetDoneD' : 'wk_unlockDoneD')}</span></span>
      </div>
    {/if}
    {#if S.lockedByUs}
      <!-- locked by our app: the way out is here, with the Admin PIN (the app checks it itself) -->
      <div class="unlock">
        <input class="upin mono tvlm-focus" type="password" inputmode="numeric" maxlength="8" placeholder={S.t('wk_unlockPin')} value={S.unlockPin} oninput={(e) => (S.unlockPin = (e.currentTarget as HTMLInputElement).value.replace(/\D/g, ''))} onkeydown={(e) => e.key === 'Enter' && S.unlockBox('keep')} />
        <button type="button" class="cta outline grow tvlm-focus" class:busy={S.launcherBusy} data-nav data-primary disabled={S.launcherBusy || S.unlockPin.length < 4} onclick={() => S.unlockBox('keep')}>
          <span class="lbl">{S.launcherBusy ? (S.launcherStage ?? S.t('wl_working')) : S.t('wk_unlockCta')} &nbsp;»</span>
        </button>
      </div>
      <div class="ctasub">{S.t('wk_unlockSub')}</div>
      {@render reset(S.unlockPin.length < 4)}
    {:else if S.kioskDone}
      <!-- the verdict, on an edition that never locks: HOME is set, the lock has an address -->
      <div class="done tvlm-fade">
        <span class="check-badge lg"><i class="base-icon bi-check"></i></span>
        <span class="dtxt"><b>{S.t('wl_doneTitle', { app: S.kioskDone })}</b><span>{S.t('wk_doneLock')}</span></span>
      </div>
      <div class="two">
        {#if S.kioskLink}
          <button type="button" class="cta outline tvlm-focus" data-nav onclick={() => S.openExternal(S.kioskLink!)}>{S.t('wk_openLink')} ↗</button>
        {/if}
        <button type="button" class="cta tvlm-focus" data-nav data-primary onclick={() => S.backToTasks()}>{S.t('wl_backTasks')} &nbsp;»</button>
      </div>
    {:else if cta}
      <button type="button" class="cta tvlm-focus" class:busy={S.launcherBusy} class:acc={cta.kind === 'account'} data-nav data-primary disabled={S.launcherBusy || !!cta.blocked || cta.kind === 'pick'} onclick={() => S.runKioskCta()} style:--pct="{S.dlPercent >= 0 ? S.dlPercent : 0}%">
        <span class="lbl">{S.launcherBusy ? (S.launcherStage ?? S.t('wl_working')) : cta.label} &nbsp;»</span>
      </button>
      <div class="ctasub" class:warn={!!cta.blocked || cta.kind === 'account'}>{S.launcherBusy ? S.t('wl_keepOn') : cta.sub}</div>
      {@render reset(false)}
    {/if}
  </div>
</div>

<style>
  .wk { display: grid; grid-template-columns: 400px minmax(0, 1fr); gap: 48px; min-height: 0; }
  .left { display: flex; flex-direction: column; padding-top: 14px; min-width: 0; }
  .eye { font: 600 12px var(--font-display); letter-spacing: 3px; color: var(--wiz-gold-light); }
  .title { margin: 12px 0 0; font: 700 36px/1.1 var(--font-display); text-wrap: pretty; }
  .body { margin: 16px 0 0; font-size: 16px; line-height: 1.6; color: rgba(255,255,255,.72); text-wrap: pretty; }
  .ticks { display: flex; flex-direction: column; gap: 12px; margin-top: 26px; }
  .tick { display: flex; align-items: flex-start; gap: 12px; font-size: 14px; line-height: 1.45; color: rgba(255,255,255,.82); }
  .tk { width: 28px; height: 28px; border-radius: 9px; background: rgba(0,161,169,.18); color: var(--wiz-teal-check); display: flex; align-items: center; justify-content: center; flex: none; }
  .tk i { font-size: 14px; }
  .keep { align-self: flex-start; margin-bottom: 16px; background: none; border: 1px solid rgba(255,255,255,.22); border-radius: 999px; padding: 9px 18px; color: rgba(255,255,255,.85); font-size: 14px; font-weight: 600; white-space: nowrap; }
  .keep:hover { background: rgba(255,255,255,.08); }

  .right { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
  .nowhead { font: 600 11px var(--font-label); letter-spacing: 2px; color: rgba(255,255,255,.4); margin-bottom: 6px; }
  .now { display: flex; align-items: center; gap: 14px; padding: 8px 14px; border-radius: 16px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.09); margin-bottom: 14px; }
  .nico { width: 34px; height: 34px; border-radius: 9px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.7); display: flex; align-items: center; justify-content: center; flex: none; }
  .ntxt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .ntxt b { font: 600 15px var(--font-display); }
  .pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 5px 11px; border-radius: 999px; white-space: nowrap; flex: none; border: 1px solid transparent; }
  .pill i { font-size: 11px; }
  .pill.ok { background: rgba(34,197,94,.14); color: #22C55E; border-color: rgba(34,197,94,.4); }
  .pill.warn { background: rgba(255,184,0,.12); color: var(--warning); border-color: rgba(255,184,0,.4); }

  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; }
  .lh { font: 600 20px var(--font-display); }
  .hint { font-size: 13px; color: rgba(255,255,255,.5); white-space: nowrap; }
  /* padding = room for the focus ring; the list scrolls only when the window is shorter than the design */
  .list { display: flex; flex-direction: column; gap: 8px; margin: 6px -10px 0; flex: 1; min-height: 0; overflow: auto; padding: 8px 10px; }
  .sep { font: 600 11px var(--font-label); letter-spacing: 2px; color: rgba(255,255,255,.4); margin-top: 4px; }
  .grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .tile { width: 42px; height: 42px; border-radius: 11px; flex: none; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.08); color: #fff; font: 700 17px var(--font-display); }
  .tile.sm { width: 34px; height: 34px; border-radius: 9px; font-size: 14px; }
  .tile.ask { background: rgba(255,255,255,.06); color: rgba(255,255,255,.75); font-size: 14px; }
  .tile.code { border: 1px dashed rgba(255,255,255,.3); font-size: 12px; }
  .tile.img { background: rgba(255,255,255,.06); padding: 3px; }
  .tile img { width: 100%; height: 100%; object-fit: contain; border-radius: 8px; }
  .txt { display: flex; flex-direction: column; gap: 2px; text-align: left; flex: 1; min-width: 0; }
  .txt b { font: 600 16px var(--font-display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .txt b.sm { font-size: 14px; }
  .nm { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .sub { font: 400 12px var(--font-label); color: rgba(255,255,255,.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag { font-size: 11px; padding: 4px 9px; border-radius: 999px; white-space: nowrap; flex: none; border: 1px solid rgba(255,255,255,.15); color: rgba(255,255,255,.5); }
  .tag.rec { background: rgba(200,144,58,.16); color: var(--wiz-gold-light); border-color: rgba(200,144,58,.45); }
  .tag.on { background: rgba(34,197,94,.14); color: #22C55E; border-color: rgba(34,197,94,.4); }
  .pkg { margin-top: 2px; height: 26px; padding: 0 8px; border-radius: 7px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.18); color: #fff; font-size: 12px; outline: none; width: 100%; }
  .pkg:focus { border-color: var(--wiz-gold); }

  .done { margin-top: 12px; display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 14px; background: rgba(0,161,169,.14); border: 1px solid rgba(0,161,169,.45); }
  .dtxt { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .dtxt b { font: 700 16px var(--font-display); }
  .dtxt span { font-size: 13px; color: rgba(255,255,255,.75); line-height: 1.4; }
  .two { display: flex; gap: 10px; }
  .unlock { display: flex; gap: 10px; align-items: flex-end; }
  .upin { margin-top: 12px; width: 150px; height: 56px; border-radius: 999px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.2); color: #fff; font-size: 18px; letter-spacing: 4px; text-align: center; outline: none; flex: none; }
  .upin:focus { border-color: var(--wiz-gold); }
  .upin::placeholder { font-size: 13px; letter-spacing: 1px; color: rgba(255,255,255,.45); }
  .cta.grow { flex: 1; }
  .reset { margin: 12px auto 0; background: none; border: 1px solid rgba(255,255,255,.22); border-radius: 999px; padding: 8px 18px; color: rgba(255,255,255,.8); font: 600 13px var(--font-display); white-space: nowrap; display: block; }
  .reset:hover:not(:disabled) { background: rgba(255,255,255,.08); }
  .reset:disabled { opacity: .4; }
  .ctasub.small { font-size: 11.5px; margin-top: 5px; line-height: 1.4; }
  .two .cta { flex: 1; }
  .cta { margin-top: 12px; height: 56px; border: none; border-radius: 999px; background: var(--wiz-gold); color: var(--wiz-gold-text); font: 700 17px var(--font-display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 20px; }
  .cta:hover:not(:disabled) { background: var(--wiz-gold-hover); }
  .cta:disabled { opacity: 1; }
  .cta:disabled:not(.busy) { opacity: .45; }
  /* the account gate: an outlined orange button, because it does not lock anything yet */
  .cta.acc { background: transparent; border: 2px solid var(--warning); color: var(--warning); }
  .cta.acc:hover:not(:disabled) { background: rgba(255,184,0,.1); }
  .cta.outline { background: transparent; border: 1px solid rgba(255,255,255,.3); color: #fff; }
  .cta.outline:hover { background: rgba(255,255,255,.08); }
  .cta.busy { background: rgba(255,255,255,.1); color: #fff; position: relative; }
  .cta.busy::before { content: ''; position: absolute; inset: 0 auto 0 0; width: var(--pct, 0%); background: var(--wiz-gold); opacity: .85; transition: width .25s linear; }
  .cta .lbl { position: relative; }
  .ctasub { margin-top: 8px; text-align: center; font-size: 12px; color: rgba(255,255,255,.55); min-height: 16px; }
  .ctasub.warn { color: var(--warning); font-size: 13px; }
</style>
