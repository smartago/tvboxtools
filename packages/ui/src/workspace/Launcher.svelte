<script lang="ts">
  // WS Default launcher: the brand's home methods (brand.homeMethods, in its order) · Set as home / Verify / Restore stock ·
  // the current home app + the TV preview (stock → chooser → ours).
  import { getSession } from '../context.js';
  import Card from '../components/Card.svelte';
  import Notice from '../components/Notice.svelte';
  import PillButton from '../components/PillButton.svelte';
  import MockHome from './MockHome.svelte';
  const S = getSession();
  const preview = $derived<'ours' | 'ask' | 'stock'>(S.homeSet ? 'ours' : S.homeAsk ? 'ask' : 'stock');
</script>

<div class="lau">
  <div class="left">
    <div><h2 class="h2-ws">{S.t('l_title')}</h2><div class="body">{S.t('l_body', { app: S.targetName })}</div></div>
    {#if !S.appInstalled}
      <Notice kind="warn" center>
        <span style="flex:1">{S.t('l_need', { app: S.targetName })}</span>
        <PillButton size="xs" onclick={() => (S.task = 'inst')}>{S.t('l_goInst')} »</PillButton>
      </Notice>
    {/if}
    <div class="methods">
      {#each S.homeMethods as m (m.id)}
        {@const dis = m.na || !S.appInstalled}
        <Card sel={S.homeSel === m.id} padding="16px 18px" disabled={dis} onpick={() => (S.homeMethod = m.id)}>
          <span class="ico-circle" style="align-self:flex-start"><i class="{m.icon.startsWith('pi-') ? 'plui-icon' : 'base-icon'} {m.icon}"></i></span>
          <span class="txt">
            <span class="nm"><b>{m.title}</b>{#if m.tag}<span class="tag" class:tag-teal={m.tagKind === 'teal'} class:tag-warn={m.tagKind === 'warn'}>{m.tag}</span>{/if}</span>
            <span class="desc">{m.desc}</span>
            <span class="mono code ellipsis">{m.code}</span>
            {#if m.warn}<span class="warn"><i class="base-icon bi-warning-fill"></i>{m.warn}</span>{/if}
          </span>
        </Card>
      {/each}
    </div>
    {#if S.homeAsk}
      <Notice kind="gold" center>
        <span style="flex:1">{S.t('l_ask', { app: S.targetName })}</span>
        <PillButton size="sm" onclick={() => S.homePicked()}>{S.t('l_picked')}</PillButton>
      </Notice>
    {/if}
    <div class="acts">
      <PillButton disabled={S.homeBtnDisabled || !S.device} onclick={() => S.setHome()}>{S.homeBusy ? S.t('st_run') + '…' : S.t('l_apply')}</PillButton>
      <PillButton kind="ghost" disabled={!S.appInstalled || !S.device} style="font:600 14px var(--font-display);padding:0 22px" onclick={() => S.verifyHome()}>{S.t('l_verify')}</PillButton>
      {#if S.stockDisabled}<PillButton kind="outline" style="font:500 14px var(--font-display)" onclick={() => S.restoreStock()}>{S.t('l_restore')}</PillButton>{/if}
      {#if S.homeSet}<span class="ok"><i class="base-icon bi-check-circle-fill"></i>{S.t('l_ok', { app: S.targetName })}</span>{/if}
    </div>
  </div>
  <div class="right">
    <div class="cur"><b>{S.t('l_cur')}</b><span class="mono" style:color={S.homeSet ? 'var(--success)' : 'rgba(255,255,255,.55)'}>{S.curHomeText}</span></div>
    <MockHome mode={preview} />
    <div class="mono cmd ellipsis">$ cmd package resolve-activity --brief -c android.intent.category.HOME</div>
  </div>
</div>

<style>
  .lau { display: grid; grid-template-columns: minmax(0, 1fr) 440px; gap: 28px; align-items: start; }
  .left { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .body { margin-top: 6px; font-size: 14px; color: rgba(255,255,255,.65); }
  .methods { display: flex; flex-direction: column; gap: 10px; }
  .txt { display: flex; flex-direction: column; gap: 4px; text-align: left; flex: 1; min-width: 0; }
  .nm { display: flex; align-items: center; gap: 10px; }
  .nm b { font: 700 18px var(--font-display); }
  .desc { font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.68); }
  .code { display: block; font-size: 12px; color: rgba(255,255,255,.55); padding: 7px 10px; border-radius: 8px; background: rgba(0,0,0,.3); margin-top: 4px; }
  .warn { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; line-height: 1.45; color: var(--warning); margin-top: 4px; }
  .warn i { font-size: 14px; margin-top: 2px; }
  .acts { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .ok { display: flex; align-items: center; gap: 8px; color: var(--success); font-size: 14px; font-weight: 600; }
  .right { display: flex; flex-direction: column; gap: 10px; margin-top: 52px; }
  .cur { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .cur b { font: 600 15px var(--font-display); color: rgba(255,255,255,.85); }
  .cur .mono { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .cmd { font-size: 12px; color: rgba(255,255,255,.5); padding: 10px 12px; border-radius: 8px; background: rgba(0,0,0,.3); }
</style>
