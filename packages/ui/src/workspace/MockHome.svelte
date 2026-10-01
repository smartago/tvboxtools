<script lang="ts">
  // The launcher home-screen placeholder (440×248) the Launcher and Test pages show when there is no real screenshot.
  import { getSession } from '../context.js';
  interface Props {
    mode: 'ours' | 'stock' | 'ask' | 'empty' | 'image';
    src?: string | null;
  }
  let { mode, src = null }: Props = $props();
  const S = getSession();
</script>

<div class="scr">
  {#if mode === 'image' && src}
    <img class="img" {src} alt="" />
  {:else if mode === 'ours' || mode === 'ask'}
    <div class="bg ours"></div>
    <div class="dots"><span></span><span></span><span></span></div>
    <div class="clock"></div>
    <div class="tiles"><span style="background:rgba(255,255,255,.14)"></span><span></span><span></span><span></span></div>
    <img class="icon" src="{S.assetBase}{S.brand.logo.icon}" alt="" />
    {#if mode === 'ask'}
      <div class="scrim"></div>
      <div class="chooser">
        <div class="ct">{S.t('l_chooser')}</div>
        <div class="capp"><img src="{S.assetBase}{S.brand.logo.icon}" alt="" />{S.brand.launcherName}</div>
        <div class="cbtns"><span class="once">{S.t('l_once')}</span><span class="always tvlm-blink">{S.t('l_always')}</span></div>
      </div>
    {/if}
  {:else if mode === 'stock'}
    <div class="bg stock"></div>
    <div class="tabs"><span class="on">Home</span><span>Discover</span><span>Apps</span></div>
    <div class="hero"></div>
    <div class="stiles"><span style="background:#E53935"></span><span style="background:#1E88E5"></span><span style="background:#43A047"></span><span style="background:#8E24AA"></span><span style="background:#FB8C00"></span></div>
    <div class="lbl">{S.t('l_stock')}</div>
  {:else}
    <div class="empty">{S.t('x_ph')}</div>
  {/if}
</div>

<style>
  .scr { width: 440px; height: 248px; border-radius: 12px; background: var(--tv-bg); position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,.1); font-family: var(--font-label); }
  .img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .bg { position: absolute; inset: 0; }
  .bg.ours { background: radial-gradient(ellipse at 70% 30%, #2b4a5a 0%, #0B0E13 70%); }
  .bg.stock { background: var(--tv-bg); }
  .dots { position: absolute; left: 14px; top: 14px; display: flex; flex-direction: column; gap: 6px; }
  .dots span { width: 24px; height: 24px; border-radius: 50%; background: rgba(0,0,0,.5); }
  .clock { position: absolute; right: 14px; top: 14px; width: 110px; height: 56px; border-radius: 12px; background: rgba(0,0,0,.5); }
  .tiles { position: absolute; left: 56px; right: 14px; bottom: 14px; display: flex; gap: 8px; }
  .tiles span { flex: 1; aspect-ratio: 16/9; border-radius: 8px; background: rgba(255,255,255,.1); }
  .icon { position: absolute; left: 14px; bottom: 14px; width: 36px; height: 36px; object-fit: contain; }
  .scrim { position: absolute; inset: 0; background: rgba(0,0,0,.6); }
  .chooser { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 260px; background: var(--tv-dialog); border-radius: 8px; padding: 16px 18px; color: var(--tv-text); box-shadow: 0 20px 60px rgba(0,0,0,.6); }
  .ct { font-size: 15px; font-weight: 500; }
  .capp { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding: 8px 10px; border-radius: 4px; background: var(--tv-text); color: #111; font-size: 13px; }
  .capp img { width: 22px; height: 22px; border-radius: 5px; object-fit: contain; }
  .cbtns { display: flex; justify-content: flex-end; gap: 6px; margin-top: 12px; }
  .once { padding: 6px 12px; border-radius: 4px; font-size: 12px; color: var(--tv-sub); }
  .always { padding: 6px 14px; border-radius: 4px; font-size: 12px; font-weight: 500; background: var(--tv-text); color: #111; }
  .tabs { position: absolute; left: 18px; top: 16px; display: flex; gap: 14px; font: 500 12px var(--font-label); color: var(--tv-row); }
  .tabs .on { border-bottom: 2px solid var(--tv-text); padding-bottom: 3px; color: var(--tv-text); }
  .hero { position: absolute; left: 18px; right: 18px; top: 52px; height: 96px; border-radius: 8px; background: linear-gradient(135deg, #3b3f6b, #1f2340); }
  .stiles { position: absolute; left: 18px; right: 18px; bottom: 16px; display: flex; gap: 8px; }
  .stiles span { flex: 1; aspect-ratio: 16/9; border-radius: 4px; }
  .lbl { position: absolute; right: 14px; top: 14px; font: 400 11px var(--font-label); color: rgba(255,255,255,.5); }
  .empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,.4); font: 13px var(--font-ui); }
</style>
