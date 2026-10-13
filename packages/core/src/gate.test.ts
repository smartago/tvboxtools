import { describe, expect, it } from 'vitest';
import { classifyCommand, isIrreversible, normalizeCommand } from './gate.js';

describe('command gate', () => {
  it('normalizes an adb shell prefix', () => {
    expect(normalizeCommand('adb -s 1.2.3.4:5555 shell  getprop   ro.build.version.release')).toBe('getprop ro.build.version.release');
    expect(normalizeCommand('adb shell dumpsys account')).toBe('dumpsys account');
  });

  it('lets read-only commands through', () => {
    for (const c of ['getprop ro.product.model', 'dumpsys account', 'pm list packages -3', 'settings get global adb_enabled', 'am start -a android.settings.SYNC_SETTINGS', 'input keyevent KEYCODE_HOME', 'cmd package resolve-activity --brief -c android.intent.category.HOME', 'df /data', 'screencap -p /sdcard/x.png']) {
      expect(classifyCommand(c).verdict, c).toBe('auto');
    }
  });

  // The Remote and Device pages (28/9): typing on the television is a read-level act, reading the
  // clock is a read — but `date -s` SETS the clock and must never be one.
  it('lets the remote type and the clock be read, but not set', () => {
    expect(classifyCommand('input text hello%sworld').verdict).toBe('auto');
    expect(classifyCommand('date').verdict).toBe('auto');
    expect(classifyCommand('date +%s').verdict).toBe('auto');
    expect(classifyCommand('date -s 20200101.000000').verdict).toBe('confirm');
    expect(classifyCommand('wm size').verdict).toBe('auto');
    expect(classifyCommand('wm size 1280x720').verdict).toBe('confirm');
    expect(classifyCommand('wm density reset').verdict).toBe('confirm');
  });

  it('asks a human for every provisioning step', () => {
    for (const c of [
      'appops set com.hotel.bnb.smart.hospitality.tv.launcher SYSTEM_ALERT_WINDOW allow',
      'pm grant com.hotel.bnb.smart.hospitality.tv.launcher android.permission.READ_TV_LISTINGS',
      'cmd package set-home-activity com.hotel.bnb.smart.hospitality.tv.launcher/com.premium.tv.launcher.ui.LauncherActivity',
      'dpm set-device-owner com.hotel.bnb.smart.hospitality.tv.launcher/com.premium.tv.launcher.ui.hotel.HotelDeviceAdminReceiver',
      'am broadcast -a com.hotel.bnb.smart.hospitality.tv.launcher.PROVISION --es profile kiosk',
      'pm disable-user --user 0 com.google.android.tvlauncher',
      'settings put secure enabled_accessibility_services x/y',
      'reboot',
      'am start -a android.intent.action.VIEW -d http://x',
      'getprop | grep abi',
    ]) {
      expect(classifyCommand(c).verdict, c).toBe('confirm');
    }
  });

  it('blocks the bricking commands even when confirmed', () => {
    for (const c of ['reboot bootloader', 'reboot recovery', 'fastboot flash boot x', 'rm -rf /data', 'dd if=/dev/zero of=/dev/block/x', 'dpm remove-active-admin x/y', 'dpm clear-freeze-period-record', 'pm uninstall com.android.settings', 'pm disable-user --user 0 com.android.systemui', 'settings put global adb_enabled 0', 'su -c id']) {
      expect(classifyCommand(c).verdict, c).toBe('blocked');
    }
  });

  // ΤΟ FACTORY RESET ΑΛΛΑΞΕ ΚΑΤΗΓΟΡΙΑ (Jim, 2/10/2026): από φραγμένο σε `confirm`, για να μπορεί να
  // ξαναστήνεται ένα δοκιμαστικό κουτί. Δύο πράγματα το κρατούν ασφαλές και τα κλειδώνει το τεστ:
  // ΔΕΝ γίνεται ποτέ `auto`, και το `isIrreversible` το σημαδεύει ώστε ο host να ρωτά ΠΑΝΤΑ —
  // ακόμη κι όταν η εντολή ήρθε από πάτημα ανθρώπου.
  it('factory reset: confirm, ΠΟΤΕ auto, και σημαδεμένο ως μη αναστρέψιμο', () => {
    const c = 'am broadcast -a android.intent.action.MASTER_CLEAR -p android';
    expect(classifyCommand(c).verdict).toBe('confirm');
    expect(isIrreversible(c)).toBe(true);
    expect(isIrreversible('getprop ro.product.model')).toBe(false);
  });

  it('allows adb_enabled 0 only as the last handover step', () => {
    expect(classifyCommand('settings put global adb_enabled 0', { handoverLastStep: true }).verdict).toBe('confirm');
  });
});

describe('καμία διαφορά ανά έκδοση (12/10/2026)', () => {
  it('uninstall/disable: η ίδια ετυμηγορία για όλους — η πύλη δεν ξέρει από εκδόσεις', () => {
    for (const cmd of ['pm uninstall com.example.bloat', 'pm disable-user --user 0 com.google.android.tvlauncher']) {
      expect(classifyCommand(cmd).verdict, cmd).toBe('confirm');
    }
  });
});
