# provision-contract — what this tool and the launcher app promise each other

Two repos, one contract. This file lives in BOTH (`tv-launcher-manager/docs/` and
`Premium-Launcher-UI-Kotlin/docs/`). If one side changes, the other side's tests must break.
Source of the decisions: `TV_SETUP_DESIGN_NOTES.md` §4–§9, `HOTELTV_PROVISION_PLAN.md` v1 §1.5–1.8.

## 1. Identities (verified against `apps/plui/src/main/AndroidManifest.xml`, 2026-09-19)

| brand | applicationId | HOME component (the alias that owns `category.HOME`) |
|---|---|---|
| PLUI | `com.premium.tv.launcher.ui` | `com.premium.tv.launcher.ui/.LauncherActivity` |
| HOTELTV | `com.hotel.bnb.smart.hospitality.tv.launcher` | `com.hotel.bnb.smart.hospitality.tv.launcher/com.premium.tv.launcher.ui.LauncherActivity` |

Both brands share the Kotlin namespace `com.premium.tv.launcher.ui`, so every class name below is
`com.premium.tv.launcher.ui.<Class>` for BOTH packages. Components that matter to provisioning:

| what | class | where declared |
|---|---|---|
| accessibility HOME capture | `.HomeCaptureService` | `src/sideload/` and `src/hoteltvGooglePlay/` (NOT in PLUI Play) |
| notification listener | `.data.PluiNotificationListenerService` | main |
| device admin (kiosk / Device Owner) | `.hotel.HotelDeviceAdminReceiver` | `src/hoteltv/` only |
| boot receiver | `.boot.BootReceiver` | main |

The prototype still says `com.hotel.bnb` / `com.premium.tv.launcher` and `/.MainActivity` — those were
placeholders; the values above are the real ones.

## 2. Broadcasts the tool sends (the app implements the receivers — PLUI repo, phase "app side")

All are explicit (`-p <applicationId>`), `exported="true"`, protected by the sender check below.

| action | extras | who | effect in the app |
|---|---|---|---|
| `<applicationId>.PROVISION` | `--es profile kiosk\|open\|install-only` · `--ez skipWizard true` · `--ez keepAdb true` · `--es home persistent` (kiosk only) · (`--es lang xx` accepted, but the tool does NOT send it: the language is the host's, suggested by the app from the host's IP) · `--es adminPin nnnn` (the Admin PIN if the Admin has none; with `profile kiosk` and no `adminPin` the app sets the **default 1111** — a locked box always has a key) · `profile open` on a locked box needs `--es pin` · `--es tool <version>` (optional, additive, 26/9: the app records it as `provision.tool` on its device document next to `provision.by="tvboxtools"`, `profile`, `keepAdb`, `ok`/`error` — the admin's Installation tab reads it; the broadcast itself is already the proof it came from the tool) | both brands (PLUI: `open` only) | applies the profile; `kiosk` ⇒ `DevicePolicyManager` lock-task + `addPersistentPreferredActivity(HOME)`; `skipWizard` marks first-run done; `lang` sets the UI language |
| `<applicationId>.LINK` | `--es code XXXX-XXXX` | HOTELTV, role = owner only | links the TV to the hoteltvapp.com account (same path as typing the 8-digit code) |
| `<applicationId>.UNLOCK` | `--es pin ****` (the Admin PIN — default **1111**) | HOTELTV | lifts every restriction and the pinned HOME, then `clearDeviceOwnerApp()`; the tool's Kiosk screen has the button |
| `<applicationId>.MAINTENANCE` | `--es pin ****` · `--ei minutes 15` | HOTELTV kiosk | `stopLockTask()` for N minutes, then back to kiosk automatically |

Sender check: the receiver accepts only when the caller is `shell` (uid 2000, i.e. adb) or the app
itself. No other app may send these.

The tool NEVER runs `dpm` restrictions itself. Kiosk logic lives only in the app; the tool's kiosk
step is exactly: `dpm set-device-owner <applicationId>/com.premium.tv.launcher.ui.hotel.HotelDeviceAdminReceiver`
followed by the `PROVISION` broadcast with `profile kiosk`.

## 3. Silent permission grants (adb shell, per brand config)

```
appops set <pkg> SYSTEM_ALERT_WINDOW allow
appops set <pkg> GET_USAGE_STATS allow
cmd notification allow_listener <pkg>/com.premium.tv.launcher.ui.data.PluiNotificationListenerService
pm grant <pkg> android.permission.READ_TV_LISTINGS
settings put secure enabled_accessibility_services <pkg>/com.premium.tv.launcher.ui.HomeCaptureService   # open profile only
settings put secure accessibility_enabled 1                                                              # with the line above
```

Never `am force-stop <pkg>` after the accessibility grant — the grant is lost (memory
`plui-accessibility-lost-on-force-stop`).

## 4. Default launcher — the three methods, in the order the brand config lists them

1. `cmd package set-home-activity <HOME component>` then verify with
   `cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME` (the answer must be our component).
2. Device Owner (kiosk only): the app does `addPersistentPreferredActivity(HOME)` on `PROVISION … --es home persistent`.
3. `pm disable-user --user 0 <stock launcher>` (PLUI default, HOTELTV fallback only). Undo: `pm enable <stock>`.
   Stock packages: Google TV `com.google.android.apps.tv.launcherx` · Android TV / Xiaomi
   `com.google.android.tvlauncher` · Fire TV `com.amazon.tv.launcher` (PLUI only; Fire TV is blocked for HOTELTV).

## 5. `manifest.json` (served by each site at `/dl/manifest.json`)

```json
{
  "schema": 1,
  "tool": { "version": "0.1.0", "minVersion": "0.1.0",
            "downloads": { "win": "…/TV Launcher Manager Setup 0.2.2.exe", "mac": "…/TV Launcher Manager 0.2.2.dmg",
                           "mac-intel": "…/TV Launcher Manager 0.2.2-x64.dmg", "linux": "…/TV Launcher Manager 0.2.2.tar.gz",
                           "android": "…/com.tv.launcher.manager.adb.tvboxtools.apk" },
            "latest":    { "win": "…/tv-launcher-manager-setup.exe", "mac": "…/tv-launcher-manager-mac-arm64.dmg",
                           "mac-intel": "…/tv-launcher-manager-mac-intel.dmg", "linux": "…/tv-launcher-manager-linux.tar.gz",
                           "android": "…/com.tv.launcher.manager.adb.tvboxtools.apk" },
            "sha256": { "win": "…", "mac": "…", "mac-intel": "…", "linux": "…", "android": "…" } },
  "apps": [
    { "pkg": "com.hotel.bnb.smart.hospitality.tv.launcher", "name": "HOTELTV", "url": "…/com.hotel.bnb.smart.hospitality.tv.launcher.apk",
      "sha256": "…", "versionCode": 1002, "required": true, "role": ["owner", "reseller"] },
    { "pkg": "com.tv.setup.suite", "name": "TVS — TV Setup Suite", "url": "…", "sha256": "…", "versionCode": 1069, "required": true, "role": ["owner", "reseller"] },
    { "pkg": "io.github.jqssun.airplay", "name": "AirPlay receiver", "url": "…", "sha256": "…", "versionCode": 31, "required": true, "role": ["owner", "reseller"], "group": "airplay", "license": "GPL-3.0" },
    { "pkg": "com.github.mazer666.phairplay", "name": "PhairPlay (beta)", "url": "…", "sha256": "…", "versionCode": 1, "required": false, "role": [], "group": "airplay", "license": "Apache-2.0" }
  ]
}
```

Rules: `downloads` is the file OF THAT VERSION and forms an unchanging pair with `sha256` — an
update checks that pair. `latest` is the SAME files under names with no version in them, which
is what the site's buttons point at and what we give to anyone linking to us from elsewhere: the
URL never changes, the bytes behind it are always the newest (they are hard links on the server,
re-made on every publish). macOS ships TWO files — `mac` is Apple Silicon, `mac-intel` is x86_64.
The tool verifies SHA-256 before `install`; exactly ONE app per `group` is installed (the
`required` one unless the user picked another); APKs are streamed straight into `adb install`,
never stored or executed on the phone (Play policy, DESIGN_NOTES §16); the list holds only our own
apps and open-source receivers — never Netflix/YouTube/Prime.

## 6. Command gate (the same gate for UI, CLI and MCP)

- **auto** (runs without asking): `getprop`, `dumpsys`, `pm list`, `pm path`, `settings get`, `am start`,
  `input keyevent`, `cmd package resolve-activity`, `df`, `screencap`, `ls`, `echo`, `whoami`, `id`.
- **confirm** (shown in the UI, a human presses "Run"): everything else, including every step in §3–§4,
  `install`, `dpm set-device-owner`, `am broadcast`, `settings put`, `pm disable-user`, `reboot`.
- **blocked** (no exception, not even with confirmation): `reboot bootloader`, `reboot recovery`,
  `pm uninstall` of a system package, `wipe`, `dpm remove-active-admin`, `dpm clear-*`, `settings put global adb_enabled 0`
  except as the LAST step of Handover, `rm -rf`, `dd`, `fastboot`, `su`, `factory`.

Every command, its output and the gate verdict go into the session report.
