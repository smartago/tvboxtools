# apps/android — the phone app (Capacitor 8 + Kotlin `AdbSocket`)

The wizard as an Android app: a phone or tablet on the same Wi-Fi as the box. The web bundle
(`apps/web/dist/<brand>`) ships inside the APK; Tango speaks ADB in the WebView over raw sockets that
the one native plugin opens. Two brands × two stores = four gradle variants, one signing key.

| brand | applicationId | app name | web bundle |
|---|---|---|---|
| `launcher` | `com.tv.launcher.manager.tvboxtools` | TV Launcher Manager | `apps/web/dist/launcher` |

## Build environment (this machine)

```
JAVA_HOME        C:\Users\User\.gradle\jdks\jetbrains_s_r_o_-21-amd64-windows.2   (JDK 21 — NOT the
                 Android Studio JBR, that one is Java 25 and breaks Gradle)
ANDROID_HOME     C:\Users\User\AppData\Local\Android\Sdk        (= ANDROID_SDK_ROOT)
```

Gradle 8.14.3 (wrapper), AGP 8.13.0, Kotlin 2.3.21, minSdk 24, targetSdk 36, Java 21
(`capacitor.build.gradle` sets it). compileSdk: the APP compiles against `android-37.0` (Kadb's AAR
declares minCompileSdk=37; AGP 8.13 accepts it via `android.suppressUnsupportedCompileSdk` in
`gradle.properties` and auto-installed the platform into `Sdk/platforms/android-37.0` on the first
build — no Android Studio needed), the Capacitor library modules keep `variables.gradle`'s 36.
`keystore/signing.properties` + `keystore/smartago-secret.jks` must exist at the repo root (see
`keystore/README.md`); without them gradle warns and signs with its own debug key, and such an APK
cannot install over a Play/sideload build.

## Build

1. Web bundle + sync (per brand — `TVLM_BRAND` picks appId / name / webDir in `capacitor.config.ts`):

   ```
   pnpm --filter @tvlm/android sync:launcher     # builds apps/web for launcher, then cap sync
   ```

   `cap sync` copies the bundle into `android/app/src/main/assets/public` and writes
   `capacitor.config.json` there (both gitignored). The assets dir holds ONE brand at a time: sync the
   brand you are about to build.

2. Gradle, in `apps/android/android` (PowerShell):

   ```
   $env:JAVA_HOME='C:\Users\User\.gradle\jdks\jetbrains_s_r_o_-21-amd64-windows.2'
   $env:ANDROID_HOME='C:\Users\User\AppData\Local\Android\Sdk'; $env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
   .\gradlew assembleHoteltvSideloadDebug        # phone build for testing
   .\gradlew assembleHoteltvSideloadRelease      # the /dl/ sideload APK
   .\gradlew bundleHoteltvGooglePlayRelease      # the Play AAB
   ```

   Task name = `assemble|bundle` + `Plui|Hoteltv` + `GooglePlay|Sideload` + `Debug|Release`.

3. Where it lands — the file is named after the PACKAGE, the variant is the folder (`docs/SIGNING.md`):

   ```
   android/app/build/outputs/apk/hoteltvSideload/debug/hotel.tv.launcher.manager.apk
   android/app/build/outputs/apk/pluiGooglePlay/debug/tv.launcher.manager.apk
   ```

   (The AAB keeps gradle's name; rename to `<applicationId>.aab` when uploading, as PLUI does.)

## Versions, signing, flavours — where they live

- `android/app/build.gradle`, map `brandVersions` at the top: ONE line per brand (`code` = the
  googlePlay base, `name` set by hand at release). Sideload = base + 1000, applied per variant in the
  `androidComponents` block. Bump the brand you release, never the other one.
- Same file, `signingConfigs`: `release` from `keystore/signing.properties`; the `debug` build type
  points at the SAME config. Certificate SHA-256 must be
  `79:E9:03:03:9E:6A:43:82:25:C2:D1:E3:C2:31:E3:6C:08:C3:99:9D:09:75:7E:A0:F1:30:E7:63:06:B9:3C:73` —
  check with `apksigner verify --print-certs <apk>`.
- `minifyEnabled false` everywhere, no shrinkResources.
- `namespace` stays `tv.launcher.manager` for both brands (Kotlin sources, R class); the brand only
  changes applicationId, `src/<brand>/res/` and the version line.
- `src/<brand>/res/values/strings.xml` — `app_name`, `title_activity_main`, `package_name`,
  `custom_url_scheme`. `src/main/res` has NO strings.xml and NO launcher icons on purpose.
- Icons: `pnpm --filter @tvlm/android icons` regenerates `src/<brand>/res/mipmap-*` (legacy, round,
  adaptive foreground + `mipmap-anydpi-v26`) from `brands/assets/tvboxtools-icon-512.png` and
  `brands/assets/hoteltv-icon-512.png` (rasterised at 1024 with sharp), background = `colors.gradient[0]`
  of `brands/<id>.json`.

## The native plugin — `AdbSocket`

`android/app/src/main/java/tv/launcher/manager/`:

| file | what |
|---|---|
| `AdbSocketPlugin.kt` | the Capacitor plugin: `connect`, `startTls`, `write`, `read`, `close`, `pair`, `identity`, `discover` |
| `AdbIdentity.kt` | the phone's persistent RSA key + self-signed certificate (Kadb's `KadbCert`, stored in `files/adb/adbkey.pem`), the TLS client `SSLContext` |
| `Discovery.kt` | /24 TCP scan on :5555 + mDNS (`_adb-tls-connect`, `_adb-tls-pairing`, `_adb`) with `NsdManager` |
| `MainActivity.kt` | registers the plugin |

JS half: `packages/adb/src/capacitor.ts` (`CapacitorTransport`, `kind: 'capacitor'`, supports
`tcp` + `wireless`). It runs the CNXN / AUTH / STLS handshake itself, then hands the socket to
Tango's `AdbDaemonTransport`; shell / install / screencap / reboot are Tango.

Read model is PULL: `read({id, max, timeoutMs})` blocks on a native thread until data, EOF or
timeout (`{data:'', eof:false}` → JS asks again). Writes are serialised per socket. Nothing runs on
Capacitor's plugin thread or the main thread.

Wireless debugging (Android 11+) is STARTTLS: `connect` is always plain TCP, the JS side sends CNXN,
the daemon answers STLS, JS replies STLS and calls `startTls({id})`, which wraps the same socket in
TLS 1.3 with our client certificate. The TV accepts only a certificate whose public key it learned
at pairing — `pair({host, port, code})` (Kadb, SPAKE2) with the pairing port + 6-digit code from
the TV's dialog. `discover` reports `_adb-tls-pairing` announcements (`CapacitorTransport.pairingHosts`
/ `discoverPairing()`) so the UI can pre-fill that address.

Two keys, by design: the TLS/pairing identity lives natively (Kadb), the classic :5555 "Allow"
path uses Tango's WebCrypto key in the WebView (`AdbWebCredentialStore`). A TV may list the phone
twice. Harmless.

Dependencies of the plugin (all Apache-2.0 / MIT): `com.flyfishxu:kadb:2.1.4` (Maven Central; its
SPAKE2 comes from JitPack, hence the extra repository in `android/build.gradle`),
`kotlinx-coroutines-core`, `bcpkix-jdk18on` (PEM parsing; Kadb ships BouncyCastle anyway).

## Permissions on the phone (DESIGN_NOTES §16)

`INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `CHANGE_WIFI_MULTICAST_STATE` (mDNS),
`CAMERA` (QR on the TV's pairing screen; `<uses-feature camera required=false>`). Nothing else.
