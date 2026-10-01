<script lang="ts">
  // The wizard shell: stepper · the current screen · footer with key hints, Back / Skip / primary.
  // W1…W9 are the prototype's screen names, not step numbers — `W` (state.svelte.ts) holds the
  // numbers, and WTarget was inserted after those names were fixed.
  import { getSession } from '../context.js';
  import { W } from '../state.svelte.js';
  import Stepper from '../components/Stepper.svelte';
  import KeyHints from '../components/KeyHints.svelte';
  import HumanBanner from '../components/HumanBanner.svelte';
  import W1Language from './W1Language.svelte';
  import WTarget from './WTarget.svelte';
  import W2Role from './W2Role.svelte';
  import W3Box from './W3Box.svelte';
  import W4DevMode from './W4DevMode.svelte';
  import W5Debugging from './W5Debugging.svelte';
  import W6Find from './W6Find.svelte';
  import W7Allow from './W7Allow.svelte';
  import W8Check from './W8Check.svelte';
  import WTasks from './WTasks.svelte';
  import WLauncher from './WLauncher.svelte';
  import WKiosk from './WKiosk.svelte';
  import WKioskApp from './WKioskApp.svelte';
  import WUse from './WUse.svelte';
  import WInstall from './WInstall.svelte';
  import W9Mode from './W9Mode.svelte';
  const S = getSession();
  const hints = $derived<Array<[string, string]>>([['↑↓', S.t('keyNav')], ['Enter', S.t('keySelect')], ['Esc', S.t('keyBack')]]);
</script>

<Stepper />

<div class="body">
  {#if S.human}<div class="human"><HumanBanner /></div>{/if}
  {#if S.step === W.lang}<W1Language />
  {:else if S.step === W.target}<WTarget />
  {:else if S.step === W.role}<W2Role />
  {:else if S.step === W.box}<W3Box />
  {:else if S.step === W.dev}
    <!-- ONE developer-mode screen for every road (Jim, 28/9). When the box IS this television the
         same screen grows the buttons that open its settings — under the film, in W4DevMode. -->
    <W4DevMode />
  {:else if S.step === W.debug}<W5Debugging />
  {:else if S.step === W.find}<W6Find />
  {:else if S.step === W.allow}<W7Allow />
  {:else if S.step === W.check}<W8Check />
  {:else if S.step === W.tasks}<WTasks />
  {:else if S.step === W.launcher}<WLauncher />
  {:else if S.step === W.kiosk}<WKiosk />
  {:else if S.step === W.kioskApp}<WKioskApp />
  {:else if S.step === W.use}<WUse />
  {:else if S.step === W.install}<WInstall />
  {:else}<W9Mode />{/if}
</div>

<div class="footer">
  <KeyHints {hints} />
  <div style="flex:1"></div>
  {#if S.showBack}<button type="button" class="btn btn-ghost" data-nav onclick={() => S.back()}>«&nbsp; {S.t('back')}</button>{/if}
  {#if S.showSkip}<button type="button" class="btn btn-outline" data-nav onclick={() => S.skipStep()}>{S.step === W.allow ? S.t('w7_retry') : S.t('skip')}</button>{/if}
  {#if S.showPrimary}<button type="button" class="btn btn-gold" data-nav data-primary disabled={S.primaryDisabled} onclick={() => S.next()}>{S.primaryLabel} &nbsp;»</button>{/if}
</div>

<style>
  .body { position: relative; flex: 1; min-height: 0; padding: 22px 40px 0; display: flex; flex-direction: column; }
  /* TV: +20% στα εσωτερικά περιθώρια (Jim, 29/9) — το μόνο που μεγαλώνει όταν
     η οθόνη γεμίζει: καμία αλλαγή σε ύψη, άρα κάθε οθόνη χωρά όπως χωρούσε. */
  :global(.app.tv) .body { padding: 26px 48px 0; }
  /* ΚΑΜΙΑ μπάρα κάτω σε TV (Jim, 29/9: «βγάλε αυτή τη σκιά από κάτω, χαλάει τα
     button»): όσο ο καμβάς έμπαινε σε πλαίσιο, η μπάρα έμοιαζε με πατούσα της οθόνης· τώρα που
     η οθόνη γεμίζει, είναι μια σκιά πάνω στα κουμπιά. */
  :global(.app.tv) .footer { padding: 0 48px; background: none; border-top: none; }
  .body > :global(.screen) { flex: 1; min-height: 0; }
  .human { flex: none; }
  .footer { position: relative; height: 84px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 40px; background: rgba(13,17,23,.35); border-top: 1px solid rgba(255,255,255,.08); }
</style>
