<script lang="ts">
  // ΤΙ ΤΡΕΧΕΙ ΤΩΡΑ ΣΤΟ ΚΟΥΤΙ (Jim, 2/10/2026). Δύο ξεχωριστά παράπονα, μία απάντηση:
  //   · «δεν βλέπω ποια εντολή έσκασε» → εδώ είναι ΟΛΕΣ, ζωντανά, με την απάντηση του κουτιού·
  //   · «η κονσόλα πήρε όλο τον πολύτιμο χώρο και μπερδεύει τον user» → δεν είναι μόνιμη μπάρα,
  //     είναι διάλογος που βγαίνει ΜΟΝΟ όσο τρέχουν οι εντολές.
  // Όλα καλά → φεύγει μόνος του. Κάτι έσπασε → ΜΕΝΕΙ και ρωτά «συνέχισε ή σταμάτα», με κουμπί
  // «Κρύψε» για όποιον θέλει να δει την οθόνη από κάτω.
  import type { ReportEntry } from '@tvlm/core';
  import { getSession } from '../context.js';
  const S = getSession();
  const ask = $derived(S.failAsk);
  // ΜΟΝΟ ΣΤΟΝ ΟΔΗΓΟ η ζωντανή ροή: στον χώρο εργασίας η κονσόλα είναι μόνιμο εργαλείο στο κάτω
  // μέρος, και ένα modal από πάνω της σε κάθε εργασία θα ήταν σκέτη ενόχληση. Η ΕΡΩΤΗΣΗ όμως
  // βγαίνει παντού — εκεί ο engine περιμένει απάντηση και δεν γίνεται να την προσπεράσεις.
  const open = $derived((S.mode === 'wizard' && S.showRunConsole) || !!ask);
  const lines = $derived(S.consoleLines);

  function text(e: ReportEntry): string {
    let s = e.text;
    if (e.kind === 'cmd') {
      if (!s.startsWith('$')) s = s.startsWith('install -r') ? `$ adb ${s}` : `$ adb shell ${s}`;
      s = s.replace(/(--es pin )\S+/, '$1****'); // το PIN μένει στην αναφορά, όχι στην οθόνη
    } else if ((e.kind === 'err' || e.kind === 'warn') && S.i18n.has(s)) s = S.t(s);
    return s;
  }

  // Το ημερολόγιο κυλά μόνο του όσο γράφεται· `column-reverse`, άρα 0 = το κάτω μέρος.
  let box: HTMLDivElement | undefined = $state();
  $effect(() => {
    void lines.length;
    if (box) box.scrollTop = 0;
  });
</script>

{#if open}
  <div class="veil">
    <div class="box" class:bad={!!ask} class:good={S.runOk && !ask}>
      <div class="h">
        {#if ask}
          <i class="base-icon bi-warning-fill warn"></i><b>{S.t('fa_title')}</b>
        {:else if S.runOk}
          <!-- Η ετυμηγορία, πριν φύγει το παράθυρο: χωρίς αυτήν μια ακαριαία εργασία φαινόταν
               σαν να μην έτρεξε ποτέ. -->
          <i class="base-icon bi-check-circle-fill ok"></i><b>{S.t('rd_ok')}</b>
        {:else}
          <i class="base-icon bi-spinner tvlm-spin"></i><b>{S.t('rd_title')}</b>
          <span class="step">{S.autoStepLabel}</span>
        {/if}
        <span style="flex:1"></span>
        <!-- ΟΧΙ όσο υπάρχει ερώτηση: ο engine κρατά μια υπόσχεση ανοιχτή και περιμένει «συνέχισε» ή
             «σταμάτα». Ένα «Κρύψε» εκεί θα έκρυβε τη ΜΟΝΗ διέξοδο και η εργασία θα κρεμόταν. -->
        {#if !ask}
          <button type="button" class="hide tvlm-focus" data-nav onclick={() => S.hideRunConsole()}>{S.t('rd_hide')}</button>
        {/if}
      </div>

      <div class="log mono" bind:this={box}>
        {#each [...lines].reverse() as e, i (lines.length - i)}
          <div class="ln {e.kind}">{text(e)}</div>
        {/each}
      </div>

      {#if ask}
        <p class="lead">{S.t('fa_lead')}</p>
        <div class="field">
          <span class="k">{S.t('fa_step')}</span>
          <span class="v">{S.i18n.has(ask.label) ? S.t(ask.label) : ask.label}</span>
        </div>
        <div class="field">
          <span class="k">{S.t('fa_out')}</span>
          <pre class="v mono out">{ask.out}</pre>
        </div>
        <div class="acts">
          <button type="button" class="btn btn-ghost tvlm-focus" data-nav onclick={() => ask.resolve(false)}>{S.t('fa_stop')}</button>
          <button type="button" class="btn btn-gold tvlm-focus" data-nav data-primary onclick={() => ask.resolve(true)}>{S.t('fa_go')} &nbsp;»</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .veil { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(8,12,20,.7); backdrop-filter: blur(3px); }
  .box { width: min(820px, 100%); max-height: 84vh; overflow: auto; display: flex; flex-direction: column; gap: 12px; padding: 20px 24px 22px; border-radius: 18px; background: var(--card-bg, #16203a); border: 1px solid rgba(255,255,255,.16); box-shadow: 0 30px 80px rgba(0,0,0,.55); }
  .box.bad { border-color: rgba(239,68,68,.45); }
  .h { display: flex; align-items: center; gap: 11px; }
  .h b { font: 700 18px var(--font-display); }
  .h i { font-size: 20px; color: var(--wiz-gold-light); }
  .h i.warn { color: var(--warning); }
  .h i.ok { color: var(--success); }
  .box.good { border-color: rgba(34,197,94,.45); }
  .step { font-size: 13px; color: rgba(255,255,255,.6); }
  .hide { padding: 6px 14px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); color: #fff; font: 600 12.5px var(--font-label); }
  .hide:hover { background: rgba(255,255,255,.14); }
  /* column-reverse: η τελευταία γραμμή είναι πάντα ορατή χωρίς χειροκίνητο scroll */
  .log { display: flex; flex-direction: column-reverse; gap: 2px; height: 260px; overflow: auto; padding: 12px 14px; border-radius: 10px; background: rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.1); font-size: 12.5px; line-height: 1.55; }
  .ln { white-space: pre-wrap; word-break: break-word; color: rgba(255,255,255,.72); }
  .ln.cmd { color: var(--wiz-teal-soft); }
  .ln.ok { color: #7ee2a8; }
  .ln.err { color: var(--danger-alt, #ff9a9a); }
  .ln.warn { color: var(--warning); }
  .lead { margin: 0; font-size: 13.5px; line-height: 1.55; color: rgba(255,255,255,.75); }
  .field { display: grid; grid-template-columns: 110px 1fr; gap: 12px; align-items: start; }
  .k { font: 700 11px var(--font-label); letter-spacing: 1.1px; text-transform: uppercase; color: rgba(255,255,255,.45); padding-top: 4px; }
  .v { font-size: 13.5px; line-height: 1.5; }
  pre.v { margin: 0; padding: 9px 12px; border-radius: 9px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.1); }
  .out { max-height: 150px; overflow: auto; white-space: pre-wrap; word-break: break-word; color: var(--danger-alt, #ff9a9a); }
  .acts { display: flex; justify-content: flex-end; gap: 10px; }
</style>
