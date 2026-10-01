<script lang="ts">
  // WS Back up the apps — read every app off this box, so the next box can have the same ones.
  //
  // Neither of the two tools in docs/COMPETITOR_TASKS_STUDY.md does this on the television side, and
  // it is the job a reseller or a hotel spends a day on: twelve boxes, the same twelve apps, and a
  // Play account that will not sign in on nine of them.
  //
  // What it is, exactly: `pm path` says where an app's APK lives, the sync service reads it, and the
  // file lands here as a download. Putting it back is the "Install my APK" page fed the same files —
  // so the two tiles together are the whole round trip, and neither of them invents a format.
  //
  // What it is NOT: it does not copy an app's DATA. Logins, saves and settings live in `/data/data`,
  // which no ADB connection may read without root, and a page that pretended otherwise would be
  // lying to the person who needs it most.
  import { untrack } from 'svelte';
  import { getSession } from '../context.js';
  import Notice from '../components/Notice.svelte';
  import PillButton from '../components/PillButton.svelte';
  const S = getSession();
  $effect(() => {
    const ready = !!S.device && S.debloatRows.length > 0;
    untrack(() => {
      if (ready && !S.backupRows.length) void S.loadBackupRows();
    });
  });
  const mb = (n: number | undefined) => (n ? `${(n / 1024 / 1024).toFixed(1)} MB` : '');
  const doneN = $derived(S.backupRows.filter((r) => r.blob).length);
</script>

<div class="bk">
  <div>
    <h2 class="h2-ws">{S.t('bk_title')}</h2>
    <div class="intro">{S.t('bk_body')}</div>
  </div>

  {#if !S.device}
    <Notice kind="info">{S.t('wl_noBox')}</Notice>
  {:else if !S.canBackup}
    <!-- the bridge (web page ↔ desktop helper) has no sync channel yet: say so, do not pretend -->
    <Notice kind="warn">{S.t('bk_noPull')}</Notice>
  {:else}
    <div class="acts">
      <PillButton onclick={() => S.backupAll()} disabled={S.backupBusy || !S.backupRows.length}>
        {S.backupBusy ? S.t('bk_reading') : S.t('bk_all', { n: S.backupRows.length })}
      </PillButton>
      {#if doneN}<span class="dim">{S.t('bk_done', { n: doneN })}</span>{/if}
    </div>

    <div class="rows">
      {#each S.backupRows as r (r.pkg)}
        <div class="row">
          <span class="nm ellipsis">{r.label}</span>
          <span class="dim mono pk ellipsis">{r.pkg}</span>
          {#if r.err}
            <span class="err ellipsis">{r.err}</span>
          {:else if r.blob}
            <span class="dim">{mb(r.size)}</span>
            <a class="btn btn-outline sm tvlm-focus" style="height:36px;display:inline-flex;align-items:center" href={r.blob} download="{r.pkg}.apk" data-nav>{S.t('bk_save')}</a>
          {:else}
            <PillButton kind="ghost" size="sm" style="height:36px" disabled={S.backupBusy} onclick={() => S.backupApp(r.pkg)}>{r.busy ? S.t('bk_reading') : S.t('bk_one')}</PillButton>
          {/if}
        </div>
        {#if r.extra?.length}
          <div class="splits">
            {#each r.extra as x (x.url)}
              <a class="split mono tvlm-focus" href={x.url} download={x.name} data-nav>{x.name}</a>
            {/each}
          </div>
        {/if}
      {/each}
      {#if !S.backupRows.length}<div class="dim" style="padding:14px 18px">{S.t('db_none')}</div>{/if}
    </div>

    <Notice kind="info">{S.t('bk_note')}</Notice>
  {/if}
</div>

<style>
  .bk { display: flex; flex-direction: column; gap: 18px; max-width: 900px; }
  .intro { margin-top: 6px; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.65); text-wrap: pretty; max-width: 640px; }
  .acts { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .rows { display: flex; flex-direction: column; border: 1px solid rgba(255,255,255,.12); border-radius: 16px; overflow: hidden; max-height: 380px; overflow-y: auto; }
  .row { display: flex; align-items: center; gap: 14px; padding: 10px 18px; font-size: 14px; }
  .row + .row { border-top: 1px solid rgba(255,255,255,.08); }
  .nm { flex: 1; min-width: 0; font-weight: 600; }
  .pk { flex: 1; min-width: 0; font-size: 12px; }
  .err { color: var(--danger-alt); font-size: 12.5px; max-width: 320px; }
  /* an app that ships as base + splits: the extra files hang under its row, named as they are */
  .splits { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 18px 10px 18px; }
  .split { font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18); color: rgba(255,255,255,.8); }
</style>
