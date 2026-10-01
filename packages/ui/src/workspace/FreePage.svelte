<script lang="ts">
  // WS Free space — the 8 GB box, which is most of them.
  //
  // Two things, kept apart on purpose because they are not equally reversible:
  //   · `pm trim-caches` takes back room nobody owns. Android rebuilds a cache when it needs one,
  //     so this is a button, not a question.
  //   · `pm clear <pkg>` throws away that app's logins, settings and downloads. That is a question,
  //     with the app's name inside it — and on a television it is the same small dialog the Debloat
  //     page uses, so the ring comes back to the row that was answered.
  import { untrack } from 'svelte';
  import { getSession } from '../context.js';
  import Notice from '../components/Notice.svelte';
  import PillButton from '../components/PillButton.svelte';
  const S = getSession();
  let free = $state<string | null>(null);
  $effect(() => {
    const ready = !!S.device;
    untrack(() => {
      if (ready) void S.readFree().then((v) => (free = v));
    });
  });
  // after a trim or a clear the number on screen must be the new one
  $effect(() => {
    const after = S.freeAfter;
    untrack(() => {
      if (after) free = after;
    });
  });
  /** Only apps a person installed: clearing a vendor service's data helps nobody. */
  const apps = $derived(S.debloatRows.filter((r) => !r.system && !r.disabled));
  const askLabel = $derived(S.debloatRows.find((r) => r.pkg === S.freeAsk)?.label ?? S.freeAsk ?? '');
  let card: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (S.freeAsk && card) card.querySelector<HTMLElement>('button')?.focus();
  });
</script>

<div class="fr">
  <div>
    <h2 class="h2-ws">{S.t('fr_title')}</h2>
    <div class="intro">{S.t('fr_body')}</div>
  </div>

  {#if !S.device}
    <Notice kind="info">{S.t('wl_noBox')}</Notice>
  {:else}
    <div class="state">
      <span class="dim">{S.t('fr_now')}</span>
      <b>{free ?? S.t('sp_reading')}</b>
      {#if S.freeBefore && S.freeAfter && S.freeBefore !== S.freeAfter}
        <span class="dim">({S.t('fr_before')} {S.freeBefore} · {S.t('fr_after')} {S.freeAfter})</span>
      {/if}
    </div>

    <div class="block">
      <b class="sh">{S.t('fr_trim')}</b>
      <span class="dim">{S.t('fr_trimD')}</span>
      <PillButton onclick={() => S.trimCaches()} disabled={S.freeBusy}>{S.t('fr_trim')}</PillButton>
    </div>

    <div class="block">
      <b class="sh">{S.t('fr_apps')}</b>
      <span class="dim">{S.t('fr_appsD')}</span>
      <div class="rows">
        {#each apps as a (a.pkg)}
          <div class="row" data-pkg={a.pkg}>
            <span class="nm ellipsis">{a.label}</span>
            <span class="dim mono pk ellipsis">{a.pkg}</span>
            <PillButton kind="outline" size="sm" style="height:36px" disabled={S.freeBusy} onclick={() => S.askClear(a.pkg)}>{S.t('fr_clear')}</PillButton>
          </div>
        {/each}
        {#if !apps.length}<div class="dim" style="padding:12px 18px">{S.t('db_none')}</div>{/if}
      </div>
    </div>
  {/if}
</div>

{#if S.freeAsk}
  <div class="askscrim">
    <div class="askcard" role="dialog" aria-modal="true" bind:this={card}>
      <b class="ttl">{S.t('fr_ask', { app: askLabel })}</b>
      <span class="sub">{S.t('fr_askD')}</span>
      <div class="askbtns">
        <PillButton onclick={() => S.clearApp(S.freeAsk ?? '')}>{S.t('fr_clear')}</PillButton>
        <PillButton kind="ghost" onclick={() => S.askClear(null)}>{S.t('cancel')}</PillButton>
      </div>
    </div>
  </div>
{/if}

<style>
  .fr { display: flex; flex-direction: column; gap: 20px; max-width: 900px; }
  .intro { margin-top: 6px; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.65); text-wrap: pretty; max-width: 640px; }
  .state { display: flex; align-items: center; gap: 10px; font-size: 14px; flex-wrap: wrap; }
  .block { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .sh { font: 600 15px var(--font-display); }
  .rows { align-self: stretch; display: flex; flex-direction: column; border: 1px solid rgba(255,255,255,.12); border-radius: 16px; overflow: hidden; margin-top: 6px; max-height: 320px; overflow-y: auto; }
  .row { display: flex; align-items: center; gap: 14px; padding: 10px 18px; font-size: 14px; }
  .row + .row { border-top: 1px solid rgba(255,255,255,.08); }
  .nm { flex: 1; min-width: 0; font-weight: 600; }
  .pk { flex: 1; min-width: 0; font-size: 12px; }
  .askscrim { position: absolute; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(3,6,12,.72); }
  .askcard { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 10px; padding: 22px; border-radius: 20px; background: rgba(20,28,46,.97); border: 1px solid rgba(120,160,255,.18); box-shadow: 0 24px 60px rgba(0,0,0,.5); }
  .ttl { font: 700 18px var(--font-display); }
  .sub { font-size: 13.5px; line-height: 1.5; color: rgba(255,255,255,.7); }
  .askbtns { display: flex; gap: 12px; margin-top: 6px; }
</style>
