<script lang="ts">
  // Install — "What should we install?" (design 24/9, "Hotel TV Install"; docs/HOTELTV_SETUP_PLAN.md §2I).
  // Built to the prototype as drawn (Jim, 24/9). Top: three install types (presets). Below, three
  // columns: the apps from the hotel manifest, each with its own tick (the type presets them, the
  // hand can change them); the settings, with the owner's defaults; and — gold, apart — what can only
  // be done NOW, over adb. The gold button is the footer's (Wizard.svelte → S.next → runHotelInstall).
  //
  // Honest where it has to be: the NEW settings travel as PROVISION extras and take effect once the
  // hotel app reads them (one line says so); closing adb waits for the PIN step in the TV's first run.
  import { INSTALL_TYPES, hotelTarget, type InstallType } from '@tvlm/core';
  import { getSession } from '../context.js';
  import type { StrKey } from '../i18n/en.js';
  import type { HotelSwitches } from '../state.svelte.js';
  import TvSwitch from '../components/TvSwitch.svelte';
  import Notice from '../components/Notice.svelte';
  const S = getSession();
  // The hotel's own site in every edition: `S.t` would turn hoteltvapp.com into THIS brand's domain.
  const site = hotelTarget().domain;
  const h = (k: StrKey) => S.t(k, { site });

  const ICON: Record<InstallType, string> = { typ: 'install-typical', min: 'install-minimal', full: 'install-full' };
  const chosen = $derived(new Set(S.installApps.map((a) => a.pkg)));
  const stat = (t: InstallType) => {
    const { n, mb } = S.installStat(t);
    return S.t(n === 1 ? 'hi_stat1' : 'hi_stat', { n: String(n), mb: String(Math.round(mb)) });
  };
  // [title, description, switch, NEW tag]
  const settings: Array<[StrKey, StrKey, keyof HotelSwitches, boolean]> = [
    ['hi_adult', 'hi_adultD', 'adult', false],
    ['hi_upd', 'hi_updD', 'updates', true],
    ['hi_cec', 'hi_cecD', 'cec', true],
    ['hi_vol', 'hi_volD', 'volume', true],
    ['hi_stock', 'hi_stockD', 'hideStock', true],
  ];
  const flip = (k: keyof HotelSwitches, v: boolean) => (S.hotelSw = { ...S.hotelSw, [k]: v });
  // A letter tile until the box or the manifest gives an icon: the prototype's colours for the apps it drew.
  const TINT: Record<string, string> = { 'tv.setup.suite': '#00A1A9', 'org.videolan.vlc': '#F97316', 'org.xbmc.kodi': '#17B2E7' };
  const tint = (pkg: string, i: number) => TINT[pkg] ?? (i === 0 ? '#C8903A' : ['#6B7280', '#2563EB', '#10B981'][i % 3]);
  let missing = $state<Record<string, boolean>>({});
  const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase();
</script>

<div class="screen wi">
  <div class="top">
    <h2 class="title">{S.t('hi_title')}</h2>
    <span class="sub">{h('hi_sub')}</span>
  </div>

  <div class="types">
    {#each INSTALL_TYPES as t (t)}
      <button type="button" class="type tvlm-focus" class:sel={S.installType === t && !S.installPick} data-nav onclick={() => S.chooseInstallType(t)}>
        <span class="ico"><span class="mk" style:--icon="url('{S.assetUrl(`icons/${ICON[t]}.svg`)}')"></span></span>
        <span class="tt">
          <span class="tn"><b>{S.t(`hi_t_${t}` as StrKey)}</b>{#if t === 'typ'}<span class="rec">{S.t('hi_rec')}</span>{/if}</span>
          <span class="td">{S.t(`hi_d_${t}` as StrKey, { use: S.t(`hi_use_${S.hotelUse}` as StrKey) })}</span>
          <span class="ts">{stat(t)}</span>
        </span>
        {#if S.installType === t && !S.installPick}<span class="ck"><i class="base-icon bi-check"></i></span>{/if}
      </button>
    {/each}
  </div>

  <div class="cols">
    <!-- the apps: straight from the manifest, one tick each -->
    <div class="col">
      <div class="ch"><span>{S.t('hi_apps')}</span><span class="mono src">{site}/dl/manifest.json</span></div>
      <div class="list">
        {#if !S.hotelApps.length}<div class="empty">{S.t('hi_noList')}</div>{/if}
        {#each S.hotelApps as a, i (a.pkg)}
          {@const src = `${S.assetBase}launchers/${a.pkg}.png`}
          {@const on = chosen.has(a.pkg)}
          <button type="button" class="app tvlm-focus" class:off={!on} data-nav disabled={a.required} onclick={() => S.toggleInstallApp(a.pkg)}>
            <span class="tile" style:background={missing[src] ? tint(a.pkg, i) : null}>{#if !missing[src]}<img {src} alt="" onerror={() => (missing = { ...missing, [src]: true })} />{:else}{initial(a.name)}{/if}</span>
            <span class="an">
              <span class="anl"><b>{a.name}</b>{#if a.required}<span class="always">{S.t('hi_always')}</span>{/if}</span>
              <span class="as">{((a as unknown as Record<string, string | undefined>)[`summary_${S.lang}`] ?? a.summary) ?? a.pkg}</span>
            </span>
            {#if a.size}<span class="sz">{a.size}</span>{/if}
            <span class="box" class:on>{#if on}<i class="base-icon bi-check"></i>{/if}</span>
          </button>
        {/each}
      </div>
      <span class="note">{S.t('hi_appsNote')}</span>
    </div>

    <!-- settings: defaults for the owner -->
    <div class="col">
      <div class="ch col2"><span>{S.t('hi_set')}</span><span class="src">{h('hi_setSub')}</span></div>
      <div class="list">
        {#each settings.slice(0, 1) as [t, d, k, isNew] (k)}
          <div class="srow">
            <span class="rt"><b>{S.t(t)}{#if isNew}<span class="new">{S.t('hi_new')}</span>{/if}</b><span>{S.t(d)}</span></span>
            <TvSwitch on={S.hotelSw[k]} label={S.t(t)} onchange={(v) => flip(k, v)} scale={0.62} />
          </div>
        {/each}
        <div class="srow">
          <span class="rt"><b>{S.t('hi_pin')}</b><span>{S.t(S.hotelUse === 'reseller' ? 'hi_pinRes' : 'hi_pinD')}</span></span>
          {#if S.hotelUse !== 'reseller'}
            <input class="pin mono tvlm-focus" type="password" inputmode="numeric" maxlength="8" placeholder="••••" value={S.adminPin} oninput={(e) => (S.adminPin = (e.currentTarget as HTMLInputElement).value.replace(/\D/g, ''))} />
          {/if}
        </div>
        {#each settings.slice(1) as [t, d, k, isNew] (k)}
          {@const locked = k === 'hideStock' && S.onHotelRoad}
          <div class="srow">
            <!-- on the kiosk road the stock launcher goes off as part of the lock: an enabled stock
                 launcher wins the HOME intent, measured 25/9 — so the switch says so and stays on -->
            <span class="rt"><b>{S.t(t)}{#if isNew && !locked}<span class="new">{S.t('hi_new')}</span>{/if}</b><span>{locked ? S.t('hi_stockKiosk') : S.t(d)}</span></span>
            <TvSwitch on={locked || S.hotelSw[k]} disabled={locked} label={S.t(t)} onchange={(v) => flip(k, v)} scale={0.62} />
          </div>
        {/each}
      </div>
      <span class="note">{S.hotelSw.secure ? S.t('hi_applied') : S.t('hi_webLimited')}</span>
    </div>

    <!-- only now, over adb. No "close ADB at the end" row here any more: Jim, 25/9 — adb is never a
         customer setting (a guest on the hotel's network must not have a door), and it is the app that
         opens it again, inside an Admin session. HOTELTV_KIOSK_HANDOFF §11.4. -->
    <div class="col adb">
      <div class="ch col2"><span class="gold">{S.t('hi_adb')}</span><span class="src">{S.t('hi_adbSub')}</span></div>
      <div class="list">
        <div class="srow">
          <span class="rt"><b>{S.t('hi_secure')}<span class="new">{S.t('hi_new')}</span></b><span class="mono cmd">{S.t('hi_secureD')}</span></span>
          <TvSwitch on={S.hotelSw.secure} label={S.t('hi_secure')} onchange={(v) => flip('secure', v)} scale={0.62} />
        </div>
        <div class="srow">
          <span class="rt"><b>{S.t('hi_bg')}<span class="new">{S.t('hi_new')}</span></b><span class="mono cmd">{S.t('hi_bgD')}</span></span>
          <TvSwitch on={S.hotelSw.bg} label={S.t('hi_bg')} onchange={(v) => flip('bg', v)} scale={0.62} />
        </div>
      </div>
      <div style="flex:1"></div>
      {#if S.launcherError}
        <Notice kind="danger">{S.t('wl_failed')} <span class="mono">{S.launcherError}</span></Notice>
      {:else if S.installCta.blocked}
        <span class="note warn">{S.installCta.sub}</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .wi { display: flex; flex-direction: column; min-height: 0; }
  .top { display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; }
  .title { margin: 0; font: 700 32px/1.1 var(--font-display); }
  .sub { font-size: 13px; color: rgba(255,255,255,.55); white-space: nowrap; padding-bottom: 4px; }

  .types { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 16px; flex: none; }
  .type { position: relative; display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 18px; color: #fff; text-align: left; font: inherit; background: rgba(255,255,255,.05); border: 1.5px solid rgba(255,255,255,.14); min-width: 0; transition: border-color .15s; }
  .type:hover { border-color: rgba(255,255,255,.32); }
  .type.sel { background: rgba(200,144,58,.1); border-color: var(--wiz-gold); }
  .ico { width: 46px; height: 46px; border-radius: 50%; background: rgba(255,255,255,.1); color: #fff; display: flex; align-items: center; justify-content: center; flex: none; }
  .type.sel .ico { background: var(--wiz-gold); color: var(--wiz-gold-text); }
  .mk { width: 26px; height: 26px; background: currentColor; -webkit-mask: var(--icon) center / contain no-repeat; mask: var(--icon) center / contain no-repeat; }
  .tt { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; padding-right: 22px; }
  .tn { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .tn b { font: 700 18px var(--font-display); white-space: nowrap; }
  .rec { font-size: 11px; padding: 2px 9px; border-radius: 999px; background: rgba(0,161,169,.16); color: var(--wiz-teal-soft); border: 1px solid rgba(0,161,169,.45); white-space: nowrap; }
  .td { font-size: 13px; line-height: 1.35; color: rgba(255,255,255,.72); }
  .ts { font: 500 12px var(--font-display); color: rgba(255,255,255,.5); white-space: nowrap; margin-top: 3px; }
  .type.sel .ts { color: var(--wiz-gold-light); }
  .ck { position: absolute; top: 14px; right: 14px; width: 26px; height: 26px; border-radius: 50%; background: var(--wiz-gold); color: var(--wiz-gold-text); display: flex; align-items: center; justify-content: center; }
  .ck i { font-size: 11px; }

  .cols { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }
  .col { display: flex; flex-direction: column; min-height: 0; min-width: 0; padding: 16px 16px 14px; border-radius: 18px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.08); }
  .col.adb { background: rgba(200,144,58,.07); border-color: rgba(200,144,58,.45); }
  .ch { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 11px; letter-spacing: 2px; color: rgba(255,255,255,.6); }
  .ch.col2 { flex-direction: column; align-items: flex-start; gap: 6px; }
  .ch .gold { color: var(--wiz-gold-light); }
  .src { font-size: 11px; letter-spacing: 0; color: rgba(255,255,255,.45); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; min-height: 0; overflow: auto; scrollbar-width: none; }
  .empty { font-size: 13px; color: var(--warning); padding: 8px 2px; }
  .app { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); color: #fff; font: inherit; text-align: left; width: 100%; }
  .app:disabled { opacity: 1; cursor: default; }
  .app.off { opacity: .45; }
  .tile { width: 36px; height: 36px; border-radius: 10px; flex: none; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.08); font: 700 15px var(--font-display); color: #fff; overflow: hidden; }
  .tile img { width: 100%; height: 100%; object-fit: contain; }
  .an { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .anl { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .anl b { font: 600 15px var(--font-display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .always { font-size: 10px; padding: 2px 8px; border-radius: 999px; background: rgba(200,144,58,.16); color: var(--wiz-gold-light); border: 1px solid rgba(200,144,58,.45); white-space: nowrap; flex: none; letter-spacing: .5px; }
  .as { font-size: 12px; line-height: 1.35; color: rgba(255,255,255,.6); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .sz { font: 500 12px var(--font-display); color: rgba(255,255,255,.55); white-space: nowrap; flex: none; }
  .box { width: 26px; height: 26px; border-radius: 7px; border: 1.5px solid rgba(255,255,255,.28); display: flex; align-items: center; justify-content: center; flex: none; }
  .box.on { background: var(--wiz-gold); border-color: var(--wiz-gold); color: var(--wiz-gold-text); }
  .box i { font-size: 11px; }
  .note { margin-top: 10px; font-size: 12px; line-height: 1.45; color: rgba(255,255,255,.5); }
  .note.warn { color: var(--warning); }
  .srow { display: flex; align-items: center; gap: 12px; padding: 2px 0; }
  .rt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .rt b { display: flex; align-items: center; gap: 8px; font: 600 14.5px var(--font-display); }
  .rt span { font-size: 11.5px; line-height: 1.35; color: rgba(255,255,255,.58); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rt .cmd { font-size: 10.5px; color: rgba(255,255,255,.5); }
  .new { font: 500 10px var(--font-display); letter-spacing: .5px; padding: 2px 8px; border-radius: 999px; background: rgba(0,161,169,.16); color: var(--wiz-teal-soft); border: 1px solid rgba(0,161,169,.45); white-space: nowrap; flex: none; }
  .pin { width: 96px; height: 40px; border-radius: 10px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.16); color: #fff; font-size: 16px; letter-spacing: 4px; text-align: center; outline: none; flex: none; }
  .pin:focus { border-color: var(--wiz-gold); }
  .pin::placeholder { color: rgba(255,255,255,.4); }
</style>
