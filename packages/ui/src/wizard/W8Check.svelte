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
    {#if !S.checkDone}
      <div class="checking"><i class="base-icon bi-spinner tvlm-spin"></i><span class="mono" style="font-size:12px">adb shell getprop · dumpsys account · df /data</span></div>
    {/if}
  </div>
</div>

<style>
  .w8 { display: grid; grid-template-columns: 420px 1fr; gap: 48px; align-content: start; padding-top: 10px; }
  .ready { margin-top: 26px; display: flex; align-items: center; gap: 14px; padding: 18px 20px; border-radius: 14px; background: rgba(34,197,94,.14); border: 1px solid rgba(34,197,94,.45); font: 600 17px/1.35 var(--font-display); }
  .rows { display: flex; flex-direction: column; gap: 8px; padding-top: 6px; }
  .crow { display: grid; grid-template-columns: 170px 1fr 32px; align-items: center; gap: 16px; padding: 14px 20px; border-radius: 12px; background: var(--row-bg); border: 1px solid var(--row-border); }
  .k { font-size: 13px; color: rgba(255,255,255,.55); text-transform: uppercase; letter-spacing: 1px; }
  .v { font-size: 16px; font-weight: 500; }
  .crow i { font-size: 20px; justify-self: end; }
  .checking { display: flex; align-items: center; gap: 10px; padding: 10px 20px; color: rgba(255,255,255,.6); font-size: 14px; }
</style>
