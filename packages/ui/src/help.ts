// The in-app guides behind "Hotspot guide" and "Get USB driver" on W6 (DESIGN_NOTES §1, step 6:
// "empty result → troubleshooting: client isolation → phone hotspot; USB with no device → driver").
//
// They live in the app, not on the site: the tool is used exactly when the network is not working,
// and an installer in a hotel corridor cannot be sent to a web page to find out why nothing was found.
// Content is data — steps are string keys, so the i18n pipeline translates them like everything else.
import type { StrKey } from './i18n/index.svelte.js';

export type HelpTopic = 'hotspot' | 'driver';
export type HostOs = 'windows' | 'mac' | 'linux' | 'android' | 'unknown';

/** The OS this bundle runs on — the guides show the steps for it first. */
export function detectOs(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): HostOs {
  if (/Android/i.test(ua)) return 'android'; // before Linux: the Android UA contains "Linux"
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'mac';
  if (/Linux|X11|CrOS/i.test(ua)) return 'linux';
  return 'unknown';
}

/** A button under a section. `url` opens outside the app; `act` is handled by the session. */
export interface HelpAction {
  label: StrKey;
  url?: string;
  act?: 'network' | 'rescan';
  gold?: boolean;
  /** Only on these OSes (a Windows settings link is useless on macOS). */
  os?: HostOs[];
  /** Only in the desktop app — a browser cannot open system settings. */
  desktopOnly?: boolean;
}

export interface HelpSection {
  title: StrKey;
  steps: StrKey[];
  actions?: HelpAction[];
  os?: HostOs[];
}

export interface HelpGuide {
  title: StrKey;
  lead: StrKey;
  sections: HelpSection[];
  note?: StrKey;
}

/** Official Android pages — the only downloads we point at (never a mirror, never an APK). */
export const LINK_GOOGLE_USB_DRIVER = 'https://developer.android.com/studio/run/win-usb';
export const LINK_OEM_USB_DRIVERS = 'https://developer.android.com/studio/run/oem-usb';
/** Deep links into the host's own settings — allow-listed by the desktop main process. */
export const LINK_WIN_HOTSPOT = 'ms-settings:network-mobilehotspot';
export const LINK_MAC_SHARING = 'x-apple.systempreferences:com.apple.Sharing-Settings.extension';

export const GUIDES: Record<HelpTopic, HelpGuide> = {
  hotspot: {
    title: 'h_hot_title',
    lead: 'h_hot_lead',
    sections: [
      {
        title: 'h_hot_s1',
        steps: ['h_hot_s1a', 'h_hot_s1b', 'h_hot_s1c', 'h_hot_s1d'],
      },
      {
        title: 'h_hot_s2',
        os: ['windows'],
        steps: ['h_hot_s2a', 'h_hot_s2b', 'h_hot_s2c'],
        actions: [{ label: 'h_hot_winBtn', url: LINK_WIN_HOTSPOT, os: ['windows'], desktopOnly: true }],
      },
      {
        title: 'h_hot_s3',
        os: ['mac'],
        steps: ['h_hot_s3a', 'h_hot_s3b'],
        actions: [{ label: 'h_hot_macBtn', url: LINK_MAC_SHARING, os: ['mac'], desktopOnly: true }],
      },
      { title: 'h_hot_s4', steps: ['h_hot_s4a', 'h_hot_s4b'] },
    ],
    note: 'h_hot_note',
  },
  driver: {
    title: 'h_usb_title',
    lead: 'h_usb_lead',
    sections: [
      {
        title: 'h_usb_s0',
        steps: ['h_usb_s0a', 'h_usb_s0b', 'h_usb_s0c'],
        actions: [{ label: 'h_usb_toNetwork', act: 'network' }],
      },
      {
        title: 'h_usb_s1',
        os: ['windows', 'unknown'],
        steps: ['h_usb_s1a', 'h_usb_s1b', 'h_usb_s1c', 'h_usb_s1d'],
        actions: [
          { label: 'h_usb_googleBtn', url: LINK_GOOGLE_USB_DRIVER },
          { label: 'h_usb_oemBtn', url: LINK_OEM_USB_DRIVERS },
        ],
      },
      { title: 'h_usb_s2', steps: ['h_usb_s2a', 'h_usb_s2b'] },
      { title: 'h_usb_s3', os: ['mac', 'linux'], steps: ['h_usb_s3a', 'h_usb_s3b'] },
    ],
    note: 'h_usb_note',
  },
};

/** The sections that apply to this host. */
export function sectionsFor(guide: HelpGuide, os: HostOs): HelpSection[] {
  return guide.sections.filter((s) => !s.os || s.os.includes(os) || os === 'unknown');
}

export function actionsFor(section: HelpSection, os: HostOs, isDesktop: boolean): HelpAction[] {
  return (section.actions ?? []).filter((a) => (!a.os || a.os.includes(os)) && (!a.desktopOnly || isDesktop));
}
