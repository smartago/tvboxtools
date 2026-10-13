<script lang="ts">
  /**
   * ΤΟ ΚΟΥΤΑΚΙ ΠΟΥ ΓΡΑΦΕΤΑΙ, ΟΤΑΝ ΤΟ ΠΛΗΚΤΡΟΛΟΓΙΟ ΤΗΣ ΤΗΛΕΟΡΑΣΗΣ ΠΙΑΝΕΙ ΜΙΣΗ ΟΘΟΝΗ.
   *
   * Jim, 3/10/2026, με φωτογραφία από Android TV: το IME άνοιξε και σκέπασε το πεδίο — ο άνθρωπος
   * πληκτρολογούσε χωρίς να βλέπει τι γράφει. Στην οθόνη πίσω το πεδίο δεν γράφεται πια· η γραφή
   * γίνεται ΕΔΩ, και αυτός ο διάλογος κάθεται ΨΗΛΑ ώστε να μένει πάνω από το πληκτρολόγιο.
   *
   * ΔΥΟ ΕΙΔΗ, ΓΙΑΤΙ ΤΟ ΠΛΗΚΤΡΟΛΟΓΙΟ ΠΡΕΠΕΙ ΝΑ ΕΙΝΑΙ ΤΟ ΣΩΣΤΟ: ο κωδικός είναι μόνο ψηφία
   * (`inputmode="numeric"` → η τηλεόραση ανοίγει το αριθμητικό), η διεύθυνση θέλει ολόκληρο
   * πληκτρολόγιο. Σε έναν άνθρωπο με τηλεχειριστήριο η διαφορά είναι δέκα πατήματα.
   */
  import { getSession } from '../context.js';
  const S = getSession();
  const kind = $derived(S.codeAsk);
  let el: HTMLInputElement | undefined = $state();
  /**
   * ΠΟΙΟΣ ΕΙΧΕ ΤΟ ΔΑΧΤΥΛΙΔΙ ΠΡΙΝ ΑΝΟΙΞΕΙ (Jim, 3/10/2026: «πατάω code, βάζω code, πάω ΟΚ, κλείνει
   * και μετά;; δεν έχω ring»). Οταν ένας διάλογος κλείνει, το focus πεθαίνει μαζί του: στο ποντίκι
   * δεν φαίνεται, με τηλεχειριστήριο όμως η οθόνη γίνεται ΑΠΛΗΣΙΑΣΤΗ — κανένα βελάκι δεν έχει από
   * πού να ξεκινήσει. Γυρνά σε αυτόν που τον άνοιξε.
   */
  let returnTo: HTMLElement | null = null;
  // Το δαχτυλίδι πάει στο πεδίο μόνο του: ο διάλογος ΥΠΑΡΧΕΙ για να γραφτεί κάτι, και ένα βήμα
  // «βρες πρώτα το κουτάκι» με τηλεχειριστήριο είναι βήμα χαμένο.
  $effect(() => {
    if (kind) {
      // Τη στιγμή που τρέχει αυτό, το focus είναι ΑΚΟΜΗ στο κουμπί που πατήθηκε.
      const now = document.activeElement;
      if (now instanceof HTMLElement && !now.closest('.veil')) returnTo = now;
      const node = el;
      if (node) setTimeout(() => node.focus(), 60);
      return;
    }
    const back = returnTo;
    returnTo = null;
    // ΟΧΙ requestAnimationFrame: σε παράθυρο που δεν ζωγραφίζει δεν τρέχει ποτέ.
    if (back) setTimeout(() => back.isConnected && back.focus(), 0);
  });
</script>

{#if kind}
  <div class="veil">
    <div class="box" role="dialog" aria-modal="true">
      <b class="h">{S.t(kind === 'code' ? 'ka_askCode' : 'ka_askUrl')}</b>
      <p class="lead">{S.t(kind === 'code' ? 'ka_askCodeD' : 'ka_askUrlD')}</p>
      <input
        bind:this={el}
        class="fld mono"
        type="text"
        inputmode={kind === 'code' ? 'numeric' : 'url'}
        autocomplete="off"
        spellcheck="false"
        placeholder={S.t(kind === 'code' ? 'ka_askCodePh' : 'ka_askUrlPh')}
        value={S.codeAskValue}
        oninput={(e) => (S.codeAskValue = e.currentTarget.value)}
        onkeydown={(e) => {
          // ΚΑΙ ΣΤΑΜΑΤΑ ΕΔΩ: χωρίς `stopPropagation` το ίδιο πλήκτρο έφτανε στον παγκόσμιο
          // χειριστή του App και έκανε ΚΑΙ τη δική του δουλειά.
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            S.commitCodeAsk();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            S.cancelCodeAsk();
          }
        }}
      />
      <div class="acts">
        <button type="button" class="btn btn-ghost tvlm-focus" data-nav onclick={() => S.cancelCodeAsk()}>{S.t('cancel')}</button>
        <button type="button" class="btn btn-gold tvlm-focus" data-nav data-primary disabled={!S.codeAskValue.trim()} onclick={() => S.commitCodeAsk()}>{S.t('done')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ΨΗΛΑ, ΟΧΙ ΣΤΟ ΚΕΝΤΡΟ: το πληκτρολόγιο της τηλεόρασης ανεβαίνει από κάτω και πιάνει ως και τη
     μισή οθόνη. Ένας κεντραρισμένος διάλογος θα εξαφανιζόταν κάτω από αυτό — που είναι ακριβώς
     το πρόβλημα που λύνει. */
  .veil { position: fixed; inset: 0; z-index: 96; display: flex; align-items: flex-start; justify-content: center; padding: 5vh 24px 24px; background: rgba(8,12,20,.72); backdrop-filter: blur(3px); }
  .box { width: min(640px, 100%); display: flex; flex-direction: column; gap: 12px; padding: 22px 24px; border-radius: 18px; background: var(--card-bg, #16203a); border: 1px solid rgba(255,255,255,.18); box-shadow: 0 30px 80px rgba(0,0,0,.55); }
  .h { font: 700 19px var(--font-display); }
  .lead { margin: 0; font-size: 13.5px; line-height: 1.5; color: rgba(255,255,255,.72); }
  .fld { width: 100%; padding: 13px 15px; border-radius: 12px; background: rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.22); color: #fff; font-size: 17px; letter-spacing: .5px; }
  .fld::placeholder { color: rgba(255,255,255,.3); letter-spacing: 0; }
  .fld:focus { outline: none; border-color: var(--wiz-gold, #e9b949); }
  .acts { display: flex; justify-content: flex-end; gap: 10px; margin-top: 2px; }
</style>
