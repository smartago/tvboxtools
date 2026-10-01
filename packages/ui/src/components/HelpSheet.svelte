<script lang="ts">
  // The guide sheet behind W6's "Hotspot guide" / "Get USB driver" (help.ts holds the content).
  // A native <dialog> so focus is trapped and Escape closes it without the wizard's Back firing.
  import { getSession } from '../context.js';
  import PillButton from '../components/PillButton.svelte';
  import { GUIDES, actionsFor, sectionsFor, type HelpAction } from '../help.js';
  const S = getSession();

  let el: HTMLDialogElement | undefined = $state();
  const guide = $derived(S.help ? GUIDES[S.help] : null);
  const sections = $derived(guide ? sectionsFor(guide, S.hostOs) : []);

  $effect(() => {
    if (!el) return;
    if (S.help && !el.open) {
      el.showModal();
      queueMicrotask(() => el?.querySelector<HTMLElement>('[data-nav]')?.focus({ preventScroll: true }));
    } else if (!S.help && el.open) el.close();
  });

  function run(a: HelpAction) {
    if (a.url) S.openExternal(a.url);
    else if (a.act === 'network') S.helpUseNetwork();
    else if (a.act === 'rescan') S.helpRescan();
  }
</script>

<dialog bind:this={el} class="sheet" onclose={() => S.closeHelp()} oncancel={(e) => { e.preventDefault(); S.closeHelp(); }}>
  {#if guide}
    <header>
      <div class="ti">
        <span class="ico"><i class="base-icon {S.help === 'hotspot' ? 'bi-wifi' : 'bi-solid-arrow-right'}"></i></span>
        <div><b>{S.t(guide.title)}</b><span class="lead">{S.t(guide.lead)}</span></div>
      </div>
      <button type="button" class="x" aria-label={S.t('h_close')} data-nav onclick={() => S.closeHelp()}><i class="base-icon bi-x"></i></button>
    </header>

    <div class="body">
      {#if S.help === 'driver' && S.usbReason}
        <p class="reason"><i class="base-icon bi-warning-fill"></i>{S.t('h_usb_reason', { reason: S.usbReason })}</p>
      {/if}

      {#each sections as sec (sec.title)}
        {@const acts = actionsFor(sec, S.hostOs, S.platform === 'desktop')}
        <section>
          <b class="st">{S.t(sec.title)}</b>
          <ol>
            {#each sec.steps as step (step)}<li>{S.t(step)}</li>{/each}
          </ol>
          {#if acts.length}
            <div class="acts">
              {#each acts as a (a.label)}
                <PillButton kind={a.gold ? 'gold' : 'ghost'} size="sm" onclick={() => run(a)}>
                  {S.t(a.label)}{#if a.url && a.url.startsWith('https')}&nbsp;<i class="base-icon bi-solid-arrow-right" style="font-size:11px;opacity:.7"></i>{/if}
                </PillButton>
              {/each}
            </div>
          {/if}
        </section>
      {/each}

      {#if guide.note}<p class="note"><i class="base-icon bi-check-circle-fill"></i>{S.t(guide.note)}</p>{/if}
    </div>

    <footer>
      <span class="hint">{S.t('h_links')}</span>
      <PillButton kind="ghost" size="sm" onclick={() => S.closeHelp()}>{S.t('h_close')}</PillButton>
      <PillButton size="sm" onclick={() => S.helpRescan()}>{S.t('w6_rescan')}</PillButton>
    </footer>
  {/if}
</dialog>

<style>
  .sheet { width: 780px; max-width: calc(100% - 80px); max-height: 700px; padding: 0; border: 1px solid rgba(255,255,255,.14); border-radius: 18px; background: #16233d; color: #fff; box-shadow: 0 40px 120px rgba(0,0,0,.55); overflow: hidden; flex-direction: column; }
  .sheet[open] { display: flex; }
  .sheet::backdrop { background: rgba(10,16,30,.62); backdrop-filter: blur(3px); }
  header { display: flex; align-items: flex-start; gap: 16px; padding: 24px 26px 18px; border-bottom: 1px solid rgba(255,255,255,.09); }
  .ti { display: flex; gap: 16px; flex: 1; min-width: 0; }
  .ti > div { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .ti b { font: 700 22px var(--font-display); }
  .lead { font-size: 14px; line-height: 1.55; color: rgba(255,255,255,.75); }
  .ico { width: 46px; height: 46px; border-radius: 12px; flex: none; display: flex; align-items: center; justify-content: center; background: rgba(200,144,58,.16); border: 1px solid rgba(200,144,58,.45); color: var(--wiz-gold-light); font-size: 20px; }
  .x { width: 36px; height: 36px; border-radius: 10px; flex: none; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); color: #fff; font-size: 14px; display: flex; align-items: center; justify-content: center; }
  .x:hover { background: rgba(255,255,255,.14); }
  .body { padding: 20px 26px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 22px; }
  section { display: flex; flex-direction: column; gap: 10px; }
  .st { font: 600 16px var(--font-display); color: var(--wiz-teal-soft); }
  ol { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 8px; }
  li { font-size: 14px; line-height: 1.6; color: rgba(255,255,255,.88); }
  li::marker { color: var(--wiz-gold-light); font-weight: 700; }
  .acts { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 2px; }
  .note, .reason { display: flex; align-items: flex-start; gap: 10px; margin: 0; padding: 14px 16px; border-radius: 12px; font-size: 13px; line-height: 1.55; }
  .note { background: rgba(0,161,169,.12); border: 1px solid rgba(0,161,169,.32); color: rgba(255,255,255,.85); }
  .note i { color: var(--wiz-teal-soft); font-size: 15px; margin-top: 1px; }
  .reason { background: rgba(255,184,0,.1); border: 1px solid rgba(255,184,0,.35); }
  .reason i { color: var(--warning); font-size: 15px; margin-top: 1px; }
  footer { display: flex; align-items: center; gap: 10px; padding: 16px 26px; border-top: 1px solid rgba(255,255,255,.09); background: rgba(0,0,0,.18); }
  .hint { flex: 1; font-size: 12px; color: rgba(255,255,255,.5); }
</style>
