<script lang="ts">
  // W1 Language — hero + three ticks + "Skip the guide" · the language list (↑↓ + Enter) + Continue.
  import { getSession } from '../context.js';
  import Card from '../components/Card.svelte';
  const S = getSession();
  const ticks = $derived([S.t('w1_t1'), S.t('w1_t2'), S.t('w1_t3')]);

  /**
   * PHONE: bring the language that is already selected into the list's window. Greek sits 17th of
   * 45 rows, so on a small screen the box opens showing English at the top and the person reads
   * that as "it did not detect my language" — the same complaint, with the same cause, that the
   * Smartago wizard's StepLanguage was fixed for. The list scrolls itself (`scrollTop`), never
   * `scrollIntoView`, which would also scroll every ancestor and shove the app sideways.
   */
  let list: HTMLDivElement | undefined = $state();
  $effect(() => {
    void S.i18n.lang;
    if (!S.phone || !list) return;
    const box = list;
    queueMicrotask(() => {
      const row = box.querySelector<HTMLElement>('.card.sel') ?? box.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!row) return;
      const top = row.offsetTop - (box.clientHeight - row.offsetHeight) / 2;
      box.scrollTop = Math.max(0, top);
    });
  });
</script>

<div class="screen w1">
  <div class="left">
    <div class="eye">{S.t('w1_eyebrow')}</div>
    <h2 class="title">{S.t('w1_title')}</h2>
    <!-- the hotel road installs a room TV; the home road hands the HOME button back to its owner -->
    <p class="body">{S.t(S.brand.flow === 'kiosk' ? 'w1_body' : 'w1_bodyL')}</p>
    <div class="ticks">
      {#each ticks as tk (tk)}
        <div class="tick"><span class="tk"><i class="base-icon bi-check"></i></span><span>{tk}</span></div>
      {/each}
    </div>
    <div style="flex:1"></div>
    {#if S.langAuto}
      <!-- What the region said, and the way out of it (Jim, 28/9, by the example of DWTV). The escape
           is written in ENGLISH ON PURPOSE: the person who needs it is the one who cannot read the
           language the notice is written in. -->
      <div class="auto">
        <span class="check-badge"><i class="base-icon bi-check"></i></span>
        <span class="atxt">
          <b>{S.t('w1_auto', { lang: S.i18n.langName })}</b>
          <span>{S.t(S.langAutoSrc === 'geo' ? 'w1_autoSub' : 'w1_autoSubDev')}</span>
        </span>
      </div>
      {#if S.i18n.lang !== 'en'}
        <!-- A WHITE CARD, not a ghost button (Jim, 29/9, again by DWTV): the person who needs this
             cannot read a word of the rest, so it has to be the one thing on the screen that does
             not look like the rest. Both lines stay in English, always. -->
        <div class="toenbox">
          <b class="toenq">Wrong language?</b>
          <button type="button" class="toen tvlm-focus" data-nav onclick={() => S.pickLang('en')}>
            <img class="enflag" src="{S.assetBase}flags/us.svg" alt="" /> SWITCH TO ENGLISH
          </button>
        </div>
      {/if}
    {/if}
    <button type="button" class="skip tvlm-focus" data-nav onclick={() => S.landing()}>{S.t('skipGuide')} →</button>
  </div>
  <div class="right">
    <div class="head"><span class="lh">{S.t('w1_list')}</span><span class="hint">{S.t('w1_hint')}</span></div>
    <div class="list" bind:this={list}>
      {#each S.langs as l (l.tag)}
        <Card sel={l.sel} padding="10px 16px" onpick={() => S.pickLang(l.tag)}>
          <span class="flag"><img src="{S.assetBase}flags/{l.flag}.svg" alt="" /></span>
          <span class="name">{l.name}</span>
          <span class="code2">{l.code}</span>
        </Card>
      {/each}
    </div>
    <button type="button" class="cont tvlm-focus" data-nav data-primary onclick={() => S.next()}>{S.t('w1_cont')} {S.i18n.langName} &nbsp;»</button>
  </div>
</div>

<style>
  .w1 { display: grid; grid-template-columns: 440px 1fr; gap: 56px; }
  .left { display: flex; flex-direction: column; padding-top: 20px; }
  .eye { font: 600 12px var(--font-display); letter-spacing: 3px; color: var(--wiz-gold-light); }
  .title { margin: 14px 0 0; font: 700 40px/1.1 var(--font-display); text-wrap: pretty; }
  .body { margin: 18px 0 0; font-size: 17px; line-height: 1.6; color: rgba(255,255,255,.72); text-wrap: pretty; }
  /* tighter by 28px in total: with the region card AND the white way-out, the column reached
     the footer on a television (29/9) */
  .ticks { display: flex; flex-direction: column; gap: 11px; margin-top: 22px; }
  .tick { display: flex; align-items: center; gap: 12px; font-size: 15px; color: rgba(255,255,255,.82); }
  .tk { width: 32px; height: 32px; border-radius: 10px; background: rgba(0,161,169,.18); color: var(--wiz-teal-check); display: flex; align-items: center; justify-content: center; }
  .tk i { font-size: 13px; }
  .auto { display: flex; align-items: center; gap: 14px; margin-top: 12px; padding: 13px 16px; border-radius: 14px; background: rgba(0,161,169,.12); border: 1px solid rgba(0,161,169,.4); }
  .atxt { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .atxt b { font: 700 16px var(--font-display); }
  .atxt span { font-size: 13.5px; line-height: 1.45; color: rgba(255,255,255,.72); }
  /* ONE ROW, not two: stacked, the white card pushed the skip button under the footer on a
     television (29/9). The question and the way out belong on the same line anyway. */
  .toenbox { align-self: flex-start; display: flex; align-items: center; gap: 12px; margin-top: 8px; padding: 9px 12px 9px 16px; border-radius: 14px; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
  .toenq { color: #16233f; font: 700 15px var(--font-display); }
  .toen { display: flex; align-items: center; gap: 10px; padding: 10px 20px; border-radius: 999px; background: #fff; border: 2px solid #16233f; color: #16233f; font: 700 13px var(--font-display); letter-spacing: .6px; }
  .toen:hover { background: #16233f; color: #fff; }
  .enflag { width: 24px; height: 16px; border-radius: 3px; object-fit: cover; display: block; }
  .skip { align-self: flex-start; background: none; border: 1px solid rgba(255,255,255,.22); border-radius: 999px; padding: 9px 18px; color: rgba(255,255,255,.85); font-size: 14px; font-weight: 600; white-space: nowrap; }
  .skip:hover { background: rgba(255,255,255,.08); }
  .right { display: flex; flex-direction: column; min-height: 0; }
  .head { display: flex; align-items: baseline; justify-content: space-between; }
  .lh { font: 600 22px var(--font-display); }
  .hint { font-size: 13px; color: rgba(255,255,255,.5); }
  /* padding = room for the focus ring (it is drawn outside the card and this list scrolls, so it
     clips); the negative margin cancels it so the rows stay aligned with the heading above. */
  .list { display: flex; flex-direction: column; gap: 12px; margin: 6px -10px 0; flex: 1; min-height: 0; overflow: auto; padding: 8px 10px; mask-image: linear-gradient(#000 88%, transparent); }
  /* flag where the code tile was (full size), the NAME 30% smaller — that was the ask (Jim, 23/9) */
  .flag { width: 39px; height: 27px; border-radius: 6px; overflow: hidden; background: rgba(255,255,255,.08); display: flex; flex: none; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }
  .flag img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .code2 { font: 700 12px var(--font-display); letter-spacing: 1px; color: rgba(255,255,255,.45); flex: none; padding-right: 4px; }
  .name { flex: 1; text-align: left; font: 600 24px var(--font-display); }
  .cont { margin-top: 14px; height: 56px; border: none; border-radius: 999px; background: var(--wiz-gold); color: var(--wiz-gold-text); font: 700 17px var(--font-display); white-space: nowrap; }
  .cont:hover { background: var(--wiz-gold-hover); }
</style>
