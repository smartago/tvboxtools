<script lang="ts">
  // Our own player for our own clip (Jim, 22/9). No YouTube, no embed, no ads, no "up next", no
  // third-party request of any kind: a <video> element with a file that ships inside the app.
  //
  // It behaves like a demonstration, not like a video site: it starts by itself, muted, and loops,
  // because the person is following along on a remote and should never have to press play to learn
  // where "Device Preferences" is. One control — play/pause — and a progress bar that is also the
  // chapter list, since the captions are ours.
  //
  // The caption is drawn HERE, from i18n, not burned into the picture: one recording speaks every
  // language we ship.
  import { getSession } from '../context.js';
  import { captionAt, type HelpClip } from '../videos.js';
  const S = getSession();
  let { clip }: { clip: HelpClip } = $props();

  let el: HTMLVideoElement | undefined = $state();
  let t = $state(0);
  let paused = $state(false);
  const dur = $derived(el?.duration && Number.isFinite(el.duration) ? el.duration : clip.length);
  const pct = $derived(Math.min(100, (t / (dur || 1)) * 100));
  const caption = $derived(captionAt(clip, t));

  function toggle() {
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }
  function replay() {
    if (!el) return;
    el.currentTime = 0;
    void el.play();
  }
</script>

<div class="clip">
  <!-- svelte-ignore a11y_media_has_caption -- the caption track is drawn below, from our i18n -->
  <video
    bind:this={el}
    src={S.assetBase + clip.src}
    muted
    autoplay
    loop
    playsinline
    preload="auto"
    ontimeupdate={() => (t = el?.currentTime ?? 0)}
    onplay={() => (paused = false)}
    onpause={() => (paused = true)}
  ></video>

  <div class="bar">
    <button type="button" class="pp tvlm-focus" data-nav onclick={toggle} aria-label={paused ? S.t('clip_play') : S.t('clip_pause')}>
      <i class="base-icon {paused ? 'bi-play-fill' : 'bi-pause-fill'}"></i>
    </button>
    <span class="track"><span class="fill" style:width="{pct}%"></span></span>
    <button type="button" class="pp tvlm-focus" data-nav onclick={replay} aria-label={S.t('clip_replay')}>
      <i class="base-icon bi-arrow-counterclockwise"></i>
    </button>
  </div>

  {#if caption}
    <!-- the line sits on its own dark plate: white-on-video was legible on a desk and not at all
         from a sofa, and a TV menu is a busy, bright thing to write over (Jim, 23/9) -->
    <div class="cap"><span>{S.t(caption)}</span></div>
  {/if}
</div>

<style>
  .clip { position: relative; border-radius: 14px; overflow: hidden; background: #000; border: 1px solid rgba(255,255,255,.12); }
  video { display: block; width: 100%; height: auto; }
  /* the caption sits ON the picture, at the bottom, where a viewer already looks for one */
  .cap { position: absolute; left: 0; right: 0; bottom: 42px; display: flex; justify-content: center; padding: 0 16px; }
  .cap span { max-width: 92%; padding: 9px 18px; border-radius: 12px; background: rgba(0,0,0,.62); border: 1px solid rgba(234,195,90,.25); color: var(--wiz-gold-light); font: 700 16px/1.3 var(--font-display); text-align: center; text-shadow: 0 2px 8px rgba(0,0,0,.95); text-wrap: pretty; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: linear-gradient(transparent, rgba(0,0,0,.75) 45%); }
  .pp { width: 30px; height: 30px; flex: none; border-radius: 999px; border: 1px solid rgba(255,255,255,.25); background: rgba(0,0,0,.45); color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center; }
  .pp:hover { background: rgba(255,255,255,.18); }
  .track { flex: 1; height: 4px; border-radius: 999px; background: rgba(255,255,255,.22); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--wiz-gold); }
</style>
