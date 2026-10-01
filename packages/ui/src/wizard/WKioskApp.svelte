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
  import { getSession } from '../context.js';
  import Card from '../components/Card.svelte';
  import Notice from '../components/Notice.svelte';
  const S = getSession();
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
  // The APK line is a promise only the editions that may install can keep: the copy that came from
  // Google Play draws no such card, so it must not list it either (seen 29/9 on ?play=1).
  const points = $derived(
    other
      ? [S.t('ka_oP1'), ...(S.canPickApk ? [S.t('ka_oP2')] : []), ...(S.otherHomeApps.length ? [S.t('ka_oP3')] : [])]
      : here
        ? [S.t('ka_aP1'), S.t('ka_aP2'), S.t('ka_aP3')]
        : [S.t('ka_bP1'), ...(S.canPickApk ? [S.t('ka_bP2')] : []), S.t('ka_bP3')],
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

  <div class="right">
    <!-- who this is: the tile, the name, the package, and whether the box has it -->
    <div class="app">
      <span class="tile" style:background={row?.tint ?? 'rgba(255,255,255,.12)'}>
        {#if other}<i class="base-icon bi-caret-down"></i>{:else}{(row?.name ?? '?').slice(0, 1)}{/if}
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
      <Card sel={!S.kioskApkName && hasPlay} column padding="16px 18px" onpick={() => hasPlay && S.pickKioskApk(null)}>
        <div class="orow">
          <span class="ico-circle"><i class="plui-icon pi-cat-others"></i></span>
          <span class="otxt"><b>{S.t('ka_play')}</b>{#if !quiet}<span class="odesc">{S.t('ka_playD')}</span>{/if}</span>
        </div>
        <!-- the Google account line is the KIOSK's problem (the lock refuses to start with one
             on the box); on the launcher door the same account is simply what Play needs. -->
        {#if !quiet}<span class="warn"><i class="base-icon bi-warning-fill"></i>{hasPlay ? S.t(kiosk ? 'ka_playW' : 'ka_playWl') : S.t('wl_subNoPlay', { app: row?.name ?? '' })}</span>{/if}
      </Card>
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
      {@render boxCard()}
      {#if S.canDirectInstall && !S.canPickApk && !S.boxApks.length}
        <Notice kind="gold">{S.t('ka_noPicker')}</Notice>
      {/if}
      {#if S.kioskWaiting}
        <Notice kind="gold">{S.t('ka_pressInstall')}</Notice>
      {/if}
    {/if}

    {#if S.kioskAppError}<Notice kind="danger">{S.kioskAppError}</Notice>{/if}

    <div style="flex:1"></div>
    <!-- one gold action, like every other screen of the guide: what it says is what it does -->
    <button type="button" class="cta tvlm-focus" data-nav data-primary disabled={S.launcherBusy || S.kioskApkBusy || !!cta.blocked} onclick={() => (cta.kind === 'file' ? input?.click() : S.runKioskAppCta())}>
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
  .right { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
  .app { flex: none; display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 16px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); }
  .tile { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font: 700 20px var(--font-display); color: #fff; flex: none; }
  .atxt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .atxt b { font: 700 18px var(--font-display); }
  .pkg { font-size: 12px; color: rgba(255,255,255,.5); }
  .pill { flex: none; white-space: nowrap; font: 700 11px var(--font-display); letter-spacing: .6px; padding: 5px 12px; border-radius: 999px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.7); }
  .pill.ok { background: rgba(16,185,129,.16); color: #34d399; }
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .fact { display: flex; flex-direction: column; gap: 4px; padding: 12px 16px; border-radius: 14px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); min-width: 0; }
  .fact .k { font: 600 10.5px var(--font-display); letter-spacing: 1.4px; color: rgba(255,255,255,.45); }
  .fact .v { font: 600 15px var(--font-display); }
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
