<script lang="ts">
  // ΤΙ ΕΓΙΝΕ ΤΕΛΙΚΑ — ένας διάλογος με ένα OK (Jim, 7/10/2026: «τι έγινε τελικά, τελείωσε; έγινε
  // install; είμαι user, τι κάνω;» και μετά «βγάλε ένα dialog που του εξηγεί ότι όλα ok or
  // error xxx με ένα OK»).
  //
  // Μέχρι τώρα η απάντηση ζούσε ΜΟΝΟ ως χρώμα σε μια λέξη στην άκρη της γραμμής, κι από κάτω το
  // κουμπί εξακολουθούσε να λέει «βάλε 1 στο κουτί» — η σελίδα ρωτούσε ξανά κάτι που είχε ήδη
  // γίνει. Τώρα, μόλις τελειώσει το πέρασμα, ανοίγει ΜΙΑ φορά ένας διάλογος που το λέει με
  // λέξεις: πόσα μπήκαν, και για όσα δεν μπήκαν ΤΙ είπε το κουτί.
  //
  // ΔΕΝ είναι ο διάλογος της τηλεόρασης: εκείνος δεν υπάρχει πάνω από ADB και καλά κάνει (Jim,
  // ίδια μέρα). Αυτός είναι δικός μας, στον υπολογιστή, και κλείνει με ένα πάτημα.
  import { getSession } from '../context.js';
  const S = getSession();

  let el: HTMLDialogElement | undefined = $state();
  const rows = $derived(S.apkQueue);
  const done = $derived(rows.filter((q) => q.status === 'ok').length);
  const failed = $derived(rows.filter((q) => q.status === 'err'));
  /** Τελείωσε το πέρασμα: καμία γραμμή δεν τρέχει και καμία δεν περιμένει. */
  const finished = $derived(!S.apkBusy && rows.length > 0 && done + failed.length === rows.length);

  // ΜΙΑ ΦΟΡΑ ΑΝΑ ΠΕΡΑΣΜΑ: το `finished` μένει αληθές όσο η λίστα είναι στην οθόνη, οπότε χωρίς
  // αυτή τη σημαία ο διάλογος θα ξαναγύριζε σε κάθε επανασχεδίαση — και μετά το «ΟΚ» αμέσως.
  let shownFor = $state(-1);
  $effect(() => {
    if (!el) return;
    if (finished && shownFor !== rows.length + done) {
      shownFor = rows.length + done;
      if (!el.open) el.showModal();
    }
  });
  function close() {
    el?.close();
  }
</script>

<dialog bind:this={el} class="sheet" oncancel={(e) => { e.preventDefault(); close(); }}>
  <div class="head">
    <span class="ico" class:bad={failed.length}>
      <i class="base-icon {failed.length ? 'bi-warning-fill' : 'bi-check-circle-fill'}"></i>
    </span>
    <b>{failed.length ? S.t('ap_rBadT') : S.t('ap_rOkT')}</b>
  </div>
  <p class="lead">
    {failed.length ? S.t('ap_rBad', { n: failed.length, m: rows.length }) : S.t('ap_rOk', { n: done, m: rows.length })}
  </p>
  {#if failed.length}
    <!-- Ο λόγος, όπως τον είπε το κουτί. Τα δικά μας κλειδιά μεταφράζονται· το μήνυμα του pm όχι. -->
    <div class="why">
      {#each failed as f (f.name)}
        <div class="line"><b class="nm">{f.name}</b><span class="mono">{f.msg ? (S.i18n.has(f.msg) ? S.t(f.msg) : f.msg) : ''}</span></div>
      {/each}
    </div>
  {/if}
  <button type="button" class="ok tvlm-focus" data-nav data-primary onclick={close}>OK</button>
</dialog>

<style>
  .sheet { width: min(520px, 92vw); padding: 26px 26px 22px; border: 1px solid var(--row-border); border-radius: 22px; background: var(--sheet-bg, #131a2b); color: #fff; }
  .sheet::backdrop { background: rgba(6,10,20,.6); }
  .head { display: flex; align-items: center; gap: 12px; }
  .head b { font: 700 21px var(--font-display); }
  .ico { width: 38px; height: 38px; flex: none; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(0,161,169,.18); color: var(--success); }
  .ico.bad { background: rgba(255,186,64,.16); color: var(--warning); }
  .lead { margin: 14px 0 0; font-size: 15px; line-height: 1.55; color: rgba(255,255,255,.82); text-wrap: pretty; }
  .why { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; padding: 12px 14px; border-radius: 14px; background: rgba(0,0,0,.28); border: 1px solid var(--row-border); max-height: 220px; overflow: auto; }
  .line { display: flex; flex-direction: column; gap: 2px; }
  .nm { font-size: 13.5px; }
  .line .mono { font: 400 12px/1.5 var(--font-mono); color: var(--danger-alt); word-break: break-word; }
  .ok { margin-top: 20px; width: 100%; height: 48px; border: none; border-radius: 999px; background: var(--wiz-gold); color: var(--wiz-gold-text); font: 700 16px var(--font-display); }
  .ok:hover { background: var(--wiz-gold-hover); }
</style>
