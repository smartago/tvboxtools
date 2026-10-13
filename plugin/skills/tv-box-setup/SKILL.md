---
name: tv-box-setup
description: Set up an Android TV, Google TV or Fire TV box over ADB with the TV Box Tools MCP tools — find the box, connect, check it, install the launcher, make it the HOME app, test across a reboot and hand over. Use when someone wants to change the launcher or home screen of a TV box, prepare boxes for customers, find out why a box is not found or not authorized, or see what is on the TV screen.
---

# Setting up a TV box with TV Box Tools

The `tvboxtools` MCP server talks ADB to the box from this computer. The person you help is usually in
front of the TV with a remote and is not a developer. Your job is to run the tools and to tell them,
in plain words, the few things only they can do on the TV.

## Before the first tool call

Ask what kind of box it is if they have not said, then tell them how to turn debugging on. They do this
once, on the TV:

- **Android TV / Google TV:** Settings › Device Preferences (or System) › About › press **Build** seven times
  until it says "You are now a developer". Then Settings › Device Preferences › Developer options › turn on
  **USB debugging**, and **Network debugging** if they will connect over Wi-Fi.
- **Android 11 or newer with "Wireless debugging":** they also open Wireless debugging › "Pair device with
  pairing code" and read you the pairing host:port and the 6-digit code (see `pair` below).
- **Fire TV:** Settings › My Fire TV › About › press the device name seven times, then Developer options ›
  **ADB debugging** on.

The computer and the TV must be on the same network. Hotel and guest Wi-Fi usually isolate devices from
each other: if nothing is found there, a phone hotspot that both join, or a USB cable, solves it.

## The run

1. **`discover`** — lists boxes on USB, by mDNS and by a scan of the local network on port 5555. Pick the
   one they mean; if several are listed, ask (name and address help them recognise it).
2. **`pair`** — only when `discover` shows `tls: true` (Android 11+ wireless debugging). Needs Google's
   platform-tools `adb` on this computer; if it is missing, suggest USB or classic Network debugging.
3. **`connect`** — the TV shows "Allow USB debugging?". Tell them to tick **Always allow from this
   computer** and press **Allow**. The call waits for it. On `unauthorized`, ask again and call `connect`
   again.
4. **`check`** — read-only. Tell them in one or two lines what you see: model, Android version, which
   launcher answers HOME now, whether ours is installed, free space. Read the `warnings`.
5. **`provision` with `dryRun: true`** — shows every command it would run. Summarise the plan for them in
   plain words. It installs the launcher, sets it as HOME, and **switches the stock launcher off**
   (`pm disable-user`, which keeps the app and its data). Get a clear yes before the real run.
6. **`provision` with `stopBefore: "test"`** — the real run, keeping the connection open. Relay every item
   in `humanActions` (for example "pick the launcher and choose Always").
7. **`screenshot`** — look at what the TV shows and confirm the launcher is on screen.
8. **`test`** — presses HOME, checks who answers it, then **reboots the box**. Say so before you call it.
   Wait about a minute, `connect` again (they may have to press Allow again), then `check`: the launcher
   must still be the HOME app after the reboot. That is what breaks most often.
9. **`report`** — every command that ran, with its result. Offer it at the end, or read it when a step failed.

`install` alone installs the apps without touching HOME. Each APK comes from the manifest on
tvboxtools.com and is checked against its SHA-256 before `pm install`.

## Rules

- Ask the person only for what must happen on the TV: enabling debugging, pressing Allow, picking the
  launcher. Never give them adb commands to type.
- Confirm before `provision` (without `dryRun`), `install` and `test` (reboot).
- If `provision` would end by turning debugging off (the `handover` task in the dry run), that ends the
  connection: keep `stopBefore: "test"` until they are finished, and say so before the last step.
- There is no raw shell in this plugin. If something needs a command the tools do not offer, say what
  it is and point them to the TV Box Tools app (https://tvboxtools.com) instead of improvising.

## Hotel and rental TVs

This plugin sets up home TVs. For a hotel or rental TV that should be locked to Hotel TV (kiosk mode),
point them to the TV Box Tools app and its hotel road: https://hoteltvapp.com/kiosk-manager/

## Undo

To get the original home screen back, the TV Box Tools app has a one-tap **Restore** (re-enables the
stock launcher and sets HOME back): https://tvboxtools.com/restore/

## When something fails

- `no-devices`: debugging not on, different network, guest Wi-Fi isolation, or a charge-only USB cable.
  The error's `next` field says which to try.
- `unauthorized`: the Allow dialog was dismissed or is waiting on the TV. Take a `screenshot` if
  already connected, otherwise ask them to look at the TV.
- A failed task: read `reportTail` in the result, explain it, and retry only that step.
- More detail for agents: https://tvboxtools.com/boxsetupai
