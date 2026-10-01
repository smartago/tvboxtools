<script lang="ts">
  // WS Command console — the "free ADB commands" tile (docs/TASKS_HUB_PLAN.md, tile c).
  //
  // One input, one gate. Every line typed here goes through the same classifyCommand as the
  // wizard's own steps: reads run on their own, changes are shown and need a Run, the short
  // blocked list never runs. The verdict is shown BEFORE the press, under the input, so nobody
  // types a wipe to find out. The output lands in the dock below, like everything else.
  import { classifyCommand } from '@tvlm/core';
  import { getSession } from '../context.js';
  import PillButton from '../components/PillButton.svelte';
  const S = getSession();
  let raw = $state('');
  const verdict = $derived(raw.trim() ? classifyCommand(raw) : null);
  // What people actually go looking for when they want to send ADB to a TV box (έρευνα 28/9: XDA,
  // technastic, adb cheat sheets). Ordered from the ones that only LOOK to the ones that change
  // something — the gate says which is which under the field, before any press.
  // Nothing from the blocked list is offered here, and no pipes: the box's shell is not a desktop.
  const examples = [
    // look
    'getprop ro.product.model',
    'getprop ro.build.version.release',
    'cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME',
    'pm list packages -3',
    'pm list packages -d',
    'dumpsys battery',
    'df /data',
    'wm size',
    'settings get global window_animation_scale',
    // change
    'settings put global window_animation_scale 0.5',
    'pm disable-user --user 0 com.google.android.tvlauncher',
    'pm enable com.google.android.tvlauncher',
    'cmd package set-home-activity com.google.android.tvlauncher/.MainActivity',
    'input keyevent KEYCODE_HOME',
    'reboot',
  ];
  function send() {
    const c = raw.trim();
    if (!c || !S.device) return;
    raw = '';
    void S.runRaw(c);
  }
  let runWrap: HTMLSpanElement | undefined = $state();
  function key(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!S.tv) {
      // keyboard in hand: Enter is the press
      send();
      return;
    }
    // TELEVISION: the keyboard's ✓/→ key means "I have finished typing", not "run it" (Jim, 28/9).
    // It closes the keyboard and hands the ring to Run, so the last press on a command that changes
    // the box is still a deliberate one, made while looking at the gate's verdict.
    field?.blur();
    queueMicrotask(() => runWrap?.querySelector('button')?.focus());
  }
  // A remote is a slow keyboard, so the command usually arrives from somewhere else: written on a
  // phone at sendtotvquick.com, sent to this set, and pasted here with one press (Jim, 28/9).
  let pasteFailed = $state(false);
  let field: HTMLInputElement | undefined = $state();
  /**
   * A ready command is a STARTING POINT, not an answer: half of them carry a package name or a
   * number someone will want to change. So the press fills the field and gives it the focus, with
   * the caret at the end — on a television that also opens the keyboard, which is the only way to
   * edit there (Jim, 28/9).
   */
  function useExample(cmd: string) {
    raw = cmd;
    pasteFailed = false;
    queueMicrotask(() => {
      field?.focus();
      const n = field?.value.length ?? 0;
      field?.setSelectionRange(n, n);
    });
  }
  async function paste() {
    const text = await S.paste();
    pasteFailed = !text;
    if (text) raw = text.replace(/^\s*adb\s+shell\s+/i, '');
  }
  /**
   * COMPLETION (what the incumbent added in its v1.12, and what a remote needs most): while the
   * line is being written, offer what it is most likely to become — a package name from THIS box
   * when the token being typed looks like one, otherwise a command already used or offered. Chips,
   * not a dropdown: a dropdown cannot be reached with a d-pad.
   */
  const suggestions = $derived.by(() => {
    const line = raw.trim();
    if (!line || !S.device) return [];
    const parts = line.split(' ');
    const last = parts[parts.length - 1] ?? '';
    const head = parts.slice(0, -1).join(' ');
    if (parts.length > 1 && last.length >= 2 && /^[a-z]/.test(last)) {
      const pkgs = S.knownPackages.filter((p) => p.includes(last)).slice(0, 6);
      if (pkgs.length) return pkgs.map((p) => `${head} ${p}`);
    }
    return [...S.cmdHistory, ...examples].filter((c, i, all) => c.startsWith(line) && c !== line && all.indexOf(c) === i).slice(0, 6);
  });
  const vColor = (v: string) => (v === 'blocked' ? 'var(--danger-alt)' : v === 'confirm' ? 'var(--warning)' : 'var(--success)');
</script>

<div class="cs">
  <div>
    <h2 class="h2-ws">{S.t('cs_title')}</h2>
    <div class="intro">{S.t('cs_body')}</div>
  </div>

  <div class="entry" class:off={!S.device}>
    <span class="mono prompt">adb shell</span>
    <!-- data-nav: without it the ↑↓ walk skipped the field entirely and on a television there was
         no way to reach it at all (Jim, 28/9: «εδώ δεν μπορώ να πάω να γράψω cmd») -->
    <input class="mono" type="text" data-nav bind:this={field} bind:value={raw} placeholder={S.t('cs_ph')} spellcheck="false" autocomplete="off" onkeydown={key} disabled={!S.device} />
    <!-- TV ONLY (Jim, 28/9: «σε tv όχι mobiles»). Σε κινητό και σε desktop υπάρχει πληκτρολόγιο και
         η επικόλληση γίνεται με τον τρόπο της πλατφόρμας· εδώ είναι ο μόνος τρόπος. -->
    {#if S.tv && S.canPaste}
      <button type="button" class="btn btn-ghost sm" data-nav onclick={paste} disabled={!S.device}>{S.t('cs_paste')}</button>
    {/if}
    <span class="runwrap" bind:this={runWrap}>
      <PillButton size="sm" style="height:44px;padding:0 22px" disabled={!S.device || !raw.trim() || verdict?.verdict === 'blocked'} onclick={send}>{S.t('cs_run')} »</PillButton>
    </span>
  </div>
  {#if suggestions.length}
    <div class="chips sug">
      {#each suggestions as s (s)}
        <button type="button" class="chip mono tvlm-focus" data-nav onclick={() => useExample(s)}>{s}</button>
      {/each}
    </div>
  {/if}
  <div class="verdict">
    {#if !S.device}
      <span class="dim">{S.t('wl_noBox')}</span>
    {:else if verdict}
      <i class="base-icon {verdict.verdict === 'blocked' ? 'bi-x' : verdict.verdict === 'confirm' ? 'bi-warning-fill' : 'bi-check-circle-fill'}" style:color={vColor(verdict.verdict)}></i>
      <span style:color={vColor(verdict.verdict)}>{S.t(verdict.verdict === 'blocked' ? 'cs_gateBlocked' : verdict.verdict === 'confirm' ? 'cs_gateConfirm' : 'cs_gateAuto')}</span>
      <span class="dim mono" style="font-size:12px">· {verdict.reason}</span>
    {:else}
      <span class="dim">{S.t('cs_gateHint')}</span>
    {/if}
  </div>

  {#if S.tv}
    <!-- the way in, on the face that has no keyboard -->
    <div class="stv"><i class="base-icon bi-solid-arrow-right"></i><span>{S.t('cs_stv')}</span></div>
  {/if}

  {#if S.cmdHistory.length}
    <div class="ex">
      <div class="eyebrow">{S.t('cs_recent')}</div>
      <div class="chips">
        {#each S.cmdHistory as h (h)}
          <button type="button" class="chip mono tvlm-focus" data-nav onclick={() => useExample(h)}>{h}</button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="ex">
    <div class="eyebrow">{S.t('cs_examples')}</div>
    <div class="chips">
      {#each examples as e (e)}
        <button type="button" class="chip mono tvlm-focus" data-nav onclick={() => useExample(e)}>{e}</button>
      {/each}
    </div>
  </div>
</div>

<style>
  .cs { display: flex; flex-direction: column; gap: 18px; max-width: 900px; }
  .intro { margin-top: 6px; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.65); text-wrap: pretty; }
  .entry { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 16px; border-radius: 14px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.14); }
  .entry.off { opacity: .55; }
  .prompt { color: var(--wiz-teal-soft); font-size: 13px; white-space: nowrap; }
  input { flex: 1; min-width: 0; height: 44px; background: transparent; border: none; color: #fff; font-size: 14px; outline: none; }
  input::placeholder { color: rgba(255,255,255,.35); }
  .runwrap { display: inline-flex; flex: none; }
  .verdict { display: flex; align-items: center; gap: 8px; min-height: 20px; font-size: 13px; padding: 0 6px; }
  .verdict i { font-size: 14px; }
  .stv { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px; background: rgba(0,161,169,.12); border: 1px solid rgba(0,161,169,.35); font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.85); }
  .stv i { color: var(--wiz-teal-soft); font-size: 14px; margin-top: 3px; flex: none; }
  .ex { margin-top: 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  /* the completions sit right under the line they complete, teal so they read as an offer */
  .sug { margin-top: 0; }
  .sug .chip { border-color: rgba(0,161,169,.45); background: rgba(0,161,169,.12); }
  .chip { font-size: 12px; padding: 7px 12px; border-radius: 999px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.14); color: rgba(255,255,255,.8); }
  .chip:hover { background: rgba(255,255,255,.12); }
</style>
