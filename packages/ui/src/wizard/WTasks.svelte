<script lang="ts">
  // The Tasks hub — step 7, redesigned after Jim's design session (prototype/Tasks Hub.dc.html,
  // 23/9/2026). One screen, no scrolling. The main job is large; the rest are compact rows with a
  // risk tag instead of a paragraph; the right column shows the box and WHAT WILL RUN for the task
  // under focus — the promise "every job shows what it will run" made visible. Kiosk is a card
  // of its own under the grid, a question in plain words, in every edition. The footer stays fixed.
  //
  // Focus vs. open: pointing at a row (hover, arrows) moves the focus and the right panel follows;
  // pressing it (click, Enter, the footer's gold button) opens the task. A row is still the action.
  import { getSession } from '../context.js';
  const S = getSession();
  const c = $derived(S.check);
  const cur = $derived(S.hubWillRun);
  const tagClass = (risk: string) => (risk === 'ro' ? 'tag ro' : risk === 'chg' ? 'tag chg' : 'tag rev');
</script>

<div class="screen wt3">
  <!-- left: the tasks -->
  <div class="left">
    <div>
      <div class="eye">{S.t('th_eyebrow')}</div>
      <h2 class="ttl">{S.t('th_title')}</h2>
    </div>

    {#if S.hubHero}
      {@const h = S.hubHero}
      <button type="button" class="hero tvlm-focus" class:done={h.done} data-nav onmouseenter={() => S.focusTask(h.id)} onfocus={() => S.focusTask(h.id)} onclick={() => S.pickTask(h.id)}>
        <span class="hico"><i class="{h.icon.startsWith('pi-') ? 'plui-icon' : 'base-icon'} {h.icon}"></i></span>
        <span class="htxt">
          <span class="hrow"><b>{h.title}</b><span class={tagClass(h.risk)}>{S.t(h.riskKey)}</span>{#if h.done}<span class="tag ok"><i class="base-icon bi-check"></i>{S.t('th_done')}</span>{/if}</span>
          <span class="hdesc">{h.desc}</span>
        </span>
        <span class="hcta">{S.t('th_choose')} &nbsp;»</span>
      </button>
    {/if}

    <div class="grid">
      {#each S.hubRows as r (r.id)}
        <button type="button" class="row tvlm-focus" class:span2={r.id === 'advanced'} class:done={r.done} data-nav onmouseenter={() => S.focusTask(r.id)} onfocus={() => S.focusTask(r.id)} onclick={() => S.pickTask(r.id)}>
          <span class="rico"><i class="{r.icon.startsWith('pi-') ? 'plui-icon' : 'base-icon'} {r.icon}"></i></span>
          <span class="rtxt">
            <!-- the SHORT name on the tile: three columns cannot hold «Clean up apps (Debloat)», and
                 the full title is drawn big in the right panel the moment the ring lands here. -->
            <b>{r.tile}</b>
            <span class="rdesc">{r.short}</span>
          </span>
          {#if r.done}<span class="tag ok"><i class="base-icon bi-check"></i>{S.t('th_done')}</span>{:else}<span class={tagClass(r.risk)}>{S.t(r.riskKey)}</span>{/if}
          <span class="chev">›</span>
        </button>
      {/each}
    </div>

    <div style="flex:1"></div>

    {#if S.hubKiosk}
      {@const k = S.hubKiosk}
      <!-- Kiosk: a question in plain words (design D), the term for the specialists as a tag, and
           the door to the Kiosk screen — in every edition. Where this one never locks, the line
           under the button names the edition that does. -->
      <button type="button" class="kiosk tvlm-focus" class:done={k.done} data-nav onmouseenter={() => S.focusTask(k.id)} onfocus={() => S.focusTask(k.id)} onclick={() => S.pickTask(k.id)}>
        <span class="kico"><i class="plui-icon pi-lock"></i></span>
        <span class="ktxt">
          <span class="krow"><b>{S.t('th_kQ')}</b><span class="tag term">{S.t('th_kTerm')}</span>{#if k.done}<span class="tag ok"><i class="base-icon bi-check"></i>{S.t('th_done')}</span>{/if}</span>
          <span class="kdesc">{S.t('th_kA')}</span>
        </span>
        <span class="kact">
          <span class="kcta">{S.t('th_kCta')} &nbsp;»</span>
        </span>
      </button>
    {/if}
  </div>

  <!-- right: the box, and what will run -->
  <div class="right">
    {#if c}
      <div class="box">
        <div class="brow"><span class="k">{S.t('c_model')}</span><span class="v">{`${c.manufacturer} ${c.model}`.trim() || S.devName}</span></div>
        <div class="brow"><span class="k">{S.t('c_android')}</span><span class="v">{c.androidVersion ? `${c.androidVersion} (API ${c.sdk})` : '—'}</span></div>
        <div class="brow"><span class="k">{S.t('c_home')}</span><span class="v">{S.currentHomeName}</span></div>
        <div class="brow"><span class="k">{S.t('c_play')}</span><span class="v">{c.hasPlay ? S.t('v_play') : S.t('v_noPlay')}</span></div>
      </div>
    {/if}

    {#if cur}
      <div class="will">
        <div class="wh"><span class="weye">{S.t('th_willRun')}</span><span class={tagClass(cur.risk)}>{S.t(cur.riskKey)}</span></div>
        <b class="wt">{cur.title}</b>
        <span class="wd">{cur.long}</span>
        <div class="cmds">
          {#each cur.cmds as cmd (cmd)}<span class="mono">$ {cmd}</span>{/each}
        </div>
        <div style="flex:1"></div>
        <span class="wn">{S.t('th_nothing')}</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .wt3 { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 32px; align-content: stretch; padding-top: 4px; min-height: 0; }
  .left { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
  .right { display: flex; flex-direction: column; gap: 14px; min-height: 0; }
  .eye { font: 600 12px var(--font-display); letter-spacing: 3px; color: var(--wiz-gold-light); }
  .ttl { margin: 8px 0 0; font: 700 32px/1.15 var(--font-display); }

  /* the main job: large, gold-tinted, with its own gold action */
  .hero { display: flex; align-items: center; gap: 18px; padding: 14px 20px; border-radius: 20px; color: #fff; width: 100%; text-align: left; font: inherit; background: var(--card-sel-bg); border: 1px solid var(--card-sel-border); transition: background .15s; }
  .hero:hover { background: rgba(200,144,58,.2); }
  .hero.done { background: rgba(0,161,169,.12); border-color: rgba(0,161,169,.5); }
  .hico { width: 50px; height: 50px; border-radius: 50%; background: rgba(200,144,58,.22); color: var(--wiz-gold-light); display: flex; align-items: center; justify-content: center; flex: none; }
  .hico > i { font-size: 26px; }
  .htxt { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; }
  .hrow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .hrow b { font: 700 23px var(--font-display); white-space: nowrap; }
  .hdesc { font-size: 14.5px; line-height: 1.5; color: rgba(255,255,255,.75); text-wrap: pretty; }
  .hcta { height: 50px; padding: 0 24px; border-radius: 999px; background: var(--wiz-gold); color: var(--wiz-gold-text); font: 700 15px var(--font-display); display: flex; align-items: center; white-space: nowrap; flex: none; }
  .hero:hover .hcta { background: var(--wiz-gold-hover); }

  /* the rest: compact rows, one line each, a tag instead of a paragraph */
  /* THREE columns, and the tile is a NAME (29/9): with the six new tasks the two-column grid
     needed 791px of a 611px body, so the last row sat under the footer on a real television. The
     tile carries the icon, the name and its risk; what it DOES is already written on the right the
     moment the ring lands on it. `portrait.css` puts it back to one column with the description. */
  /* «auto-fit», not a fixed three: on a television the canvas is now as wide as the screen
     (1458 on 16:9), so a fourth column appears by itself and the rows get shorter. */
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; }
  /* `:global()` on the ancestor: the app root is not in THIS component, and Svelte drops a
     scoped rule whose first part it cannot see (that is why the first attempt changed nothing). */
  :global(.app:not(.phone)) .rdesc { display: none; }
  /* and not the risk badge either: eleven copies of "Changes the box" is noise, and the one
     that matters is drawn big in the right panel the moment the ring lands on the tile. */
  :global(.app:not(.phone)) .grid .row .tag:not(.ok) { display: none; }
  .row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 16px; color: #fff; width: 100%; min-width: 0; text-align: left; font: inherit; background: var(--card-bg); border: 1px solid var(--card-border); transition: background .15s, border-color .15s; }
  .row:hover { background: rgba(0,0,0,.45); border-color: rgba(255,255,255,.2); }
  .row.done { border-color: rgba(0,161,169,.45); }
  .row.span2 { grid-column: span 3; }
  .rico { width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,.1); color: var(--wiz-gold-light); display: flex; align-items: center; justify-content: center; flex: none; }
  .rico > i { font-size: 17px; }
  .rtxt { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
  .rtxt b { font: 700 17px var(--font-display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rdesc { font-size: 13px; color: rgba(255,255,255,.62); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chev { color: rgba(255,255,255,.4); font-size: 18px; flex: none; }

  /* risk tags — the same three everywhere on this screen */
  .tag { font-size: 11px; padding: 3px 10px; border-radius: 999px; white-space: nowrap; flex: none; border: 1px solid transparent; display: inline-flex; align-items: center; gap: 5px; }
  .tag.rev { background: rgba(0,161,169,.18); color: var(--wiz-teal-soft); border-color: rgba(0,161,169,.4); }
  .tag.ro { background: rgba(255,255,255,.08); color: rgba(255,255,255,.7); border-color: rgba(255,255,255,.18); }
  .tag.chg { background: rgba(255,184,0,.12); color: var(--warning); border-color: rgba(255,184,0,.4); }
  .tag.ok { background: rgba(0,161,169,.22); color: var(--wiz-teal-soft); border-color: rgba(0,161,169,.4); font-weight: 600; letter-spacing: 1px; font-size: 10px; }
  .tag.ok i { font-size: 9px; }

  /* the kiosk card: gold-tinted like the main job, but its action is outlined — it opens a screen that asks more */
  .kiosk { display: flex; align-items: center; gap: 14px; padding: 11px 16px; border-radius: 18px; color: #fff; width: 100%; text-align: left; font: inherit; background: rgba(200,144,58,.07); border: 1px solid rgba(200,144,58,.35); transition: background .15s; }
  .kiosk:hover { background: rgba(200,144,58,.14); }
  .kiosk.done { background: rgba(0,161,169,.12); border-color: rgba(0,161,169,.5); }
  .kico { width: 48px; height: 48px; border-radius: 50%; background: rgba(200,144,58,.18); color: var(--wiz-gold-light); display: flex; align-items: center; justify-content: center; flex: none; }
  .kico > i { font-size: 21px; }
  .ktxt { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
  .krow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .krow b { font: 700 18px var(--font-display); }
  .kdesc { font-size: 13.5px; line-height: 1.45; color: rgba(255,255,255,.72); text-wrap: pretty; }
  .tag.term { background: rgba(255,255,255,.06); color: rgba(255,255,255,.6); border-color: rgba(255,255,255,.16); letter-spacing: 1.5px; font-size: 10px; font-weight: 600; }
  .kact { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex: none; }
  .kcta { height: 42px; padding: 0 20px; border-radius: 999px; border: 1.5px solid var(--wiz-gold); color: var(--wiz-gold-light); font: 700 14px var(--font-display); display: flex; align-items: center; white-space: nowrap; }
  .kiosk:hover .kcta { background: var(--wiz-gold); color: var(--wiz-gold-text); }
  .kext { font-size: 11.5px; color: rgba(255,255,255,.55); white-space: nowrap; }

  /* right column */
  .box { border-radius: 16px; background: var(--row-bg); border: 1px solid var(--row-border); padding: 4px 18px; flex: none; }
  .brow { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,.07); }
  .brow:first-child { border-top: none; }
  .brow .k { font-size: 11px; letter-spacing: 1.5px; color: rgba(255,255,255,.5); text-transform: uppercase; }
  .brow .v { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .will { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; border-radius: 16px; background: rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.1); }
  .wh { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .weye { font-size: 11px; letter-spacing: 2px; color: rgba(255,255,255,.5); }
  .wt { font: 700 20px var(--font-display); }
  .wd { font-size: 13.5px; line-height: 1.5; color: rgba(255,255,255,.72); text-wrap: pretty; }
  .cmds { display: flex; flex-direction: column; gap: 4px; padding: 11px 12px; border-radius: 10px; background: rgba(0,0,0,.4); overflow: hidden; }
  .cmds .mono { font-size: 12px; line-height: 1.6; color: rgba(255,255,255,.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wn { font-size: 12px; line-height: 1.5; color: rgba(255,255,255,.5); }
</style>
