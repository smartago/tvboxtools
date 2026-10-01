# Why the HOME button goes back to the stock launcher — and what TV Box Tools does instead

## The problem

Android TV and Google TV have no "default launcher" setting in the menus. A third-party launcher
(Projectivy, AT4K, Monet, FLauncher and others) can appear on the home row, but the HOME button
still opens the stock launcher unless something intervenes.

Most launchers intervene with an **accessibility service**: it watches for the HOME key and brings
the launcher forward. It works — until it does not:

- some TVs switch accessibility services off after a full restart or a system update (widely
  reported on TCL sets, and on boxes after OTA updates);
- some vendors block the service entirely on newer Android TV versions;
- the switch-over is visible: the stock launcher flashes first, then the custom one.

The symptom people describe is always the same: *"my launcher forgets itself after a reboot and
the Google TV home comes back."*

## What TV Box Tools does

Over the box's own debugging connection it runs one system command:

```
cmd package set-home-activity <package>/<activity>
cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME
```

The first sets your launcher as the system's HOME app; the second reads back what the box now
resolves for HOME, and the tool only reports success when the answer is the launcher you asked
for. Nothing keeps running afterwards. The setting survives reboots because it is the system's own
default, not a service that has to be alive to enforce it.

The stock launcher is **not** disabled and **not** uninstalled. "Restore stock launcher" is the
same command pointed back at it.

## What it does not do

- It does not disable the stock launcher in a loop (some tools do; it leaves the box with no HOME
  app if the custom launcher is ever removed).
- It does not need root, and it does not install an accessibility service of its own.
- The Google Play edition never disables or uninstalls anything at all; the desktop, web and
  sideload builds offer Debloat as a separate, reversible task.

## On Fire TV

Fire OS resolves HOME differently and Amazon re-asserts its launcher aggressively. TV Box Tools
connects to Fire TV over ADB debugging and offers the same tasks; whether a custom launcher holds
HOME across reboots depends on the Fire OS version. The tool reports what the box actually did
instead of promising.
