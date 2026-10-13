# TV Box Tools for Claude

Set up Android TV, Google TV and Fire TV boxes by asking Claude. The plugin gives Claude the
[TV Box Tools](https://tvboxtools.com) MCP server and a skill that walks through the setup: find the box
on Wi-Fi or USB, check it, install a launcher, make it the HOME app, test it across a reboot, and show a
report of every command that ran. You stay in front of the TV and only press what has to be pressed there
(Allow, pick the launcher); Claude does the rest from your computer.

![TV Box Tools](./icon.svg)

## What you need

- **Node.js 22 or newer** on the computer. Nothing else is installed: the server and its modules are in this plugin.
- **Developer options and debugging on the TV box.** The skill tells you how for your box.
- The computer and the TV on the **same network** (Wi-Fi or cable).
- Optional: Google's platform-tools `adb`, for a box on a **USB cable** (its adb server carries the
  connection) and for Android 11+ "Wireless debugging" pairing.

The server runs on your computer, so the plugin works in Claude Code and in Cowork on the desktop app.
It does not run in chat on the web or on mobile, which cannot reach a box on your home network.

The plugin sets a box up with Premium TV Launcher, or with any launcher already on the box. Hotel and rental
TVs (Hotel TV, kiosk mode) are set up with the TV Box Tools app: <https://hoteltvapp.com/kiosk-manager/>.

## Tools

| Tool | Changes the box? | What it does |
| - | - | - |
| `discover` | no | Lists boxes on USB, by mDNS, and by a scan of the local /24 network on TCP port 5555 |
| `pair` | no (pairs this computer) | Android 11+ wireless-debugging pairing, through Google's `adb pair` |
| `connect` | no (the TV asks Allow) | Opens the ADB session; the TV shows "Allow USB debugging?" |
| `check` | no | Model, Android version, current HOME app, installed launcher, accounts, free space |
| `install` | yes | Installs the apps listed in the manifest, after checking each file's SHA-256 |
| `provision` | yes | Install → set HOME (switches the stock launcher off with `pm disable-user`, data kept) → permission grants → test. `dryRun: true` only lists the commands |
| `test` | yes (reboots) | HOME key, checks who answers HOME, screenshot on the box, reboot |
| `screenshot` | no | PNG of what the TV shows now |
| `report` | no | Every command of this session with its result |

There is **no raw shell tool** in this plugin (the server runs with `--no-shell`). Every command passes the
same allowlist gate as the TV Box Tools app, and commands such as factory reset, wipe, `su` or uninstalling
system apps are refused outright. To undo a launcher change, use **Restore** in the TV Box Tools app:
<https://tvboxtools.com/restore/>.

## What it runs, sends and fetches

- **Runs:** `node server/tvboxtools.mjs --mcp --no-shell` from this plugin. `server/tvboxtools.mjs` is built, unminified, from the open source code in
  <https://github.com/smartago/tvboxtools> (Apache-2.0); the modules it loads are in `server/node_modules`,
  copied unchanged from their npm releases, each with its license (list: `server/THIRD_PARTY.md`). Nothing is
  downloaded or installed when the plugin starts. For Android 11+ pairing it calls Google's `adb pair` if
  platform-tools is installed.
- **On your network:** USB, mDNS queries, TCP connections to port 5555 of addresses in your local /24 (or
  the subnet you name), the ADB connection to the box you choose, and a local Google adb server on
  127.0.0.1:5037 if one is running.
- **From the internet (only for `install` and `provision`):** the app manifest from
  `https://tvboxtools.com/dl/manifest.json` and the APK files it lists. APKs are streamed to the box and not saved on the computer.
- **Sends:** nothing to us or anyone else. No telemetry, no accounts, no analytics. The session report stays
  in the server's memory and is gone when it stops.
- **Stores on your computer:** its own ADB key in `~/.tvlm/` (so the TV remembers "Always allow"). It also
  reads `~/.android/adbkey` if Google's adb created one, so a TV that already trusts your adb does not ask again.

Privacy policy: <https://tvboxtools.com/privacy/> · Terms: <https://tvboxtools.com/terms/>

## Support

Issues: <https://github.com/smartago/tvboxtools/issues> · Website: <https://tvboxtools.com>

Made by Smartago. Apache-2.0.
