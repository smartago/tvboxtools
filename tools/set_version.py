# -*- coding: utf-8 -*-
r"""Στάμπα έκδοσης σε ΟΛΟ το έργο, με το σχήμα του οικοσυστήματος — ΕΡΓΑΛΕΙΟ.

    python tools/set_version.py                      # από τη ΣΗΜΕΡΙΝΗ ημερομηνία, versionCode +1
    python tools/set_version.py --name 1.26.09.30    # καρφωμένη ημερομηνία (π.χ. η μέρα της δουλειάς)
    python tools/set_version.py --code 6             # καρφωμένος κωδικός
    python tools/set_version.py --show               # τι ισχύει τώρα, χωρίς να γράψει τίποτα

ΤΟ ΣΧΗΜΑ (κανόνας Jim, 1/10/2026 — ίδιο με REMAP `1.26.09.19`, UNI `2.26.07.28`, PLUI `2.26.07.21`):

    <major> . <yy> . <mm> . <dd>          π.χ. 1.26.10.01 = έκδοση 1, 2026, Οκτώβριος, 1η

Ο αριθμός λέει ΠΟΤΕ βγήκε. Βλέπεις «1.26.10.01» σε ένα box και ξέρεις αμέσως τι τρέχει, χωρίς να
ψάξεις πίνακα εκδόσεων — γι' αυτό το θέλει έτσι όλο το οικοσύστημα.

ΚΑΙ Ο versionCode ΧΩΡΙΣΤΑ: το όνομα είναι για ανθρώπους, ο κωδικός για το Android. Ένας μόνο
αριθμός στο `brandVersions` είναι η βάση (= το Play), και το sideload παίρνει **+1000** ώστε να
είναι πάντα «νεότερο» από ό,τι δίνει το Play — αλλιώς ένα box με Play build δεν δέχεται το sideload.

ΓΙΑΤΙ ΑΝΕΒΑΙΝΕΙ ΠΑΝΤΑ: ο updater του sideload συγκρίνει versionCode. Δύο διαφορετικά build με τον
ίδιο κωδικό σημαίνει ότι κανείς δεν παίρνει το δεύτερο — σιωπηλά.
"""
import argparse, io, json, os, re, sys
from datetime import date

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GRADLE = os.path.join(ROOT, "apps", "android", "android", "app", "build.gradle")
# Το package.json ΔΕΝ είναι διακόσμηση: από εκεί παίρνει την έκδοση ο electron-builder (όνομα
# installer), το vite (`TVLM_VERSION` → οθόνη «Σχετικά» + τηλεμετρία) και το npm.
PKGS = [
    os.path.join(ROOT, "package.json"),
    os.path.join(ROOT, "apps", "web", "package.json"),
    os.path.join(ROOT, "apps", "android", "package.json"),
    os.path.join(ROOT, "apps", "cli", "package.json"),
]
# ΤΟ ELECTRON-BUILDER ΔΙΑΒΑΖΕΙ ΤΟ `version` ΩΣ SEMVER και το τέταρτο μέρος το διαλύει: το
# `1.26.10.01` βγήκε ως `TV Launcher Manager 1.26.1-0.1.exe` (μετρημένο 1/10/2026). Αυτό το ΕΝΑ
# αρχείο κρατά τη νόμιμη μορφή `1.26.<mmdd>` — ίδια πληροφορία, ίδια σειρά ταξινόμησης
# (1.26.1001 < 1.26.1002 < 1.26.1101) — και το ΟΝΟΜΑ των αρχείων παίρνει το αναγνώσιμο από το
# artifactName του config. Ό,τι βλέπει άνθρωπος μένει `1.26.10.01`.
DESKTOP_PKG = os.path.join(ROOT, "apps", "desktop", "package.json")
MAJOR = 1
RX = re.compile(r"(code:\s*)(\d+)(,\s*name:\s*')([^']+)(')")


def current():
    m = RX.search(io.open(GRADLE, encoding="utf-8").read())
    assert m, "δεν βρέθηκε το brandVersions στο build.gradle"
    return int(m.group(2)), m.group(4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", help="π.χ. 1.26.09.30 (προεπιλογή: η σημερινή ημερομηνία)")
    ap.add_argument("--code", type=int, help="προεπιλογή: ο τρέχων + 1")
    ap.add_argument("--show", action="store_true")
    a = ap.parse_args()

    code0, name0 = current()
    print("τώρα:   %s  ·  code %d  (Play %d · sideload %d)" % (name0, code0, code0, code0 + 1000))
    if a.show:
        return

    t = date.today()
    name = a.name or "%d.%02d.%02d.%02d" % (MAJOR, t.year % 100, t.month, t.day)
    code = a.code if a.code is not None else code0 + 1
    assert re.fullmatch(r"\d+\.\d{2}\.\d{2}\.\d{2}", name), "το όνομα δεν έχει το σχήμα major.yy.mm.dd: " + name
    assert code > 0, "ο κωδικός πρέπει να είναι θετικός"
    if code <= code0:
        print("ΠΡΟΣΟΧΗ: ο κωδικός %d ΔΕΝ είναι μεγαλύτερος από τον τρέχοντα %d — κανείς δεν θα πάρει "
              "την ενημέρωση." % (code, code0))

    # ── build.gradle: η ΜΙΑ πηγή για το Android ──────────────────────────────────────────────
    g = io.open(GRADLE, encoding="utf-8").read()
    g2, n = RX.subn(lambda m: m.group(1) + str(code) + m.group(3) + name + m.group(5), g, count=1)
    # ΟΧΙ «άλλαξε»: το ξαναστάμπωμα με τις ΙΔΙΕΣ τιμές είναι νόμιμο (π.χ. μετά από διόρθωση αλλού).
    assert n == 1, "δεν βρέθηκε το brandVersions στο build.gradle"
    io.open(GRADLE, "w", encoding="utf-8", newline="\n").write(g2)

    # ── package.json: το ίδιο string, για electron-builder / vite / npm ─────────────────────
    for p in PKGS:
        t0 = io.open(p, encoding="utf-8").read()
        was = json.loads(t0)["version"]
        t1, n = re.subn(r'("version":\s*")[^"]+(")', lambda m: m.group(1) + name + m.group(2), t0, count=1)
        assert n == 1, "δεν βρέθηκε πεδίο version στο " + p
        io.open(p, "w", encoding="utf-8", newline="\n").write(t1)
        print("   %-46s %s → %s" % (os.path.relpath(p, ROOT).replace("\\", "/"), was, name))

    # το desktop: ίδια ημερομηνία, μορφή που δέχεται το semver
    maj, yy, mm, dd = name.split(".")
    semver = "%s.%s.%d" % (maj, yy, int(mm) * 100 + int(dd))
    t0 = io.open(DESKTOP_PKG, encoding="utf-8").read()
    was = json.loads(t0)["version"]
    t1, n = re.subn(r'("version":\s*")[^"]+(")', lambda m: m.group(1) + semver + m.group(2), t0, count=1)
    assert n == 1, "δεν βρέθηκε πεδίο version στο desktop package.json"
    io.open(DESKTOP_PKG, "w", encoding="utf-8", newline="\n").write(t1)
    print("   %-46s %s → %s   (semver για το electron-builder)" % ("apps/desktop/package.json", was, semver))

    print("\nτώρα:   %s  ·  code %d  (Play %d · sideload %d)" % (name, code, code, code + 1000))
    print("ΞΑΝΑΧΤΙΣΕ: τα binaries κρατούν την παλιά έκδοση μέχρι να ξαναβγούν.")


if __name__ == "__main__":
    main()
