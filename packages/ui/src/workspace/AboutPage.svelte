<script lang="ts">
  /**
   * WS Σχετικά — ΜΙΑ σελίδα για ό,τι αφορά την ΕΦΑΡΜΟΓΗ (όχι το box· εκείνο έχει τη «Συσκευή»).
   *
   * ΓΙΑΤΙ ΕΔΩ ΚΑΙ ΟΧΙ ΣΕ ΚΑΘΕ ΥΠΟΣΕΛΙΔΟ: η πολιτική απορρήτου έμπαινε ως γραμμή στο υποσέλιδο κάθε
   * βήματος, και σε τηλεόραση αυτό σημαίνει ένα ακόμη σημείο όπου προσγειώνεται το δαχτυλίδι σε
   * κάθε οθόνη — ο άνθρωπος χάνεται (Jim, 30/9). Το Play ζητά την πολιτική ΜΕΣΑ στο app· δεν ζητά
   * να είναι παντού. Μία πόρτα στο μενού, όπως ακριβώς κάνουν τα υπόλοιπα app μας (Button Mapper
   * TV, Universal Manager): έκδοση, σύστημα, νομικά.
   */
  import { getSession } from '../context.js';
  const S = getSession();
  const legal = $derived(
    [
      ['ab_privacy', S.brand.privacyUrl],
      ['ab_terms', S.brand.termsUrl],
      ['ab_cookies', S.brand.cookiesUrl],
    ].filter((r): r is [string, string] => !!r[1]),
  );
  const site = $derived(`https://${S.brand.domain}`);
  const source = $derived(S.brand.sourceUrl);
  const show = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // ---- ΕΚΔΟΣΗ ΜΕ ΑΡΙΘΜΟ BUILD, ΣΥΣΤΗΜΑ, ΚΑΙ Ο ΕΛΕΓΧΟΣ ΕΝΗΜΕΡΩΣΗΣ -------------------------------
  // Υπόδειγμα το About του PLUI (Jim, 3/10/2026). Μπήκε πρώτα στην Android όψη — σε ένα κουτί που
  // μένει χρόνια στον ίδιο τοίχο, το «τι έχω και υπάρχει νεότερη;» πρέπει να απαντιέται ΜΕΣΑ στην
  // εφαρμογή, γιατί συχνά δεν υπάρχει browser για να ρωτήσεις αλλού.
  //
  // ΚΑΙ ΣΤΟ DESKTOP (Jim, 3/10/2026: «βάλε το ίδιο και στο mac dmg όταν έχουμε mac»): το αντίγραφο
  // που μένει πιο πολύ πίσω είναι ακριβώς το macOS, γιατί χτίζεται ΜΟΝΟ σε Mac — και ένα αντίγραφο
  // που δεν ξέρει ποιο build είναι, δεν ξέρει ούτε ότι έμεινε πίσω. Ο διάλογος της εκκίνησης
  // εμφανίζεται ΜΙΑ φορά και αναβάλλεται για 24 ώρες· η οθόνη απαντά όποτε τη ρωτήσεις.
  //
  // ΟΧΙ στον web: σερβίρεται από εμάς και είναι πάντα ο τρέχων — δεν υπάρχει τίποτα να ελέγξει.
  const onAndroid = $derived(S.platform === 'android');
  const onApp = $derived(!S.isWeb);
  const i = $derived(S.selfInfo);
  // Το κανάλι το ξέρει το ίδιο το αντίγραφο: Play build δεν κατεβάζει APK (Play DDA §4.5), οπότε
  // ούτε κουμπί λήψης του προσφέρουμε — η ενημέρωση του έρχεται από το κατάστημα.
  const fromPlay = $derived(!!i?.playBuild);
  const sys = $derived(
    i ? [`Android ${i.release || '?'} (API ${i.sdk || '?'})`, [i.manufacturer, i.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') : '',
  );
  const upd = $derived(S.updateCheck);
  const latest = $derived(S.updateLatest);
</script>

<div class="ab">
  <div>
    <h2 class="h2-ws">{S.t('ab_title')}</h2>
    <div class="intro">{S.t('ab_body')}</div>
  </div>

  <div class="card">
    <span class="mark" class:plate={S.brand.logo.onLight}>
      <img src="{S.assetBase}{S.brand.logo.wordmark}" alt={S.brand.name} />
    </span>
    <div class="rows">
      <!-- Ο ΑΡΙΘΜΟΣ BUILD ΔΙΠΛΑ ΣΤΟ ΟΝΟΜΑ: το όνομα είναι ημερήσιο και δύο builds της ίδιας μέρας
           το μοιράζονται, οπότε μόνο του δεν απαντά «ποιο αντίγραφο έχω;». -->
      <div class="row">
        <span class="k">{S.t('ab_version')}</span>
        <b class="v">{S.appVersion}{#if onApp && S.myBuild}<span class="dim"> · {S.t('ab_build')} {S.myBuild}</span>{/if}</b>
        {#if onAndroid}<span class="chip" class:play={fromPlay}>{fromPlay ? S.t('ab_chPlay') : S.t('ab_chSide')}</span>{/if}
      </div>
      <div class="row"><span class="k">{S.t('ab_face')}</span><b class="v">{S.platformChip}</b></div>
      {#if onAndroid && sys}
        <div class="row"><span class="k">{S.t('ab_system')}</span><b class="v">{sys}</b></div>
      {/if}
      {#if onAndroid && i?.installer}
        <div class="row"><span class="k">{S.t('ab_installer')}</span><b class="v mono">{i.installer}</b></div>
      {/if}
      <div class="row"><span class="k">{S.t('ab_site')}</span><b class="v">{S.brand.domain}</b></div>
    </div>
  </div>

  {#if onApp}
    <div class="upd">
      <div class="sect">{S.t('ab_upd')}</div>
      <div class="st" class:ok={upd === 'current'} class:new={upd === 'newer'} class:bad={upd === 'failed'}>
        {#if upd === 'checking'}
          <i class="base-icon bi-spinner tvlm-spin"></i>
        {:else if upd === 'current'}
          <i class="base-icon bi-check"></i>
        {:else if upd === 'newer'}
          <i class="base-icon bi-arrow-clockwise"></i>
        {/if}
        <span>
          {#if upd === 'checking'}{S.t('ab_updChecking')}
          {:else if upd === 'current'}{S.t('ab_updCurrent')}
          {:else if upd === 'newer'}{S.t('ab_updNewer', { v: latest?.version ?? '', b: String(latest?.build ?? '—') })}
          {:else if upd === 'failed'}{S.t('ab_updFailed')}
          {:else}{S.t('ab_updIdle')}{/if}
        </span>
      </div>
      <!-- ΜΙΑ ΓΡΑΜΜΗ ΜΟΝΟ ΟΤΑΝ ΕΞΗΓΕΙ ΓΙΑΤΙ ΛΕΙΠΕΙ ΚΟΥΜΠΙ. Η διεύθυνση της λήψης ήταν γραμμένη εδώ
           και βγήκε (Jim, 3/10/2026: «δεν ενδιαφέρουν και μπερδεύουν τον απλό user») — ο κόσμος
           θέλει να ξέρει αν είναι ενημερωμένος, όχι πού ζει το αρχείο. Στο Play build μένει, γιατί
           εκεί ΔΕΝ υπάρχει κουμπί λήψης και η απουσία χρειάζεται εξήγηση. -->
      {#if fromPlay}<div class="note">{S.t('ab_updPlay')}</div>{/if}
      {#if S.updateErr}<div class="note err">{S.updateErr}</div>{/if}
      <div class="acts">
        <button type="button" class="btn btn-gold tvlm-focus" data-nav data-primary disabled={upd === 'checking' || S.updateBusy} onclick={() => S.checkForUpdateNow()}>{S.t('ab_updCheck')}</button>
        <!-- ΤΟ ΔΕΥΤΕΡΟ ΚΟΥΜΠΙ ΚΑΝΕΙ ΑΛΛΗ ΔΟΥΛΕΙΑ ΣΕ ΚΑΘΕ ΕΚΔΟΣΗ (Jim, 3/10/2026). Στο sideload
             κατεβάζει και εγκαθιστά η ΙΔΙΑ η εφαρμογή, όπως UNI/PLUI/όλα τα sideload app μας —
             πριν από αυτό καλούσε τον browser και η τηλεόραση απαντούσε «You don't have an app
             that can do this». Στο Play ΔΕΝ υπάρχει λήψη καθόλου: ανοίγει το κατάστημα. -->
        {#if fromPlay}
          <button type="button" class="btn btn-outline tvlm-focus" data-nav onclick={() => S.openOurPlayPage()}>{S.t('ab_updPlayOpen')}</button>
        {:else}
          <button type="button" class="btn btn-outline tvlm-focus" data-nav disabled={S.updateBusy} onclick={() => S.takeUpdate()}>
            {#if S.updateBusy}{S.t('up_dl')} {S.updatePct}%{:else}{S.t('ab_updGet')}{/if}
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- ΤΑ ΝΟΜΙΚΑ, ΜΑΖΙ. Κάθε κουμπί γράφει ΚΑΙ τη διεύθυνσή του: αυτό το εργαλείο τρέχει και πάνω σε
       TV box, όπου συχνά δεν υπάρχει browser να ανοίξει — εκεί το πάτημα δεν κάνει τίποτα, η
       γραμμένη διεύθυνση όμως διαβάζεται και πληκτρολογείται αλλού. -->
  <div class="sect">{S.t('ab_legal')}</div>
  <div class="links">
    {#each legal as [key, url] (key)}
      <button type="button" class="lk tvlm-focus" data-nav onclick={() => S.openExternal(url)}>
        <b>{S.t(key as 'ab_privacy')}</b><span>{show(url)}</span>
      </button>
    {/each}
    <button type="button" class="lk tvlm-focus" data-nav onclick={() => S.openExternal(site)}>
      <b>{S.t('ab_openSite')}</b><span>{show(site)}</span>
    </button>
    <!-- Ο κώδικας δίπλα στα νομικά και όχι μέσα τους: δεν είναι όρος, είναι η απόδειξη. Ένα εργαλείο
         που τρέχει εντολές ADB στο box κάποιου, το «τι ακριβώς τρέχει» το απαντά ο ανοιχτός κώδικας. -->
    {#if source}
      <button type="button" class="lk tvlm-focus" data-nav onclick={() => S.openExternal(source)}>
        <b>{S.t('ab_source')}</b><span>{show(source)}</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .ab { display: flex; flex-direction: column; gap: 18px; }
  .intro { margin-top: 8px; color: var(--text-sub); font-size: 14.5px; line-height: 1.5; max-width: 620px; }
  .card { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; padding: 20px 22px; border-radius: 16px; background: var(--row-bg); border: 1px solid var(--row-border); }
  /* ένα σκούρο λογότυπο θέλει τη δική του ανοιχτή πλάκα, όπως στην κεφαλίδα — καμία αλλοίωση έργου */
  .mark { display: flex; align-items: center; }
  .mark.plate { background: #fff; border-radius: 12px; padding: 10px 14px; }
  .mark img { height: 34px; display: block; }
  .rows { display: flex; flex-direction: column; gap: 6px; min-width: 240px; }
  .row { display: flex; align-items: baseline; gap: 12px; }
  /* ΟΧΙ `text-transform: uppercase`: στα ελληνικά ο browser κρατά τον τόνο («ΈΚΔΟΣΗ»), που είναι
     ορθογραφικό λάθος — τα κεφαλαία δεν τονίζονται. Το ίδιο βάρος βγαίνει με χρώμα και μέγεθος. */
  .k { font-size: 12.5px; color: var(--text-dim); letter-spacing: .3px; min-width: 96px; }
  .v { font-size: 15px; }
  .v .dim { color: var(--text-dim); font-weight: 400; margin-left: 6px; }
  .chip { font: 700 10.5px var(--font-label); letter-spacing: .6px; padding: 3px 8px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid var(--row-border); color: var(--text-sub); }
  .chip.play { background: rgba(120,200,255,.12); }
  .upd { display: flex; flex-direction: column; gap: 10px; padding: 18px 20px; border-radius: 16px; background: var(--row-bg); border: 1px solid var(--row-border); }
  .st { display: flex; align-items: center; gap: 9px; font-size: 14.5px; color: var(--text-sub); }
  .st.ok { color: #7ee3a8; }
  .st.new { color: var(--wiz-gold-light, #ffd479); }
  .st.bad { color: #ff9b9b; }
  .note { font-size: 12.5px; color: var(--text-dim); line-height: 1.5; }
  .note.err { color: #ff9b9b; }
  .acts { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 2px; }
  .sect { font: 700 15px var(--font-display); margin-top: 4px; }
  .links { display: flex; flex-wrap: wrap; gap: 10px; }
  .lk { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 11px 16px; border-radius: 12px; background: var(--row-bg); border: 1px solid var(--row-border); color: #fff; text-align: left; }
  .lk:hover { border-color: rgba(255,255,255,.3); }
  .lk b { font: 600 14px var(--font-display); }
  .lk span { font-size: 12px; color: var(--text-dim); }
</style>
