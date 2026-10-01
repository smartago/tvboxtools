<script lang="ts">
  // WS Debloat — switch off the pre-installed apps you never open (docs/TASKS_HUB_PLAN.md §4).
  //
  // Nothing is removed: `pm disable-user` hides an app and stops it; `pm enable` brings it back
  // exactly as it was, and this page keeps the list of what IT switched off so one press undoes
  // the lot. The system's own parts, the Play store and services, every app that can be HOME and
  // our own launcher are not in the list at all — a box with no home screen or no Play is not
  // "debloated", it is broken, and this page must not be able to do that.
  //
  // NEVER in the Play edition (Jim, 23/9): the tile does not exist there. This page trusts that
  // the hub kept its word, and still refuses to act when the session says it may not.
  import { untrack } from 'svelte';
  import { getSession } from '../context.js';
  import PillButton from '../components/PillButton.svelte';
  import Notice from '../components/Notice.svelte';
  const S = getSession();
  let q = $state('');
  const rows = $derived(S.debloatRows.filter((r) => !q.trim() || (r.pkg + ' ' + r.label).toLowerCase().includes(q.trim().toLowerCase())));
  const sys = $derived(rows.filter((r) => r.system));
  const other = $derived(rows.filter((r) => !r.system));
  // The read runs once the box is there. `untrack`: the call touches session state on its way
  // (the user-initiated counter, the report), and an effect that tracked those would re-run on
  // its own writes — it did, and froze the window (23/9).
  $effect(() => {
    const ready = !!S.device && S.canRiskyTasks;
    untrack(() => {
      if (ready) void S.loadDisabled();
    });
  });

  // TELEVISION: one press asks, and afterwards the ring goes BACK to the row it left (Jim, 28/9).
  // Without this the button the ring was on is replaced by the redraw, the focus falls to the task
  // list, and the remote has to walk the whole page again to reach the next app.
  let asked = $state<string | null>(null);
  const label = $derived(S.debloatRows.find((r) => r.pkg === S.dbAsk)?.label ?? S.dbAsk ?? '');
  const offNow = $derived(!!S.dbAsk && S.dbDisabled.includes(S.dbAsk));
  /**
   * WHAT STOPS IF I SWITCH THIS OFF (Jim, 29/9 — the study found this is the column the other
   * tool sells as PRO). The row says the CONSEQUENCE, never a recommendation: `pm disable-user`
   * is undone by the same row, so an honest sentence is enough and an opinion would be too much.
   * A package we do not know says nothing at all — silence beats a guess here.
   */
  const effectKey = { store: 'db_eStore', updates: 'db_eUpdates', voice: 'db_eVoice', cast: 'db_eCast', recos: 'db_eRecos', screensaver: 'db_eScreensaver', tts: 'db_eTts', account: 'db_eAccount', input: 'db_eInput', media: 'db_eMedia', yours: 'db_eYours' } as const;
  const askSafety = $derived(S.debloatRows.find((r) => r.pkg === S.dbAsk)?.safety ?? null);
  function ask(pkg: string) {
    asked = pkg;
    S.askApp(pkg);
  }
  // the question opens: the ring belongs on the answer, not on the row behind the scrim
  $effect(() => {
    if (!S.dbAsk) return;
    queueMicrotask(() => document.querySelector<HTMLElement>('.askcard button')?.focus());
  });
  $effect(() => {
    // wait for the answer AND for the command to finish: the row redraws when the list comes back
    const settled = !S.dbAsk && !S.dbBusy;
    const pkg = asked;
    if (!settled || !pkg) return;
    asked = null;
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-pkg="${CSS.escape(pkg)}"] button`)?.focus());
  });
</script>

<div class="db">
  <div class="head">
    <div>
      <h2 class="h2-ws">{S.t('db_title')}</h2>
      <div class="intro">{S.t('db_body')}</div>
    </div>
    {#if S.dbDoneByUs.length}
      <PillButton kind="outline" size="sm" style="height:42px" disabled={S.dbBusy} onclick={() => S.restoreAllApps()}>{S.t('db_restoreAll', { n: S.dbDoneByUs.length })}</PillButton>
    {/if}
  </div>

  {#if !S.canRiskyTasks}
    <Notice kind="warn">{S.t('db_notHere')}</Notice>
  {:else if !S.device}
    <Notice kind="info">{S.t('wl_noBox')}</Notice>
  {:else}
    <Notice kind="info">{S.t(S.tv ? 'db_noteTv' : 'db_note')}</Notice>
    <!-- data-nav: the filter is part of the page, so the remote has to be able to land on it -->
    <input class="search mono" type="text" data-nav bind:value={q} placeholder={S.t('db_search')} spellcheck="false" />

    {#snippet group(title: string, list: typeof rows)}
      {#if list.length}
        <div class="eyebrow">{title} · {list.length}</div>
        <div class="list">
          {#each list as r (r.pkg)}
            <div class="row" class:off={r.disabled} data-pkg={r.pkg}>
              <span class="who">
                <b>{r.label}</b>
                {#if r.label !== r.pkg}<span class="mono pkg">{r.pkg}</span>{/if}
              </span>
              {#if r.safety}
                <span class="saf {r.safety.level}" title={r.safety.effect ? S.t(effectKey[r.safety.effect]) : ''}>
                  {S.t(r.safety.level === 'safe' ? 'db_safe' : r.safety.level === 'keep' ? 'db_keep' : 'db_care')}
                  {#if r.safety.effect}<span class="eff ellipsis">{S.t(effectKey[r.safety.effect])}</span>{/if}
                </span>
              {/if}
              <span class="state">{r.disabled ? S.t('db_stateOff') : S.t('db_stateOn')}</span>
              {#if r.disabled}
                <PillButton kind="outline" size="sm" style="height:36px" disabled={S.dbBusy} onclick={() => (S.tv ? ask(r.pkg) : S.toggleApp(r.pkg))}>{S.t('db_on')}</PillButton>
              {:else if S.dbArmed === r.pkg && !S.tv}
                <PillButton kind="danger" size="sm" style="height:36px" disabled={S.dbBusy} onclick={() => S.toggleApp(r.pkg)}>{S.t('db_sure')}</PillButton>
              {:else}
                <PillButton kind="ghost" size="sm" style="height:36px" disabled={S.dbBusy} onclick={() => (S.tv ? ask(r.pkg) : S.toggleApp(r.pkg))}>{S.t('db_off')}</PillButton>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/snippet}

    {#if !rows.length}
      <div class="dim" style="padding:10px 4px">{S.t('db_none')}</div>
    {/if}
    {@render group(S.t('db_other'), other)}
    {@render group(S.t('db_sys'), sys)}
  {/if}
</div>

{#if S.dbAsk}
  <!-- The question, on a television: Yes is the first thing the ring lands on, No is one press away,
       and BACK closes it. Nothing happens until one of the two is pressed. -->
  <div class="askscrim">
    <div class="askcard" role="dialog" aria-modal="true">
      <b class="asktitle">{S.t(offNow ? 'db_askOn' : 'db_askOff', { app: label })}</b>
      <span class="askpkg mono">{S.dbAsk}</span>
      {#if !offNow && askSafety?.effect}
        <!-- the consequence, said again where the answer is given: on a television the row
             behind the scrim cannot be read any more -->
        <span class="asksub">{S.t(effectKey[askSafety.effect])}</span>
      {/if}
      <div class="askrow">
        <PillButton kind={offNow ? 'outline' : 'danger'} size="sm" style="height:44px;min-width:150px" onclick={() => void S.confirmAsk()}>{S.t(offNow ? 'db_on' : 'db_off')}</PillButton>
        <PillButton kind="ghost" size="sm" style="height:44px;min-width:120px" onclick={() => S.closeAsk()}>{S.t('cancel')}</PillButton>
      </div>
    </div>
  </div>
{/if}

<style>
  /* the judgement, in the row: green when nothing depends on it, amber with the sentence that
     says what stops, red for the few that the television itself needs. */
  .saf { display: flex; align-items: center; gap: 8px; min-width: 0; max-width: 340px; font: 700 11px var(--font-display); letter-spacing: .4px; padding: 4px 10px; border-radius: 999px; }
  .saf.safe { background: rgba(16,185,129,.14); color: #34d399; }
  .saf.care { background: rgba(255,193,7,.14); color: var(--wiz-gold-light); }
  .saf.keep { background: rgba(240,82,82,.14); color: var(--danger-alt); }
  .saf .eff { font: 400 11.5px var(--font-body, inherit); letter-spacing: 0; opacity: .85; }
  /* the television's question: over the page, dimmed behind, nothing else reachable */
  .askscrim { position: absolute; inset: 0; z-index: 70; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(3,6,12,.78); }
  .askcard { width: 100%; max-width: 520px; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px 22px 20px; border-radius: 22px; background: rgba(20,28,46,.96); border: 1px solid rgba(120,160,255,.18); box-shadow: 0 24px 60px rgba(0,0,0,.5); text-align: center; }
  .asktitle { font: 700 20px var(--font-display); color: #fff; text-wrap: pretty; }
  .asksub { font-size: 13px; line-height: 1.45; color: rgba(255,255,255,.72); text-wrap: pretty; }
  .askpkg { font-size: 12.5px; color: rgba(255,255,255,.55); }
  .askrow { display: flex; gap: 12px; margin-top: 10px; flex-wrap: wrap; justify-content: center; }

  .db { display: flex; flex-direction: column; gap: 14px; max-width: 980px; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
  .intro { margin-top: 6px; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.65); text-wrap: pretty; max-width: 640px; }
  .search { height: 44px; padding: 0 16px; border-radius: 12px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.14); color: #fff; font-size: 14px; outline: none; }
  .search:focus { border-color: var(--wiz-gold); }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .row { display: grid; grid-template-columns: 1fr 110px auto; align-items: center; gap: 14px; padding: 10px 14px; border-radius: 12px; background: var(--row-bg); border: 1px solid var(--row-border); }
  .row.off { opacity: .6; }
  .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .who b { font-weight: 600; font-size: 14px; }
  .pkg { font-size: 11px; color: rgba(255,255,255,.5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .state { font-size: 12px; color: rgba(255,255,255,.55); letter-spacing: 1px; text-transform: uppercase; }
  .eyebrow { margin-top: 8px; }
</style>
