// ΓΙΑΤΙ ΔΕΝ ΜΠΗΚΕ ΤΟ APK, ΣΤΑ ΕΛΛΗΝΙΚΑ ΤΟΥ ΑΝΘΡΩΠΟΥ (Jim, 3/10/2026).
//
// Ο Jim δοκίμασε το Monet σε Android 7.1.2 και πήρε:
//   Failure [INSTALL_FAILED_OLDER_SDK: Failed parse during installPackageLI: … Requires newer sdk
//   version #26 (current version is #25)]
// Σωστό και ακριβές — και εντελώς αδιάβαστο για όποιον δεν ξέρει ότι «#26» σημαίνει Android 8.
// Η ωμή γραμμή ΜΕΝΕΙ (στην κονσόλα και στην αναφορά)· από πάνω μπαίνει η πρόταση που λέει τι
// συνέβη και τι μπορεί να γίνει.
//
// Το core δεν μεταφράζει: επιστρέφει κλειδί + παραμέτρους, και ο host τα περνά από το i18n του.

/** Το νούμερο του API σε αριθμό έκδοσης Android, όπως τον ξέρει ο κόσμος. */
const ANDROID_OF_SDK: Record<number, string> = {
  21: '5.0', 22: '5.1', 23: '6.0', 24: '7.0', 25: '7.1', 26: '8.0', 27: '8.1', 28: '9',
  29: '10', 30: '11', 31: '12', 32: '12L', 33: '13', 34: '14', 35: '15', 36: '16',
};

/** «API 26» → «Android 8.0 (API 26)». Άγνωστο API → μόνο ο αριθμός, χωρίς ψέματα. */
export function androidName(sdk: number): string {
  const v = ANDROID_OF_SDK[sdk];
  return v ? `Android ${v} (API ${sdk})` : `API ${sdk}`;
}

export interface InstallFailure {
  /** Κλειδί i18n για την εξήγηση. */
  key: string;
  /** Παράμετροι του κλειδιού (ήδη σε αναγνώσιμη μορφή). */
  params?: Record<string, string>;
}

/**
 * Διαβάζει την απάντηση του `pm install` και βγάζει την αιτία. `null` = δεν την αναγνωρίσαμε, και
 * τότε ο host δείχνει ΜΟΝΟ την ωμή γραμμή — καλύτερα τίποτα παρά λάθος εξήγηση.
 */
export function installFailure(output: string): InstallFailure | null {
  const o = output || '';

  // Θέλει νεότερο Android. Το μήνυμα κουβαλά και τα δύο νούμερα· τα διαβάζουμε και τα δύο.
  const older = /Requires newer sdk version #(\d+)[^#]*#(\d+)/.exec(o);
  if (older || /INSTALL_FAILED_OLDER_SDK/.test(o)) {
    if (older) {
      return { key: 'if_olderSdk', params: { needs: androidName(Number(older[1])), has: androidName(Number(older[2])) } };
    }
    return { key: 'if_olderSdkPlain' };
  }
  // Το κουτί έχει ΝΕΟΤΕΡΗ έκδοση της ίδιας εφαρμογής.
  if (/INSTALL_FAILED_VERSION_DOWNGRADE/.test(o)) return { key: 'if_downgrade' };
  // Ίδιο πακέτο, ΑΛΛΗ υπογραφή: πρέπει να φύγει το παλιό πρώτα.
  if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match|INCONSISTENT_CERTIFICATES/i.test(o)) {
    return { key: 'if_signature' };
  }
  if (/INSTALL_FAILED_INSUFFICIENT_STORAGE/.test(o)) return { key: 'if_space' };
  // Χτισμένο για άλλον επεξεργαστή.
  if (/INSTALL_FAILED_NO_MATCHING_ABIS/.test(o)) return { key: 'if_abi' };
  if (/INSTALL_PARSE_FAILED|INSTALL_FAILED_INVALID_APK/.test(o)) return { key: 'if_broken' };
  // Η τηλεόραση δεν δέχεται άγνωστες πηγές (σπάνιο μέσω adb, αλλά υπάρχει σε κλειδωμένα box).
  if (/INSTALL_FAILED_VERIFICATION_FAILURE|verification/i.test(o)) return { key: 'if_verify' };
  return null;
}
