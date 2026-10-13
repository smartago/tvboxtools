<script lang="ts">
  // WS Install: the manifest list (required locked · one AirPlay receiver per group) → Install (stream → sha256 → adb install).
  import { getSession } from '../context.js';
  import Notice from '../components/Notice.svelte';
  import PillButton from '../components/PillButton.svelte';
  import type { UiApp } from '../state.svelte.js';
  const S = getSession();
  const stText = (pkg: string) => {
    const st = S.inst[pkg];
    return st === 'ok' ? S.t('i_ok') : st === 'ing' ? S.t('i_ing') : st === 'ver' ? S.t('i_ver') : st === 'wait' ? S.t('i_wait') : st === 'err' ? S.t('err_raw') : '';
  };
  const tagOf = (a: UiApp) => (a.group ? `${a.group === 'airplay' ? 'AirPlay' : a.group}${a.license ? ` · ${a.license}` : ''}` : a.required ? S.t('req') : S.t('opt'));
  const locked = (a: UiApp) => !a.group;
</script>

<div class="inst">
  <div><h2 class="h2-ws">{S.t('i_title')}</h2><div class="body">{S.t('i_body')}</div></div>
  <!-- The page is out of the nav in the Play edition, but a saved task id could still land here:
       say why instead of showing a list whose button is not allowed to do anything. -->
  {#if !S.canDirectInstall}<Notice kind="info">{S.t('w9_playEd')}</Notice>{/if}
  {#if S.manifestError}<Notice kind="danger">{S.manifestError}</Notice>{/if}
  <div class="list">
    {#each S.apps as a (a.pkg)}
      {@const on = S.appOn(a)}
      {@const st = S.inst[a.pkg]}
      <div class="row" style:opacity={a.group && !on ? 0.5 : 1}>
        <button type="button" class="box" class:on class:radio={!!a.group} disabled={locked(a)} data-nav onclick={() => S.pickAirplay(a)}>{#if on}<i class="base-icon bi-check"></i>{/if}</button>
        <span class="txt">
          <span class="nm"><b>{a.name}</b><span class="tag" class:tag-gold={a.required && !a.group}>{tagOf(a)}</span></span>
          <span class="mono meta ellipsis">{a.pkg} · {a.versionName ? `${a.versionName} (${a.versionCode})` : a.versionCode}{#if a.size} · {a.size}{/if}</span>
        </span>
        {#if a.group}<span class="tag tag-teal" style="font-size:12px;padding:4px 10px">{S.t('i_pin')}</span>{/if}
        <span class="st" style:color={st === 'ok' ? 'var(--success)' : st === 'err' ? 'var(--danger-alt)' : 'var(--wiz-gold-light)'}>
          {#if st === 'ing' || st === 'ver'}<i class="base-icon bi-spinner tvlm-spin"></i>{/if}{#if st === 'ok'}<i class="base-icon bi-check-circle-fill"></i>{/if}{stText(a.pkg)}
        </span>
      </div>
    {/each}
    {#if !S.apps.length && !S.manifestError}
      <div class="row dim"><i class="base-icon bi-spinner tvlm-spin"></i><span class="mono" style="font-size:12px">GET {S.brand.manifestUrl}</span></div>
    {/if}
  </div>
  <Notice kind="warn">{S.t('i_air')}</Notice>
  <div><PillButton disabled={S.installing || !S.apps.length || !S.device || !S.canDirectInstall} onclick={() => S.installAll()}>{S.installing ? S.t('i_ing') + '…' : S.t('i_go')}</PillButton></div>
</div>

<style>
  .inst { display: flex; flex-direction: column; gap: 16px; }
  .body { margin-top: 6px; font-size: 13px; color: rgba(255,255,255,.55); }
  .list { display: flex; flex-direction: column; gap: 8px; }
  .box { width: 24px; height: 24px; border-radius: 6px; border: 2px solid rgba(255,255,255,.3); background: transparent; color: var(--wiz-gold-text); display: flex; align-items: center; justify-content: center; flex: none; padding: 0; }
  .box.radio { border-radius: 12px; }
  .box.on { border-color: var(--wiz-gold); background: var(--wiz-gold); }
  .box:disabled { cursor: default; }
  .box i { font-size: 11px; }
  .txt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .nm { display: flex; align-items: center; gap: 10px; }
  .nm b { font: 600 16px var(--font-display); }
  .meta { font-size: 12px; color: rgba(255,255,255,.5); display: block; }
  .st { display: flex; align-items: center; gap: 8px; width: 150px; justify-content: flex-end; font-size: 13px; }
</style>
