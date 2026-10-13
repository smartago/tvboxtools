<script lang="ts">
  // The workspace: task nav (236px) · the task page · the console dock (150px).
  import AboutPage from './AboutPage.svelte';
  import { getSession } from '../context.js';
  import Console from '../components/Console.svelte';
  import HumanBanner from '../components/HumanBanner.svelte';
  import Overview from './Overview.svelte';
  import AutoSetup from './AutoSetup.svelte';
  import Profile from './Profile.svelte';
  import Install from './Install.svelte';
  import Launcher from './Launcher.svelte';
  import Configure from './Configure.svelte';
  import Test from './Test.svelte';
  import Handover from './Handover.svelte';
  import Maintenance from './Maintenance.svelte';
  import Agent from './Agent.svelte';
  import ConsolePage from './ConsolePage.svelte';
  import DebloatPage from './DebloatPage.svelte';
  import SpeedPage from './SpeedPage.svelte';
  import ShotPage from './ShotPage.svelte';
  import DisplayPage from './DisplayPage.svelte';
  import DevicePage from './DevicePage.svelte';
  import RemotePage from './RemotePage.svelte';
  import ApkPage from './ApkPage.svelte';
  import FreePage from './FreePage.svelte';
  import BackupPage from './BackupPage.svelte';
  const S = getSession();
  const iconColor = (id: string, active: boolean) => (active ? 'var(--wiz-gold-light)' : S.status[id as keyof typeof S.status] === 'done' ? 'var(--success)' : 'rgba(255,255,255,.7)');
  // On a phone the 236px nav is a drawer over the page (portrait.css): closed by default, opened by
  // the bar at the top of the page, and closed again the moment a task is picked — nobody wants to
  // dismiss a menu twice. On every other screen it is simply always there and this stays false.
  let navOpen = $state(false);
  const navLabel = $derived(S.navItems.find((k) => k.id === S.task)?.label ?? S.t('tasks'));
  function pick(id: string) {
    S.task = id as typeof S.task;
    navOpen = false;
  }
</script>

<div class="ws">
  <div class="main">
    {#if !S.taskOnly}<nav class="nav" class:open={navOpen}>
      <!-- two separators ("This box", "More") share the id 'sep': the key carries the label too -->
      {#each S.navItems as k (k.id + ':' + k.label)}
        {#if k.id === 'sep'}
          <div class="sep">{k.label}</div>
        {:else}
          {@const active = S.task === k.id}
          <button type="button" class="nav-item" class:active disabled={k.disabled} data-nav onclick={() => pick(k.id)}>
            <i class="{k.icon.startsWith('pi-') ? 'plui-icon' : 'base-icon'} {k.icon}" style:color={iconColor(k.id, active)}></i>
            <span class="lbl">{k.label}</span>
            {#if k.disabled}<span class="badge">{S.t('soon')}</span>{/if}
          </button>
        {/if}
      {/each}
    </nav>
    <!-- the drawer is open: a tap anywhere else closes it, the way every phone menu does -->
    {#if S.phone && navOpen}<button type="button" class="scrim" aria-label={S.t('tasks')} onclick={() => (navOpen = false)}></button>{/if}{/if}
    <div class="page">
      {#if S.phone && !S.taskOnly}
        <button type="button" class="menu" onclick={() => (navOpen = true)} title={S.t('tasks')}>
          <span class="bars"><i></i><i></i><i></i></span>
          <span class="mlbl ellipsis">{navLabel}</span>
        </button>
      {/if}
      {#if S.taskOnly}
        <!-- a task opened from the hub: no sidebar, one road back -->
        <button type="button" class="tback tvlm-focus" data-nav onclick={() => S.backToTasks()}>«&nbsp; {S.t('wl_backTasks')}</button>
      {/if}
      {#if S.human && S.task !== 'home'}<HumanBanner />{/if}
      {#if S.task === 'over'}<Overview />
      {:else if S.task === 'auto'}<AutoSetup />
      {:else if S.task === 'prof'}<Profile />
      {:else if S.task === 'inst'}<Install />
      {:else if S.task === 'home'}<Launcher />
      {:else if S.task === 'conf'}<Configure />
      {:else if S.task === 'test'}<Test />
      {:else if S.task === 'hand'}<Handover />
      {:else if S.task === 'maint'}<Maintenance />
      {:else if S.task === 'console'}<ConsolePage />
      {:else if S.task === 'debloat'}<DebloatPage />
      {:else if S.task === 'speed'}<SpeedPage />
      {:else if S.task === 'shot'}<ShotPage />
      {:else if S.task === 'display'}<DisplayPage />
      {:else if S.task === 'device'}<DevicePage />
      {:else if S.task === 'remote'}<RemotePage />
      {:else if S.task === 'apk'}<ApkPage />
      {:else if S.task === 'free'}<FreePage />
      {:else if S.task === 'backup'}<BackupPage />
      {:else if S.task === 'about'}<AboutPage />
      {:else if S.task === 'agent' || S.task === 'agentmcp'}<Agent />
      {/if}
    </div>
  </div>
  <Console />
</div>

<style>
  .ws { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .main { flex: 1; min-height: 0; display: flex; }
  .nav { width: 236px; flex: none; background: rgba(0,0,0,.25); border-right: 1px solid rgba(255,255,255,.08); display: flex; flex-direction: column; padding: 14px 12px; gap: 4px; overflow: auto; }
  .sep { font-size: 11px; letter-spacing: 2px; color: rgba(255,255,255,.4); padding: 14px 12px 6px; }
  .nav-item { display: flex; align-items: center; gap: 12px; height: 42px; padding: 0 12px; border-radius: 10px; border: none; background: transparent; color: rgba(255,255,255,.8); width: 100%; flex: none; }
  .nav-item:hover:not(:disabled) { background: rgba(255,255,255,.08); }
  .nav-item.active { background: rgba(200,144,58,.16); color: #fff; box-shadow: inset 3px 0 0 var(--wiz-gold); }
  .nav-item:disabled { opacity: .45; }
  .nav-item:focus-visible { outline: 3px solid var(--focus); outline-offset: -3px; }
  .nav-item i { font-size: 16px; width: 20px; text-align: center; }
  .lbl { flex: 1; text-align: left; font-size: 14px; font-weight: 500; }
  .badge { font-size: 10px; letter-spacing: 1px; padding: 2px 7px; border-radius: 999px; white-space: nowrap; flex: none; border: 1px solid rgba(255,255,255,.2); color: rgba(255,255,255,.5); }
  .page { flex: 1; min-width: 0; overflow: auto; padding: 26px 36px 20px; }
  .tback { margin: -6px 0 16px; padding: 8px 16px; border-radius: 999px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.16); color: rgba(255,255,255,.85); font: 500 13px var(--font-display); }
  .tback:hover { background: rgba(255,255,255,.12); }

  /* phone only (portrait.css turns the nav into a drawer): the bar that opens it, and the sheet of
     dark glass over the page while it is open. Drawn here, not in portrait.css, because these two
     elements exist ONLY on a phone — there is nothing to override. */
  .menu { display: flex; align-items: center; gap: 12px; width: 100%; margin: 0 0 12px; padding: 10px 14px; border-radius: 12px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.12); color: #fff; }
  .bars { display: flex; flex-direction: column; gap: 4px; width: 18px; flex: none; }
  .bars i { display: block; height: 2px; border-radius: 2px; background: var(--wiz-gold-light); }
  .mlbl { font: 600 15px var(--font-display); text-align: left; }
  .scrim { position: absolute; inset: 0; z-index: 30; border: none; background: rgba(0,0,0,.5); }
</style>
