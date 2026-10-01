import { describe, expect, it } from 'vitest';
import { classifyCommand, normalizeCommand } from './gate.js';

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
    for (const c of ['reboot bootloader', 'reboot recovery', 'fastboot flash boot x', 'rm -rf /data', 'dd if=/dev/zero of=/dev/block/x', 'dpm remove-active-admin x/y', 'dpm clear-freeze-period-record', 'pm uninstall com.android.settings', 'pm disable-user --user 0 com.android.systemui', 'settings put global adb_enabled 0', 'su -c id', 'am broadcast -a android.intent.action.MASTER_CLEAR']) {
      expect(classifyCommand(c).verdict, c).toBe('blocked');
    }
  });

  it('allows adb_enabled 0 only as the last handover step', () => {
    expect(classifyCommand('settings put global adb_enabled 0', { handoverLastStep: true }).verdict).toBe('confirm');
  });
});

describe('η έκδοση Play: ό,τι κρύβει η οθόνη, το αρνείται και η πύλη', () => {
  // Μελέτη Play §3.4. Η έκδοση Play κρύβει τη σελίδα Debloat (`canRiskyTasks`) — αλλά μια κρυμμένη
  // σελίδα δεν είναι περιορισμός: η κονσόλα δέχεται ελεύθερες εντολές, οπότε το ίδιο πράγμα
  // ξαναέμπαινε γραμμένο με το χέρι. Ένας reviewer που το βρει δεν βλέπει bug, βλέπει παράκαμψη.
  const play = { playBuild: true };

  it('δεν απεγκαθιστά και δεν απενεργοποιεί', () => {
    for (const cmd of [
      'pm uninstall com.example.bloat',
      'pm uninstall --user 0 com.example.bloat',
      'pm disable-user --user 0 com.example.bloat',
      'pm disable com.example.bloat',
      'cmd package uninstall com.example.bloat',
    ]) {
      expect(classifyCommand(cmd, play).verdict, cmd).toBe('blocked');
      expect(classifyCommand(cmd, play).reason, cmd).toMatch(/Google Play edition/);
    }
  });

  it('η ΙΔΙΑ εντολή περνά κανονικά στις υπόλοιπες εκδόσεις', () => {
    // Το sideload, το πρόγραμμα του υπολογιστή και η σελίδα ΚΑΝΟΥΝ debloat· το φρένο είναι της
    // έκδοσης, όχι του εργαλείου.
    expect(classifyCommand('pm disable-user --user 0 com.example.bloat').verdict).not.toBe('blocked');
  });

  it('δεν αγγίζει ό,τι η έκδοση Play ΚΑΝΕΙ', () => {
    // Το να ορίσεις HOME και να διαβάσεις το box είναι όλη η δουλειά της· ένα φρένο που τα έπιανε
    // κι αυτά θα είχε σκοτώσει την έκδοση αντί να την περιορίσει.
    expect(classifyCommand('cmd package set-home-activity com.x/.Main', play).verdict).not.toBe('blocked');
    expect(classifyCommand('pm list packages', play).verdict).toBe('auto');
    expect(classifyCommand('dumpsys package com.x', play).verdict).toBe('auto');
  });
});
