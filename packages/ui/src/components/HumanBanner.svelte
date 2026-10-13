<script lang="ts">
  // The engine's `human` callback: "press Allow / HOME / pick the launcher on the TV" + Continue.
  import { getSession } from '../context.js';
  import PillButton from './PillButton.svelte';
  const S = getSession();
  const key = $derived(({ allow: 'hu_allow', home: 'hu_home', pickLauncher: 'hu_pickLauncher', accounts: 'hu_accounts', reboot: 'hu_reboot' } as const)[S.human?.what ?? 'allow']);
  // "pick the launcher" must name the one the user actually chose — or nobody, when the TV is the
  // one doing the asking. Every other prompt reads the same whatever was picked.
  const text = $derived(S.human?.what === 'pickLauncher' ? S.pickLauncherPrompt : S.t(key));
</script>

{#if S.human}
  <div class="notice notice-gold center tvlm-fade human">
    <i class="base-icon bi-remote" style="font-size:22px"></i>
    <span class="txt"><b>{S.t('hu_title')}</b><span>{text}</span></span>
    <PillButton size="sm" onclick={() => S.humanContinue()}>{S.t('cont')} »</PillButton>
  </div>
{/if}

<style>
  .human { margin-bottom: 16px; }
  .txt { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .txt b { font: 700 15px var(--font-display); }
</style>
