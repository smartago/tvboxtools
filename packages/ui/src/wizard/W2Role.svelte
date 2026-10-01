<script lang="ts">
  // W2 Role (brand.roleStep only): owner / reseller (+ reseller code) · the Google-account warning.
  import { getSession } from '../context.js';
  import Card from '../components/Card.svelte';
  import Notice from '../components/Notice.svelte';
  const S = getSession();
  const roles = $derived([
    { id: 'owner' as const, title: S.t('w2_owner'), desc: S.t('w2_ownerD'), icon: 'plui-icon pi-opt-general' },
    { id: 'reseller' as const, title: S.t('w2_res'), desc: S.t('w2_resD'), icon: 'plui-icon pi-store' },
  ]);
</script>

<div class="screen w2">
  <div class="left">
    <h2 class="h2" style="font-size:38px">{S.t('w2_title')}</h2>
    <div style="margin-top:26px"><Notice kind="warn">{S.t('w2_note')}</Notice></div>
  </div>
  <div class="right">
    {#each roles as r (r.id)}
      <Card sel={S.role === r.id} padding="18px 20px" onpick={() => (S.role = r.id)}>
        <span class="ico"><i class={r.icon}></i></span>
        <span class="txt"><b>{r.title}</b><span>{r.desc}</span></span>
      </Card>
    {/each}
    {#if S.role === 'reseller'}
      <label class="field code"><span>{S.t('w2_code')}</span><input class="tvlm-input" bind:value={S.resellerCode} style="font-family:var(--font-ui);font-size:16px;letter-spacing:1px" /></label>
    {/if}
  </div>
</div>

<style>
  .w2 { display: grid; grid-template-columns: 440px 1fr; gap: 56px; align-content: start; }
  .left { padding-top: 20px; }
  .right { display: flex; flex-direction: column; gap: 14px; padding-top: 20px; }
  .ico { width: 52px; height: 52px; border-radius: 50%; background: rgba(255,255,255,.1); display: flex; align-items: center; justify-content: center; flex: none; }
  .ico i { font-size: 22px; }
  .txt { display: flex; flex-direction: column; gap: 4px; text-align: left; flex: 1; }
  .txt b { font: 700 19px var(--font-display); }
  .txt span { font-size: 14px; color: rgba(255,255,255,.65); }
  .code { margin-top: 6px; max-width: 320px; }
</style>
