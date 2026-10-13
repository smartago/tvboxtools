<script lang="ts">
  // PHONE, first run: "is this language right?" — a small dialog over the first step, with the
  // screen behind it dimmed. The shape is ZUKKA's LanguageDetectorDialog (Jim, 27/9: "δες πώς το
  // κάνει το zukka"), and the reasoning is the same:
  //   · no screen of its own — the phone starts on the first REAL step and the question floats
  //     over it, so nobody pays a full screen for a question that is usually already right;
  //   · a COMBO of every language, not a keep/English pair, so it scales as languages are added;
  //   · the detected language is pre-selected and a countdown confirms it, because doing nothing
  //     is the commonest answer. The moment the combo is touched the countdown stops — a person
  //     choosing must never be interrupted by a timer.
  // WHAT IS DETECTED comes from the IP first (state.svelte.ts `geoLang`), the device second, and it
  // lands a moment AFTER this component mounts. So everything here is DERIVED, never captured: the
  // first version froze "English" at mount and kept showing it after the endpoint had answered
  // "Greek" half a second later.
  // English never opens this dialog at all — the session answers it silently.
  import { getSession } from '../context.js';
  import { LANGS } from '../i18n/index.svelte.js';
  const S = getSession();

  const SECONDS = 25;
  /** The detection: the country's language if the endpoint answered, otherwise the device's own. */
  const detected = $derived(S.langDetected || S.i18n.lang);
  /** The sentence under the title is about the DETECTION, so it must not follow the combo. */
  const detectedName = $derived(LANGS.find((l) => l.tag === detected)?.name ?? detected);
  /** null until the person picks — then their choice wins over the detection. */
  let picked = $state<string | null>(null);
  const pick = $derived(picked ?? detected);
  const chosen = $derived(LANGS.find((l) => l.tag === pick) ?? LANGS[0]!);
  let left = $state(SECONDS);
  let armed = $state(true);

  // The countdown belongs to the OPEN dialog: it starts when the question appears — not when the
  // app mounts, which on a phone is a second earlier — and it stops for good when the combo is used.
  $effect(() => {
    if (!S.langAsk || !armed) return;
    const t = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(t);
        S.confirmLangAsk(picked ?? (S.langDetected || S.i18n.lang));
      }
    }, 1000);
    return () => clearInterval(t);
  });

  function choose(tag: string) {
    picked = tag;
    armed = false;
  }
</script>

{#if S.langAsk && S.phone}
  <div class="scrim">
    <div class="card" role="dialog" aria-modal="true">
      <b class="ttl">{S.t('w1_list')}</b>
      <span class="sub">{S.t('ls_q', { lang: detectedName })}</span>

      <div class="combo">
        <img class="fl" src="{S.assetBase}flags/{chosen.flag}.svg" alt="" />
        <span class="name">{chosen.name}</span>
        <span class="code">{chosen.code}</span>
        <span class="caret">▾</span>
        <!-- the platform's own picker: on a phone that is a full-height wheel, already translated,
             already reachable with a thumb. Nothing we could draw would beat it. -->
        <select value={pick} onchange={(e) => choose(e.currentTarget.value)} aria-label={S.t('w1_list')}>
          {#each LANGS as l (l.tag)}
            <option value={l.tag}>{l.name} ({l.code})</option>
          {/each}
        </select>
      </div>

      <button type="button" class="go" onclick={() => S.confirmLangAsk(pick)}>
        {#if armed}<span class="bar" style:width="{(left / SECONDS) * 100}%"></span>{/if}
        <span class="lbl">{S.t('w1_cont')} {chosen.name}{armed ? ` (${left})` : ''} &nbsp;»</span>
      </button>

      <!-- The way out, in ENGLISH ON PURPOSE and never translated (Jim, 28/9): the person who needs
           it is the one who cannot read the language above. One tap and the app is in English. -->
      {#if pick !== 'en'}
        <button type="button" class="en" onclick={() => S.confirmLangAsk('en')}>
          <img class="fl" src="{S.assetBase}flags/us.svg" alt="" />
          Continue in English
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .scrim { position: absolute; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(3, 6, 12, 0.78); }
  .card { width: 100%; max-width: 340px; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px 18px 18px; border-radius: 22px; background: rgba(20, 28, 46, 0.96); border: 1px solid rgba(120, 160, 255, 0.18); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5); text-align: center; }
  .ttl { font: 700 18px var(--font-display); color: #fff; }
  .sub { font-size: 13px; line-height: 1.45; color: rgba(255, 255, 255, 0.62); }
  .combo { position: relative; display: flex; align-items: center; gap: 10px; width: 100%; margin-top: 6px; padding: 12px 14px; border-radius: 14px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(140, 165, 220, 0.22); }
  .fl { width: 26px; height: 18px; border-radius: 3px; object-fit: cover; flex: none; }
  .name { font: 600 15px var(--font-display); color: #fff; }
  .code { font-size: 13px; color: rgba(255, 255, 255, 0.5); }
  .caret { margin-left: auto; color: rgba(255, 255, 255, 0.55); }
  /* the native control covers the row: the row is what you see, the picker is what you get */
  .combo select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; border: none; background: none; font-size: 16px; }
  .go { position: relative; overflow: hidden; width: 100%; height: 48px; margin-top: 4px; border: none; border-radius: 14px; background: var(--wiz-teal); color: #05101f; font: 700 14px var(--font-display); }
  .bar { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(255, 255, 255, 0.22); transition: width 1s linear; }
  .lbl { position: relative; }
  /* quieter than the confirm above it: this is the second answer, not the expected one */
  .en { display: flex; align-items: center; justify-content: center; gap: 9px; width: 100%; height: 42px; border-radius: 14px; background: none; border: 1px solid rgba(255, 255, 255, 0.22); color: rgba(255, 255, 255, 0.85); font: 600 13.5px var(--font-display); }
  .en:hover { background: rgba(255, 255, 255, 0.08); }
</style>
