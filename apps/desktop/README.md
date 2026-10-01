# @tvlm/desktop — Electron shell

The web bundle (`apps/web/dist/<brand>`) in a 1280×820 Chromium window; the Node main process holds the
real ADB transport (`@tvlm/adb/node`: USB via the `usb` module, TCP + Android 11 wireless via our socket
framing, mDNS + subnet discovery, a running Google adb server as fallback). The renderer talks to it
through `window.tvlm` (preload, `contextBridge`) — the contract is `src/ipc.ts`, the renderer-side
`AdbTransport` is `packages/adb/src/electron.ts`.

```
src/main/index.ts     Electron main (ESM): window, tvlm:// protocol for the bundle, IPC handlers, transport
src/preload.ts        window.tvlm = TvlmApi (bundled to CJS so the renderer stays sandboxed)
src/ipc.ts            channel names + DTOs, imported by main + preload (values) and packages/adb (types)
build.mjs             esbuild → dist/main/index.js, dist/main/preload.cjs, dist/main/brand.json
electron-builder.config.mjs   per brand: productName/appId/icon from brands/<brand>.json
```

## Dev run

```bash
pnpm --filter @tvlm/web build:launcher        # the bundle the window loads
pnpm --filter @tvlm/desktop start              # = build:main (TVLM_BRAND, default launcher) + electron .
TVLM_DEV_URL=http://localhost:5173 pnpm --filter @tvlm/desktop start   # renderer from the Vite dev server
pnpm --filter @tvlm/desktop check              # tsc --noEmit
```

The window loads `tvlm://app/index.html?brand=<brand>` served from `apps/web/dist/<brand>` (packaged:
`<resources>/web`), so absolute `/assets/…` paths work whatever Vite `base` is.

## Installers (one per brand)

```bash
pnpm --filter @tvlm/desktop dist:launcher      # release/launcher/ "TV Launcher Manager Setup x.y.z.exe"
```

Targets: Windows NSIS, macOS DMG, Linux AppImage (`--mac`, `--linux` on the matching host). The PLUI SVG
icon is rasterized once into `build/<brand>-icon.png` with the workspace's sharp. Signing: only from the
environment (`CSC_LINK`, `CSC_KEY_PASSWORD`; macOS notarization via `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/
`APPLE_TEAM_ID`) — unsigned builds show "unknown publisher" (plan §Ζ.6).

## USB on Windows

The `usb` module (node-usb-rs, prebuilt N-API binaries) needs a WinUSB driver on the box's ADB interface
(Zadig, or the vendor's driver). When it cannot claim the device the app falls back to a running Google
adb server (127.0.0.1:5037) if there is one; `window.tvlm.usbHint()` carries the reason for the UI.
