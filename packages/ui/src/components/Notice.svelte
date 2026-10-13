<script lang="ts">
  // The colored info boxes of the prototype: teal (info), yellow (warn), red (danger), green (ok), gold (hands on the TV).
  import type { Snippet } from 'svelte';
  interface Props {
    kind?: 'info' | 'warn' | 'danger' | 'ok' | 'gold';
    icon?: string;
    center?: boolean;
    bold?: boolean;
    style?: string;
    children: Snippet;
  }
  let { kind = 'info', icon = '', center = false, bold = false, style = '', children }: Props = $props();
  const defaultIcon: Record<NonNullable<Props['kind']>, string> = { info: 'bi-check-circle-fill', warn: 'bi-warning-fill', danger: 'bi-warning-fill', ok: 'bi-check-circle-fill', gold: 'bi-remote' };
  const ico = $derived(icon || defaultIcon[kind]);
  const isPlui = $derived(ico.startsWith('pi-'));
</script>

<div class="notice notice-{kind}" class:center class:bold {style}>
  <i class="{isPlui ? 'plui-icon' : 'base-icon'} {ico}"></i>
  <span class="body">{@render children()}</span>
</div>

<style>
  .body { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .bold .body { font-weight: 600; font-size: 15px; }
</style>
