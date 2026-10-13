<script lang="ts">
  // ΤΟ APK ΜΠΗΚΕ ΚΑΙ ΤΟ ΚΟΥΤΙ ΤΟ ΔΕΧΕΤΑΙ ΩΣ ΑΡΧΙΚΗ ΟΘΟΝΗ (Jim, 3/10/2026: «τελείωσε με επιτυχία
  // αλλά δεν με ενημέρωσε… ένα dialog θα μπορούσε να είναι»). Η οθόνη έμενε απαράλλαχτη, με το ίδιο
  // κουμπί «Εγκατάσταση στο box»: ούτε ότι πέτυχε μάθαινε κανείς, ούτε ότι μένει ένα βήμα ακόμη.
  //
  // Λέει ΠΟΙΟΣ ήρθε — όχι το όνομα του αρχείου, το πακέτο που αναγνώρισε το ΚΟΥΤΙ — και προσφέρει
  // το μόνο βήμα που απομένει.
  import { getSession } from '../context.js';
  const S = getSession();
  const a = $derived(S.apkArrived);
</script>

{#if a}
  <div class="veil">
    <div class="box" role="dialog" aria-modal="true">
      <div class="h">
        <span class="badge"><i class="base-icon bi-check"></i></span>
        <b>{S.t('aa_title')}</b>
      </div>
      <p class="lead">{S.t(a.wrong ? 'aa_bodyOther' : 'aa_body')}</p>
      <div class="pkg mono">{a.pkg}</div>
      <!-- ΗΡΘΕ ΑΛΛΟ ΑΠΟ ΑΥΤΟ ΠΟΥ ΖΗΤΗΘΗΚΕ: με short code συμβαίνει εύκολα — γράφεις τον κωδικό
           άλλης εφαρμογής πάνω στη γραμμή ενός launcher. Δεν το κρύβουμε πίσω από ένα σκέτο
           «σφάλμα»: λέμε τι ζητήθηκε, τι ήρθε, και αφήνουμε την απόφαση στον άνθρωπο. -->
      {#if a.wrong}<p class="warn"><i class="base-icon bi-warning-fill"></i>{S.t('aa_notAsked', { app: a.wrong })}</p>{/if}
      <p class="from">{S.t('aa_from', { file: a.file })}</p>
      <div class="acts">
        <button type="button" class="btn btn-ghost tvlm-focus" data-nav onclick={() => S.dismissArrived()}>{S.t('aa_later')}</button>
        <button type="button" class="btn btn-gold tvlm-focus" data-nav data-primary onclick={() => S.useArrived()}>{S.t('aa_use')} &nbsp;»</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .veil { position: fixed; inset: 0; z-index: 92; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(8,12,20,.72); backdrop-filter: blur(3px); }
  .box { width: min(620px, 100%); display: flex; flex-direction: column; gap: 12px; padding: 24px 26px; border-radius: 18px; background: var(--card-bg, #16203a); border: 1px solid rgba(34,197,94,.45); box-shadow: 0 30px 80px rgba(0,0,0,.55); }
  .h { display: flex; align-items: center; gap: 12px; }
  .h b { font: 700 20px var(--font-display); }
  .badge { width: 30px; height: 30px; flex: none; border-radius: 50%; background: var(--success); color: #06281a; display: flex; align-items: center; justify-content: center; font-size: 14px; }
  .lead { margin: 0; font-size: 14.5px; line-height: 1.55; color: rgba(255,255,255,.8); }
  .pkg { padding: 9px 13px; border-radius: 9px; background: rgba(0,0,0,.32); border: 1px solid rgba(255,255,255,.12); font-size: 13.5px; }
  .warn { margin: 0; display: flex; align-items: flex-start; gap: 9px; font-size: 13px; line-height: 1.5; color: var(--wiz-gold-light, #ffd479); }
  .from { margin: 0; font-size: 12.5px; color: rgba(255,255,255,.5); }
  .acts { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
</style>
