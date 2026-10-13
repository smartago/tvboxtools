# -*- coding: utf-8 -*-
r"""Στάμπα έκδοσης σε ΟΛΟ το έργο, με το σχήμα του οικοσυστήματος — ΕΡΓΑΛΕΙΟ.

    python tools/set_version.py                      # από τη ΣΗΜΕΡΙΝΗ ημερομηνία
    python tools/set_version.py --name 1.26.09.30    # καρφωμένη ημερομηνία (π.χ. η μέρα της δουλειάς)
    python tools/set_version.py --show               # τι ισχύει τώρα, χωρίς να γράψει τίποτα

ΤΟ ΣΧΗΜΑ (κανόνας Jim, 1/10/2026 — ίδιο με REMAP `1.26.09.19`, UNI `2.26.07.28`, PLUI `2.26.07.21`):

    <major> . <yy> . <mm> . <dd>          π.χ. 1.26.10.01 = έκδοση 1, 2026, Οκτώβριος, 1η

Ο αριθμός λέει ΠΟΤΕ βγήκε. Βλέπεις «1.26.10.01» σε ένα box και ξέρεις αμέσως τι τρέχει, χωρίς να
ψάξεις πίνακα εκδόσεων — γι' αυτό το θέλει έτσι όλο το οικοσύστημα.

Ο versionCode ΔΕΝ ΓΡΑΦΕΤΑΙ ΕΔΩ ΠΙΑ (Jim, 12/10/2026: «ένας αριθμός παντού»). Είναι ο ΑΡΙΘΜΟΣ BUILD —
το πλήθος των commit, `git rev-list --count HEAD` — και τον υπολογίζει το ίδιο το build.gradle τη
στιγμή του build: Play = build, sideload = build + 1000. Έτσι το Play Console, το «Σχετικά» και το
manifest του /dl/ λένε τον ίδιο αριθμό, και κανείς δεν μπορεί να ξεχάσει να τον ανεβάσει (μέχρι
12/10 ήταν ένα 25 με το χέρι δίπλα σε build 280). Εδώ γράφεται ΜΟΝΟ το όνομα, η ημερομηνία.
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
RX = re.compile(r"(code:\s*buildNumber,\s*name:\s*')([^']+)(')")


def build_number():
    """Ο αριθμός που θα πάρει το ΕΠΟΜΕΝΟ build (ο ίδιος υπολογισμός με build.gradle και vite)."""
    import subprocess
    out = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    return int(out) if out.isdigit() else 0


def current():
    m = RX.search(io.open(GRADLE, encoding="utf-8").read())
    assert m, "δεν βρέθηκε το brandVersions (code: buildNumber, name: …) στο build.gradle"
    return m.group(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", help="π.χ. 1.26.09.30 (προεπιλογή: η σημερινή ημερομηνία)")
    ap.add_argument("--show", action="store_true")
    a = ap.parse_args()

    name0 = current()
    b = build_number()
    print("τώρα:   %s  ·  build %d  (Play %d · sideload %d, από το git)" % (name0, b, b, b + 1000))
    if a.show:
        return

    t = date.today()
    name = a.name or "%d.%02d.%02d.%02d" % (MAJOR, t.year % 100, t.month, t.day)
    assert re.fullmatch(r"\d+\.\d{2}\.\d{2}\.\d{2}", name), "το όνομα δεν έχει το σχήμα major.yy.mm.dd: " + name

    # ── build.gradle: η ΜΙΑ πηγή για το Android ──────────────────────────────────────────────
    g = io.open(GRADLE, encoding="utf-8").read()
    g2, n = RX.subn(lambda m: m.group(1) + name + m.group(3), g, count=1)
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

    # ── packages/core: η σταθερά που διαβάζει ο έλεγχος ενημέρωσης ──────────────────────────
    # ΞΕΧΝΙΟΤΑΝ (3/10/2026): έμεινε στο 0.1.0 για μήνες, και κάθε σύγκριση με το manifest θα
    # έλεγε «υπάρχει νεότερη». Μπαίνει εδώ ώστε να μην μπορεί να ξαναμείνει πίσω.
    core = os.path.join(ROOT, "packages", "core", "src", "index.ts")
    t0 = io.open(core, encoding="utf-8").read()
    was = re.search(r"TOOL_VERSION = '([^']+)'", t0).group(1)
    t1, n = re.subn(r"(TOOL_VERSION = ')[^']+(')", lambda m: m.group(1) + name + m.group(2), t0, count=1)
    assert n == 1, "δεν βρέθηκε το TOOL_VERSION στο packages/core/src/index.ts"
    io.open(core, "w", encoding="utf-8", newline="\n").write(t1)
    print("   %-46s %s → %s" % ("packages/core/src/index.ts (TOOL_VERSION)", was, name))

    # το commit της στάμπας ανεβάζει το πλήθος κατά ένα — αυτός είναι ο αριθμός του build που ακολουθεί
    print("\nτώρα:   %s  ·  μετά το commit: build %d  (Play %d · sideload %d)" % (name, b + 1, b + 1, b + 1001))
    print("ΞΑΝΑΧΤΙΣΕ: τα binaries κρατούν την παλιά έκδοση μέχρι να ξαναβγούν.")


if __name__ == "__main__":
    main()
