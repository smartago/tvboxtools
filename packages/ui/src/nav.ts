// Ο ΚΑΝΟΝΑΣ ΤΟΥ PLUI, ΓΙΑ ΤΟ WEB (Jim, 9/10/2026, μετά το Mi Box: «όπως το PLUI — ένα κέλυφος σε κάθε
// ring που ξέρει τα OK/BACK/βέλη· ΑΝΑ ΕΣΤΙΑΣΜΕΝΟ, όχι ανά οθόνη: όταν βρίσκεται κάπου, γνωρίζει εκ
// των προτέρων πού πάει»). Ίδιο σχήμα με το `Modifier.navKeys(left/right/up/down/backTo)` του
// Kotlin (ui/nav/FocusNav.kt, ui-navigation-rules §16) και με τα `data-*-focus-id` του REMAP/UNI:
//
//   data-nav-id="w6-help"                 — το όνομα του στοιχείου (προαιρετικό)
//   data-nav-up / -down / -left / -right  — πού πάει το ring: αλυσίδα «a,b,c», ο πρώτος ΟΡΑΤΟΣ
//                                           κερδίζει· «.» (ή το δικό του id) = ΤΟΙΧΟΣ, το πλήκτρο
//                                           τρώγεται και το ring μένει
//   data-nav-back="task-hero"            — BACK/Escape: ring εκεί, το πλήκτρο καταναλώνεται
//   OK                                    — το onclick του ίδιου του στοιχείου (τίποτα να δηλωθεί)
//
// Κατεύθυνση ΧΩΡΙΣ κανόνα πέφτει στη γεωμετρία του App.svelte (με κώνο) — όπως στο Compose το
// αδήλωτο βέλος πέφτει στο δικό του search. Στόχος ΔΗΛΩΜΕΝΟΣ αλλά μη ορατός τη στιγμή του πατήματος
// πέφτει κι αυτός στη γεωμετρία, και το λέει στην κονσόλα (NAV GAP), όπως ο `auditGaps` του PLUI.

export type NavDir = 'up' | 'down' | 'left' | 'right';
export const NAV_DIR: Readonly<Record<string, NavDir>> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** The `[data-nav]` control that owns the ring right now, or null when the ring is nowhere. */
export function navOwner(root: HTMLElement | null, active: Element | null): HTMLElement | null {
  if (!root || !active || active === document.body || !root.contains(active)) return null;
  return (active as HTMLElement).closest<HTMLElement>('[data-nav]');
}

/** The declared exit of `owner` for one key, or null when it has none. */
export function navRule(owner: HTMLElement | null, key: NavDir | 'back'): string | null {
  return owner?.getAttribute(`data-nav-${key}`) ?? null;
}

/**
 * One jump along a chain. True = the key is consumed (a target took the ring, or the chain came
 * home — a wall). False = nothing in the chain is attached right now; the caller falls back.
 * `list` is what the ring may sit on at this moment (visible, enabled, inside the open question).
 */
export function jump(list: HTMLElement[], chain: string, cur: HTMLElement | null): boolean {
  for (const raw of chain.split(',')) {
    const id = raw.trim();
    if (!id) continue;
    // A WALL — a rule naming the very node it is written on (or «.») simply eats the key. Walked IN
    // CHAIN ORDER, like the Kotlin `jump`: a real neighbour earlier in the chain wins, reaching
    // myself means the chain has run out of places to go.
    if (id === '.' || (cur && cur.getAttribute('data-nav-id') === id)) return true;
    const el = list.find((x) => x.getAttribute('data-nav-id') === id);
    if (el) {
      el.focus();
      return true;
    }
  }
  return false;
}

/** Put the ring on a named control after the current change has rendered (OK on a language → Continue). */
export function ringTo(id: string): void {
  queueMicrotask(() => {
    const el = [...document.querySelectorAll<HTMLElement>(`[data-nav-id="${id}"]`)].find((x) => x.offsetParent !== null && !x.matches(':disabled'));
    el?.focus();
  });
}

/** What the Kotlin `auditGaps` writes: a declared exit that was not attached when the key came. */
export function navGap(owner: HTMLElement | null, key: string, chain: string): void {
  const who = owner?.getAttribute('data-nav-id') ?? owner?.textContent?.trim().slice(0, 24) ?? '?';
  console.debug(`NAV GAP: '${who}' → ${key} → '${chain}' is not attached right now — geometry runs`);
}
