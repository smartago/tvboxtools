# TV Box Tools for AI agents

TV Box Tools exposes its whole engine to AI agents in two ways. Both go through the same
command gate as the app, so an agent can never do to a box what a person could not.

## 1. One prompt, no setup

Paste one line into Claude Code, ChatGPT, Gemini or any agent that can run commands:

> Set up my Android TV box with TV Box Tools — read https://tvboxtools.com/boxsetupai first.

The agent reads that page, downloads the tool for the computer it runs on, and drives it for you.
It asks you only what it cannot know: which computer you are on, USB or Wi-Fi, and the pairing
code the TV shows.

## 2. MCP server (advanced)

```bash
claude mcp add tvlm -- tvlm --mcp
```

or in `.mcp.json`:

```json
{ "mcpServers": { "tvlm": { "command": "tvlm", "args": ["--mcp"] } } }
```

Then: *"set up my TV box"*, *"which launcher is HOME on this box?"*, *"take a screenshot of the TV"*.

### Tools

| Tool | What it does |
|---|---|
| `discover` | Find boxes reachable from this computer: USB, mDNS (`_adb._tcp`, `_adb-tls-connect._tcp`), subnet scan on :5555 |
| `pair` | Android 11+ wireless debugging: host:port + the 6-digit code from the TV |
| `connect` | Open the ADB session; waits for the person to press *Allow* on the TV |
| `check` | Read the box: model, Android version, launcher on HOME, accounts, storage, Developer options |
| `install` | Install an app from a signed manifest (sha256 verified) — never in the Google Play edition |
| `provision` | Run a task: launcher, configure, test, handover, kiosk |
| `link` | Pair a Hotel TV box with its property account |
| `test` | Verify HOME, permissions, profile, apps after a run |
| `screenshot` | The TV screen, as an image |
| `report` | What ran, what succeeded, what failed |
| `shell` | A raw command — **gated**: reads run, changes ask, destructive commands are refused |

The instructions an agent needs live **inside the tool descriptions** (what to ask the human, what
the TV shows, what to do on "unauthorized"), so the agent never improvises adb.

## The command gate, in one table

| Class | Examples | Result |
|---|---|---|
| read | `getprop`, `dumpsys`, `pm list`, `wm size` | runs |
| reversible setting | `settings put`, `cmd package set-home-activity` | runs, shown |
| change to the box | `pm disable-user`, `pm install`, `dpm set-device-owner` | asks first |
| destructive | `su`, `wipe`, factory reset, bootloader, `settings put global adb_enabled 0` | refused |

Source: [`packages/core/src/gate.ts`](../packages/core/src/gate.ts) · steps as data:
[`packages/core/src/steps.ts`](../packages/core/src/steps.ts).

## CLI

```bash
tvlm discover                                  # USB + mDNS + subnet scan
tvlm check --json                              # read-only box facts, machine-readable
tvlm launcher --method set-home-activity --yes # make the chosen launcher the HOME app
tvlm screenshot --out tv.png                   # the TV screen
tvlm pair 192.168.1.50:37123 123456            # Android 11+ wireless debugging
tvlm --mcp                                     # MCP server on stdio
```

Targets: `--connect host:port`, `--usb`, `--serial X` (none = discover, one box expected).
`--mock happy|unauthorized|accounts|nodevices` runs every command against a simulated box.

`--json` on every command; exit codes are stable. The CLI is in `apps/cli`.
