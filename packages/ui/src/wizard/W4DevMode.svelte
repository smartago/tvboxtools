<script lang="ts">
  // W4 Developer mode: the path per brand (Settings › … › Build × 7) + the animated TV mock (placeholder, Ζ7).
  import { getSession } from '../context.js';
  import { devPath, devScreen } from './devmode.js';
  import TvMock from '../components/TvMock.svelte';
  import Notice from '../components/Notice.svelte';
  import ClipPlayer from '../components/ClipPlayer.svelte';
  import { clipFor } from '../videos.js';
  const S = getSession();
  // THE BOX IS THIS TELEVISION (Session.selfTarget). Same screen, same film — and under the film the
  // buttons that open the set's own menus, because here the tool can do the walking (Jim, 28/9: "αν
  // είναι tv τότε βάζουμε κάτω από το video τα button"). The wizard also READS this set's switches,
  // so the line under the buttons says where it stands instead of asking to be believed.
  const dbg = $derived(S.selfInfo?.wirelessAdb ? S.t('ws_dbgW') : S.t('ws_dbgU'));
  const scr = $derived(devScreen(S.box, S.anim));
  // Our own recording of this box doing it. Where we have one it REPLACES the mock — a real menu
  // beats a drawing of one — and where we do not, the mock carries on as before.
  // Android TV when nobody has been asked and the box has not answered yet: the same fallback
  // `devPath` and `devScreen` already make, so the film plays instead of the placeholder drawing.
  const clip = $derived(clipFor('devmode', S.box ?? 'androidtv'));
  const path = $derived(devPath(S.box));
  // The list walks itself: one step lit at a time, in order, two seconds each, round and round
  // (Jim, 23/9). Its own clock — the mock and the film have theirs, and this is a reading order,
  // not a report of what is on the screen beside it.
  let lit = $state(0);
  $effect(() => {
    const id = setInterval(() => (lit = (lit + 1) % path.length), 2000);
    return () => clearInterval(id);
  });
</script>

<div class="screen w4">
  <div class="left">
    <h2 class="h2">{S.t('w4_title')}</h2>
    <p class="lead">{S.t('w4_body')}</p>
    <ol class="path">
      {#each path as p, i (p.n)}
        <li class:active={i === lit}>
          <span class="n">{p.n}</span>
          <span class="lbl">{p.label}
            <!-- The last press is the one people get wrong: seven times on the SAME line, and the
                 television counts down at you until it says you are a developer (Jim, 23/9). -->
            {#if p.n === path.length}<span class="sub">{S.t('w4_taps')}</span>{/if}
          </span>
        </li>
      {/each}
    </ol>
    <div style="margin-top:18px"><Notice kind="info" center>{S.t('w4_hint')}</Notice></div>
  </div>
  <div class="right">
    {#if clip}
      <!-- the real menus of this box, filmed on it: the mock was always a placeholder for this -->
      <ClipPlayer {clip} />
    {:else}
    <TvMock>
      <div class="settings">
        <div class="stitle">{scr.title}</div>
        <div class="rows">
          {#each scr.rows as row (row.label)}
            <div class="row" class:hi={row.hi} class:tap={row.tapping}>
              <span class="rl"><span class="ellipsis">{row.label}</span>{#if row.sub}<span class="sub ellipsis">{row.sub}</span>{/if}</span>
              {#if row.chev}<span class="chev">›</span>{/if}
            </div>
          {/each}
        </div>
      </div>
      {#if scr.toast}<div class="toast">{scr.toast}</div>{/if}
      {#if scr.tapping}
        <div class="tapbar">
          <span class="ok tvlm-pulse">OK</span>
          <span class="dots">{#each [0, 1, 2, 3, 4, 5, 6] as i (i)}<span class="dot" class:on={i < scr.taps}></span>{/each}</span>
          <span class="tapt">{S.t('w4_tap')}</span>
        </div>
      {/if}
    </TvMock>
    {/if}
    <!-- the apology only belongs under the drawing, never under a real recording -->
    {#if !clip}<div class="ph">{S.t('w4_ph')}</div>{/if}

    {#if S.selfTarget}
      <!-- ΜΙΑ ΓΡΑΜΜΗ: κουμπιά και κατάσταση μαζί (Jim, 30/9). Χωριστά, η κατάσταση ήταν μια δεύτερη
           πλατιά μπάρα κάτω από τρία κουμπιά και έσπρωχνε τη σελίδα· είναι η απάντηση στα κουμπιά,
           όχι δικό της θέμα. -->
      <div class="selfrow">
      <div class="selfacts">
        <button type="button" class="btn {S.selfDev ? 'btn-outline' : 'btn-gold'} sm" data-nav onclick={() => S.openSelfSettings('about')}>
          <i class="base-icon bi-solid-arrow-right"></i>&nbsp; {S.t('ws_about')}
        </button>
        <button type="button" class="btn {S.selfDebugOn ? 'btn-outline' : 'btn-gold'} sm" data-nav onclick={() => S.openSelfSettings('dev')}>
          <i class="base-icon bi-solid-arrow-right"></i>&nbsp; {S.t('ws_dev')}
        </button>
        <button type="button" class="btn btn-ghost sm" data-nav onclick={() => S.openSelfSettings('wifi')}>{S.t('ws_wifi')}</button>
      </div>
      <div class="selfstate">
        {#if S.settingsFailed}
          <Notice kind="warn">{S.t('ws_noOpen')}</Notice>
        {:else if !S.selfInfo}
          <Notice kind="info">{S.t('ws_noRead')}</Notice>
        {:else if S.selfBlocked}
          <Notice kind="gold">{S.t('ws_hint')}</Notice>
        {:else}
          <Notice kind="ok">{S.t('ws_dbgOn', { m: dbg })}</Notice>
        {/if}
      </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .w4 { display: grid; grid-template-columns: 420px 1fr; gap: 48px; align-content: start; }
  .left { padding-top: 12px; }
  .path { margin: 18px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .path li { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 12px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
  .path li.active { background: rgba(200,144,58,.14); border-color: rgba(200,144,58,.55); }
  .n { width: 26px; height: 26px; border-radius: 13px; display: flex; align-items: center; justify-content: center; font: 700 13px var(--font-display); background: rgba(255,255,255,.1); color: rgba(255,255,255,.7); flex: none; }
  .path li.active .n { background: var(--wiz-gold); color: var(--wiz-gold-text); }
  .lbl { font-size: 16px; display: flex; flex-direction: column; gap: 3px; }
  .lbl .sub { font-size: 13px; line-height: 1.35; color: rgba(255,255,255,.6); text-wrap: pretty; }
  .right { display: flex; flex-direction: column; gap: 10px; align-items: center; }
  /* self road only: the row of doors into this set's own settings, right under the film */
  /* κουμπιά + κατάσταση σε ΜΙΑ γραμμή, με αναδίπλωση όταν δεν χωρά */
  .selfrow { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; margin-top: 4px; width: 100%; }
  .selfacts { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; flex: none; }
  /* παίρνει ό,τι μένει· `min-width:0` για να συρρικνώνεται αντί να σπρώχνει τα κουμπιά έξω */
  .selfstate { flex: 1 1 240px; min-width: 0; max-width: 520px; }
  .settings { position: absolute; top: 0; right: 0; bottom: 0; width: 340px; background: var(--tv-panel); display: flex; flex-direction: column; padding: 20px 0 0; }
  .stitle { font-size: 18px; color: var(--tv-text); padding: 0 28px 12px; }
  .rows { display: flex; flex-direction: column; gap: 2px; padding: 0 14px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 14px; border-radius: 6px; font-size: 13px; color: var(--tv-row); }
  .row.hi { background: var(--tv-text); color: #111; }
  .row.tap { animation: tvs-tap .9s ease-in-out infinite; }
  .rl { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .sub { font-size: 11px; opacity: .6; }
  .chev { opacity: .5; }
  .toast { position: absolute; left: 190px; bottom: 84px; background: var(--tv-text); color: #111; font: 400 13px var(--font-label); padding: 9px 16px; border-radius: 4px; white-space: nowrap; box-shadow: 0 4px 14px rgba(0,0,0,.4); }
  .tapbar { position: absolute; left: 36px; bottom: 30px; display: flex; align-items: center; gap: 10px; background: rgba(0,0,0,.55); border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: 8px 14px 8px 8px; white-space: nowrap; font-family: var(--font-ui); }
  .ok { width: 34px; height: 34px; border-radius: 50%; background: var(--wiz-gold); color: var(--wiz-gold-text); display: flex; align-items: center; justify-content: center; font: 700 12px var(--font-display); }
  .dots { display: flex; gap: 5px; }
  .dot { width: 8px; height: 8px; border-radius: 4px; background: rgba(255,255,255,.25); }
  .dot.on { background: var(--wiz-gold-light); }
  .tapt { font-size: 13px; color: rgba(255,255,255,.85); }
  .ph { font-size: 12px; color: rgba(255,255,255,.45); }
</style>
