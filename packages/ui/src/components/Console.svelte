<script lang="ts">
  // The console dock: every report entry (kind cmd/out/ok/warn/err/info). Engine `cmd` entries are shown as
  // `$ adb shell <cmd>` (or `$ adb install …`); UI lines that already start with `$` are shown verbatim.
  // Engine keys (`err_*`) are translated; a maintenance PIN is masked on screen (the report keeps it).
  //
  // On a TELEVISION the dock is ONE line until the operator opens it. The full dock is 150px of 12px
  // monospace, which on a scaled-down TV canvas becomes ~15 device pixels of log at the bottom of the
  // screen: unreadable from the sofa, and it took so much height that the task nav lost its last item.
  // Collapsed it shows the latest line; opened it is taller and set in a size you can actually read.
  import type { ReportEntry } from '@tvlm/core';
  import { getSession } from '../context.js';
  const S = getSession();

  function text(e: ReportEntry): string {
    let s = e.text;
    if (e.kind === 'cmd') {
      if (!s.startsWith('$')) s = s.startsWith('install -r') ? `$ adb ${s}` : `$ adb shell ${s}`;
      s = s.replace(/(--es pin )\S+/, '$1****');
    } else if ((e.kind === 'err' || e.kind === 'warn') && S.i18n.has(s)) s = S.t(s);
    return s;
  }
  const last = $derived(S.consoleLines[0]);
  // One line until it is asked for, on every screen too small to spare 150px: a television (above)
  // and a PHONE, where the dock was eating a fifth of the page and the log was unreadable anyway.
  const compact = $derived(S.tv || S.phone);
  const open = $derived(!compact || S.consoleOpen);
  let box: HTMLDivElement | undefined = $state();
  $effect(() => {
    void S.consoleLines.length;
    if (box) box.scrollTop = 0; // column-reverse: 0 = the bottom
  });
</script>

<div class="dock" class:compact class:tv={S.tv} class:open>
  {#if compact}
    <!-- the whole bar is the control here: one D-pad press (or one tap) opens or closes the log -->
    <button type="button" class="bar as-button" data-nav onclick={() => S.toggleConsole()}>
      <span class="eyebrow" style="font-size:11px">{S.t('console')}</span>
      {#if open}
        <span class="mono dim">adb -s {S.devAddr}</span>
      {:else if last}
        <span class="mono peek {last.kind}">{text(last)}</span>
      {/if}
      <div style="flex:1"></div>
      <span class="toggle">{S.t(open ? 'c_hide' : 'c_show')}</span>
    </button>
  {:else}
    <div class="bar">
      <span class="eyebrow" style="font-size:11px">{S.t('console')}</span>
      <span class="mono dim" style="font-size:11px">adb -s {S.devAddr}</span>
      <div style="flex:1"></div>
      <button type="button" class="clear" onclick={() => S.clearConsole()}>{S.t('clear')}</button>
    </div>
  {/if}

  {#if open}
    <div class="lines" bind:this={box}>
      <div class="inner">
        {#each S.consoleLines as e (e.id)}
          <div class="line {e.kind}">{text(e)}</div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .dock { flex: none; height: 150px; background: rgba(0,0,0,.45); border-top: 1px solid rgba(255,255,255,.1); display: flex; flex-direction: column; }
  .bar { display: flex; align-items: center; gap: 12px; padding: 8px 20px; border-bottom: 1px solid rgba(255,255,255,.06); }
  .clear { background: none; border: none; color: rgba(255,255,255,.5); font-size: 12px; }
  .clear:hover { color: #fff; }
  .lines { flex: 1; overflow: auto; padding: 8px 20px; font: 400 12px/1.6 var(--font-mono); display: flex; flex-direction: column-reverse; }
  .inner { display: flex; flex-direction: column; }
  .line { white-space: pre-wrap; word-break: break-all; color: rgba(255,255,255,.5); }
  .line.cmd { color: rgba(255,255,255,.85); }
  .line.ok { color: var(--success); }
  .line.warn { color: var(--warning); }
  .line.err { color: var(--danger-alt); }

  /* television and phone */
  .dock.compact { height: 52px; }
  .dock.compact.open { height: 320px; }
  .as-button { width: 100%; background: none; border: none; color: inherit; text-align: left; height: 52px; flex: none; }
  .as-button:hover { background: rgba(255,255,255,.05); }
  .peek { font-size: 14px; color: rgba(255,255,255,.65); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 62%; }
  .peek.ok { color: var(--success); }
  .peek.warn { color: var(--warning); }
  .peek.err { color: var(--danger-alt); }
  .toggle { font-size: 13px; font-weight: 600; color: var(--wiz-gold-light); white-space: nowrap; }
  .dock.tv .mono.dim { font-size: 13px; }
  .dock.tv .lines { font-size: 17px; line-height: 1.55; padding: 10px 20px 14px; }
</style>
