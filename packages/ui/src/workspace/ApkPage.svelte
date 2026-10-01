<script lang="ts">
  // WS Install my APK — a file from this computer, straight onto the box.
  //
  // The tile the catalogue has carried since 23/9 (TASKS_HUB_PLAN §4) and the one every sideloader
  // opens a tool for. It is in RISKY_TASKS, so a copy that came from Google Play does not draw it at
  // all — the exe, the web page and the sideload APK do.
  //
  // The bytes go the same way a manifest app's do: `pm install -r -S <size>` streamed over the same
  // socket, no file ever written to the box's disk first. There is no digest to compare against,
  // because the file is the person's own — the report records what was sent, and that is the honest
  // thing to promise.
  import { getSession } from '../context.js';
  import Notice from '../components/Notice.svelte';
  import PillButton from '../components/PillButton.svelte';
  const S = getSession();
  let input: HTMLInputElement | undefined = $state();
  let over = $state(false);
  const sizeOf = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
  const label: Record<string, 'ap_wait' | 'ap_ing' | 'ap_ok' | 'ap_err'> = { wait: 'ap_wait', ver: 'ap_ing', ing: 'ap_ing', ok: 'ap_ok', err: 'ap_err' };
  const color = (st: string) => (st === 'ok' ? 'var(--success)' : st === 'err' ? 'var(--danger-alt)' : st === 'ing' ? 'var(--wiz-gold-light)' : 'rgba(255,255,255,.5)');
  function take(list: FileList | null) {
    if (list) S.addApks([...list]);
  }
</script>

<div class="ap">
  <div>
    <h2 class="h2-ws">{S.t('ap_title')}</h2>
    <div class="intro">{S.t('ap_body')}</div>
  </div>

  {#if !S.device}
    <Notice kind="info">{S.t('wl_noBox')}</Notice>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="drop"
      class:over
      ondragover={(e) => {
        e.preventDefault();
        over = true;
      }}
      ondragleave={() => (over = false)}
      ondrop={(e) => {
        e.preventDefault();
        over = false;
        take(e.dataTransfer?.files ?? null);
      }}
    >
      <input bind:this={input} type="file" accept=".apk,application/vnd.android.package-archive" multiple hidden onchange={(e) => take(e.currentTarget.files)} />
      <PillButton onclick={() => input?.click()} disabled={S.apkBusy}>{S.t('ap_pick')}</PillButton>
      <span class="dim">{S.t('ap_drop')}</span>
    </div>

    {#if S.apkQueue.length}
      <div class="rows">
        {#each S.apkQueue as q, i (q.name + i)}
          <div class="row">
            <i class="plui-icon pi-cat-others" style:color={color(q.status)}></i>
            <span class="nm ellipsis">{q.name}</span>
            <span class="dim">{sizeOf(q.size)}</span>
            <span class="st" style:color={color(q.status)}>{S.t(label[q.status] ?? 'ap_wait')}</span>
          </div>
          {#if q.msg && q.status === 'err'}<div class="msg mono">{q.msg}</div>{/if}
        {/each}
      </div>
      <div class="acts">
        <PillButton onclick={() => S.installApks()} disabled={S.apkBusy}>{S.apkBusy ? S.t('ap_installing') : S.t('ap_install', { n: S.apkQueue.length })}</PillButton>
        <PillButton kind="ghost" onclick={() => S.clearApks()} disabled={S.apkBusy}>{S.t('ap_clear')}</PillButton>
      </div>
    {:else}
      <div class="dim">{S.t('ap_empty')}</div>
    {/if}

    <Notice kind="info">{S.t('ap_note')}</Notice>
  {/if}
</div>

<style>
  .ap { display: flex; flex-direction: column; gap: 18px; max-width: 900px; }
  .intro { margin-top: 6px; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.65); text-wrap: pretty; max-width: 640px; }
  .drop { display: flex; align-items: center; gap: 16px; padding: 22px; border-radius: 16px; border: 1px dashed rgba(255,255,255,.28); background: rgba(255,255,255,.03); }
  .drop.over { border-color: var(--wiz-teal); background: rgba(0,161,169,.1); }
  .rows { display: flex; flex-direction: column; border: 1px solid rgba(255,255,255,.12); border-radius: 16px; overflow: hidden; }
  .row { display: flex; align-items: center; gap: 12px; padding: 12px 18px; font-size: 14px; }
  .row + .row { border-top: 1px solid rgba(255,255,255,.08); }
  .nm { flex: 1; min-width: 0; font-weight: 600; }
  .st { font: 700 12px var(--font-display); letter-spacing: .5px; }
  .msg { padding: 0 18px 12px; font-size: 12px; color: var(--danger-alt); }
  .acts { display: flex; gap: 12px; flex-wrap: wrap; }
</style>
