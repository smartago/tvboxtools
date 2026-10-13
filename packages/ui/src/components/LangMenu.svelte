<script lang="ts">
  // ΤΟ CHIP ΤΗΣ ΓΛΩΣΣΑΣ, στην κεφαλίδα — ΜΕ ΟΛΕΣ ΤΙΣ ΓΛΩΣΣΕΣ.
  //
  // Μέχρι τις 6/10/2026 το chip έκανε `toggleLang()`: EN ⇄ EL, δύο γλώσσες, γραμμένες μέσα στον
  // κώδικα. Όσο το app είχε δύο γλώσσες αυτό ήταν σωστό. Με εννιά, το ίδιο κουμπί έγινε παγίδα —
  // ο Jim το είδε στο `/es/setup/`: το βελάκι «▾» υπόσχεται κατάλογο, το πάτημα πήγαινε στα
  // αγγλικά και οι άλλες εφτά γλώσσες δεν υπήρχαν πουθενά σε αυτή την οθόνη.
  //
  // Τώρα ανοίγει ΔΙΑΛΟΓΟΣ με τον κατάλογο — ό,τι δίνει το `S.langs`, δηλαδή ό,τι ΕΧΕΙ το app
  // (i18n/index.svelte.ts): καμιά δεύτερη λίστα να μείνει πίσω. Διάλογος και όχι πτυσσόμενο
  // πλαίσιο, γιατί η τηλεόραση θέλει το focus κλεισμένο μέσα και το Esc να κλείνει ΤΟΝ ΚΑΤΑΛΟΓΟ
  // αντί να γυρνά βήμα πίσω στον οδηγό — το σχήμα του HelpSheet, αυτούσιο.
  import { getSession } from '../context.js';
  import Card from './Card.svelte';
  const S = getSession();

  let el: HTMLDialogElement | undefined = $state();
  let open = $state(false);

  $effect(() => {
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // Η τρέχουσα γλώσσα παίρνει το focus, όχι η πρώτη γραμμή: ο κατάλογος ανοίγει ΕΚΕΙ ΠΟΥ
      // είμαστε, όπως κάθε λίστα επιλογής του app.
      queueMicrotask(() => {
        const box = el;
        if (!box) return;
        const row = box.querySelector<HTMLElement>('.card.sel') ?? box.querySelector<HTMLElement>('[data-nav]');
        row?.focus({ preventScroll: true });
      });
    } else if (!open && el.open) el.close();
  });

  function choose(tag: string) {
    S.pickLang(tag);
    // Μια γλώσσα διαλεγμένη με το χέρι είναι απάντηση: σταμάτα να προτείνεις άλλη.
    S.langSuggestion = null;
    open = false;
  }
</script>

<button type="button" class="lang tvlm-focus" aria-haspopup="dialog" title={S.t('s_lang')} onclick={() => (open = true)}>
  <img class="fl" src="{S.assetBase}flags/{S.i18n.flag}.svg" alt="" /><span class="code">{S.i18n.code}</span>▾
</button>

<dialog bind:this={el} class="sheet" onclose={() => (open = false)} oncancel={(e) => { e.preventDefault(); open = false; }}>
  <header>
    <b>{S.t('w1_list')}</b>
    <button type="button" class="x" aria-label={S.t('h_close')} data-nav onclick={() => (open = false)}><i class="base-icon bi-x"></i></button>
  </header>
  <div class="list">
    {#each S.langs as l (l.tag)}
      <Card sel={l.sel} padding="9px 14px" onpick={() => choose(l.tag)}>
        <span class="flag"><img src="{S.assetBase}flags/{l.flag}.svg" alt="" /></span>
        <span class="name">{l.name}</span>
        <span class="code2">{l.code}</span>
      </Card>
    {/each}
  </div>
</dialog>

<style>
  /* το chip μένει ΙΔΙΟ — ήρθε αυτούσιο από το Header.svelte */
  .lang { height: 36px; padding: 0 12px; border-radius: 8px; background: rgba(255,255,255,.1); border: 1px solid var(--gray-700); color: #fff; font: 400 14px var(--font-display); display: flex; align-items: center; gap: 8px; }
  .lang:hover { background: rgba(255,255,255,.16); }
  .code { font-size: 12px; padding: 1px 5px; border-radius: 4px; background: rgba(255,255,255,.15); }
  .fl { width: 24px; height: 16px; border-radius: 3px; object-fit: cover; display: block; }

  .sheet { width: min(420px, 92vw); max-height: 82vh; padding: 0; border: 1px solid var(--row-border); border-radius: 20px; background: var(--sheet-bg, #131a2b); color: #fff; overflow: hidden; }
  .sheet::backdrop { background: rgba(6,10,20,.6); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px 12px; }
  header b { font: 700 19px var(--font-display); }
  .x { width: 34px; height: 34px; flex: none; border-radius: 10px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); color: #fff; display: flex; align-items: center; justify-content: center; }
  .x:hover { background: rgba(255,255,255,.16); }
  /* padding = χώρος για το ring (σχεδιάζεται ΕΞΩ από την κάρτα και η λίστα κυλά, άρα κόβεται) */
  .list { display: flex; flex-direction: column; gap: 8px; padding: 2px 20px 20px; overflow: auto; }
  .flag { width: 34px; height: 24px; border-radius: 5px; overflow: hidden; background: rgba(255,255,255,.08); display: flex; flex: none; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }
  .flag img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .name { flex: 1; text-align: left; font: 600 17px var(--font-display); }
  .code2 { font: 700 11px var(--font-display); letter-spacing: 1px; color: rgba(255,255,255,.45); flex: none; }
</style>
