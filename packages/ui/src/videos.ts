// OUR OWN clips, in OUR OWN player (Jim, 22/9): "YouTube throws ads at you, so one video of ours
// and it plays in a player of ours". Nothing leaves the app — no embed, no third-party script, no
// beacon, no "up next". The file ships with the app, so a box on a network with no route out still
// gets the lesson.
//
// How they are made (docs/CLIPS.md): the AOSP Android TV emulator is driven over ADB with the real
// remote keys, recorded with `adb emu screenrecord` (the recorder INSIDE the guest returns a frozen
// frame on this image), then cut to 1280×720 H.264 with ffmpeg. 31 seconds of TV menus compress to
// 430 KB, because a settings screen barely moves.
//
// The captions are NOT burned into the picture: they are i18n keys with timings, drawn by the
// player. One recording therefore speaks every language we ship, and fixing a wording costs a
// string, not a re-shoot.
import type { BoxId } from './state.svelte.js';
import type { StrKey } from './i18n/index.svelte.js';

export type ClipTopic = 'devmode' | 'debugging';

/**
 * Which switch a debugging clip shows. The three are not one lesson: USB is a toggle, Network is
 * another toggle three rows down, and Wireless opens a pairing screen that only Android 11+ has.
 * One film for all three taught two thirds of the room the wrong thing, so the screen plays the
 * one for the row you picked (Jim, 23/9: "so whatever they choose, they just see another video").
 */
export type ClipPath = 'usb' | 'tcp' | 'wireless';

export interface ClipCaption {
  /** Seconds into the clip when this line appears; it stays until the next one. */
  t: number;
  key: StrKey;
}

export interface HelpClip {
  topic: ClipTopic;
  /** The box this was actually filmed on. `null` = close enough for any Android TV. */
  box: BoxId | null;
  /** Debugging clips only: the switch this one shows. Absent = it covers the whole screen. */
  path?: ClipPath;
  /** Relative to `assetBase` (brand/) — bundled with the app, never fetched from anywhere else. */
  src: string;
  /** Seconds, for the progress bar before the file has loaded. */
  length: number;
  captions: ClipCaption[];
}

export const HELP_CLIPS: readonly HelpClip[] = [
  {
    topic: 'devmode',
    box: 'androidtv',
    src: 'clips/devmode-androidtv.mp4',
    length: 31.5,
    // Timings read off the recording itself, frame by frame — not guessed.
    captions: [
      { t: 0, key: 'clip_dev1' },
      { t: 2.5, key: 'clip_dev2' },
      { t: 7.5, key: 'clip_dev3' },
      { t: 9.5, key: 'clip_dev4' },
      { t: 20, key: 'clip_dev5' },
      { t: 29, key: 'clip_dev6' },
    ],
  },
  {
    topic: 'debugging',
    box: 'androidtv',
    src: 'clips/debugging-androidtv.mp4',
    length: 27,
    // It ends on the choice, not on a switch that flipped: this emulator refuses to enable wireless
    // debugging with no Wi-Fi (Ethernet only), and filming USB debugging being toggled would cut the
    // cable we are filming through. The last frame is "Enabled", highlighted — which is the press
    // the person has to make on their own box.
    captions: [
      { t: 0, key: 'clip_dbg1' },
      { t: 3.5, key: 'clip_dbg2' },
      { t: 6, key: 'clip_dbg3' },
      { t: 15.5, key: 'clip_dbg4' },
      { t: 17.5, key: 'clip_dbg5' },
      { t: 20, key: 'clip_dbg6' },
    ],
  },
];

/**
 * The clip for this step and this box: the exact box first, then one filmed on a set close enough,
 * else nothing — and "nothing" is a real answer. The screens that have no clip keep the animated
 * mock they have always had, which is ours too and works with no file at all.
 */
export function clipFor(topic: ClipTopic, box: BoxId | null, path?: ClipPath | null): HelpClip | null {
  // The film of the switch that was picked, when we have one; otherwise the one that covers the
  // screen. A clip for another switch is never shown in its place — wrong menu, wrong lesson.
  const forTopic = HELP_CLIPS.filter((c) => c.topic === topic && (!c.path || (path ? c.path === path : false)));
  // Xiaomi ships stock Android TV menus, so the Android TV clip is honest there. Google TV and
  // Fire TV are NOT: their menus differ, and a clip that shows the wrong path teaches the wrong
  // thing. They wait for their own recording.
  const near: Record<string, BoxId> = { xiaomi: 'androidtv', other: 'androidtv' };
  const want = box ? (near[box] ?? box) : null;
  return forTopic.find((c) => want && c.box === want) ?? forTopic.find((c) => c.box === null) ?? null;
}

/** The caption to show at `t` seconds. */
export function captionAt(clip: HelpClip, t: number): StrKey | null {
  let key: StrKey | null = null;
  for (const c of clip.captions) if (t >= c.t) key = c.key;
  return key;
}
