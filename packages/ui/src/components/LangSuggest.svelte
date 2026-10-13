<script lang="ts">
  // "We think you read Greek — shall we?" (Jim, 22/9: do what Lunona and ZUKKA do.)
  //
  // The bar only exists when something OUTSIDE the page suggests a language we actually have, and
  // it is a QUESTION: nothing changes until the person answers. A page that switches language by
  // itself is a page that lost its reader — and the answer is remembered, so it is asked once.
  import { getSession } from '../context.js';
  import { LANGS } from '../i18n/index.svelte.js';
  const S = getSession();
  const name = (tag: string | null) => LANGS.find((l) => l.tag === tag)?.name ?? '';
</script>

{#if S.langSuggestion}
  <div class="ls">
    <span class="txt">{S.t('ls_q', { lang: name(S.langSuggestion) })}</span>
    <button type="button" class="yes tvlm-focus" data-nav onclick={() => S.takeLangSuggestion()}>
      {S.t('ls_yes', { lang: name(S.langSuggestion) })}
    </button>
    <button type="button" class="no tvlm-focus" data-nav onclick={() => S.keepLang()}>
      {S.t('ls_no', { lang: S.i18n.langName })}
    </button>
  </div>
{/if}

<style>
  .ls { display: flex; align-items: center; gap: 12px; margin: 0 40px 10px; padding: 9px 14px; border-radius: 12px; background: rgba(0,161,169,.14); border: 1px solid rgba(0,161,169,.35); }
  .txt { flex: 1; min-width: 0; font-size: 13px; color: rgba(255,255,255,.85); }
  .yes { border: none; border-radius: 999px; padding: 7px 16px; background: var(--wiz-gold); color: var(--wiz-gold-text); font-size: 13px; font-weight: 700; white-space: nowrap; }
  .no { border: 1px solid rgba(255,255,255,.22); border-radius: 999px; padding: 7px 14px; background: none; color: rgba(255,255,255,.8); font-size: 13px; white-space: nowrap; }
  .no:hover { background: rgba(255,255,255,.08); }
</style>
