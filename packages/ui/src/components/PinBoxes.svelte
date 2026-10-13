<script lang="ts">
  // PLUI PinBoxes (DS components/dialogs/PinBoxes.jsx): 4 boxes 60 r-8 gray-700, digit 32 bold; active = ring-4 yellow.
  interface Props {
    filled: number;
    active?: number;
    scale?: number;
  }
  let { filled, active = -1, scale = 0.8 }: Props = $props();
</script>

<div class="pins" style:transform="scale({scale})">
  {#each [0, 1, 2, 3] as i (i)}
    <div class="box" class:active={active === i}>{#if i < filled}●{:else}<span class="ph">•</span>{/if}</div>
  {/each}
</div>

<style>
  .pins { display: inline-flex; gap: 14px; transform-origin: left center; height: 52px; align-items: center; }
  .box { width: 60px; height: 60px; border-radius: 8px; background: var(--gray-700); border: 2px solid transparent; display: flex; align-items: center; justify-content: center; color: #fff; font: 700 32px var(--font-ui); }
  .box.active { box-shadow: 0 0 0 4px var(--focus); }
  .ph { opacity: .35; }
</style>
