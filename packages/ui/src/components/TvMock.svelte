<script lang="ts">
  // The TV frame the wizard shows (720×405, Android TV Settings palette — NOT ours). The content is a
  // placeholder: real screen recordings per brand replace it (DESIGN_NOTES §1 Ζ7).
  import type { Snippet } from 'svelte';
  interface Props {
    width?: number;
    height?: number;
    dim?: boolean;
    glow?: 'left' | 'right';
    children: Snippet;
  }
  let { width = 720, height = 405, dim = false, glow = 'left', children }: Props = $props();
</script>

<div class="tv" style:width="{width}px" style:height="{height}px">
  <div class="bg" class:right={glow === 'right'}></div>
  {#if dim}<div class="scrim"></div>{/if}
  {@render children()}
</div>

<style>
  .tv { border-radius: 12px; background: var(--tv-bg); position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,.1); box-shadow: 0 20px 50px rgba(0,0,0,.4); flex: none; font-family: var(--font-label); }
  .bg { position: absolute; inset: 0; background: radial-gradient(ellipse at 30% 60%, #243B4A 0%, #0B0E13 70%); }
  .bg.right { background: radial-gradient(ellipse at 70% 30%, #2b4a5a 0%, #0B0E13 70%); }
  .scrim { position: absolute; inset: 0; background: rgba(0,0,0,.55); }
</style>
