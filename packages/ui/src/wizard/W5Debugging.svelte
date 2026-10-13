<script lang="ts">
  // W5 Debugging: USB / Network (TCP 5555) / Wireless (Android 11+).
  //
  // REDESIGNED 23/9/2026 (Jim, on his own run): the three big cards sat in a row and pushed the
  // recording underneath them, where it collided with the footer — and clicking a card looked like
  // nothing had happened. The page now reads like the Developer mode one beside it: the choices on
  // the LEFT as one list, the film of the real menus on the RIGHT, at a size that fits.
  //
  // Two things the old screen never said out loud:
  //   · a choice this platform CANNOT take is marked with a red ✗ and cannot be picked. In a
  //     browser that is the Wi-Fi pair: a page cannot open a TCP socket, so "Network debugging"
  //     is not a thing the web version can do, however much the box supports it. It says so, and
  //     offers the desktop app right there.
  //   · picking is OPTIONAL. The tool tries every path it has when it scans, so Continue is never
  //     blocked by this screen — the answer only narrows what we show next.
  import { getSession } from '../context.js';
  import Notice from '../components/Notice.svelte';
  import PillButton from '../components/PillButton.svelte';
  import ClipPlayer from '../components/ClipPlayer.svelte';
  import { clipFor } from '../videos.js';
  import type { DebugPath } from '@tvlm/adb';
  const S = getSession();
  // The film follows the choice: pick "Network debugging" and the screen shows that toggle being
  // turned on, not the generic tour (Jim, 23/9).
  const clip = $derived(clipFor('debugging', S.box ?? 'androidtv', S.debug));
  // WHICH PATHS THIS BUILD CAN ACTUALLY TAKE, from the transport itself rather than a guess about
  // platforms (Jim, 23/9: "USB is desktop + web + android, isn't it?" — the first two yes, the
  // third no: our Android app speaks over the network only). Every transport already declares it:
  // Electron usb+tcp+wireless, WebUSB usb, the bridge all three, Capacitor tcp+wireless.
  const can = (id: DebugPath) => S.transport.supports.includes(id) || (S.bridged && id !== 'usb');
  // The tag says what the BOX must be, not what this computer is: the platform question is the
  // cross, and mixing the two put "Desktop" beside two Android version numbers.
  const debugs = $derived<Array<{ id: DebugPath; title: string; desc: string; path: string; icon: string; tag: string; off: boolean }>>([
    { id: 'usb', title: S.t('d_usb'), desc: S.t('d_usbD'), path: S.t('d_usbP'), icon: 'bi-solid-arrow-right', tag: S.t('d_anyAndroid'), off: !can('usb') },
    { id: 'tcp', title: S.t('d_tcp'), desc: S.t('d_tcpD'), path: S.t('d_tcpP'), icon: 'bi-wifi', tag: 'Android TV 9–10', off: !can('tcp') },
    { id: 'wireless', title: S.t('d_wl'), desc: S.t('d_wlD'), path: S.t('d_wlP'), icon: 'bi-infinity', tag: 'Android 11+', off: !can('wireless') },
  ]);
  // Two different "cannot": a browser has no socket to the box, a phone/TV app has no USB host.
  const why = (id: DebugPath) => (id === 'usb' ? S.t('d_usbNotHere') : S.t('web_notHere'));
  const anyOff = $derived(debugs.some((d) => d.off));
</script>

<div class="screen w5">
  <div class="left">
    <h2 class="h2">{S.t('w5_title')}</h2>
    <p class="lead">{S.t('w5_body')}</p>
    <span class="which">{S.t('w5_which')}</span>

    <div class="list">
      {#each debugs as d (d.id)}
        <button
          type="button"
          class="row"
          class:sel={S.debug === d.id}
          class:off={d.off}
          data-nav={d.off ? undefined : true}
          disabled={d.off}
          onclick={() => !d.off && (S.debug = d.id)}
        >
          <span class="body">
            <span class="ttl"><i class="base-icon {d.icon} ico"></i>{d.title}<span class="tag">{d.tag}</span></span>
            <span class="desc">{d.off ? why(d.id) : d.desc}</span>
            <span class="path">{d.path}</span>
          </span>
          <!-- A mark only where there is something to say. An empty ring on every row was a
               question mark beside two answers nobody asked for (Jim, 23/9): the row itself
               already lights up when it is the chosen one. -->
          {#if d.off}
            <span class="no"><i class="base-icon bi-x"></i></span>
          {:else if S.debug === d.id}
            <span class="check-badge"><i class="base-icon bi-check"></i></span>
          {/if}
        </button>
      {/each}
    </div>

    {#if S.isWeb && anyOff}
      <!-- not a dead end: the same page that cannot do Wi-Fi can hand over the app that can -->
      <div class="getapp">
        <Notice kind="info">{S.t('web_debugNote')}</Notice>
        <PillButton kind="outline" onclick={() => S.bridgeDesktop()}>{S.t('web_getApp')}</PillButton>
      </div>
    {/if}
  </div>

  <div class="right">
    {#if clip}<ClipPlayer {clip} />{/if}
  </div>
</div>

<style>
  /* the Developer mode page's shape: words and choices left, the real menus right */
  .w5 { display: grid; grid-template-columns: minmax(520px, 1fr) minmax(420px, 620px); gap: 48px; align-content: start; padding-top: 10px; }
  .lead { margin-top: 10px; line-height: 1.5; }
  .which { display: block; margin-top: 18px; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,.45); }
  .list { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
  .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; width: 100%; text-align: left; color: #fff; font: inherit; padding: 14px 16px; border-radius: 16px; background: var(--card-bg); border: 1px solid var(--card-border); transition: border-color .15s, background .15s; }
  .row:hover:not(:disabled) { border-color: rgba(255,255,255,.3); }
  .row.sel { background: var(--card-sel-bg); border-color: var(--card-sel-border); }
  .row.off { opacity: .55; cursor: default; }
  .no { flex: none; width: 26px; height: 26px; border-radius: 999px; border: 1px solid var(--danger); color: var(--danger); display: flex; align-items: center; justify-content: center; font-size: 12px; }
  .body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .ttl { display: flex; align-items: center; gap: 10px; font: 700 18px var(--font-display); }
  .ico { font-size: 16px; color: rgba(255,255,255,.7); }
  .tag { font: 400 11px var(--font-label); letter-spacing: 1px; color: rgba(255,255,255,.45); padding-left: 2px; }
  .desc { font-size: 14px; line-height: 1.45; color: rgba(255,255,255,.68); }
  .path { margin-top: 6px; align-self: flex-start; padding: 7px 10px; border-radius: 8px; background: var(--tv-panel); color: var(--tv-text); font: 400 12px var(--font-label); border: 1px solid rgba(255,255,255,.08); }
  .getapp { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
  .right { display: flex; flex-direction: column; justify-content: flex-start; }
</style>
