import { describe, expect, it } from 'vitest';
import { androidName, installFailure } from './installfail.js';

// ΤΑ ΑΛΗΘΙΝΑ ΜΗΝΥΜΑΤΑ ΤΟΥ ΚΟΥΤΙΟΥ ΤΟΥ JIM (MX10.00.d4, Android 7.1.2, 3/10/2026). Δοκίμασε το
// Monet (minSdk 26) και το at4k (minSdk 27) σε API 25 και πήρε δύο φορές τον ίδιο ωμό κωδικό.
describe('γιατί δεν μπήκε το APK', () => {
  const monet =
    'Failure [INSTALL_FAILED_OLDER_SDK: Failed parse during installPackageLI: ' +
    '/data/app/vmdl337047054.tmp/base.apk (at Binary XML file line #7): ' +
    'Requires newer sdk version #26 (current version is #25)]';

  it('λέει ΠΟΙΟ Android θέλει και ΠΟΙΟ έχει το κουτί', () => {
    expect(installFailure(monet)).toEqual({
      key: 'if_olderSdk',
      params: { needs: 'Android 8.0 (API 26)', has: 'Android 7.1 (API 25)' },
    });
  });

  it('και με το at4k (#27)', () => {
    const f = installFailure('Requires newer sdk version #27 (current version is #25)');
    expect(f?.params?.needs).toBe('Android 8.1 (API 27)');
  });

  it('τα υπόλοιπα που συναντάμε', () => {
    expect(installFailure('Failure [INSTALL_FAILED_VERSION_DOWNGRADE]')?.key).toBe('if_downgrade');
    expect(installFailure('Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]')?.key).toBe('if_signature');
    expect(installFailure('Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]')?.key).toBe('if_space');
    expect(installFailure('Failure [INSTALL_FAILED_NO_MATCHING_ABIS]')?.key).toBe('if_abi');
    expect(installFailure('Failure [INSTALL_PARSE_FAILED_NOT_APK]')?.key).toBe('if_broken');
  });

  // Μια λάθος εξήγηση είναι χειρότερη από καμία: ό,τι δεν αναγνωρίζουμε μένει ωμό.
  it('άγνωστο σφάλμα → null, και ο host δείχνει μόνο την ωμή γραμμή', () => {
    expect(installFailure('Failure [SOMETHING_WE_HAVE_NEVER_SEEN]')).toBe(null);
    expect(installFailure('')).toBe(null);
  });

  it('άγνωστο API δεν βαφτίζεται έκδοση Android', () => {
    expect(androidName(26)).toBe('Android 8.0 (API 26)');
    expect(androidName(99)).toBe('API 99');
  });
});
