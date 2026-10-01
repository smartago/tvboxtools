# Launcher icons for the picker (W9)

The artwork of the design package's "Launcher Pick" screen, one PNG per row, square, 128×128
(resized from the 480 px originals: 675 KB of artwork became 63 KB, for a tile drawn at 42 px).

A row looks for its picture in this order, and falls back to a letter tile when none loads:

1. what the BOX itself renders (`appIcons`) — the only copy that is certainly that device's, and
   available when the box IS this television;
2. `<package>.png` — use this for **our own launchers**: `com.premium.tv.launcher.ui.png` (the
   home road) and `com.hotel.bnb.smart.hospitality.tv.launcher.png` (the hotel road);
3. `<row id>.png` — how the design package names the ones it drew: `projectivy.png`, `monet.png`,
   `at4k.png`, `ask.png` (the "Other launcher" row).

A box that reports a launcher we have no art for uses `<package>.png` too — that is why
`com.google.android.tvlauncher.png` and `ca.dstudio.atvlauncher.png` are here: ATV Launcher is not
in the list any more, but a box that has it installed still gets a row, and now an icon.

Source: the launcher icon set exported for this tool (kept outside the repository).
unpacked on 21/9). Add a file, run `pnpm --filter @tvlm/android sync:<brand>`, and it appears — no
code change.
