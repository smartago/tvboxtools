<script lang="ts">
  // ΥΠΑΡΧΕΙ ΝΕΟΤΕΡΗ ΕΚΔΟΣΗ (απόφαση Jim, 3/10/2026): ειδοποίηση και ένα κλικ στη σελίδα λήψης —
  // ΟΧΙ αυτο-ενημέρωση. Μετρημένο την ίδια νύχτα: το portable δεν μετονομάζεται όσο τρέχει, και το
  // `app.asar` της εγκατάστασης είναι κλειδωμένο· κάθε «έξυπνη» λύση θα δούλευε σε μία μορφή και θα
  // έσπαγε στην άλλη. Ο browser δουλεύει παντού, σε κάθε λειτουργικό.
  import { getSession } from '../context.js';
  const S = getSession();
  const u = $derived(S.updateAvail);
</script>

{#if u}
  <div class="veil">
    <div class="box" role="dialog" aria-modal="true">
      <div class="h">
        <span class="badge"><i class="base-icon bi-arrow-clockwise"></i></span>
        <b>{S.t('up_title')}</b>
      </div>
      <p class="lead">{S.t('up_body')}</p>
      <div class="vers">
        <!-- ΚΑΙ Ο ΑΡΙΘΜΟΣ BUILD, ΟΧΙ ΜΟΝΟ ΤΟ ΟΝΟΜΑ: το όνομα είναι ημερήσιο, οπότε δύο διαφορετικά
             builds της ίδιας μέρας δείχνουν ίδια έκδοση. Χωρίς τον αριθμό, ο διάλογος θα έλεγε
             «1.26.10.02 → 1.26.10.02» και θα έμοιαζε με σφάλμα. -->
        <span class="col"><span class="k">{S.t('up_have')}</span><span class="v mono">{S.appVersion}</span>{#if S.appBuild}<span class="b mono">build {S.appBuild}</span>{/if}</span>
        <i class="base-icon bi-solid-arrow-right"></i>
        <span class="col"><span class="k">{S.t('up_new')}</span><span class="v mono new">{u.version}</span>{#if u.build}<span class="b mono new">build {u.build}</span>{/if}</span>
      </div>
      <!-- ΣΤΟ ANDROID ΤΟ ΚΟΥΜΠΙ ΚΑΤΕΒΑΖΕΙ ΚΑΙ ΕΓΚΑΘΙΣΤΑ (Jim, 3/10/2026): μια τηλεόραση συχνά δεν
           έχει browser να ανοίξει, και ένα APK στα Downloads δεν εγκαθίσταται μόνο του. Στο
           desktop μένει η σελίδα λήψης — εκεί διαλέγει άνθρωπος ανάμεσα σε πέντε αρχεία. -->
      {#if S.updateErr}<p class="err"><i class="base-icon bi-warning-fill"></i>{S.updateErr}</p>{/if}
      <div class="acts">
        <button type="button" class="btn btn-ghost tvlm-focus" data-nav disabled={S.updateBusy} onclick={() => S.snoozeUpdate()}>{S.t('up_later')}</button>
        <button type="button" class="btn btn-gold tvlm-focus" data-nav data-primary disabled={S.updateBusy} onclick={() => S.takeUpdate()}>
          {#if S.updateBusy}{S.t('up_dl')} {S.updatePct}%{:else}{S.t('up_get')} &nbsp;»{/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .veil { position: fixed; inset: 0; z-index: 94; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(8,12,20,.72); backdrop-filter: blur(3px); }
  .box { width: min(560px, 100%); display: flex; flex-direction: column; gap: 14px; padding: 24px 26px; border-radius: 18px; background: var(--card-bg, #16203a); border: 1px solid rgba(255,255,255,.18); box-shadow: 0 30px 80px rgba(0,0,0,.55); }
  .h { display: flex; align-items: center; gap: 12px; }
  .h b { font: 700 20px var(--font-display); }
  .badge { width: 30px; height: 30px; flex: none; border-radius: 50%; background: var(--wiz-gold); color: var(--wiz-gold-text); display: flex; align-items: center; justify-content: center; font-size: 15px; }
  .lead { margin: 0; font-size: 14.5px; line-height: 1.55; color: rgba(255,255,255,.8); }
  .vers { display: flex; align-items: center; justify-content: center; gap: 22px; padding: 12px; border-radius: 12px; background: rgba(0,0,0,.26); border: 1px solid rgba(255,255,255,.1); }
  .vers > i { font-size: 15px; color: rgba(255,255,255,.4); }
  .col { display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .k { font: 700 10.5px var(--font-label); letter-spacing: 1.1px; text-transform: uppercase; color: rgba(255,255,255,.45); }
  .v { font-size: 14px; }
  .v.new { color: var(--wiz-gold-light); font-weight: 700; }
  .b { font-size: 11px; color: rgba(255,255,255,.45); }
  .b.new { color: rgba(255,255,255,.65); }
  .err { margin: 0; display: flex; align-items: flex-start; gap: 9px; font-size: 13px; line-height: 1.5; color: #ff9b9b; }
  .acts { display: flex; justify-content: flex-end; gap: 10px; }
</style>
