<script lang="ts">
  // Use — "Where will this box be used?" (design 24/9, "Hotel TV Use"; docs/HOTELTV_SETUP_PLAN.md §2H).
  // Built to the prototype as drawn (Jim, 24/9: "as the design is — it was made to show the UI/UX"):
  // three big cards, BnB by default; under them one panel — what will be set up (with the room/lobby
  // switch for a hotel), or for a reseller why selling it ready pays, their code and the Google warning.
  import { hotelTarget } from '@tvlm/core';
  import { getSession } from '../context.js';
  import type { StrKey } from '../i18n/en.js';
  import type { HotelUse } from '../state.svelte.js';
  const S = getSession();
  // The hotel's own site in every edition: `S.t` would turn hoteltvapp.com into THIS brand's domain.
  const site = hotelTarget().domain;
  const h = (k: StrKey) => S.t(k, { site });

  const cards: Array<{ id: HotelUse; icon: string; title: StrKey; desc: StrKey; bullets: StrKey[] }> = [
    { id: 'bnb', icon: 'use-bnb', title: 'us_bnb', desc: 'us_bnbD', bullets: ['us_bnb1', 'us_bnb2', 'us_bnb3'] },
    { id: 'hotel', icon: 'use-hotel', title: 'us_hotel', desc: 'us_hotelD', bullets: ['us_hotel1', 'us_hotel2', 'us_hotel3'] },
    { id: 'reseller', icon: 'use-reseller', title: 'us_res', desc: 'us_resD', bullets: ['us_res1', 'us_res2', 'us_res3'] },
  ];
  // the prototype's order: left column top-down, then right column
  const SETUP: Record<'bnb' | 'room' | 'lobby', StrKey[]> = {
    bnb: ['us_sb1', 'us_sb3', 'us_sb5', 'us_sb2', 'us_sb4', 'us_sb6'],
    room: ['us_sh1', 'us_sh3', 'us_sh5', 'us_sh2', 'us_sh4', 'us_sh6'],
    lobby: ['us_sl1', 'us_sl3', 'us_sl5', 'us_sl2', 'us_sl4', 'us_sl6'],
  };
  const setup = $derived(SETUP[S.hotelUse === 'hotel' ? S.hotelWhere : 'bnb']);
  const why: Array<[string, StrKey, StrKey]> = [
    ['plui-icon pi-bullhorn', 'us_w1', 'us_w1D'],
    ['base-icon bi-check-circle-fill', 'us_w2', 'us_w2D'],
    ['plui-icon pi-cat-all', 'us_w3', 'us_w3D'],
  ];
  const cta = $derived(
    S.hotelUse === 'reseller' ? h('us_ctaRes') : S.hotelUse === 'hotel' ? h(S.hotelWhere === 'lobby' ? 'us_ctaLobby' : 'us_ctaHotel') : h('us_ctaBnb'),
  );
</script>

<div class="screen wu">
  <div class="top">
    <div>
      <div class="eye">{h('us_eye')}</div>
      <h2 class="title">{h('us_title')}</h2>
    </div>
    <span class="sub">{h('us_sub')}</span>
  </div>

  <div class="cards">
    {#each cards as c (c.id)}
      <button type="button" class="card tvlm-focus" class:sel={S.hotelUse === c.id} data-nav onclick={() => (S.hotelUse = c.id)}>
        <span class="chead">
          <span class="ico"><span class="mk" style:--icon="url('{S.assetUrl(`icons/${c.icon}.svg`)}')"></span></span>
          <span class="marks">
            {#if c.id === 'bnb'}<span class="most">{h('us_most')}</span>{/if}
            {#if S.hotelUse === c.id}<span class="ck"><i class="base-icon bi-check"></i></span>{/if}
          </span>
        </span>
        <b class="ct">{h(c.title)}</b>
        <span class="cd">{h(c.desc)}</span>
        <span class="bl">
          {#each c.bullets as k (k)}
            <span class="b"><i class="base-icon bi-check"></i><span class="bt">{h(k)}</span></span>
          {/each}
        </span>
      </button>
    {/each}
  </div>

  <div class="panel">
    <div class="pl">
      {#if S.hotelUse === 'reseller'}
        <div class="ph gold">{h('us_why')}</div>
        <div class="why">
          {#each why as [icon, t, d] (t)}
            <div class="w"><b><i class={icon}></i>{h(t)}</b><span>{h(d)}</span></div>
          {/each}
        </div>
        <div class="warn"><span class="wd"></span>{h('us_noGoogle')}</div>
      {:else}
        <div class="ph">{h('us_setup')}</div>
        <div class="setup">
          {#each setup as k (k)}
            <span class="s"><span class="sq"><i class="base-icon bi-check"></i></span><span class="bt">{h(k)}</span></span>
          {/each}
        </div>
        {#if S.hotelUse === 'hotel'}
          <div class="where">
            <span class="wl">{h('us_where')}</span>
            <span class="seg">
              <button type="button" class="tvlm-focus" class:on={S.hotelWhere === 'room'} data-nav onclick={() => (S.hotelWhere = 'room')}>{h('us_room')}</button>
              <button type="button" class="tvlm-focus" class:on={S.hotelWhere === 'lobby'} data-nav onclick={() => (S.hotelWhere = 'lobby')}>{h('us_lobby')}</button>
            </span>
          </div>
        {/if}
      {/if}
    </div>

    <div class="pr">
      {#if S.hotelUse === 'reseller'}
        <div class="code">
          <span class="cl"><span>{h('us_codeRes')}</span><span class="opt">{h('us_optional')}</span></span>
          <input class="in mono tvlm-focus" type="text" value={S.resellerId} placeholder="RS-0000" spellcheck="false" oninput={(e) => S.setResellerId((e.currentTarget as HTMLInputElement).value)} />
          <span class="hint">{h('us_noCode')} <button type="button" class="lnk" onclick={() => S.openExternal(`https://${site}/reseller/`)}>{site}/reseller ↗</button></span>
        </div>
      {/if}
      <div style="flex:1"></div>
      <button type="button" class="cta tvlm-focus" data-nav data-primary onclick={() => S.next()}>{cta} »</button>
    </div>
  </div>
</div>

<style>
  .wu { display: flex; flex-direction: column; min-height: 0; }
  .top { display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; }
  .eye { font: 600 12px var(--font-display); letter-spacing: 3px; color: var(--wiz-gold-light); }
  .title { margin: 10px 0 0; font: 700 36px/1.1 var(--font-display); }
  .sub { font-size: 14px; color: rgba(255,255,255,.6); padding-bottom: 6px; white-space: nowrap; }

  .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 20px; }
  .card { display: flex; flex-direction: column; align-items: flex-start; padding: 22px 22px 24px; border-radius: 20px; color: #fff; text-align: left; font: inherit; background: rgba(255,255,255,.05); border: 1.5px solid rgba(255,255,255,.14); min-width: 0; transition: border-color .15s, background .15s; }
  .card:hover { border-color: rgba(255,255,255,.32); }
  .card.sel { background: rgba(200,144,58,.1); border-color: var(--wiz-gold); }
  .chead { display: flex; align-items: flex-start; justify-content: space-between; width: 100%; }
  .ico { width: 60px; height: 60px; border-radius: 50%; background: rgba(255,255,255,.1); color: #fff; display: flex; align-items: center; justify-content: center; flex: none; }
  .card.sel .ico { background: var(--wiz-gold); color: var(--wiz-gold-text); }
  /* the design's SVGs as masks: the colour follows the selection (currentColor) */
  .mk { width: 30px; height: 30px; background: currentColor; -webkit-mask: var(--icon) center / contain no-repeat; mask: var(--icon) center / contain no-repeat; }
  .marks { display: flex; align-items: center; gap: 8px; }
  .most { font-size: 11px; padding: 4px 10px; border-radius: 999px; background: rgba(0,161,169,.16); color: var(--wiz-teal-soft); border: 1px solid rgba(0,161,169,.45); white-space: nowrap; }
  .ck { width: 28px; height: 28px; border-radius: 50%; background: var(--wiz-gold); color: var(--wiz-gold-text); display: flex; align-items: center; justify-content: center; flex: none; }
  .ck i { font-size: 12px; }
  .ct { font: 700 21px/1.2 var(--font-display); margin-top: 16px; }
  .cd { font-size: 14px; line-height: 1.45; color: rgba(255,255,255,.7); margin-top: 6px; }
  .bl { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; width: 100%; }
  .b { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; line-height: 1.4; color: rgba(255,255,255,.85); min-width: 0; }
  .b > i { font-size: 11px; color: var(--wiz-teal-soft); flex: none; margin-top: 3px; }
  .bt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .panel { flex: 1; min-height: 0; margin-top: 18px; display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 32px; padding: 20px 24px; border-radius: 20px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.08); }
  .pl { min-width: 0; display: flex; flex-direction: column; }
  .ph { font-size: 11px; letter-spacing: 2px; color: rgba(255,255,255,.55); }
  .ph.gold { color: var(--wiz-gold-light); }
  .setup { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-flow: column; grid-template-rows: repeat(3, auto); gap: 12px 28px; margin-top: 12px; }
  .s { display: flex; align-items: center; gap: 12px; font-size: 14px; color: rgba(255,255,255,.9); min-width: 0; }
  .sq { width: 26px; height: 26px; border-radius: 7px; background: rgba(0,161,169,.2); color: var(--wiz-teal-soft); display: flex; align-items: center; justify-content: center; flex: none; }
  .sq i { font-size: 11px; }
  .where { display: flex; align-items: center; gap: 12px; margin-top: auto; padding-top: 14px; }
  .wl { font-size: 13px; color: rgba(255,255,255,.6); }
  .seg { display: flex; padding: 4px; border-radius: 12px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.12); }
  .seg button { height: 32px; padding: 0 18px; border-radius: 8px; background: none; border: none; color: rgba(255,255,255,.7); font: 600 13px var(--font-display); }
  .seg button.on { background: rgba(200,144,58,.28); color: #fff; }
  .why { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
  .w { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); min-width: 0; }
  .w b { display: flex; align-items: center; gap: 8px; font: 700 15px var(--font-display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .w b i { color: var(--wiz-gold-light); font-size: 15px; flex: none; }
  .w span { font-size: 12.5px; line-height: 1.45; color: rgba(255,255,255,.72); }
  .warn { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 12.5px; color: var(--wiz-gold-light); }
  .wd { width: 10px; height: 10px; border-radius: 50%; background: var(--warning); flex: none; }
  .pr { display: flex; flex-direction: column; min-width: 0; }
  .code { display: flex; flex-direction: column; gap: 8px; }
  .cl { display: flex; align-items: baseline; justify-content: space-between; font-size: 13px; color: rgba(255,255,255,.75); }
  .opt { font-size: 11.5px; color: rgba(255,255,255,.45); }
  .in { height: 48px; padding: 0 16px; border-radius: 12px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.14); color: #fff; font-size: 16px; letter-spacing: 2px; text-align: center; outline: none; }
  .in:focus { border-color: var(--wiz-gold); }
  .in::placeholder { color: rgba(255,255,255,.35); }
  .hint { font-size: 12.5px; line-height: 1.5; color: rgba(255,255,255,.6); }
  .lnk { background: none; border: none; padding: 0; color: var(--wiz-gold-light); font: inherit; cursor: pointer; }
  .lnk:hover { text-decoration: underline; }
  .cta { height: 54px; border: none; border-radius: 999px; background: var(--wiz-gold); color: var(--wiz-gold-text); font: 700 17px var(--font-display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 20px; }
  .cta:hover { background: var(--wiz-gold-hover); }
</style>
