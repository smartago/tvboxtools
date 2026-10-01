<script lang="ts">
  // W6 Find the box: scan (mDNS + subnet + USB) · found list · nothing found (troubleshooting) · manual IP / pairing.
  // platform web + Wi‑Fi: the "Wi‑Fi needs a bridge" block with 3 options (DESIGN_NOTES §12).
  import { getSession } from '../context.js';
  import Card from '../components/Card.svelte';
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
      <div class="fh"><span>{S.t('w6_found')} · {S.devices.length}</span><button type="button" class="btn btn-outline xs" style="height:32px" onclick={() => S.rescan()}>{S.t('w6_rescan')}</button></div>
      <div class="list">
        {#each S.devices as d, i (d.id)}
          <Card sel={S.devSel === i} padding="12px 16px" onpick={() => (S.devSel = i)}>
            <span class="dico" class:self={d.self}><i class="base-icon {d.self ? 'bi-remote' : d.method === 'usb' ? 'bi-solid-arrow-right' : 'bi-wifi'}"></i></span>
            <span class="dtxt"><b>{d.name}</b><span class="mono">{d.addr}</span></span>
            <!-- the box the tool is running on: on a TV the scan always finds it, and the installer
                 must not have to work out which address is the set in front of them -->
            {#if d.self}<span class="tag tag-gold" style="font-size:12px;padding:4px 10px">{S.t('w6_self')}</span>{/if}
            <span class="tag tag-teal" style="font-size:12px;padding:4px 10px">{S.t(methodKey(d.method))}</span>
          </Card>
        {/each}
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
      <button type="button" class="btn btn-ghost" style="height:44px;font:600 14px var(--font-display)" data-nav onclick={() => S.connectManual()}>{S.t('connect')}</button>
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
