<script lang="ts">
  // "Which box are we setting up?" — the step that exists only inside the app running ON a
  // television (Session.canTargetSelf). The other screens keep the prototype's W1…W9 names; this
  // one has no number because it was inserted after them.
  //
  // The answer changes the rest of the wizard: "this TV" means the set can be asked about itself,
  // so the developer step waits on the real setting instead of asking the installer, and the
  // debugging question disappears — there is nothing to choose when the box is the device you are
  // holding the remote for.
  import { getSession } from '../context.js';
  import Card from '../components/Card.svelte';
  const S = getSession();
</script>

<div class="screen wt">
  <div class="head">
    <h2 class="h2">{S.t('wt_title')}</h2>
    <p class="lead" style="margin-top:12px">{S.t('wt_body')}</p>
  </div>
  <div class="grid">
    <Card sel={S.target === 'self'} column padding="24px" minHeight="300px" onpick={() => S.pickTarget('self')}>
      <div class="top">
        <span class="ico-circle"><i class="base-icon bi-remote"></i></span>
        {#if S.target === 'self'}<span class="check-badge"><i class="base-icon bi-check"></i></span>{/if}
      </div>
      <b class="ttl">{S.t('wt_self')}</b>
      <span class="desc">{S.t('wt_selfD')}</span>
      <span class="who">{S.selfSummary}</span>
    </Card>
    <Card sel={S.target === 'other'} column padding="24px" minHeight="300px" onpick={() => S.pickTarget('other')}>
      <div class="top">
        <span class="ico-circle"><i class="base-icon bi-wifi"></i></span>
        {#if S.target === 'other'}<span class="check-badge"><i class="base-icon bi-check"></i></span>{/if}
      </div>
      <b class="ttl">{S.t('wt_other')}</b>
      <span class="desc">{S.t('wt_otherD')}</span>
      <span class="who">{S.t('wt_otherP')}</span>
    </Card>
  </div>
</div>

<style>
  .wt { display: flex; flex-direction: column; gap: 22px; padding-top: 10px; }
  .head { max-width: 860px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 900px; }
  .top { display: flex; align-items: center; justify-content: space-between; width: 100%; }
  .ttl { font: 700 22px var(--font-display); margin-top: 18px; text-align: left; }
  .desc { font-size: 15px; line-height: 1.55; color: rgba(255,255,255,.7); text-align: left; margin-top: 8px; flex: 1; }
  .who { align-self: stretch; margin-top: 14px; padding: 10px 12px; border-radius: 8px; background: var(--tv-panel); color: var(--tv-text); font: 400 12px var(--font-label); text-align: left; border: 1px solid rgba(255,255,255,.08); }
</style>
