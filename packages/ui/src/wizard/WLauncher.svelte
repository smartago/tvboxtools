<script lang="ts">
  // W9 Launcher — the picker, built to the design package's "Launcher Pick" screen (Jim, 21/9):
  // the same shape as W1 Language, because it asks the same kind of question. Left: what this
  // screen does. Right: the list, and ONE gold action that does the whole thing — fetch it if the
  // box does not have it, set it as HOME, and move on. No second press, no dialog on the TV.
  //
  // The list is the box's (docs/LAUNCHER_PICKER_PLAN.md): what it can already open on HOME, plus
  // the launchers we know by name. Names in our own type, never their logos; icons come from the
  // box itself when it has the app. Nobody else's APK is ever fetched by us — a missing third party
  // opens ITS Play page on the television and the remote does the installing.
  import { getSession } from '../context.js';
  import type { LauncherRow } from '@tvlm/core';
  import Card from '../components/Card.svelte';
  import { ringTo } from '../nav.js';
  import Notice from '../components/Notice.svelte';
  const S = getSession();
  const rows = $derived(S.pickerRows);
  // ΔΥΟ ΟΜΑΔΕΣ, ΟΧΙ ΜΙΑ (Jim, 2/10: «πώς βρέθηκε αυτός εδώ στους popular;»). Η λίστα κουβαλούσε
  // ΚΑΙ τους γνωστούς ΚΑΙ ό,τι ανέφερε το ίδιο το κουτί, κάτω από μία κεφαλίδα «οι πιο δημοφιλείς»
  // — οπότε ο `com.android.launcher` του Amlogic φαινόταν να διαφημίζεται από εμάς. Είναι αληθινή
  // εφαρμογή αρχικής και ανήκει στη λίστα· απλώς δεν είναι δημοφιλής, είναι ΗΔΗ ΕΚΕΙ.
  const popular = $derived(rows.filter((r) => r.kind === 'ours' || r.kind === 'known'));
  const onBox = $derived(rows.filter((r) => r.kind === 'found'));
  const ask = $derived(rows.filter((r) => r.kind === 'ask'));
  const now = $derived(S.currentLauncherRow);
  const cta = $derived(S.launcherCta);
  // The three promises follow the CHOICE, not the brand: only our own app is fetched and checked by
  // us, and the Play edition fetches nothing at all (GENERIC_TOOL_PLAN D1/D3).
  const oursPicked = $derived(S.launcherRow ? !!S.launcherRow.ours : true);
  const ticks = $derived([S.t(oursPicked && S.canDirectInstall ? 'wl_t1' : 'wl_t1p'), S.t('wl_t2'), S.t('wl_t3')]);
  const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase();
  // A shipped icon that is not there yet must not leave a broken image on a television: the row
  // simply goes back to its letter the moment the file fails to load.
  let missing = $state<Record<string, boolean>>({});
</script>

<div class="screen wl">
  <div class="left">
    <div class="eye">{S.t('wl_eyebrow')}</div>
    <h2 class="title">{S.t('wl_title')}</h2>
    <p class="body">{S.t('wl_lead')}</p>
    <div class="ticks">
      {#each ticks as tk (tk)}
        <div class="tick"><span class="tk"><i class="base-icon bi-check"></i></span><span>{tk}</span></div>
      {/each}
    </div>
    <div style="flex:1"></div>
    {#if S.launcherError}
      <div style="margin-bottom:14px"><Notice kind="danger">{S.t('wl_failed')} <span class="mono">{S.launcherError}</span></Notice></div>
    {/if}
    <!-- the way out that changes nothing: the box keeps whatever opens on HOME today -->
    <button type="button" class="keep tvlm-focus" data-nav onclick={() => S.keepCurrentLauncher()}>{S.t('wl_keep')} →</button>
    <!-- …and the way BACK, on a box we already changed: the stock launcher is off, so it is not in
         any list and "Other" has nothing to show. One press puts it back and reads the box again. -->
    {#if S.canRestoreStock}
      <button type="button" class="keep undo tvlm-focus" data-nav disabled={S.launcherBusy} onclick={() => S.restoreStockAndRecheck()}>{S.t('wl_restoreStock')} ↺</button>
    {/if}
  </div>

  <div class="right">
    <!-- One row, one shape, wherever it is drawn: the check badge stays ON, because the gold ring is
         only FOCUS and the button below follows the SELECTION. Without the badge a row under the
         ring looks chosen while the button is talking about another one. -->
    {#snippet row(r: LauncherRow, small: boolean)}
      {@const src = S.launcherArt(r).find((c) => !missing[c])}
      <!-- OK σε launcher = διάλεξε ΚΑΙ ring στο χρυσό κουμπί (Jim, 9/10: «όταν κάνω OK στο Projectivy
           το ring να πάει κάτω στο Συνέχεια»). Ίδιος κανόνας με τη γλώσσα και το κουτί. -->
      <Card sel={S.launcherPick === r.id} padding={small ? '7px 12px' : '10px 14px'} data-nav-right="primary" onpick={() => { S.chooseLauncher(r.id); ringTo('primary'); }}>
        <span class="tile" class:sm={small} class:ask={r.kind === 'ask'} class:img={!!src}>
          {#if src}
            <!-- the box's own icon first; a file we ship only when the box has nothing to show.
                 Keyed by the src, so an icon that arrives later (the box answers asynchronously)
                 is tried again instead of being stuck on the letter. -->
            <img {src} alt="" onerror={() => (missing = { ...missing, [src]: true })} />
          {:else if r.kind === 'ask'}<i class="base-icon bi-caret-down"></i>{:else}{initial(r.name)}{/if}
        </span>
        <span class="txt">
          <b>{r.kind === 'ask' ? S.t('wl_other') : r.name}</b>
          <span class="sub">{r.kind === 'ask' ? S.t('wl_otherD') : r.package}</span>
        </span>
        <span class="state">
          <!-- ΕΦΑΡΜΟΓΗ ΚΙΝΗΤΟΥ (Jim, 3/10): διάλεξε τον `com.android.launcher`, πάτησε HOME, και η
               τηλεόραση του ζήτησε «touch the circle». Το box ξέρει ποιος δηλώνει LEANBACK — δεν
               τον κρύβουμε (είναι αληθινή αρχική οθόνη), αλλά το λέμε ΠΡΙΝ το διαλέξει. -->
          {#if r.tv === false}<span class="tag phone" title={S.t('wl_phoneD')}>{S.t('wl_phone')}</span>{/if}
          <!-- Η ΣΙΩΠΗ ΕΛΕΓΕ ΔΥΟ ΠΡΑΓΜΑΤΑ (Jim, 7/10: «όταν δεν είναι installed μου το λες, αν
               είναι installed δεν το λες»): «είναι εδώ» και «δεν ξέρω». Τώρα η γραμμή απαντά και
               στις δύο περιπτώσεις — και το «εγκατεστημένο» είναι ΚΑΛΟ νέο, γι' αυτό δεν είναι
               σβηστό σαν τα υπόλοιπα: δεν κατεβαίνει τίποτα, το πάτημα είναι ακαριαίο. -->
          {#if r.current}<span class="tag dim">{S.t('wl_current')}</span>
          {:else if r.kind !== 'ask' && !r.installed}<span class="tag dim">{S.t('wl_notInst')}</span>
          {:else if r.stock}<span class="tag dim">{S.t('wl_stock')}</span>
          {:else if r.kind !== 'ask' && r.installed}<span class="tag on">{S.t('wl_inst')}</span>{/if}
        </span>
      </Card>
    {/snippet}

    <!-- What the box opens today: a fact, above the offers and quieter than them. It is still
         selectable — "keep it" is a real answer — but it is not competing for the eye with the
         list, because it is usually the thing the person came here to replace (Jim, 22/9). -->
    {#if now}
      <div class="nowhead">{S.t('wl_now')}</div>
      <div class="now">{@render row(now, true)}</div>
    {/if}

    <!-- ΑΝΑΝΕΩΣΗ (Jim, 3/10: «ούτε refresh μπορώ να κάνω»): το κουτί αλλάζει ΚΑΙ χωρίς εμάς —
         ο χρήστης πατά HOME και διαλέγει μόνος του, μια εφαρμογή φεύγει από την τηλεόραση. Χωρίς
         αυτό η οθόνη έμενε με ό,τι διάβασε μία φορά, στο βήμα 5. -->
    <div class="head">
      <span class="lh">{S.t('wl_listTitle')}</span>
      <button type="button" class="refresh tvlm-focus" data-nav disabled={S.refreshing} onclick={() => void S.refreshCheck()}>
        <i class="base-icon bi-arrow-clockwise" class:tvlm-spin={S.refreshing}></i>{S.t('wl_refresh')}
      </button>
      <span class="hint">{S.t('w1_hint')}</span>
    </div>
    <!-- `data-focus-list`: όσο δεν έχει διαλεγεί launcher, το δαχτυλίδι ανοίγει ΕΔΩ — στην πρώτη
         πρόταση. Χωρίς αυτό έπεφτε στο πρώτο [data-nav] του DOM, που είναι το «κράτα τον τρέχοντα»
         της αριστερής στήλης: η οθόνη ρωτά «ποιος launcher;» και το δαχτυλίδι απαντούσε «κανένας». -->
    <div class="list" data-focus-list>
      {#each popular as r (r.id)}{@render row(r, false)}{/each}
      {#if onBox.length}
        <!-- Υποκεφαλίδα ΜΕΣΑ στην ίδια λίστα: τα βέλη περνούν μόνο από [data-nav], οπότε ένα
             σκέτο div δεν μπαίνει εμπόδιο στη ροή του δαχτυλιδιού. -->
        <div class="sub-h">{S.t('wl_onBox')}</div>
        {#each onBox as r (r.id)}{@render row(r, false)}{/each}
      {/if}
      {#each ask as r (r.id)}{@render row(r, false)}{/each}
    </div>

    {#if S.launcherDone}
      <!-- the verdict, on the screen that did the work; the only way on is back to the menu -->
      <div class="done tvlm-fade">
        <span class="check-badge lg"><i class="base-icon bi-check"></i></span>
        <span class="dtxt"><b>{S.t('wl_doneTitle', { app: S.launcherDone })}</b><span>{S.t('wl_doneBody')}</span></span>
      </div>
      <button type="button" class="cta tvlm-focus" data-nav data-primary data-nav-id="primary" data-nav-down="." onclick={() => S.backToTasks()}>{S.t('wl_backTasks')} &nbsp;»</button>
    {:else if cta}
      <button type="button" class="cta tvlm-focus" class:busy={S.launcherBusy} data-nav data-primary data-nav-id="primary" data-nav-down="." disabled={S.launcherBusy || !!cta.blocked} onclick={() => S.runLauncherCta()} style:--pct="{S.dlPercent >= 0 ? S.dlPercent : 0}%">
        <span class="lbl">{S.launcherBusy ? (S.launcherStage ?? S.t('wl_working')) : cta.label} &nbsp;»</span>
      </button>
      <div class="ctasub" class:warn={!!cta.blocked}>{S.launcherBusy ? S.t('wl_keepOn') : cta.sub}</div>
      <!-- ΕΠΑΝΕΓΚΑΤΑΣΤΑΣΗ (Jim, 3/10): μόλις δει τον ΔΙΚΟ μας εγκατεστημένο, το χρυσό κουμπί λέει
           «Όρισε ως HOME» και δεν υπάρχει πια δρόμος για νεότερο build ή για ένα χαλασμένο APK.
           Δεύτερη, ήσυχη ενέργεια — ποτέ για ξένο launcher. -->
      {#if S.canReinstallOurs && !S.launcherBusy}
        <button type="button" class="again tvlm-focus" data-nav onclick={() => void S.reinstallOurs()}>
          <i class="base-icon bi-arrow-clockwise"></i>{S.t('wl_reinstall')}
        </button>
      {/if}
    {:else}
      <div class="ctasub pick">{S.t('wl_pickFirst')}</div>
    {/if}
  </div>
</div>

<style>
  .wl { display: grid; grid-template-columns: 420px 1fr; gap: 56px; min-height: 0; }
  .left { display: flex; flex-direction: column; padding-top: 14px; min-width: 0; }
  .eye { font: 600 12px var(--font-display); letter-spacing: 3px; color: var(--wiz-gold-light); }
  .title { margin: 12px 0 0; font: 700 36px/1.1 var(--font-display); text-wrap: pretty; }
  .body { margin: 16px 0 0; font-size: 16px; line-height: 1.6; color: rgba(255,255,255,.72); text-wrap: pretty; }
  .ticks { display: flex; flex-direction: column; gap: 12px; margin-top: 26px; }
  .tick { display: flex; align-items: flex-start; gap: 12px; font-size: 14px; line-height: 1.45; color: rgba(255,255,255,.82); }
  .tk { width: 28px; height: 28px; border-radius: 9px; background: rgba(0,161,169,.18); color: var(--wiz-teal-check); display: flex; align-items: center; justify-content: center; flex: none; }
  .tk i { font-size: 12px; }
  /* room under the way out, so it does not sit on the footer's edge */
  .keep { align-self: flex-start; margin-bottom: 16px; background: none; border: 1px solid rgba(255,255,255,.22); border-radius: 999px; padding: 9px 18px; color: rgba(255,255,255,.85); font-size: 14px; font-weight: 600; white-space: nowrap; }
  .keep:hover { background: rgba(255,255,255,.08); }
  .right { display: flex; flex-direction: column; min-height: 0; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .lh { font: 600 22px var(--font-display); }
  .again { display: inline-flex; align-items: center; gap: 8px; align-self: center; margin-top: 10px; padding: 8px 16px; border-radius: 999px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.18); color: rgba(255,255,255,.8); font: 600 13px var(--font-display); }
  .again:hover { background: rgba(255,255,255,.13); color: #fff; }
  .again i { font-size: 14px; }
  .refresh { display: inline-flex; align-items: center; gap: 7px; margin-left: 14px; padding: 5px 13px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); color: rgba(255,255,255,.85); font: 600 12px var(--font-label); }
  .refresh:hover:not(:disabled) { background: rgba(255,255,255,.14); }
  .refresh:disabled { opacity: .55; }
  .refresh i { font-size: 13px; }
  /* Μικρότερη από την κύρια κεφαλίδα: χωρίζει, δεν ανταγωνίζεται. */
  .tag.phone { background: rgba(255,184,0,.16); border-color: rgba(255,184,0,.45); color: #ffd86b; }
  .sub-h { margin: 10px 0 2px; padding-left: 2px; font: 700 12px var(--font-label); letter-spacing: 1.2px; text-transform: uppercase; color: rgba(255,255,255,.5); }
  .hint { font-size: 13px; color: rgba(255,255,255,.5); white-space: nowrap; }
  /* padding = room for the focus ring, which is drawn outside the card and would clip in a scroller */
  .list { display: flex; flex-direction: column; gap: 8px; margin: 6px -10px 0; flex: 1; min-height: 0; overflow: auto; padding: 8px 10px; mask-image: linear-gradient(#000 92%, transparent); }
  .tile { width: 42px; height: 42px; border-radius: 11px; flex: none; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.08); color: rgba(255,255,255,.75); font: 700 17px var(--font-display); }
  .tile.sm { width: 32px; height: 32px; border-radius: 9px; font-size: 14px; }
  .tile.ask { background: rgba(255,255,255,.06); font-size: 14px; }
  .tile.img { background: rgba(255,255,255,.06); padding: 3px; }
  .tile img { width: 100%; height: 100%; object-fit: contain; border-radius: 8px; }
  .txt { display: flex; flex-direction: column; gap: 2px; text-align: left; flex: 1; min-width: 0; }
  .txt b { font: 600 16px var(--font-display); }
  .sub { font: 400 12px var(--font-label); color: rgba(255,255,255,.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .state { display: flex; align-items: center; gap: 8px; flex: none; }
  .tag { font-size: 11px; padding: 4px 9px; }
  .tag.dim { color: rgba(255,255,255,.45); border: 1px solid rgba(255,255,255,.15); border-radius: 999px; }
  .tag.on { color: var(--success); border: 1px solid rgba(0,200,120,.35); background: rgba(0,200,120,.1); border-radius: 999px; }
  .done { margin-top: 12px; display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 14px; background: rgba(0,161,169,.14); border: 1px solid rgba(0,161,169,.45); }
  .dtxt { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .dtxt b { font: 700 16px var(--font-display); }
  .dtxt span { font-size: 13px; color: rgba(255,255,255,.75); line-height: 1.4; }
  .cta { margin-top: 12px; height: 56px; border: none; border-radius: 999px; background: var(--wiz-gold); color: var(--wiz-gold-text); font: 700 17px var(--font-display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 20px; }
  .cta:hover:not(:disabled) { background: var(--wiz-gold-hover); }
  .cta:disabled { opacity: 1; }
  /* The button IS the progress bar: the fill is what a person three metres away can read, and the
     label on top names the stage. A spinner would say "alive" and nothing else. */
  .cta.busy { background: rgba(255,255,255,.1); color: #fff; position: relative; }
  .cta.busy::before { content: ''; position: absolute; inset: 0 auto 0 0; width: var(--pct, 0%); background: var(--wiz-gold); opacity: .85; transition: width .25s linear; }
  .cta .lbl { position: relative; }
  .nowhead { font: 600 11px var(--font-label); letter-spacing: 2px; color: rgba(255,255,255,.4); margin-bottom: 6px; }
  /* quieter than the offers: dimmer, and it comes back to full strength when it is the selection */
  .now { opacity: .72; margin: 0 -10px 18px; padding: 0 10px; }
  .now:hover, .now:focus-within { opacity: 1; }
  .ctasub { margin-top: 8px; text-align: center; font-size: 12px; color: rgba(255,255,255,.55); min-height: 16px; }
  .ctasub.pick { margin-top: 20px; font-size: 14px; color: rgba(255,255,255,.7); }
  .ctasub.warn { color: var(--warning); font-size: 13px; }
  .cta:disabled:not(.busy) { opacity: .45; }
  .undo { margin-top: 10px; }
</style>
