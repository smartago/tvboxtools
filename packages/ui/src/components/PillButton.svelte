<script lang="ts">
  // The gold CTA + the ghost/outline pills of the prototype. Keyboard-navigable (data-nav).
  import type { Snippet } from 'svelte';
  interface Props {
    kind?: 'gold' | 'ghost' | 'outline' | 'danger';
    size?: 'xs' | 'sm' | 'md' | 'lg';
    disabled?: boolean;
    type?: 'button' | 'submit';
    style?: string;
    nav?: boolean;
    onclick?: () => void;
    children: Snippet;
  }
  let { kind = 'gold', size = 'md', disabled = false, type = 'button', style = '', nav = true, onclick, children }: Props = $props();
</script>

<button {type} class="btn btn-{kind} {size}" class:danger={kind === 'danger'} {disabled} {style} data-nav={nav ? '' : null} onclick={() => !disabled && onclick?.()}>
  {@render children()}
</button>

<style>
  .btn-danger { height: 46px; padding: 0 22px; background: transparent; border: 2px solid var(--danger-alt); color: var(--danger-alt); font: 700 15px var(--font-display); }
  .btn-danger:hover:not(:disabled) { background: rgba(240,82,82,.12); }
  .btn-danger:disabled { opacity: .4; }
</style>
