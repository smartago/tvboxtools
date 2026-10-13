<script lang="ts">
  // WS Maintenance: maintenance mode (owner PIN → MAINTENANCE broadcast, 15 min) · full removal.
  //
  // Maintenance mode is a KIOSK thing: the PIN lifts the restrictions for fifteen minutes and kiosk
  // comes back by itself. A brand that never does kiosk (TV Box Tools: `never: [kiosk, device-owner,
  // factory-reset]`) has nothing to lift — the card would be a button that can only fail, and the
  // Device Owner warning beside it would be describing a thing that was never set up. Both are
  // hidden there; full removal stays, because uninstalling what we installed applies to every brand.
  import { getSession } from '../context.js';
  import PinBoxes from '../components/PinBoxes.svelte';
  import PillButton from '../components/PillButton.svelte';
  const S = getSession();
  const keys = '1234567890'.split('');
</script>

<div class="maint">
  <h2 class="h2-ws">{S.t('m_title')}</h2>
  <div class="grid" class:one={!S.canKiosk}>
    {#if S.canKiosk}
    <div class="box">
      <b class="bt">{S.t('m_mode')}</b>
      <span class="bd">{S.t('m_modeD')}</span>
      <span class="pl">{S.t('m_pin')}</span>
      <PinBoxes filled={S.pin.length} active={S.pin.length} />
      <div class="pad">
        {#each keys as d (d)}<button type="button" class="key" data-nav onclick={() => S.pinTap(d)}>{d}</button>{/each}
        <button type="button" class="key del" onclick={() => S.pinClear()}>⌫</button>
      </div>
      <PillButton style="height:44px" disabled={S.pin.length < 4 || S.maintBusy || !S.device} onclick={() => S.startMaint()}>{S.t('m_start')} · 15 min</PillButton>
      {#if S.maintActive}<span class="ok"><i class="base-icon bi-check-circle-fill"></i>{S.t('m_active')}</span>{/if}
    </div>
    {/if}
    <div class="box danger">
      <b class="bt">{S.t('m_rem')}</b>
      <span class="bd">{S.t('m_remD')}</span>
      {#if S.canDeviceOwner}
        <div class="warn"><i class="base-icon bi-warning-fill" style="color:var(--danger-alt);font-size:18px;margin-top:2px"></i><b style="font-size:14px;line-height:1.5">{S.t('m_warn')}</b></div>
      {/if}
      <div style="flex:1"></div>
      {#if S.removed}<span class="ok"><i class="base-icon bi-check-circle-fill"></i>{S.t('m_removed')}</span>{/if}
      <PillButton kind="danger" disabled={!S.device} onclick={() => S.removeAll()}>{S.removeArmed ? S.t('m_confirm') : S.t('m_remB')}</PillButton>
    </div>
  </div>
</div>

<style>
  .maint { display: flex; flex-direction: column; gap: 18px; max-width: 820px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .grid.one { grid-template-columns: 1fr; max-width: 420px; }
  .box { display: flex; flex-direction: column; gap: 12px; padding: 22px; border-radius: 18px; background: var(--card-bg); border: 1px solid var(--card-border); }
  .box.danger { background: rgba(224,36,36,.08); border-color: rgba(240,82,82,.35); }
  .bt { font: 700 20px var(--font-display); }
  .bd { font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.7); }
  .pl { font-size: 13px; color: rgba(255,255,255,.6); margin-top: 6px; }
  .pad { display: flex; gap: 6px; flex-wrap: wrap; }
  .key { width: 38px; height: 34px; border-radius: 8px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); color: #fff; font-size: 14px; }
  .key:hover { background: rgba(255,255,255,.16); }
  .key.del { width: auto; padding: 0 10px; background: none; color: rgba(255,255,255,.7); font-size: 12px; }
  .warn { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 10px; background: rgba(0,0,0,.3); }
  .ok { display: flex; align-items: center; gap: 8px; color: var(--success); font-size: 14px; font-weight: 600; }
</style>
