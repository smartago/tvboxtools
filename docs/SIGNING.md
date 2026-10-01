# Signing — one key, every variant (the Smartago rule)

Copied from how PLUI / TVS / DWTV / REMAP already work, so that a phone that has any build of this
app installed accepts any other build of it, and only `versionCode` decides the direction.

| | value |
|---|---|
| keystore | `keystore/smartago-secret.jks`, alias `smartago-release` — the same file as the Capacitor apps in `getnowappstore/capacitor/*/android/keystore/` and as Premium-Launcher-UI-Kotlin |
| debug builds | signed with the SAME key (the `debug` signingConfig points at the release key) |
| release builds | same key |
| Google Play | AAB signed with this key. Our key goes to Play through PEPK (as for HOTELTV), so the Play install and the sideload install carry the same certificate |
| sideload | APK signed with this key, `versionCode = googlePlay base + 1000`, so it is always "newer" than the Play build of the same release and a Play user can update by sideloading |
| minify / R8 | OFF in every build type (Jim's rule: release-only reflection breakage is not worth the size) |
| output name | always the bare `<applicationId>.apk` / `.aab`; the variant is the folder, never the filename |

TWO brands, two applicationIds, two version lines. Each is bumped on its own release, never "to stay
in sync". (An earlier version of this table listed three brands with invented package names — they
never existed; `tv.launcher.manager` is the Kotlin NAMESPACE, shared by both brands, not an
applicationId. Corrected 22/9/2026 against `app/build.gradle`, which is the only source of truth.)

| brand | applicationId | googlePlay | sideload |
|---|---|---|---|
| launcher (TV Box Tools) | `com.tv.launcher.manager.adb.tvboxtools` | base | base + 1000 |

The applicationId was `com.launcher.manager.tvboxtools` until 27/9/2026, before any Play upload. Jim added `tv` as a word of its own ("tvboxtools" does not read as tv): the package name is a small search signal on Play and the only moment it can change is before the first upload. Everything named after the id followed — the APK on /dl/, the desktop appId, the Linux binary.
| kiosk (HotelTV) | `com.tvboxtools.hospitality.kiosk.bnb.hoteltv` | base | base + 1000 |

Measured on the builds of 22/9/2026 — all four APKs (debug and release, both brands) carry
certificate SHA-256 `79e9:03…:3c73`, the same file as `Premium-Launcher-UI-Kotlin/keystore`
(byte-identical, md5 `bf8829e31ac972645ad5136cdb8de789`). That identity is the point: on Android 8+
the SSAID (`ANDROID_ID`) is per app-signing-key, so this tool reports the SAME device id as PLUI and
every other Smartago app on the same box.

## The two editions, and what actually differs

`store` is a real flavour dimension, not a label. Beyond `versionCode`:

| | googlePlay | sideload |
|---|---|---|
| versionCode | base | base + 1000 |
| downloads an APK from our site | **never** | yes (manifest → sha256 → `adb install`) |
| automatic run | no "Install all apps" row | full run |
| workspace | no Install page | Install page |
| launcher picker | every row opens ITS Google Play page on the TV | ours is fetched and installed; third parties still go to Play |

The switch is `BuildConfig.FLAVOR_store == "googlePlay" || installerOf() == "com.android.vending"`
(AdbSocketPlugin → `playBuild` → `Session.canDirectInstall`), so a SIDELOAD apk that Play later
distributes behaves as the Play edition too, and the gate fails closed when the device cannot answer.
To see that edition without building it: `?platform=android&play=1` on the dev server.

The `.aab` name needed its own fix (22/9): AGP does not expose the bundle's filename the way it does
the apk's, so gradle wrote `app-launcher-googlePlay-release.aab`. A `doLast` on every `bundle*Release`
task now copies it to `<applicationId>.aab` beside it (PLUI's pattern, newest file — never the first,
or a stale leftover ships for ever).

Where the credentials live: `keystore/signing.properties` (gitignored). The gradle file loads it and
falls back to the default debug key when it is absent.

Desktop (Windows Authenticode, macOS notarization) is Jim's own certificate ("not an issue", plan
section Ζ8). electron-builder reads it from the environment (`CSC_LINK` / `CSC_KEY_PASSWORD`);
nothing lives in the repo.

## The key never enters git — two locks

1. `.gitignore` refuses `keystore/*.jks` and `keystore/signing.properties`.
2. `.githooks/pre-commit` refuses any commit that carries a key by NAME (`*.jks`, `*.p12`,
   `*.pem`, `signing.properties`, `.env`, …) or by CONTENT (`storePassword=`, `keyPassword=`,
   `BEGIN PRIVATE KEY`). Once per clone: `git config core.hooksPath .githooks`.

Checked on 23/9/2026 before the repo goes public: no key, no `signing.properties`, no password
string has ever been in any commit of this repository (`git log --all --name-only` and a blob
scan of every revision). The one key that signs both the Play and the sideload build of our
launcher lives in Dropbox `KEYS/`, and nowhere else.
