<script lang="ts">
  /**
   * WS Σχετικά — ΜΙΑ σελίδα για ό,τι αφορά την ΕΦΑΡΜΟΓΗ (όχι το box· εκείνο έχει τη «Συσκευή»).
   *
   * ΓΙΑΤΙ ΕΔΩ ΚΑΙ ΟΧΙ ΣΕ ΚΑΘΕ ΥΠΟΣΕΛΙΔΟ: η πολιτική απορρήτου έμπαινε ως γραμμή στο υποσέλιδο κάθε
   * βήματος, και σε τηλεόραση αυτό σημαίνει ένα ακόμη σημείο όπου προσγειώνεται το δαχτυλίδι σε
   * κάθε οθόνη — ο άνθρωπος χάνεται (Jim, 30/9). Το Play ζητά την πολιτική ΜΕΣΑ στο app· δεν ζητά
   * να είναι παντού. Μία πόρτα στο μενού, όπως ακριβώς κάνουν τα υπόλοιπα app μας (Button Mapper
   * TV, Universal Manager): έκδοση, σύστημα, νομικά.
   */
  import { getSession } from '../context.js';
  const S = getSession();
  const legal = $derived(
    [
      ['ab_privacy', S.brand.privacyUrl],
      ['ab_terms', S.brand.termsUrl],
      ['ab_cookies', S.brand.cookiesUrl],
    ].filter((r): r is [string, string] => !!r[1]),
  );
  const site = $derived(`https://${S.brand.domain}`);
  const source = $derived(S.brand.sourceUrl);
  const show = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');
</script>

<div class="ab">
  <div>
    <h2 class="h2-ws">{S.t('ab_title')}</h2>
    <div class="intro">{S.t('ab_body')}</div>
  </div>

  <div class="card">
    <span class="mark" class:plate={S.brand.logo.onLight}>
      <img src="{S.assetBase}{S.brand.logo.wordmark}" alt={S.brand.name} />
    </span>
    <div class="rows">
      <div class="row"><span class="k">{S.t('ab_version')}</span><b class="v">{S.appVersion}</b></div>
      <div class="row"><span class="k">{S.t('ab_face')}</span><b class="v">{S.platformChip}</b></div>
      <div class="row"><span class="k">{S.t('ab_site')}</span><b class="v">{S.brand.domain}</b></div>
    </div>
  </div>

  <!-- ΤΑ ΝΟΜΙΚΑ, ΜΑΖΙ. Κάθε κουμπί γράφει ΚΑΙ τη διεύθυνσή του: αυτό το εργαλείο τρέχει και πάνω σε
       TV box, όπου συχνά δεν υπάρχει browser να ανοίξει — εκεί το πάτημα δεν κάνει τίποτα, η
       γραμμένη διεύθυνση όμως διαβάζεται και πληκτρολογείται αλλού. -->
  <div class="sect">{S.t('ab_legal')}</div>
  <div class="links">
    {#each legal as [key, url] (key)}
      <button type="button" class="lk tvlm-focus" data-nav onclick={() => S.openExternal(url)}>
        <b>{S.t(key as 'ab_privacy')}</b><span>{show(url)}</span>
      </button>
    {/each}
    <button type="button" class="lk tvlm-focus" data-nav onclick={() => S.openExternal(site)}>
      <b>{S.t('ab_openSite')}</b><span>{show(site)}</span>
    </button>
    <!-- Ο κώδικας δίπλα στα νομικά και όχι μέσα τους: δεν είναι όρος, είναι η απόδειξη. Ένα εργαλείο
         που τρέχει εντολές ADB στο box κάποιου, το «τι ακριβώς τρέχει» το απαντά ο ανοιχτός κώδικας. -->
    {#if source}
      <button type="button" class="lk tvlm-focus" data-nav onclick={() => S.openExternal(source)}>
        <b>{S.t('ab_source')}</b><span>{show(source)}</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .ab { display: flex; flex-direction: column; gap: 18px; }
  .intro { margin-top: 8px; color: var(--text-sub); font-size: 14.5px; line-height: 1.5; max-width: 620px; }
  .card { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; padding: 20px 22px; border-radius: 16px; background: var(--row-bg); border: 1px solid var(--row-border); }
  /* ένα σκούρο λογότυπο θέλει τη δική του ανοιχτή πλάκα, όπως στην κεφαλίδα — καμία αλλοίωση έργου */
  .mark { display: flex; align-items: center; }
  .mark.plate { background: #fff; border-radius: 12px; padding: 10px 14px; }
  .mark img { height: 34px; display: block; }
  .rows { display: flex; flex-direction: column; gap: 6px; min-width: 240px; }
  .row { display: flex; align-items: baseline; gap: 12px; }
  /* ΟΧΙ `text-transform: uppercase`: στα ελληνικά ο browser κρατά τον τόνο («ΈΚΔΟΣΗ»), που είναι
     ορθογραφικό λάθος — τα κεφαλαία δεν τονίζονται. Το ίδιο βάρος βγαίνει με χρώμα και μέγεθος. */
  .k { font-size: 12.5px; color: var(--text-dim); letter-spacing: .3px; min-width: 96px; }
  .v { font-size: 15px; }
  .sect { font: 700 15px var(--font-display); margin-top: 4px; }
  .links { display: flex; flex-wrap: wrap; gap: 10px; }
  .lk { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 11px 16px; border-radius: 12px; background: var(--row-bg); border: 1px solid var(--row-border); color: #fff; text-align: left; }
  .lk:hover { border-color: rgba(255,255,255,.3); }
  .lk b { font: 600 14px var(--font-display); }
  .lk span { font-size: 12px; color: var(--text-dim); }
</style>
