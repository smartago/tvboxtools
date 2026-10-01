<script lang="ts">
  // The wizard stepper: pills, active = gold, completed = teal check (DESIGN_NOTES §10).
  import { getSession } from '../context.js';
  const S = getSession();
  // The Hotel TV road has 11–12 steps and the row is 1280 wide: done steps far behind the current one
  // shrink to their tick (the name stays as a tooltip), so the steps AHEAD are never cut off.
  const items = $derived(S.stepItems);
  const cur = $derived(items.findIndex((s) => s.active));
  const mini = (i: number) => items.length > 9 && items[i]!.done && i < cur - 1;
  // On a phone the row does not fit at all, so it scrolls sideways (portrait.css) and the step you
  // are on is pulled back into the middle every time it changes. Without this the rail stays at the
  // start and the wizard looks stuck on step 1.
  let rail: HTMLDivElement | undefined = $state();
  $effect(() => {
    void cur;
    if (!S.phone || !rail) return;
    const el = rail;
    queueMicrotask(() => {
      const pill = el.querySelector<HTMLElement>('.pill.active');
      if (!pill) return;
      // THE RAIL, and nothing above it. `scrollIntoView` walks up and scrolls every ancestor that
      // can be scrolled — including `.app`, which is `overflow: hidden` but still scrollable from
      // code. The result was the whole application shoved 150 px sideways, header and footer with
      // it, on any step whose pill sits far to the right (Jim, 27/9/2026). Setting scrollLeft moves
      // this element only.
      el.scrollTo({ left: pill.offsetLeft - (el.clientWidth - pill.offsetWidth) / 2, behavior: 'smooth' });
    });
  });
</script>

<div class="stepper" bind:this={rail}>
  {#each items as s, i (s.key)}
    <div class="pill" class:active={s.active} class:done={s.done} class:mini={mini(i)} title={mini(i) ? S.t(s.key) : null}>
      <span class="dot">{#if s.done}<i class="base-icon bi-check"></i>{:else}{s.n}{/if}</span>
      {#if !mini(i)}<span class="label">{S.t(s.key)}</span>{/if}
    </div>
    {#if i < items.length - 1}<span class="sep">›</span>{/if}
  {/each}
</div>

<style>
  .stepper { position: relative; height: 48px; flex: none; display: flex; align-items: center; padding: 0 40px; gap: 2px; }
  :global(.app.tv) .stepper { padding: 0 48px; }
  .pill { display: flex; align-items: center; gap: 8px; padding: 5px 12px 5px 6px; border-radius: 999px; white-space: nowrap; flex: none; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); font: 500 13px var(--font-display); color: rgba(255,255,255,.4); }
  .pill.done { color: rgba(255,255,255,.75); }
  .pill.active { background: rgba(200,144,58,.14); border-color: rgba(200,144,58,.55); font-weight: 600; color: #fff; }
  .dot { width: 24px; height: 24px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; background: rgba(255,255,255,.08); color: rgba(255,255,255,.45); flex: none; }
  .dot i { font-size: 11px; }
  .pill.done .dot { background: rgba(0,161,169,.25); color: var(--wiz-teal-soft); }
  .pill.active .dot { background: var(--wiz-gold); color: var(--wiz-gold-text); }
  .pill.mini { padding: 5px; }
  .sep { color: rgba(255,255,255,.3); font-size: 16px; padding: 0 5px; }
</style>
