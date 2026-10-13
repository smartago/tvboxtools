<script lang="ts">
  // PLUI KeyHints (DS components/core/KeyHints.jsx) — the footer key-hint row: "↑↓ Move · Enter Select · Esc Back".
  interface Props {
    hints: Array<[string, string]>;
  }
  let { hints }: Props = $props();
</script>

<div class="hints">
  {#each hints as [key, label], i (key)}
    <span class="hint">{#if i > 0}<span class="sep">·</span>{/if}<b>{key}</b>{label}</span>
  {/each}
</div>

<style>
  .hints { display: inline-flex; align-items: center; gap: 18px; background: rgba(255,255,255,.06); border-radius: 999px; padding: 6px 16px; font-family: var(--font-ui); font-size: 13px; color: var(--text-sub); }
  .hint { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
  .sep { color: var(--text-dim); margin-right: 10px; }
  b { font-weight: 700; color: #fff; }
</style>
