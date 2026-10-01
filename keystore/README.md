# keystore/ — the signing key (the files here are gitignored, never commit them)

Same model as every Smartago app (Premium-Launcher-UI-Kotlin is the source of truth):

- `smartago-secret.jks` — ONE key for everything: debug **and** release, Google Play **and** sideload,
  both brands. Certificate SHA-256
  `79:E9:03:03:9E:6A:43:82:25:C2:D1:E3:C2:31:E3:6C:08:C3:99:9D:09:75:7E:A0:F1:30:E7:63:06:B9:3C:73`.
- `signing.properties` — `storeFile`, `storePassword`, `keyAlias`, `keyPassword`. Gradle
  (`apps/android/android/app/build.gradle`) reads it. If the file is missing, builds fall back to the
  default Android debug key: fine for an emulator, but such an APK can NOT install over a Play or
  sideload build.

**Where to get them:** they are not in any repository and never will be. Ask the maintainer; the
location is recorded outside this codebase, with the rest of the credentials.

Without them a build still succeeds — it falls back to the default Android debug key, which is fine
for an emulator and useless for anything else. Why one key: `docs/SIGNING.md`.
