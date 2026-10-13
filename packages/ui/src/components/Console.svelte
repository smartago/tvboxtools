<script lang="ts">
  // The console dock: every report entry (kind cmd/out/ok/warn/err/info). Engine `cmd` entries are shown as
  // `$ adb shell <cmd>` (or `$ adb install …`); UI lines that already start with `$` are shown verbatim.
  // Engine keys (`err_*`) are translated; a maintenance PIN is masked on screen (the report keeps it).
  //
  // ΚΛΕΙΣΤΗ ΑΠΟ ΜΟΝΗ ΤΗΣ, ΑΝΟΙΧΤΗ ΟΤΑΝ ΤΡΕΧΕΙ ΚΑΤΙ (Jim, 7/10/2026: «θέλω η κονσόλα να μπορεί να
  // γίνει hide και default να την έχεις hide· την κάνεις view όταν εκτελέσεις κάποια εντολή adb και
  // μετά αν θέλω ο user την κλείνει — όχι μόνο εδώ, γενικά»). Ήταν ΜΟΝΙΜΑ ανοιχτή στον υπολογιστή:
  // 150px λογαριθμικού κειμένου κάτω από κάθε σελίδα, που κανείς δεν ζήτησε να δει και που έτρωγαν
  // από τη σελίδα. Τώρα:
  //
  //   · ξεκινά ΚΛΕΙΣΤΗ σε κάθε όψη — μία γραμμή, με την τελευταία έξοδο να φαίνεται στο πλάι·
  //   · ΜΕΝΕΙ κλειστή: ΤΙΠΟΤΑ δεν την ανοίγει μόνο του. Δοκιμάστηκε να ανοίγει μόνη της σε κάθε
  //     νέα εντολή adb και ο Jim το έκοψε την ίδια νύχτα (7/10): «κράτα το συνεχώς έτσι, hide το
  //     log· αν θέλω το ανοίγει ο user, εσύ δεν ασχολείσαι όταν εκτελείς κάτι να το ανοίγεις».
  //     Ένα ντοκ που πετάγεται μόνο του είναι η σελίδα που αναπηδά κάτω από τα χέρια σου·
  //   · ανοίγει και κλείνει ΜΟΝΟ με το πάτημα του χρήστη, και μένει όπως το άφησε.
  //
  // Στην ΤΗΛΕΟΡΑΣΗ και στο ΚΙΝΗΤΟ η κλειστή μπάρα ήταν ήδη έτσι (150px γίνονται ~15 πραγματικά
  // pixel σε κλίμακα TV: αδιάβαστα από τον καναπέ, και έτρωγαν το τελευταίο στοιχείο του μενού).
  // Εκεί αλλάζει μόνο το ότι ανοίγει πλέον μόνη της στην εντολή.
  import type { ReportEntry } from '@tvlm/core';
  import { getSession } from '../context.js';
  const S = getSession();

  function text(e: ReportEntry): string {
    let s = e.text;
    if (e.kind === 'cmd') {
      if (!s.startsWith('$')) s = s.startsWith('install -r') ? `$ adb ${s}` : `$ adb shell ${s}`;
      s = s.replace(/(--es pin )\S+/, '$1****');
    } else if ((e.kind === 'err' || e.kind === 'warn') && S.i18n.has(s)) s = S.t(s);
    return s;
  }
  // Η ΤΕΛΕΥΤΑΙΑ γραμμή, όχι η πρώτη: οι εγγραφές μπαίνουν στο τέλος (`entries = [...entries, e]`) και
  // η λίστα τις δείχνει ανάποδα με column-reverse. Το `[0]` έδειχνε την ΠΑΛΑΙΟΤΕΡΗ — στην τηλεόραση
  // περνούσε απαρατήρητο, στον υπολογιστή η κλειστή μπάρα θα το είχε μόνιμα μπροστά.
  const last = $derived(S.consoleLines[S.consoleLines.length - 1]);
  /**
   * ΣΧΕΔΙΑΖΟΥΜΕ ΤΙΣ ΤΕΛΕΥΤΑΙΕΣ, ΟΧΙ ΟΛΕΣ. Ένα `dumpsys device_policy` είναι μόνο του εκατοντάδες
   * γραμμές· μετά από δέκα λεπτά δουλειάς η αναφορά κρατά χιλιάδες, και ΚΑΘΕ μία γινόταν κόμβος
   * στη σελίδα. Στο κινητό αυτό είναι σκέτη πίεση μνήμης στο WebView για κείμενο που κανείς δεν
   * κυλά τόσο πίσω. Η ΑΝΑΦΟΡΑ μένει πλήρης (`S.consoleLines`, report.ts) — μόνο η ζωγραφική κόβεται.
   */
  const SHOWN = 400;
  const visible = $derived(S.consoleLines.length > SHOWN ? S.consoleLines.slice(-SHOWN) : S.consoleLines);
  /** Η τηλεόραση και το κινητό έχουν δική τους, μεγαλύτερη μπάρα: όλη η γραμμή είναι το κουμπί. */
  const compact = $derived(S.tv || S.phone);
  const open = $derived(S.consoleOpen);

  let box: HTMLDivElement | undefined = $state();
  $effect(() => {
    void S.consoleLines.length;
    if (box) box.scrollTop = 0; // column-reverse: 0 = the bottom
  });
</script>

<div class="dock" class:compact class:tv={S.tv} class:open>
  {#if compact}
    <!-- the whole bar is the control here: one D-pad press (or one tap) opens or closes the log -->
    <button type="button" class="bar as-button" data-nav onclick={() => S.toggleConsole()}>
      <span class="eyebrow" style="font-size:11px">{S.t('console')}</span>
      {#if open}
        <span class="mono dim">adb -s {S.devAddr}</span>
      {:else if last}
        <span class="mono peek {last.kind}">{text(last)}</span>
      {/if}
      <div style="flex:1"></div>
      <span class="toggle">{S.t(open ? 'c_hide' : 'c_show')}</span>
    </button>
  {:else}
    <div class="bar">
      <span class="eyebrow" style="font-size:11px">{S.t('console')}</span>
      {#if open}
        <span class="mono dim" style="font-size:11px">adb -s {S.devAddr}</span>
      {:else if last}
        <!-- κλειστή, αλλά όχι βουβή: η τελευταία γραμμή μένει ορατή, όπως στην τηλεόραση -->
        <span class="mono peek {last.kind}">{text(last)}</span>
      {/if}
      <div style="flex:1"></div>
      {#if open}
        <button type="button" class="clear" onclick={() => S.clearConsole()}>{S.t('clear')}</button>
      {/if}
      <button type="button" class="clear strong" aria-expanded={open} onclick={() => S.toggleConsole()}>{S.t(open ? 'c_hide' : 'c_show')}</button>
    </div>
  {/if}

  {#if open}
    <div class="lines" bind:this={box}>
      <div class="inner">
        {#each visible as e (e.id)}
          <div class="line {e.kind}">{text(e)}</div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  /* κλειστή = μόνο η μπάρα· ανοιχτή = η μπάρα και 150px ξύλου */
  .dock { flex: none; height: 38px; background: rgba(0,0,0,.45); border-top: 1px solid rgba(255,255,255,.1); display: flex; flex-direction: column; }
  .dock.open { height: 150px; }
  .bar { display: flex; align-items: center; gap: 12px; padding: 8px 20px; border-bottom: 1px solid rgba(255,255,255,.06); }
  .dock:not(.open) .bar { border-bottom: none; }
  .clear { background: none; border: none; color: rgba(255,255,255,.5); font-size: 12px; }
  .clear:hover { color: #fff; }
  .clear.strong { color: var(--wiz-gold-light); font-weight: 600; }
  .lines { flex: 1; overflow: auto; padding: 8px 20px; font: 400 12px/1.6 var(--font-mono); display: flex; flex-direction: column-reverse; }
  .inner { display: flex; flex-direction: column; }
  .line { white-space: pre-wrap; word-break: break-all; color: rgba(255,255,255,.5); }
  .line.cmd { color: rgba(255,255,255,.85); }
  .line.ok { color: var(--success); }
  .line.warn { color: var(--warning); }
  .line.err { color: var(--danger-alt); }

  /* television and phone */
  .dock.compact { height: 52px; }
  .dock.compact.open { height: 320px; }
  .as-button { width: 100%; background: none; border: none; color: inherit; text-align: left; height: 52px; flex: none; }
  .as-button:hover { background: rgba(255,255,255,.05); }
  .peek { font-size: 14px; color: rgba(255,255,255,.65); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 62%; }
  .dock:not(.compact) .peek { font-size: 11.5px; max-width: 70%; }
  .peek.ok { color: var(--success); }
  .peek.warn { color: var(--warning); }
  .peek.err { color: var(--danger-alt); }
  .toggle { font-size: 13px; font-weight: 600; color: var(--wiz-gold-light); white-space: nowrap; }
  .dock.tv .mono.dim { font-size: 13px; }
  .dock.tv .lines { font-size: 17px; line-height: 1.55; padding: 10px 20px 14px; }
</style>
