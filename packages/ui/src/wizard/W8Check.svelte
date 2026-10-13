<script lang="ts">
  // W8 Box check (read-only): model, Android/API, accounts, free space, launcher installed, developer options.
  import { getSession } from '../context.js';
  import Notice from '../components/Notice.svelte';
  const S = getSession();
</script>

<div class="screen w8">
  <div>
    <h2 class="h2">{S.t('w8_title')}</h2>
    <p class="lead">{S.t('w8_body')}</p>
    {#if S.fireBlocked}
      <!-- the box turned out to be a Fire TV and this edition does not set one up: said here, on the
           screen that found out, instead of on a question nobody is asked any more -->
      <div style="margin-top:22px"><Notice kind="danger" bold>{S.t('w3_fire')}</Notice></div>
    {:else if S.checkDone}
      <div class="ready tvlm-fade"><i class="base-icon bi-check-circle-fill" style="font-size:24px;color:var(--success)"></i><span>{S.t('w8_ready')}</span></div>
      <!-- ΜΟΝΟ με καλώδιο (2/10/2026): τα παλιά box δεν έχουν «Network debugging» στο μενού, και το
           adbd ανοίγει στο δίκτυο μόνο από μια σύνδεση που ήδη υπάρχει. Μία φορά USB, μετά ασύρματα. -->
      {#if S.netState === 'linking' || S.netState === 'open'}
        <div class="net done tvlm-fade" class:waiting={S.netState === 'linking'}>
          <b>{S.t('w8_netAt')} <span class="mono">{S.netAddr}</span></b>
          <p class="why">
            {#if S.netState === 'linking'}<i class="base-icon bi-spinner tvlm-spin"></i> {S.t('w8_netLink')}
            {:else}{S.netBack ? S.t('w8_netBack') : S.t('w8_netManual')}{/if}
          </p>
        </div>
      {:else if S.netState === 'noip'}
        <div style="margin-top:18px"><Notice kind="warn">{S.t('w8_netNoIp')}</Notice></div>
      {:else if S.netState === 'failed'}
        <div style="margin-top:18px"><Notice kind="danger">{S.t('w8_netFail')} {S.netError}</Notice></div>
      {:else if S.canOpenNetwork}
        <div class="net">
          <button type="button" class="netbtn tvlm-focus" data-nav disabled={S.netState === 'working'} onclick={() => void S.openNetwork()}>
            {#if S.netState === 'working'}<i class="base-icon bi-spinner tvlm-spin"></i>{:else}<i class="base-icon bi-wifi"></i>{/if}
            <span>{S.netState === 'working' ? S.t('w8_netWork') : S.t('w8_net')}</span>
          </button>
          <p class="why">{S.t('w8_netWhy')}</p>
        </div>
      {/if}
    {/if}
  </div>
  <div class="rows">
    {#each S.checkRows as c (c.k)}
      <div class="crow tvlm-fade">
        <span class="k">{c.k}</span>
        <span class="v">{c.v}</span>
        <i class="base-icon {c.ok === true ? 'bi-check-circle-fill' : c.ok === false ? 'bi-warning-fill' : 'bi-plus'}" style:color={c.ok === true ? 'var(--success)' : c.ok === false ? 'var(--warning)' : 'rgba(255,255,255,.5)'}></i>
      </div>
    {/each}
    {#if S.checkStuck}
      <!-- ΤΟ ΚΟΥΤΙ ΣΩΠΑΣΕ ΣΕ ΜΙΑ ΕΝΤΟΛΗ (Jim, 9/10/2026, κινητό Android 11): όχι κύκλος για πάντα —
           ποια εντολή, γιατί μπορεί να συμβαίνει, και ένα κουμπί που ξανασυνδέει από την αρχή. -->
      <div class="stuck tvlm-fade">
        <Notice kind="danger" bold>{S.t('w8_stuck', { cmd: S.checkStuck })}</Notice>
        <p class="why">{S.t('w8_stuckWhy')}</p>
        <button type="button" class="btn btn-gold sm tvlm-focus" data-nav data-nav-first data-nav-id="w8-retry" data-nav-down="primary,back" data-nav-up="." onclick={() => S.retryCheck()}>{S.t('w8_retry')}</button>
      </div>
    {:else if !S.checkDone}
      <div class="checking"><i class="base-icon bi-spinner tvlm-spin"></i><span class="mono" style="font-size:12px">adb shell getprop · dumpsys account · df /data</span></div>
    {/if}
  </div>
</div>

<style>
  .w8 { display: grid; grid-template-columns: 420px 1fr; gap: 48px; align-content: start; padding-top: 10px; }
  .net { margin-top: 18px; padding: 16px 18px; border-radius: 14px; background: var(--card-bg); border: 1px solid var(--card-border); }
  .net.done { background: rgba(34,197,94,.1); border-color: rgba(34,197,94,.4); }
  /* Όσο ξαναμπαίνει: ουδέτερο, όχι πράσινο — δεν έχει κριθεί ακόμη. */
  .net.done.waiting { background: var(--card-bg); border-color: var(--card-border); }
  .net.done b { font: 700 15px var(--font-display); }
  .net .why { margin: 10px 0 0; font-size: 13px; line-height: 1.5; color: rgba(255,255,255,.7); }
  .netbtn { display: inline-flex; align-items: center; gap: 10px; padding: 10px 18px; border-radius: 999px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.28); color: #fff; font: 700 14px var(--font-display); }
  .netbtn:hover:not(:disabled) { background: rgba(255,255,255,.16); }
  .netbtn:disabled { opacity: .6; }
  .ready { margin-top: 26px; display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-radius: 14px; background: rgba(34,197,94,.14); border: 1px solid rgba(34,197,94,.45); font: 600 17px/1.35 var(--font-display); }
  .rows { display: flex; flex-direction: column; gap: 8px; padding-top: 6px; }
  .crow { display: grid; grid-template-columns: 170px 1fr 32px; align-items: center; gap: 16px; padding: 14px 20px; border-radius: 12px; background: var(--row-bg); border: 1px solid var(--row-border); }
  .k { font-size: 13px; color: rgba(255,255,255,.55); text-transform: uppercase; letter-spacing: 1px; }
  .v { font-size: 16px; font-weight: 500; }
  .crow i { font-size: 20px; justify-self: end; }
  .checking { display: flex; align-items: center; gap: 10px; padding: 10px 20px; color: rgba(255,255,255,.6); font-size: 14px; }
  .stuck { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 6px 0 0; }
  .stuck .why { margin: 0; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.72); max-width: 640px; }
</style>
