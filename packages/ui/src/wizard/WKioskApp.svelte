<script lang="ts">
  // W12 THE APP — "is it on the box, and if not, how does it get there?"
  //
  // ONE screen, TWO doors (Jim, 29/9): the kiosk picker's hospitality app, and the launcher
  // picker's launcher. Both end in the same question and the same two roads, so both get the
  // same screen — `S.appRow` is whichever was picked, `S.appHome` is the way back.
  //
  // From the design session's `Kiosk Third Party` screen (Jim, 29/9), adapted to OUR layout: the
  // same two columns as every other wizard screen, our cards, our one gold CTA at the foot.
  //
  // It stands between the kiosk picker and everything that follows, and it exists for two roads:
  //   · SOMEBODY ELSE'S hospitality app (Viggo, Smart Hotel TV, WelcomeScreen, BetterSTR…). What we
  //     do with it is set it as HOME — and what we do NOT do (wrap it in a Device Owner) belongs on
  //     the screen too, in the line under the button.
  //   · OURS, in the copy that came from Google Play. That copy installs nothing itself, so the
  //     honest road is the app's own Play page ON THE TELEVISION (TVLM_PLAY_STUDY §3.1 — it used to
  //     dead-end on a blocked button that said "not on Play", which stopped being true on 25/9).
  //
  // Nothing on this screen is invented: the facts are what `dumpsys package` answered, and the
  // "will run" block is the commands themselves.
  import { untrack } from 'svelte';
  import { knownLauncherSource, shortCodeForPackage } from '@tvlm/core';
  import { getSession } from '../context.js';
  import Card from '../components/Card.svelte';
  import { ringTo } from '../nav.js';
  import Notice from '../components/Notice.svelte';
  const S = getSession();
  // Ένα εικονίδιο που λείπει δεν αφήνει σπασμένη εικόνα: η πλακέτα γυρίζει στο γράμμα της.
  let missing = $state<Record<string, boolean>>({});
  /** Το εικονίδιο της εφαρμογής, με τη σειρά του επιλογέα· undefined = μένει το γράμμα. */
  const art = $derived(S.appRow ? S.launcherArt(S.appRow).find((c) => !missing[c]) : undefined);
  const row = $derived(S.appRow);
  /** The row that names no app: "another launcher" — three roads instead of one app's facts. */
  const other = $derived(row?.kind === 'ask');
  /**
   * Ο κατάλογος του box άνοιξε και έχει αρχεία: οι ΑΛΛΕΣ κάρτες κρατούν τον τίτλο τους και
   * αφήνουν την περιγραφή. Ο καμβάς είναι σταθερού ύψους και δεν κυλά — ό,τι μεγαλώνει, κάτι
   * άλλο πρέπει να μικρύνει, αλλιώς το χρυσό κουμπί φεύγει κάτω από την οθόνη.
   */
  const quiet = $derived(S.boxApks.length > 0);
  /** The kiosk door talks about a lock; the launcher door never did. */
  const kiosk = $derived(S.hubTask === 'kiosk');
  const here = $derived(!!row?.installed);
  /** No Play on the box = no Play road; the APK one is the only honest offer then. */
  const hasPlay = $derived(S.check?.hasPlay !== false);
  let input: HTMLInputElement | undefined = $state();
  $effect(() => {
    const p = row?.package;
    untrack(() => {
      if (p) void S.readKioskFacts();
    });
  });
  const cta = $derived(S.kioskAppCta);
  let answerEl: HTMLElement | undefined = $state();
  let errEl: HTMLElement | undefined = $state();
  let panelEl: HTMLElement | undefined = $state();
  /**
   * Μετά το βάψιμο: τη στιγμή που αλλάζει η κατάσταση το στοιχείο μπορεί να μην έχει ακόμη ύψος.
   *
   * ΑΚΑΡΙΑΙΑ, ΟΧΙ `smooth` — ΜΕΤΡΗΜΕΝΟ (3/10/2026): με `behavior: 'smooth'` το `scrollIntoView`
   * ΔΕΝ ΚΟΥΝΑΕΙ ΤΙΠΟΤΑ μέσα σε αυτή την περιοχή (0px, σε δοκιμή με την περιοχή να κυλά σίγουρα),
   * ενώ χωρίς αυτό κυλά κανονικά. Αυτό ακριβώς ήταν το «δεν κουνήθηκε» του Jim — η λογική ήταν
   * σωστή, η κίνηση δεν εκτελούνταν ποτέ. Σε τηλεόραση η ακαριαία είναι έτσι κι αλλιώς η σωστή.
   */
  const reveal = (el: HTMLElement | undefined) => {
    // ΟΧΙ `requestAnimationFrame`: σε παράθυρο που δεν ζωγραφίζει (ελαχιστοποιημένο, από πίσω,
    // κρυμμένο tab) ΔΕΝ ΤΡΕΧΕΙ ΠΟΤΕ — και η κύλιση απλώς δεν γινόταν. `setTimeout` τρέχει πάντα.
    if (el) setTimeout(() => el.scrollIntoView({ block: 'end' }), 0);
  };
  // ΜΟΛΙΣ ΑΝΟΙΞΕΙ Η ΔΙΑΔΡΟΜΗ, ΤΟ ΠΕΔΙΟ ΕΡΧΕΤΑΙ ΣΤΟ ΟΡΑΤΟ (Jim, 3/10/2026: «έκανα focused και δεν
  // κουνήθηκε· όταν εγώ έκανα scroll τότε βλέπω αυτό»). Η κάρτα είναι η τρίτη από τέσσερις: το
  // πλαίσιο γεννιέται κάτω από το κάδρο και ο άνθρωπος βλέπει την ίδια οθόνη να μην αλλάζει.
  $effect(() => {
    if (S.codeRoad) reveal(panelEl);
  });
  $effect(() => {
    const st = S.codeState;
    if (st === 'ready' || st === 'page' || st === 'error') reveal(answerEl);
  });
  // ΚΑΙ ΤΟ ΣΦΑΛΜΑ ΤΗΣ ΕΓΚΑΤΑΣΤΑΣΗΣ: ζει στο ΤΕΛΟΣ της περιοχής που κυλά, κάτω από τέσσερις
  // κάρτες, οπότε «το κατέβασμα δεν έγινε» γραφόταν εκεί που δεν κοιτά κανείς.
  $effect(() => {
    if (S.kioskAppError) reveal(errEl);
  });
  /** Το κουτάκι έχει ΑΚΟΜΗ τον κωδικό που βάλαμε εμείς — τότε η γραμμή από κάτω το λέει. */
  const mineCode = $derived(!!row?.package && !!S.codeInput.trim() && !S.codeReady
    && (shortCodeForPackage(row.package) ?? knownLauncherSource(row.package)) === S.codeInput.trim());
  // The APK line is a promise only the editions that may install can keep: the copy that came from
  // Google Play draws no such card, so it must not list it either (seen 29/9 on ?play=1).
  /** Γνωστός launcher που ΔΕΝ είναι στο Google Play (Arc): καμία κάρτα Play — δεν θα έβρισκε τίποτα στην TV. */
  const offPlay = $derived(row?.kind === 'known' && row.play === false);
  const points = $derived(
    other
      ? [S.t('ka_oP1'), ...(S.canPickApk ? [S.t('ka_oP2')] : []), ...(S.otherHomeApps.length ? [S.t('ka_oP3')] : [])]
      : here
        ? [S.t('ka_aP1'), S.t('ka_aP2'), S.t('ka_aP3')]
        : [S.t(offPlay ? 'ka_bPgit' : 'ka_bP1'), ...(S.canPickApk ? [S.t('ka_bP2')] : []), S.t('ka_bP3')],
  );
  /** The commands this screen will actually send — the same ones the runner uses. */
  const willRun = $derived(
    row?.family
      ? [`am broadcast -a ${row.package}.PROVISION --es profile kiosk`, 'dpm set-device-owner …']
      : [`cmd package set-home-activity ${row?.component ?? `${row?.package}/.Main`}`, 'cmd package resolve-activity -c HOME'],
  );
</script>

<div class="screen wka">
  <div class="left">
    <div class="eye">{S.t(kiosk ? 'wk_eyebrow' : 'wl_eyebrow')}</div>
    <h2 class="ttl">{S.t(other ? 'ka_oTitle' : here ? 'ka_aTitle' : 'ka_bTitle', { app: row?.name ?? '' })}</h2>
    <p class="body">{S.t(other ? 'ka_oBody' : here ? 'ka_aBody' : 'ka_bBody', { app: row?.name ?? '' })}</p>
    <div class="pts">
      {#each points as p (p)}
        <div class="pt"><span class="tk"><i class="base-icon bi-check"></i></span><span>{p}</span></div>
      {/each}
    </div>
    <div style="flex:1"></div>
    <button type="button" class="skip tvlm-focus" data-nav onclick={() => S.goStep(S.appHome)}>← {S.t(kiosk ? 'ka_back' : 'ka_backL')}</button>
  </div>

    <!-- THE FILE IS ALREADY ON THE BOX. DWTV hit the same wall from the other side and wrote its
         own picker (docs/local-send.md: on plenty of these boxes DocumentsUI is not even
         installed). Here adb is already open on the box, so we read what is sitting there and
         install it from there: no storage permission, no picker, no bytes through the WebView. -->
    {#snippet boxCard()}
      <Card sel={!!S.boxApkPick} column padding="16px 18px" onpick={() => { if (!S.boxApkScanned) void S.scanBoxApks(); }}>
        <div class="orow">
          <span class="ico-circle"><i class="plui-icon pi-cat-others"></i></span>
          <!-- ΣΕ ΥΠΟΛΟΓΙΣΤΗ ΚΑΙ ΚΙΝΗΤΟ ΕΙΝΑΙ Η ΔΕΥΤΕΡΗ ΣΚΕΨΗ, ΚΑΙ ΤΟ ΓΡΑΦΕΙ (Jim, 29/9):
               το αρχείο είναι σχεδόν πάντα στο μηχάνημα που κρατά ο άνθρωπος, όχι στο box. Στην
               τηλεόραση, όπου επιλογέας αρχείων δεν υπάρχει καν, αυτός ΕΙΝΑΙ ο δρόμος — και
               κρατά ολόκληρη την περιγραφή του. -->
          <span class="otxt">
            <b>{S.t(S.canPickApk ? 'ka_boxAlt' : 'ka_box')}</b>
            <span class="odesc">{S.t(S.canPickApk ? 'ka_boxAltD' : 'ka_boxD')}</span>
          </span>
        </div>
        {#if S.boxApkScanned}
          {#if S.boxApks.length}
            <!-- ΤΟ ΠΛΗΘΟΣ, ΠΑΝΩ ΑΠΟ ΤΗ ΛΙΣΤΑ: τρεις ορατές σειρές από δέκα, χωρίς αριθμό,
                 διαβάζονται ως «αυτά είναι όλα» (Jim: «τι θα γίνει αν έχει 10 apk εκεί;»). -->
            <span class="count">{S.t('ka_boxFound', { n: String(S.boxApks.length) })}</span>
            <div class="found">
              {#each S.boxApks as f (f.path)}
                <button type="button" class="fbtn tvlm-focus" class:on={S.boxApkPick === f.path} data-nav onclick={() => S.pickBoxApk(S.boxApkPick === f.path ? null : f.path)}>
                  <span class="fname mono ellipsis">{f.name}</span>
                  {#if f.usb}<span class="usb">USB</span>{/if}
                  <span class="fdir mono">{f.size ? `${(f.size / 1048576).toFixed(1)} MB` : f.dir}{f.when ? ` · ${f.when.slice(5)}` : ''}</span>
                </button>
              {/each}
            </div>
          {:else}
            <span class="warn"><i class="base-icon bi-warning-fill"></i>{S.t('ka_boxNone')}</span>
          {/if}
        {/if}
      </Card>
    {/snippet}

    <!-- ΤΟ ΑΡΧΕΙΟ ΤΟ ΔΕΙΧΝΕΙ Ο ΑΝΘΡΩΠΟΣ (Jim, 3/10/2026). Σε τηλεόραση χωρίς λογαριασμό Google και
         χωρίς επιλογέα αρχείων, οι άλλοι τρεις δρόμοι μπορεί να είναι ΟΛΟΙ κλειστοί — και η οθόνη
         κατέληγε σε αδιέξοδο. Εδώ δίνει έναν short code του Downloader ή μια διεύθυνση· εμείς τον
         λύνουμε (ο ΔΙΚΟΣ ΜΑΣ server απαντά και για τους κωδικούς του AFTVnews), κατεβάζουμε και
         στέλνουμε στο box με adb. Ο ίδιος αριθμός δουλεύει και στους δύο Downloader. -->
    <!-- Η ΔΙΕΥΘΥΝΣΗ ΑΝΟΙΓΕΙ ΣΤΟΝ BROWSER (Jim, 3/10/2026). Στην περίπτωση «ΣΕΛΙΔΑ» αυτό ΕΙΝΑΙ το
         επόμενο βήμα: ανοίγεις τη σελίδα, διαλέγεις αρχιτεκτονική και φέρνεις πίσω την απευθείας
         διεύθυνση. Μένει ΚΑΙ γραμμένη: σε TV box συχνά δεν υπάρχει browser να ανοίξει, και τότε
         διαβάζεται και πληκτρολογείται αλλού — ο ίδιος κανόνας με τα νομικά του «Σχετικά». -->
    {#snippet urlLink()}
      <!-- ΟΤΑΝ Ο ΚΩΔΙΚΟΣ ΟΔΗΓΕΙ ΣΕ ΣΕΛΙΔΑ, ΤΟ RING ΕΡΧΕΤΑΙ ΕΔΩ (Jim, 9/10): το επόμενο πάτημα είναι να
           ανοίξει η σελίδα στον browser του box — όχι το Google Play από πάνω. -->
      <button type="button" class="url mono tvlm-focus" data-nav data-nav-id="ka-url-link" data-nav-back="ka-code-card" data-nav-down="primary,back" title={S.codeUrl} onclick={() => S.openExternal(S.codeUrl)}>
        {S.codeUrl}
      </button>
    {/snippet}

    {#snippet codeCard()}
      <!-- Η ΚΑΡΤΑ ΕΙΝΑΙ <button>, ΑΡΑ ΤΟ ΠΕΔΙΟ ΔΕΝ ΜΠΟΡΕΙ ΝΑ ΜΠΕΙ ΜΕΣΑ ΤΗΣ (Jim, 3/10/2026: «δεν με
           αφήνει να γράψω»). Ενα <input> μέσα σε <button> είναι άκυρο HTML και ο browser δίνει το
           κλικ ΚΑΙ το focus στο κουμπί — το πεδίο έμοιαζε ζωντανό και ήταν νεκρό. Το πλαίσιο της
           απάντησης ζει ΔΙΠΛΑ στην κάρτα, κολλημένο από κάτω της, και είναι απλό div. -->
      <div class="codegroup" class:open={S.codeRoad}>
      <!-- ΜΟΛΙΣ ΑΝΟΙΞΕΙ Ο ΔΡΟΜΟΣ ΤΟΥ ΚΩΔΙΚΟΥ, ΤΟ RING ΜΠΑΙΝΕΙ ΜΕΣΑ (Jim, 9/10, emulator: «πρέπει το ring
           να πάει στο Κωδικός»). Το OK στην κάρτα ανοίγει το πλαίσιο· το επόμενο πάτημα είναι
           προφανώς ο κωδικός, άρα το ring πάει εκεί μόνο του — και ▼ από την κάρτα το ίδιο. -->
      <!-- ΤΟ ΣΠΙΤΙ ΤΟΥ RING ΣΕ ΑΥΤΗ ΤΗΝ ΟΘΟΝΗ (Jim, 10/10/2026: «default βάλε focus στο With a Downloader…»):
           ο κωδικός είναι πλέον προσυμπληρωμένος για κάθε γνωστό launcher, άρα είναι ο δρόμος με ένα OK. -->
      <Card sel={S.codeRoad} column padding="16px 18px" data-nav-id="ka-code-card" data-nav-first="" data-nav-down={S.codeRoad ? 'ka-code' : null} onpick={() => { S.pickCodeRoad(true); ringTo('ka-code'); }}>
        <div class="orow">
          <span class="dlico"><img src="{S.assetBase}downloader-tv.png" alt="" draggable="false" /></span>
          <span class="otxt">
            <b>{S.t('ka_code')}</b>
            {#if !quiet || S.codeRoad}<span class="odesc">{S.t('ka_codeD')}</span>{/if}
          </span>
        </div>
      </Card>
      {#if S.codeRoad}
        <div class="codepanel" bind:this={panelEl}>
          <!-- ΤΟ ΠΕΔΙΟ ΔΕΙΧΝΕΙ, ΔΕΝ ΓΡΑΦΕΤΑΙ (Jim, 3/10/2026, με φωτογραφία από Android TV: το
               πληκτρολόγιο του συστήματος σκέπασε το κουτάκι και πληκτρολογούσε στα τυφλά). Η
               γραφή γίνεται σε διάλογο που κάθεται ψηλά, πάνω από το πληκτρολόγιο· εδώ μένουν
               τέσσερα κουμπιά με ring, που φτάνονται με το τηλεχειριστήριο. -->
          <div class="cin mono" class:empty={!S.codeInput}>{S.codeInput || S.t('ka_codePh')}</div>
          <div class="cbtns">
            <button type="button" class="cbtn tvlm-focus" data-nav data-nav-id="ka-code" data-nav-left="." data-nav-right="ka-url" data-nav-up="ka-code-card" data-nav-back="ka-code-card" onclick={() => S.openCodeAsk('code')}><i class="base-icon bi-caret-down"></i>{S.t('ka_bCode')}</button>
            <button type="button" class="cbtn tvlm-focus" data-nav data-nav-id="ka-url" data-nav-left="ka-code" data-nav-right="ka-paste,ka-clear" data-nav-up="ka-code-card" data-nav-back="ka-code-card" onclick={() => S.openCodeAsk('url')}>{S.t('ka_bUrl')}</button>
            {#if S.canPaste}
              <button type="button" class="cbtn tvlm-focus" data-nav data-nav-id="ka-paste" data-nav-left="ka-url" data-nav-right="ka-clear" data-nav-up="ka-code-card" data-nav-back="ka-code-card" onclick={() => S.pasteCode()}>{S.t('ka_bPaste')}</button>
            {/if}
            <!-- ΔΕΝ ΑΠΕΝΕΡΓΟΠΟΙΕΙΤΑΙ (Jim, 3/10/2026: «πατώντας καθαρισμό έκανε clear και μετά έχασα
                 το ring — προφανώς έκανες disable το button και χάθηκε»). Σωστό: ένα κουμπί που
                 γίνεται `disabled` ΤΗ ΣΤΙΓΜΗ που το πατάς χάνει το focus, και με τηλεχειριστήριο
                 η οθόνη μένει χωρίς δαχτυλίδι. Σε άδειο πεδίο απλώς δεν κάνει τίποτα. -->
            <button type="button" class="cbtn tvlm-focus" data-nav data-nav-id="ka-clear" data-nav-left="ka-paste,ka-url" data-nav-right="." data-nav-up="ka-code-card" data-nav-back="ka-code-card" class:dim={!S.codeInput} onclick={() => S.clearCode()}>{S.t('ka_bClear')}</button>
          </div>
          {#if S.codePasteErr}<span class="warn"><i class="base-icon bi-warning-fill"></i>{S.codePasteErr}</span>{/if}
          <span class="hint">{mineCode ? S.t('ka_codeMine', { app: row?.name ?? '' }) : S.t('ka_codeHint')}</span>
          <!-- Η ΑΠΑΝΤΗΣΗ ΚΥΛΑ ΜΟΝΗ ΤΗΣ ΣΤΟ ΟΡΑΤΟ (Jim, 3/10/2026: «δεν τον βρήκες αλλά εγώ δεν
               βλέπω τίποτα»). Η περιοχή κυλά, η κάρτα είναι η τρίτη από τέσσερις, και ό,τι
               γράφεται κάτω από το κουτάκι έπεφτε έξω από το κάδρο: το κουμπί απαντούσε και ο
               άνθρωπος έβλεπε την ίδια οθόνη. Δεν παίρνουμε focus — μόνο κύλιση. -->
          <div class="ans" bind:this={answerEl}>
          {#if S.codeState === 'ready'}
            <span class="okline"><i class="base-icon bi-check"></i>{S.t('ka_codeFound')}</span>
            {@render urlLink()}
          {:else if S.codeState === 'page'}
            <!-- ΛΥΘΗΚΕ, ΑΛΛΑ ΣΕ ΣΕΛΙΔΑ. Ο `71893` πάει στο stremio.com/downloads με τέσσερις
                 αρχιτεκτονικές: ό,τι διαλέξει εκεί ένας άνθρωπος είναι απάντηση ΤΗΣ ΣΥΣΚΕΥΗΣ του,
                 όχι του κωδικού — δεν μαντεύουμε, ζητάμε την απευθείας διεύθυνση. -->
            <span class="warn"><i class="base-icon bi-warning-fill"></i>{S.t('ka_codePage')}</span>
            {@render urlLink()}
          {:else if S.codeErr}
            <span class="warn"><i class="base-icon bi-warning-fill"></i>{S.codeErr}</span>
            {#if S.codeUrl}{@render urlLink()}{/if}
          {/if}
          </div>
        </div>
      {/if}
      </div>
    {/snippet}

  <div class="right">
    <!-- ΤΟ ΚΟΥΜΠΙ ΕΦΕΥΓΕ ΚΑΤΩ ΑΠΟ ΤΗΝ ΟΘΟΝΗ (Jim, 3/10): τρεις επιλογές, λίστα με APK του
         κουτιού και από κάτω ένα μήνυμα σφάλματος δεν χωρούν σε 720 γραμμές. Ό,τι είναι πάνω
         από τη χρυσή ενέργεια κυλά· η ενέργεια μένει ΠΑΝΤΑ καρφωμένη και ορατή. -->
    <div class="scroller">
    <!-- who this is: the tile, the name, the package, and whether the box has it -->
    <div class="app">
      <!-- ΤΟ ΕΙΚΟΝΙΔΙΟ ΤΗΣ ΕΦΑΡΜΟΓΗΣ, ΟΧΙ ΤΟ ΑΡΧΙΚΟ ΤΗΣ (Jim, 8/10). Ίδια σειρά με τον επιλογέα:
           ό,τι ζωγραφίζει το ΚΟΥΤΙ, μετά το `<package>.png`, μετά το `<id>.png` που στέλνουμε
           εμείς. Γράμμα μόνο όταν δεν φορτώνει κανένα. -->
      <span class="tile" class:img={!!art} style:background={art ? 'rgba(255,255,255,.06)' : (row?.tint ?? 'rgba(255,255,255,.12)')}>
        {#if other}<i class="base-icon bi-caret-down"></i>
        {:else if art}<img src={art} alt="" onerror={() => (missing = { ...missing, [art]: true })} />
        {:else}{(row?.name ?? '?').slice(0, 1)}{/if}
      </span>
      <span class="atxt">
        <b>{other ? S.t('wl_other') : row?.name}</b>
        <span class="mono pkg">{other ? S.t('wl_otherD') : row?.package}</span>
      </span>
      <!-- no "installed / not installed" badge on a row that names no app: there is nothing to
           be installed or missing yet -->
      {#if !other}<span class="pill" class:ok={here}>{S.t(here ? 'wk_inst' : 'wl_notInst')}</span>{/if}
    </div>

    {#if other}
      <!-- THREE ROADS (Jim, 29/9): search Play on the television, send an APK — the likeliest
           thing to be in hand — or pick one the box already has. -->
      <div class="eyebrow">{S.t('ka_how')}</div>
      <Card sel={!S.kioskApkName && !S.pickInstalled} column padding="16px 18px" onpick={() => { S.pickKioskApk(null); S.pickInstalledRoad(false); }}>
        <div class="orow">
          <span class="ico-circle"><i class="plui-icon pi-cat-others"></i></span>
          <span class="otxt"><b>{S.t('ka_search')}</b>{#if !quiet}<span class="odesc">{S.t('ka_searchD')}</span>{/if}</span>
        </div>
        {#if !hasPlay}<span class="warn"><i class="base-icon bi-warning-fill"></i>{S.t('ka_noPlayAny')}</span>{/if}
      </Card>
      {#if S.canPickApk}
        <Card sel={!!S.kioskApkName} column padding="16px 18px" onpick={() => input?.click()}>
          <div class="orow">
            <span class="ico-circle"><i class="plui-icon pi-bag"></i></span>
            <span class="otxt"><b>{S.t('ka_apk')}</b>{#if !quiet}<span class="odesc">{S.t('ka_apkOtherD')}</span>{/if}</span>
          </div>
          {#if S.kioskApkName}<span class="file mono">{S.kioskApkName}</span>{/if}
        </Card>
      {/if}
      {@render codeCard()}
      {@render boxCard()}
      <!-- the road exists from a computer, not from this SET: no app here answers a file picker,
           and the press raised Android's own toast and nothing else (Jim, 29/9). It goes away the
           moment the box's own list has something in it: the canvas is a fixed height, and advice
           about ANOTHER road must not push the button that walks THIS one off the screen. -->
      {#if S.canDirectInstall && !S.canPickApk && !S.boxApks.length}
        <Notice kind="gold">{S.t('ka_noPicker')}</Notice>
      {/if}
      {#if S.otherHomeApps.length}
        <Card sel={S.pickInstalled} column padding="16px 18px" onpick={() => { S.pickKioskApk(null); S.pickInstalledRoad(true); }}>
          <div class="orow">
            <span class="ico-circle"><i class="plui-icon pi-top-bar"></i></span>
            <span class="otxt"><b>{S.t('ka_pick')}</b><span class="odesc">{S.t('ka_pickD', { n: String(S.otherHomeApps.length) })}</span></span>
          </div>
        </Card>
      {/if}
      <input bind:this={input} type="file" accept=".apk,application/vnd.android.package-archive" hidden onchange={(e) => S.pickKioskApk(e.currentTarget.files?.[0] ?? null)} />
    {:else if here}
      {#if S.kioskFacts.length}
        <div class="facts">
          {#each S.kioskFacts as f (f.key)}
            <div class="fact"><span class="k">{S.t(f.key)}</span><b class="v ellipsis">{f.value}</b></div>
          {/each}
        </div>
      {/if}
      <div class="eyebrow">{S.t('th_willRun')}</div>
      <div class="cmds mono">
        {#each willRun as c (c)}<div class="cmd">$ {c}</div>{/each}
      </div>
    {:else}
      <div class="eyebrow">{S.t('ka_how')}</div>
      {#if !offPlay}
      <Card sel={!S.kioskApkName && hasPlay} column padding="16px 18px" onpick={() => hasPlay && S.pickKioskApk(null)}>
        <div class="orow">
          <span class="ico-circle"><i class="plui-icon pi-cat-others"></i></span>
          <span class="otxt"><b>{S.t('ka_play')}</b>{#if !quiet}<span class="odesc">{S.t('ka_playD')}</span>{/if}</span>
        </div>
        <!-- the Google account line is the KIOSK's problem (the lock refuses to start with one
             on the box); on the launcher door the same account is simply what Play needs. -->
        {#if !quiet}<span class="warn"><i class="base-icon bi-warning-fill"></i>{hasPlay ? S.t(kiosk ? 'ka_playW' : 'ka_playWl') : S.t('wl_subNoPlay', { app: row?.name ?? '' })}</span>{/if}
      </Card>
      {/if}
      <!-- the file input below is bound whenever this block is drawn, which is exactly when the
           gold button can be the `file` one — so that button can open it too -->
      {#if S.canPickApk}
        <!-- the copy that came from Google Play installs nothing itself, so this half is not drawn there -->
        <Card sel={!!S.kioskApkName} column padding="16px 18px" onpick={() => input?.click()}>
          <div class="orow">
            <span class="ico-circle"><i class="plui-icon pi-bag"></i></span>
            <span class="otxt"><b>{S.t('ka_apk')}</b>{#if !quiet}<span class="odesc">{S.t('ka_apkD', { app: row?.name ?? '' })}</span>{/if}</span>
          </div>
          {#if S.kioskApkName}<span class="file mono">{S.kioskApkName}</span>{/if}
        </Card>
        <input bind:this={input} type="file" accept=".apk,application/vnd.android.package-archive" hidden onchange={(e) => S.pickKioskApk(e.currentTarget.files?.[0] ?? null)} />
      {/if}
      {@render codeCard()}
      {@render boxCard()}
      {#if S.canDirectInstall && !S.canPickApk && !S.boxApks.length}
        <Notice kind="gold">{S.t('ka_noPicker')}</Notice>
      {/if}
      {#if S.kioskWaiting}
        <Notice kind="gold">{S.t('ka_pressInstall')}</Notice>
      {/if}
    {/if}

    {#if S.kioskAppError}<div bind:this={errEl}><Notice kind="danger">{S.kioskAppError}</Notice></div>{/if}

    </div>

    <!-- one gold action, like every other screen of the guide: what it says is what it does -->
    <!-- data-nav-id="primary": χωρίς αυτό το ringTo('primary') μετά τη λύση του κωδικού ΔΕΝ έβρισκε
         τίποτα σε αυτή την οθόνη (μετρήθηκε 10/10 στο mock) — το ring έμενε στο «Κωδικός». -->
    <button type="button" class="cta tvlm-focus" data-nav data-primary data-nav-id="primary" disabled={S.launcherBusy || S.kioskApkBusy || !!cta.blocked} onclick={() => (cta.kind === 'file' ? input?.click() : S.runKioskAppCta())}>
      <span class="lbl">{S.launcherBusy || S.kioskApkBusy ? (S.stageText ?? S.t('wl_working')) : cta.label} &nbsp;»</span>
    </button>
    <div class="ctasub" class:warn={!!cta.blocked}>{S.launcherBusy || S.kioskApkBusy ? S.t('wl_keepOn') : cta.sub}</div>
  </div>
</div>

<style>
  .wka { display: grid; grid-template-columns: 430px 1fr; gap: 48px; min-height: 0; }
  .left { display: flex; flex-direction: column; padding-top: 10px; }
  .eye { font: 600 12px var(--font-display); letter-spacing: 3px; color: var(--wiz-gold-light); }
  .ttl { margin: 12px 0 0; font: 700 34px/1.15 var(--font-display); text-wrap: pretty; }
  .body { margin: 14px 0 0; font-size: 16px; line-height: 1.55; color: rgba(255,255,255,.72); text-wrap: pretty; }
  .pts { display: flex; flex-direction: column; gap: 12px; margin-top: 26px; }
  .pt { display: flex; align-items: flex-start; gap: 12px; font-size: 14.5px; line-height: 1.45; color: rgba(255,255,255,.82); }
  .tk { width: 30px; height: 30px; border-radius: 9px; background: rgba(0,161,169,.18); color: var(--wiz-teal-check); display: flex; align-items: center; justify-content: center; flex: none; }
  .tk i { font-size: 12px; }
  .skip { align-self: flex-start; background: none; border: 1px solid rgba(255,255,255,.22); border-radius: 999px; padding: 9px 18px; color: rgba(255,255,255,.85); font-size: 14px; font-weight: 600; white-space: nowrap; }
  .skip:hover { background: rgba(255,255,255,.08); }
  .right { display: flex; flex-direction: column; gap: 12px; min-height: 0; min-width: 0; }
  /* Το ring ζωγραφίζεται ΕΞΩ από το στοιχείο, οπότε χωρίς αυτά τα περιθώρια κόβεται στην άκρη
     της περιοχής που κυλά — το ίδιο μάθημα με τη λίστα γλωσσών του W1. */
  .scroller { flex: 1; min-height: 0; min-width: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 12px; margin: 0 -10px; padding: 4px 10px; }
  .app { flex: none; display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 16px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); }
  .tile { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font: 700 20px var(--font-display); color: #fff; flex: none; }
  .tile.img { padding: 3px; }
  .tile img { width: 100%; height: 100%; object-fit: contain; border-radius: 9px; }
  .atxt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .atxt b { font: 700 18px var(--font-display); }
  .pkg { font-size: 12px; color: rgba(255,255,255,.5); }
  .pill { flex: none; white-space: nowrap; font: 700 11px var(--font-display); letter-spacing: .6px; padding: 5px 12px; border-radius: 999px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.7); }
  .pill.ok { background: rgba(16,185,129,.16); color: #34d399; }
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .fact { display: flex; flex-direction: column; gap: 4px; padding: 12px 16px; border-radius: 14px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); min-width: 0; }
  .fact .k { font: 600 10.5px var(--font-display); letter-spacing: 1.4px; color: rgba(255,255,255,.45); }
  .fact .v { font: 600 15px var(--font-display); }
  .dlico { width: 38px; height: 38px; border-radius: 11px; overflow: hidden; flex: none; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.06); }
  .dlico img { width: 100%; height: 100%; object-fit: cover; display: block; }
  /* ΕΝΑ ΠΛΑΙΣΙΟ, ΚΑΡΤΑ ΚΑΙ ΠΕΔΙΟ ΜΑΖΙ (Jim, 3/10/2026: «ένωσε το frame»). Η πρώτη απόπειρα το
     κόλλησε με αρνητικό περιθώριο και έσπασε, γιατί η κάρτα είναι <button> με ΔΙΚΟ του
     στρογγυλεμένο περίγραμμα που ζωγραφιζόταν από πάνω. Η σωστή ένωση θέλει να χάσει η ΚΑΡΤΑ τις
     κάτω γωνίες και την κάτω γραμμή της όσο το πλαίσιο είναι ανοιχτό — και αυτό γίνεται μόνο από
     έξω, με `:global` μέσα στην ομάδα, γιατί το Card δεν παίρνει class. */
  .codegroup { display: flex; flex-direction: column; min-width: 0; }
  .codegroup.open :global(.card) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom-color: transparent; }
  .codepanel { display: flex; flex-direction: column; gap: 10px; padding: 4px 18px 16px; border-radius: 0 0 18px 18px; background: var(--card-sel-bg); border: 1px solid var(--card-sel-border); border-top: none; min-width: 0; }
  .url:hover { color: rgba(255,255,255,.85); }
  .cin { width: 100%; padding: 11px 14px; border-radius: 12px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.18); color: #fff; font-size: 15px; letter-spacing: .5px; overflow-wrap: anywhere; min-height: 44px; }
  /* Αδειο = η υπόδειξη, στο χρώμα της υπόδειξης — όχι ψεύτικο κείμενο που μοιάζει τιμή. */
  .cin.empty { color: rgba(255,255,255,.35); letter-spacing: 0; }
  .cbtns { display: flex; flex-wrap: wrap; gap: 8px; }
  .cbtn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 15px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18); color: #fff; font: 600 13.5px var(--font-display); white-space: nowrap; }
  .cbtn:hover:not(:disabled) { background: rgba(255,255,255,.14); }
  .cbtn.dim { opacity: .45; }
  .cbtn i { font-size: 11px; opacity: .7; }
  .ans { display: flex; flex-direction: column; gap: 8px; scroll-margin-bottom: 14px; }
  .hint { font-size: 12px; color: rgba(255,255,255,.5); line-height: 1.45; }
  .okline { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: #34d399; }
  /* ΜΙΑ ΛΕΞΗ 200 ΧΑΡΑΚΤΗΡΩΝ: χωρίς `anywhere` το min-content της σπρώχνει τη στήλη έξω από το
     παράθυρο — αυτό ακριβώς έγινε με διεύθυνση Dropbox (Jim, 3/10/2026). Δύο γραμμές φτάνουν
     για να αναγνωρίσει κανείς τι βρέθηκε· η πλήρης διεύθυνση είναι στην κονσόλα. */
  .url { align-self: flex-start; text-align: left; background: none; border: none; padding: 0; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; font-size: 11.5px; color: rgba(255,255,255,.55); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .cmds { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border-radius: 14px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.1); }
  .cmd { font-size: 12.5px; color: rgba(255,255,255,.72); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .orow { display: flex; align-items: center; gap: 14px; width: 100%; }
  .otxt { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; text-align: left; }
  .otxt b { font: 700 16px var(--font-display); }
  .odesc { font-size: 13px; line-height: 1.45; color: rgba(255,255,255,.7); text-wrap: pretty; }
  .warn { display: flex; align-items: flex-start; gap: 8px; margin-top: 10px; font-size: 12.5px; line-height: 1.45; color: var(--wiz-gold-light); text-align: left; }
  .cta { flex: none; height: 58px; border: none; border-radius: 999px; background: var(--wiz-gold); color: var(--wiz-gold-text); font: 700 17px var(--font-display); white-space: nowrap; }
  .cta:hover:not(:disabled) { background: var(--wiz-gold-hover); }
  .cta:disabled { opacity: .55; }
  .ctasub { flex: none; margin-top: 8px; font-size: 13px; line-height: 1.45; color: rgba(255,255,255,.62); text-align: center; text-wrap: pretty; }
  .ctasub.warn { color: var(--wiz-gold-light); }
  /* ΧΩΡΟΣ ΓΙΑ ΤΟΝ ΔΑΚΤΥΛΙΟ: ζωγραφίζεται ΕΞΩ από το κουμπί, κι ένας scroller τον κόβει και στις
     τέσσερις πλευρές. Το ίδιο κόλπο με τη λίστα των launchers (WLauncher `.list`): αρνητικό
     margin όσο το padding, ώστε ο χώρος του δακτυλίου να είναι ΜΕΣΑ στον scroller και η λίστα
     να μη μετακινηθεί ούτε ένα pixel. Το `scroll-margin` κρατά τη σειρά μακριά από την άκρη
     όταν κυλά προς αυτήν. */
  .found { display: flex; flex-direction: column; gap: 6px; margin: 8px -9px 0; width: calc(100% + 18px); max-height: 148px; overflow: auto; padding: 6px 9px; }
  .count { align-self: flex-start; margin-top: 12px; font: 600 11px var(--font-label); letter-spacing: 1.4px; color: rgba(255,255,255,.45); }
  .fbtn { scroll-margin: 7px; }
  .fbtn { display: flex; align-items: baseline; gap: 10px; width: 100%; text-align: left; padding: 7px 11px; border-radius: 10px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.04); }
  .fbtn.on { border-color: var(--wiz-teal-check); background: rgba(0,161,169,.16); }
  .fname { font-size: 12.5px; color: #fff; flex: 1; min-width: 0; }
  .fdir { font-size: 11px; color: rgba(255,255,255,.45); flex: none; }
  .usb { flex: none; font: 700 9.5px var(--font-display); letter-spacing: .8px; padding: 2px 7px; border-radius: 999px; background: rgba(0,161,169,.18); color: var(--wiz-teal-soft); }
  .file { margin-top: 10px; font-size: 12.5px; color: var(--wiz-teal-soft); align-self: flex-start; }
</style>
