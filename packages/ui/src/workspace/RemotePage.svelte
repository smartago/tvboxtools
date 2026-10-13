<script lang="ts">
  // WS Remote — the television's remote, on this screen, plus a way to type on it.
  //
  // Why it exists (docs/COMPETITOR_TASKS_STUDY.md): the Windows tool people actually download has a
  // "remote control emulator" and "send text from the PC", and both answer the same two evenings:
  // the remote is lost / not paired / its pairing broke during a launcher change, and "a remote is a
  // slow keyboard" — the reason we put a Paste button on the console two days ago.
  //
  // `input keyevent` is on the gate's allowlist because it can do nothing a remote could not do, and
  // `input text` types what the person in front of the screen typed. Nothing here needs the box to
  // be ours, and nothing here is remembered.
  import { getSession } from '../context.js';
  import Notice from '../components/Notice.svelte';
  import PillButton from '../components/PillButton.svelte';
  const S = getSession();
  let text = $state('');
  function type() {
    const t = text;
    text = '';
    void S.sendText(t);
  }
</script>

<div class="rm">
  <div>
    <h2 class="h2-ws">{S.t('rm_title')}</h2>
    <div class="intro">{S.t('rm_body')}</div>
  </div>

  {#if !S.device}
    <Notice kind="info">{S.t('wl_noBox')}</Notice>
  {:else}
    <div class="cols">
      <div class="pad">
        <!-- the shape of every TV remote: a ring of arrows around OK, HOME/BACK under it -->
        <button type="button" class="key up tvlm-focus" data-nav onclick={() => S.sendKey('KEYCODE_DPAD_UP')} aria-label={S.t('rm_up')}>▲</button>
        <button type="button" class="key left tvlm-focus" data-nav onclick={() => S.sendKey('KEYCODE_DPAD_LEFT')} aria-label={S.t('rm_left')}>◀</button>
        <button type="button" class="key ok tvlm-focus" data-nav data-primary onclick={() => S.sendKey('KEYCODE_DPAD_CENTER')}>OK</button>
        <button type="button" class="key right tvlm-focus" data-nav onclick={() => S.sendKey('KEYCODE_DPAD_RIGHT')} aria-label={S.t('rm_right')}>▶</button>
        <button type="button" class="key down tvlm-focus" data-nav onclick={() => S.sendKey('KEYCODE_DPAD_DOWN')} aria-label={S.t('rm_down')}>▼</button>
      </div>

      <div class="side">
        <div class="btns">
          <button type="button" class="wide tvlm-focus" data-nav onclick={() => S.sendKey('KEYCODE_HOME')}>{S.t('rm_home')}</button>
          <button type="button" class="wide tvlm-focus" data-nav onclick={() => S.sendKey('KEYCODE_BACK')}>{S.t('rm_back')}</button>
          <button type="button" class="wide tvlm-focus" data-nav onclick={() => S.sendKey('KEYCODE_MENU')}>{S.t('rm_menu')}</button>
          <button type="button" class="wide tvlm-focus" data-nav onclick={() => S.sendKey('KEYCODE_VOLUME_DOWN')}>{S.t('rm_volDown')}</button>
          <button type="button" class="wide tvlm-focus" data-nav onclick={() => S.sendKey('KEYCODE_VOLUME_UP')}>{S.t('rm_volUp')}</button>
          <button type="button" class="wide tvlm-focus" data-nav onclick={() => S.sendKey('KEYCODE_MUTE')}>{S.t('rm_mute')}</button>
        </div>
        <div class="power">
          <!-- wake and sleep, the two the hotel and the shop ask for first -->
          <PillButton kind="ghost" onclick={() => S.sendKey('KEYCODE_WAKEUP')}>{S.t('rm_wake')}</PillButton>
          <PillButton kind="ghost" onclick={() => S.sendKey('KEYCODE_SLEEP')}>{S.t('rm_sleep')}</PillButton>
        </div>
      </div>
    </div>

    <div class="typing">
      <b class="sh">{S.t('rm_type')}</b>
      <span class="dim">{S.t('rm_typeD')}</span>
      <div class="field">
        <input
          class="inp tvlm-focus"
          data-nav
          bind:value={text}
          placeholder={S.t('rm_ph')}
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              type();
            }
          }}
        />
        <PillButton onclick={type} disabled={!text.trim()}>{S.t('rm_send')}</PillButton>
      </div>
    </div>

    <!-- The buttons on the remote ITSELF: this page sends keys, it cannot change what the remote's
         own keys do. That is a different job, and the app that does it is ours. -->
    <div class="ours">
      <span class="ico-circle"><i class="plui-icon pi-bullhorn"></i></span>
      <div class="otxt">
        <b>{S.t('rm_appTitle')}</b>
        <span class="dim">{S.t('rm_appBody')}</span>
        {#if S.remapMsg}<span class="omsg">{S.remapMsg}</span>{/if}
      </div>
      <PillButton kind="ghost" onclick={() => S.openRemap()}>{S.t(S.remapInstalled ? 'rm_appOpen' : 'rm_appGet')}</PillButton>
    </div>

    {#if S.lastKey}<div class="dim mono" style="font-size:12px">input keyevent {S.lastKey}</div>{/if}
  {/if}
</div>

<style>
  .rm { display: flex; flex-direction: column; gap: 20px; max-width: 900px; }
  .intro { margin-top: 6px; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.65); text-wrap: pretty; max-width: 640px; }
  .cols { display: grid; grid-template-columns: 260px 1fr; gap: 28px; align-items: start; }
  .pad { position: relative; width: 240px; height: 240px; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 8px; }
  .key { border-radius: 16px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.16); color: #fff; font: 700 16px var(--font-display); }
  .key:hover { background: rgba(255,255,255,.13); }
  .up { grid-area: 1 / 2; }
  .left { grid-area: 2 / 1; }
  .ok { grid-area: 2 / 2; border-radius: 999px; background: rgba(0,161,169,.22); border-color: rgba(0,161,169,.6); }
  .right { grid-area: 2 / 3; }
  .down { grid-area: 3 / 2; }
  .side { display: flex; flex-direction: column; gap: 14px; }
  .btns { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .wide { padding: 12px 10px; border-radius: 14px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.16); color: #fff; font: 600 13px var(--font-display); }
  .wide:hover { background: rgba(255,255,255,.12); }
  .power { display: flex; gap: 12px; }
  .ours { display: flex; align-items: center; gap: 16px; padding: 16px 18px; border-radius: 16px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.12); }
  .otxt { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
  .omsg { font-size: 12.5px; color: var(--wiz-teal-soft); }
  .typing { display: flex; flex-direction: column; gap: 8px; }
  .sh { font: 600 15px var(--font-display); }
  .field { display: flex; gap: 12px; align-items: center; margin-top: 4px; }
  .inp { flex: 1; min-width: 0; height: 46px; padding: 0 16px; border-radius: 14px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.18); color: #fff; font-size: 15px; }
</style>
