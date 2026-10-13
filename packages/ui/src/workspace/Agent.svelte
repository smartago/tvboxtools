<script lang="ts">
  // WS AI agent — two entries (one prompt · MCP server), one command gate (DESIGN_NOTES §8).
  // The gate panel is live: every command that ran on this box with its verdict, pending ones with Run / Deny,
  // and an input to push a raw command through the same gate.
  import { getSession } from '../context.js';
  import Card from '../components/Card.svelte';
  import Notice from '../components/Notice.svelte';
  import PillButton from '../components/PillButton.svelte';
  const S = getSession();
  const mcp = $derived(S.task === 'agentmcp');
  const modes = $derived([
    { id: 'agent' as const, title: S.t('a_mode_prompt'), desc: S.t('a_mode_promptD'), tag: S.t('a_rec'), icon: 'pi-bullhorn', teal: true },
    { id: 'agentmcp' as const, title: S.t('a_mode_mcp'), desc: S.t('a_mode_mcpD'), tag: S.t('a_adv'), icon: 'pi-brain', teal: false },
  ]);
  const tools = ['discover', 'connect', 'check', 'install', 'provision', 'link', 'test', 'screenshot', 'report'];
  let raw = $state('');
  function send() {
    const c = raw.trim();
    if (!c) return;
    raw = '';
    void S.runRaw(c);
  }
  const rowColor = (st: string) => (st === 'blocked' ? 'var(--danger-alt)' : st === 'pending' ? 'var(--warning)' : st === 'denied' ? 'rgba(255,255,255,.5)' : 'var(--success)');
  const rowIcon = (st: string) => (st === 'blocked' ? 'bi-x' : st === 'pending' ? 'bi-warning-fill' : 'bi-check-circle-fill');
  const rowNote = (st: string) => (st === 'auto' ? S.t('a_auto') : st === 'pending' ? S.t('a_ask') : st === 'blocked' ? S.t('a_block') : st === 'denied' ? S.t('g_denied') : S.t('g_ran'));
</script>

<div class="agent">
  <div class="left">
    <div><h2 class="h2-ws">{mcp ? S.t('a_title_mcp') : S.t('a_title_easy')}</h2><div class="intro">{S.t('a_intro')}</div></div>
    <div class="modes">
      {#each modes as m (m.id)}
        <Card sel={S.task === m.id} column padding="16px 18px" onpick={() => (S.task = m.id)}>
          <div class="top"><span class="ico-circle"><i class="plui-icon {m.icon}"></i></span><span class="tag" class:tag-teal={m.teal}>{m.tag}</span></div>
          <b class="ttl">{m.title}</b>
          <span class="desc">{m.desc}</span>
        </Card>
      {/each}
    </div>
    {#if !mcp}
      <div class="box">
        <div class="bh"><b>{S.t('a_prompt_title')}</b><span class="dim" style="font-size:12px;white-space:nowrap">{S.t('a_works')}</span></div>
        <div class="prompt">{S.promptText}</div>
        <div class="bf"><PillButton size="sm" style="height:42px;padding:0 22px" onclick={() => S.copy(S.promptText)}>{S.copied ? `${S.t('a_copied')} ✓` : S.t('a_copy')}</PillButton><span class="dim" style="font-size:13px">{S.t('a_prompt_hint')}</span></div>
      </div>
      <div class="does">
        <div class="eyebrow">{S.t('a_does')}</div>
        <div class="dgrid">
          {#each [S.t('a_d1'), S.t('a_d2'), S.t('a_d3'), S.t('a_d4')] as d, i (i)}
            <div class="drow"><span class="num" style="background:rgba(200,144,58,.25);color:var(--wiz-gold-light)">{i + 1}</span>{d}</div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="box">
        <div class="bh"><b>{S.t('a_mcp_title')}</b><span class="on"><span class="led"></span>{S.t('a_on')}</span></div>
        <pre class="mono code">{S.mcpText}</pre>
        <div class="bf"><PillButton size="sm" style="height:42px;padding:0 22px" onclick={() => S.copy(S.mcpText)}>{S.copied ? `${S.t('a_copied')} ✓` : S.t('a_copy')}</PillButton><span class="dim" style="font-size:13px">{S.t('a_mcp_hint')}</span></div>
        <div class="eyebrow" style="margin-top:4px">{S.t('a_tools')}</div>
        <div class="tools">{#each tools as t (t)}<span class="tool mono">{t}</span>{/each}<span class="tool mono gated">shell (gated)</span></div>
      </div>
    {/if}
  </div>
  <div class="right">
    <div class="gh"><span class="eyebrow">{S.t('a_gate')}</span><span class="mono dim" style="font-size:11px">{mcp ? S.t('a_via_mcp') : S.t('a_via_prompt')}</span></div>
    <div class="rows">
      {#each S.gateRows as g (g.entry)}
        <div class="grow" class:pending={g.state === 'pending'}>
          <i class="base-icon {rowIcon(g.state)}" style:color={rowColor(g.state)}></i>
          <span class="gt"><span class="mono gcmd ellipsis">$ {g.cmd}</span><span class="gn" style:color={rowColor(g.state)}>{rowNote(g.state)}</span></span>
          {#if g.state === 'pending' && g.ask}
            {@const ask = g.ask}
            <span class="gb"><PillButton kind="outline" size="xs" onclick={() => ask.resolve(false)}>{S.t('deny')}</PillButton><PillButton size="xs" style="animation:tvs-pulse 1.4s ease-out infinite" onclick={() => ask.resolve(true)}>{S.t('run')}</PillButton></span>
          {/if}
        </div>
      {/each}
      {#if !S.gateRows.length}<div class="dim" style="font-size:13px;padding:6px 2px">{S.t('g_empty')}</div>{/if}
    </div>
    <form class="rawrow" onsubmit={(e) => { e.preventDefault(); send(); }}>
      <input class="tvlm-input" bind:value={raw} placeholder={S.t('g_input')} disabled={!S.device} />
      <PillButton kind="ghost" size="sm" type="submit" disabled={!S.device || !raw.trim()} nav={false}>{S.t('g_send')}</PillButton>
    </form>
    <Notice kind="info" center><span style="font-size:13px;line-height:1.45">{S.t('a_note')}</span></Notice>
  </div>
</div>

<style>
  .agent { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 28px; align-items: start; }
  .left { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .intro { margin-top: 6px; font-size: 14px; line-height: 1.5; color: rgba(255,255,255,.65); }
  .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .top { display: flex; align-items: center; justify-content: space-between; width: 100%; }
  .ttl { font: 700 18px var(--font-display); margin-top: 12px; text-align: left; }
  .desc { font-size: 13px; line-height: 1.5; color: rgba(255,255,255,.68); text-align: left; margin-top: 4px; }
  .box { display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: 16px; background: var(--row-bg); border: 1px solid var(--card-border); }
  .bh { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .bh b { font: 600 15px var(--font-display); }
  .prompt { padding: 14px 16px; border-radius: 10px; background: var(--gray-100); color: var(--ink); font-size: 14px; line-height: 1.6; text-wrap: pretty; }
  .bf { display: flex; align-items: center; gap: 12px; }
  .does { display: flex; flex-direction: column; gap: 8px; }
  .dgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .drow { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border-radius: 10px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); font-size: 13px; }
  .on { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--success); white-space: nowrap; }
  .led { width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 8px var(--success); }
  .code { margin: 0; font-size: 13px; line-height: 1.7; color: var(--tv-text); padding: 12px 14px; border-radius: 10px; background: rgba(0,0,0,.4); white-space: pre-wrap; }
  .tools { display: flex; flex-wrap: wrap; gap: 6px; }
  .tool { font-size: 12px; padding: 5px 9px; border-radius: 6px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12); }
  .tool.gated { background: rgba(255,184,0,.14); border-color: rgba(255,184,0,.4); color: var(--warning); }
  .right { display: flex; flex-direction: column; gap: 12px; margin-top: 52px; }
  .gh { display: flex; align-items: center; justify-content: space-between; }
  .rows { display: flex; flex-direction: column; gap: 8px; }
  .grow { display: flex; align-items: flex-start; gap: 14px; padding: 12px 16px; border-radius: 12px; background: var(--row-bg); border: 1px solid var(--row-border); }
  .grow.pending { background: rgba(255,184,0,.08); border-color: rgba(255,184,0,.4); }
  .grow i { font-size: 18px; width: 22px; text-align: center; margin-top: 2px; }
  .gt { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
  .gcmd { display: block; font-size: 13px; font-weight: 500; }
  .gn { font-size: 12px; }
  .gb { display: flex; gap: 8px; }
  .rawrow { display: flex; gap: 8px; }
  .rawrow .tvlm-input { height: 40px; font-size: 13px; }
</style>
