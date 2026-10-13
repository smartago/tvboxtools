<script lang="ts">
  // W6 Find the box: scan (mDNS + subnet + USB) · found list · nothing found (troubleshooting) · manual IP / pairing.
  // platform web + Wi‑Fi: the "Wi‑Fi needs a bridge" block with 3 options (DESIGN_NOTES §12).
  import { getSession } from '../context.js';
  import Card from '../components/Card.svelte';
  import { ringTo } from '../nav.js';
  import Notice from '../components/Notice.svelte';
  import PillButton from '../components/PillButton.svelte';
  import type { StrKey } from '../i18n/index.svelte.js';
  const S = getSession();
  const methodKey = (m: string): StrKey => (m === 'usb' ? 'm_usb' : m === 'wireless' ? 'm_wl' : 'm_tcp');
  // A cable is not a network. Everything on this screen that says "Wi-Fi" — the line under the
  // title, the scanning label, the three things to try, the buttons, the IP box — is wrong the
  // moment the previous screen was answered with "USB debugging" (Jim, 23/9).
  const usb = $derived(S.debug === 'usb');
  const tips = $derived<StrKey[]>(usb ? ['w6_u1', 'w6_u2', 'w6_u3'] : ['w6_ts1', 'w6_ts2', 'w6_ts3']);
  // Κλειστό από προεπιλογή: ο τίτλος αρκεί για να ξέρεις ότι υπάρχει βοήθεια, και η λίστα μένει
  // ολόκληρη στην οθόνη. Ανοίγει μόνο όποιος τη χρειάζεται.
  let helpOpen = $state(false);
</script>

<div class="screen w6">
  <div class="left">
    <div><h2 class="h2">{S.t('w6_title')}</h2><p class="lead" style="margin-top:10px"><i class="base-icon {usb ? 'bi-solid-arrow-right' : 'bi-wifi'}" style="font-size:16px;margin-right:8px;color:var(--wiz-teal-soft)"></i>{S.t(usb ? 'w6_bodyUsb' : 'w6_body')}</p></div>

    {#if S.webBridge}
      <div class="block warn">
        <div class="bh"><i class="base-icon bi-warning-fill" style="color:var(--warning);font-size:20px"></i><b>{S.t('web_bridge')}</b></div>
        <span class="bd">{S.t('web_bridgeD')}</span>
        <div class="opts">
          <button type="button" class="opt gold" data-nav onclick={() => S.bridgeDesktop()}><b>{S.t('web_b1')}</b><span>{S.t('web_b1D')}</span></button>
          <button type="button" class="opt" data-nav onclick={() => S.bridgePhone()}><b>{S.t('web_b2')}</b><span>{S.t('web_b2D')}</span></button>
          <button type="button" class="opt" data-nav onclick={() => S.bridgeUsb()}><b>{S.t('web_b3')}</b><span>{S.t('web_b3D')}</span></button>
        </div>
        {#if S.bridgeWait}
          <div class="bridgewait">
            <i class="base-icon bi-spinner tvlm-spin" style="font-size:20px;color:var(--wiz-gold-light)"></i>
            <span><b>{S.t('web_wait')}</b><br /><span class="bd">{S.t('web_waitD')}</span></span>
            <button type="button" class="btn btn-ghost xs" data-nav onclick={() => S.bridgeCancel()}>{S.t('web_cancel')}</button>
          </div>
        {/if}
        {#if S.bridgeFailed}
          <div class="bridgewait">
            <i class="base-icon bi-warning-fill" style="font-size:20px;color:var(--warning)"></i>
            <span><b>{S.t('web_noBridge')}</b><br /><span class="bd">{S.t('web_noBridgeD')}</span></span>
            <button type="button" class="btn btn-gold xs" data-nav onclick={() => S.waitForBridge()}>{S.t('web_retry')}</button>
          </div>
        {/if}
        {#if S.bridgeQr}
          <div class="qrrow"><div class="qr"></div><span class="qrt">{S.t('web_qr')}<br /><span class="mono dim" style="font-size:12px">{S.brand.domain}/setup?session=7F3A</span></span></div>
        {/if}
      </div>
    {/if}

    {#if S.scan === 'scanning'}
      <div class="scanning"><i class="base-icon bi-spinner tvlm-spin" style="font-size:22px;color:var(--wiz-gold-light)"></i><span style="font-size:16px">{S.t(usb ? 'w6_scanUsb' : 'w6_scan')}</span><span class="mono dim" style="margin-left:auto;font-size:12px">{S.scanLabel}</span></div>
      {#if S.canPickUsb}
        <!-- WebUSB: the page cannot see a cable until Chrome's own dialog grants it, and that
             dialog opens only from a click. Without this button the scan is a promise we cannot
             keep (Jim, 23/9). -->
        <div class="pick">
          <PillButton size="sm" onclick={() => S.pickUsb()}>{S.t('w6_pick')}</PillButton>
          <span class="pd">{S.t('w6_pickD')}</span>
        </div>
        {#if S.pickMsg}<div style="margin-top:10px"><Notice kind="warn">{S.t(S.pickMsg)}</Notice></div>{/if}
      {/if}
    {/if}

    {#if S.scan === 'found'}
      <!-- ΚΑΘΕ ΕΣΤΙΑΣΜΕΝΟ ΞΕΡΕΙ ΤΙΣ ΕΞΟΔΟΥΣ ΤΟΥ (nav.ts). Μετρημένο στον emulator 9/10: από τη γραμμή
           «Δεν βλέπεις το δικό σου box;» το ▼ δεν έφτανε ποτέ στο «Σύνδεση» (κάτω δεξιά, έξω από τον
           κώνο της γεωμετρίας), και το «Σάρωση ξανά» δεν ήταν καν στόχος. Το OK σε κουτί = διάλεξε
           ΚΑΙ προχώρα (Jim: «πατάω OK στο επιλεγμένο, δεν πάει στη σύνδεση»). -->
      <div class="fh"><span>{S.t('w6_found')} · {S.devices.length}</span><button type="button" class="btn btn-outline xs" style="height:32px" data-nav data-nav-id="w6-rescan" data-nav-down="w6-dev-0,w6-help" data-nav-up="." data-nav-right="w6-manual" onclick={() => S.rescan()}>{S.t('w6_rescan')}</button></div>
      <div class="list">
        {#each S.devices as d, i (d.id)}
          <Card
            sel={S.devSel === i}
            padding="12px 16px"
            data-nav-id={'w6-dev-' + i}
            data-nav-first={i === 0 ? '' : null}
            data-nav-up={i === 0 ? 'w6-rescan' : null}
            data-nav-down={i === S.devices.length - 1 ? 'w6-help,primary' : null}
            data-nav-right="w6-manual,w6-help"
            data-nav-left="."
            onpick={() => {
              // OK = διάλεξε ΚΑΙ ring στο «Σύνδεση» — ΟΧΙ σύνδεση μόνη της (Jim, 9/10, emulator: «πατώντας
              // OK πηδάει στην Αποδοχή και βγάζει error — γιατί δεν πάει στο button;»). Το κουμπί είναι το
              // μέρος όπου ο άνθρωπος βλέπει ποιο κουτί διάλεξε πριν το πατήσει.
              S.devSel = i;
              ringTo('primary');
            }}
          >
            <span class="dico" class:self={d.self}><i class="base-icon {d.self ? 'bi-remote' : d.method === 'usb' ? 'bi-solid-arrow-right' : 'bi-wifi'}"></i></span>
            <span class="dtxt"><b>{d.name}</b><span class="mono">{d.addr}</span></span>
            <!-- the box the tool is running on: on a TV the scan always finds it, and the installer
                 must not have to work out which address is the set in front of them -->
            {#if d.self}<span class="tag tag-gold" style="font-size:12px;padding:4px 10px">{S.t('w6_self')}</span>{/if}
            <span class="tag tag-teal" style="font-size:12px;padding:4px 10px">{S.t(methodKey(d.method))}</span>
          </Card>
        {/each}
      </div>
      <!-- Η ΛΙΣΤΑ ΔΕΝ ΕΙΝΑΙ ΑΔΕΙΑ ΑΛΛΑ ΤΟ ΔΙΚΟ ΣΟΥ ΛΕΙΠΕΙ: η βοήθεια του `scan === 'empty'` δεν
           βγαίνει ποτέ όταν βρέθηκαν ΑΛΛΑ κουτιά (ο Jim έβλεπε δύο emulator και όχι το box του).
           Εδώ λοιπόν μπαίνει η μόνη ερώτηση που έχει σημασία μπροστά σε μια λίστα: «πού είναι το
           δικό μου;» — όχι το πώς θα πάει ασύρματα αργότερα (Jim, 2/10: «άχρηστο μήνυμα»). -->
      <!-- ΜΑΖΕΜΕΝΟ (Jim, 2/10: «είναι τεράστιο, χάνεται ο user»): τέσσερις παράγραφοι κάτω από τη
           λίστα έσπρωχναν τα πάντα έξω από την οθόνη. Μένει ΜΟΝΟ ο τίτλος, με ring σαν κανονικό
           χειριστήριο — ανοίγει με OK/Enter/κλικ όποιος ΘΕΛΕΙ να διαβάσει. -->
      <div class="cant" class:open={helpOpen}>
        <!-- Το εικονίδιο του Jim (2/10). Inline SVG και όχι κλάση `base-icon`: η γραμματοσειρά
             icomoon δεν έχει glyph γι' αυτό, και μια ανύπαρκτη κλάση βγάζει άδειο τετράγωνο. -->
        <button type="button" class="canth tvlm-focus" data-nav data-nav-id="w6-help" data-nav-up={'w6-dev-' + (S.devices.length - 1)} data-nav-down="primary,back" data-nav-right="w6-manual" data-nav-left="." aria-expanded={helpOpen} onclick={() => (helpOpen = !helpOpen)}>
          <svg class="bico" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path d="m56 8.98h-48a3.99675 3.99675 0 0 0 -4 3.99v30.37a3.99675 3.99675 0 0 0 4 3.99h5.25641l-2.0517 5.68957h-3.43127a1.00013 1.00013 0 0 0 .00006 2h48.45013a1.0002 1.0002 0 0 0 -.00008-2h-3.43168l-2.0517-5.68957h5.25983a3.99675 3.99675 0 0 0 4-3.99v-30.37a3.99675 3.99675 0 0 0 -4-3.99zm-25.07 34.34a1.06521 1.06521 0 0 1 2.13 0 1.06521 1.06521 0 0 1 -2.13 0zm12.63-11.14a10.10232 10.10232 0 0 1 -13.27-2.66l-2.59 1.56c.39819.71636 1.244 1.72559.92993 2.61a1.76974 1.76974 0 0 1 -.83 1.13l-7.44 4.44a4.26517 4.26517 0 1 1 -4.37988-7.32l7.43995-4.44a1.83463 1.83463 0 0 1 1.39-.21c.9361.14634 1.41607 1.375 1.86 2.07l2.59-1.55c-5.02279-11.67119 10.8462-20.1943 17.79-9.45995a10.10119 10.10119 0 0 1 -3.49 13.82995zm7.10663 20.83954h-37.3357l2.05176-5.68954h33.23218z" /><path d="m38.38 15.44a8.08353 8.08353 0 1 0 4.16 15.02c7.01974-4.252 3.93713-15.02057-4.16-15.02z" /><path d="m24.31 29.3-7.3 4.36a2.26035 2.26035 0 1 0 2.32 3.88l7.3-4.36c-.58043-.96547-1.74039-2.91438-2.32-3.88z" /></svg>
          <span class="cantt">{S.t('w6_cant')}</span>
          <span class="more">{helpOpen ? S.t('w6_less') : S.t('more')}</span>
          <i class="base-icon bi-caret-down" class:up={helpOpen}></i>
        </button>
        {#if helpOpen}
          <div class="cantb tvlm-fade">
            <span>{S.t('w6_c1')}</span>
            <span>{S.t('w6_c2')}</span>
            {#if S.showManual && !usb}<span>{S.t('w6_c3')}</span>{/if}
            {#if S.selectedDevice?.method === 'usb' && !S.selectedDevice.self}
              <!-- Μία γραμμή, στο τέλος: το κουμπί του δικτύου ζει στο βήμα 5 και αλλιώς το ψάχνεις. -->
              <span class="tail">{S.t('w6_netLater')}</span>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if S.scan === 'empty'}
      <div class="block warn">
        <div class="bh"><i class="base-icon bi-warning-fill" style="color:var(--warning);font-size:20px"></i><b>{S.t('w6_none')}</b></div>
        <div class="ts">
          {#each tips as tip, i (tip)}
            <div><span class="tn">{i + 1}</span><span>{S.t(tip)}</span></div>
          {/each}
        </div>
        {#if S.pickMsg}<Notice kind="warn">{S.t(S.pickMsg)}</Notice>{/if}
        <div class="acts">
          {#if S.canPickUsb}<PillButton size="sm" onclick={() => S.pickUsb()}>{S.t('w6_pick')}</PillButton>{/if}
          <PillButton size="sm" kind={S.canPickUsb ? 'ghost' : undefined} onclick={() => S.rescan()}>{S.t('w6_rescan')}</PillButton>
          <!-- the help that belongs to the path taken: a hotspot cannot fix a cable, and a Windows
               driver cannot fix an isolated guest network -->
          {#if usb}
            <PillButton kind="ghost" size="sm" onclick={() => S.openHelp('driver')}>{S.t('w6_driver')}</PillButton>
          {:else}
            <PillButton kind="ghost" size="sm" onclick={() => S.openHelp('hotspot')}>{S.t('w6_hotspot')}</PillButton>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- Typing an address is a network answer; over a cable there is nothing to type. -->
  {#if S.showManual && !usb}
    <div class="panel manual">
      <b class="mt">{S.t('w6_manual')}</b>
      <label class="field"><span>{S.t('w6_ip')}</span><input class="tvlm-input" bind:value={S.ip} placeholder="192.168.1.50" /></label>
      {#if S.debug === 'wireless'}
        <div class="pairgrid">
          <label class="field"><span>{S.t('w6_pair')}</span><input class="tvlm-input pair" bind:value={S.pair} placeholder="••••••" maxlength="6" /></label>
          <label class="field"><span>{S.t('w6_port')}</span><input class="tvlm-input" bind:value={S.pairPort} placeholder="37099" /></label>
        </div>
      {/if}
      {#if S.manualError}<Notice kind="danger">{S.t(S.manualError)}</Notice>{/if}
      <button type="button" class="btn btn-ghost" style="height:44px;font:600 14px var(--font-display)" data-nav data-nav-id="w6-manual" data-nav-left="w6-dev-0,w6-help" data-nav-down="primary" data-nav-up="." data-nav-right="." onclick={() => S.connectManual()}>{S.t('connect')}</button>
    </div>
  {/if}
</div>

<style>
  .bridgewait { display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 12px 14px;
    background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.14); border-radius: 12px; font-size: 14px; }
  .bridgewait > span { flex: 1; }
  .bridgewait .bd { color: rgba(255,255,255,.7); font-size: 13px; }

  .pick { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
  .pd { font-size: 12px; color: rgba(255,255,255,.6); }
  .w6 { display: grid; grid-template-columns: 1fr 380px; gap: 40px; align-content: start; padding-top: 10px; }
  .left { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .block { display: flex; flex-direction: column; gap: 14px; padding: 22px 24px; border-radius: 16px; }
  .block.warn { background: rgba(255,184,0,.08); border: 1px solid rgba(255,184,0,.35); }
  .bh { display: flex; align-items: center; gap: 12px; }
  .bh b { font: 700 20px var(--font-display); }
  .bd { font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.85); }
  .opts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .opt { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; padding: 14px; border-radius: 12px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); color: #fff; text-align: left; }
  .opt:hover { background: rgba(255,255,255,.1); }
  .opt.gold { background: rgba(200,144,58,.16); border-color: rgba(200,144,58,.55); }
  .opt.gold:hover { background: rgba(200,144,58,.26); }
  .opt b { font: 700 14px var(--font-display); }
  .opt span { font-size: 12px; line-height: 1.45; color: rgba(255,255,255,.7); }
  .qrrow { display: flex; align-items: center; gap: 16px; }
  .qr { width: 96px; height: 96px; border-radius: 8px; background: repeating-conic-gradient(#fff 0 25%, #1A2744 0 50%) 0 0/16px 16px; border: 5px solid #fff; flex: none; }
  .qrt { font-size: 13px; line-height: 1.5; color: rgba(255,255,255,.8); }
  .scanning { display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-radius: 16px; background: var(--card-bg); border: 1px solid var(--card-border); }
  .cant { margin-top: 2px; border-radius: 12px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); }
  .cant.open { background: rgba(255,255,255,.07); }
  .canth { display: flex; align-items: center; gap: 10px; width: 100%; padding: 13px 16px; border-radius: 12px; background: none; border: 0; text-align: left; color: rgba(255,255,255,.92); font: 700 14px var(--font-display); }
  .canth:hover { background: rgba(255,255,255,.05); }
  .canth .bico { width: 19px; height: 19px; flex: none; color: var(--wiz-teal-soft); }
  .canth .cantt { flex: 1; }
  .canth .more { font: 600 12.5px var(--font-label); color: var(--wiz-teal-soft); }
  .canth i { font-size: 12px; color: rgba(255,255,255,.55); transition: transform .18s ease; }
  .canth i.up { transform: rotate(180deg); }
  .cantb { display: flex; flex-direction: column; gap: 7px; padding: 2px 18px 15px; font-size: 13px; line-height: 1.55; color: rgba(255,255,255,.72); }
  .cantb .tail { margin-top: 3px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.1); color: rgba(255,255,255,.58); }
  .fh { display: flex; align-items: center; justify-content: space-between; font: 600 16px var(--font-display); color: rgba(255,255,255,.85); }
  .list { display: flex; flex-direction: column; gap: 10px; }
  .dico { width: 46px; height: 46px; border-radius: 12px; background: rgba(255,255,255,.08); display: flex; align-items: center; justify-content: center; flex: none; }
  .dico i { font-size: 20px; }
  .dico.self { background: rgba(200,144,58,.18); color: var(--wiz-gold-light); }
  .dtxt { display: flex; flex-direction: column; gap: 3px; text-align: left; flex: 1; }
  .dtxt b { font: 600 17px var(--font-display); }
  .dtxt .mono { font-size: 13px; color: rgba(255,255,255,.6); }
  .ts { display: flex; flex-direction: column; gap: 10px; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.85); }
  .ts > div { display: flex; gap: 10px; }
  .tn { color: var(--wiz-gold-light); font-weight: 700; }
  .acts { display: flex; gap: 10px; flex-wrap: wrap; }
  .manual { align-self: start; margin-top: 64px; gap: 12px; }
  .mt { font: 600 16px var(--font-display); color: rgba(255,255,255,.85); }
  .pairgrid { display: grid; grid-template-columns: 1fr 100px; gap: 10px; }
  .pair { font: 600 20px var(--font-mono); letter-spacing: 6px; text-align: center; }
</style>
