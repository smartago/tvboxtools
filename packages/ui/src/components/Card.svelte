<script lang="ts">
  // The selectable card (DESIGN_NOTES §10): white/5 + border white/9, r-18; selected = gold/14 + gold/55 + gold check.
  import type { Snippet } from 'svelte';
  interface Props {
    sel?: boolean;
    disabled?: boolean;
    column?: boolean;
    /** Show the gold check badge when selected (the prototype puts it inline at the end, or top-right for column cards). */
    check?: boolean;
    padding?: string;
    minHeight?: string;
    opacity?: number;
    onpick?: () => void;
    children: Snippet;
  }
  let { sel = false, disabled = false, column = false, check = true, padding = '14px 18px', minHeight = '', opacity = 1, onpick, children }: Props = $props();
</script>

<button type="button" class="card" class:sel class:column data-nav onclick={() => !disabled && onpick?.()} {disabled} style:padding style:min-height={minHeight || null} style:opacity={disabled ? 0.45 : opacity}>
  {@render children()}
  {#if check && sel && !column}
    <span class="check-badge"><i class="base-icon bi-check"></i></span>
  {/if}
</button>

<style>
  .card { display: flex; align-items: center; gap: 16px; border-radius: 18px; color: #fff; width: 100%; text-align: left; background: var(--card-bg); border: 1px solid var(--card-border); transition: border-color .15s; font: inherit; }
  .card:hover:not(:disabled) { border-color: rgba(255,255,255,.3); }
  .card.sel { background: var(--card-sel-bg); border-color: var(--card-sel-border); }
  .card.column { flex-direction: column; align-items: flex-start; }
  .card:disabled { cursor: default; }
</style>
