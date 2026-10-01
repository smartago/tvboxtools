<script lang="ts">
  // W7 Allow on the TV: waiting (retry counter, hint after 3 tries) → authorized. The TV mock shows the RSA dialog.
  import { getSession } from '../context.js';
  import TvMock from '../components/TvMock.svelte';
  import Notice from '../components/Notice.svelte';
  const S = getSession();
</script>

<div class="screen w7">
  <div>
    <h2 class="h2">{S.t('w7_title')}</h2>
    <p class="lead">{S.t('w7_body')}</p>
    {#if !S.authorized}
      <div class="wait"><i class="base-icon bi-spinner tvlm-spin" style="font-size:22px;color:var(--wiz-gold-light)"></i><span style="font-size:15px">{S.t('w7_wait')} {S.allowTries}</span></div>
      <!-- Measured on a real Android 9 box (23/9): the connection sits `unauthorized` for ever and
           the set shows nothing. One line of advice was not enough — these are the four that bring
           the dialog back, strongest first. -->
      {#if S.allowTries >= 3 || S.allowFailed}
        <div class="nod">
          {#if S.allowError}
            <!-- what actually happened, in the transport's own words -->
            <b class="err">{S.allowError}</b>
          {/if}
          <b>{S.t('w7_nodlg')}</b>
          <div><span class="tn">1</span><span>{S.t('w7_n1')}</span></div>
          <div><span class="tn">2</span><span>{S.t('w7_n2')}</span></div>
          <div><span class="tn">3</span><span>{S.t('w7_n3')}</span></div>
          <div><span class="tn">4</span><span>{S.t('w7_n4')}</span></div>
          {#if S.selfTarget}
            <!-- ON THE BOX ITSELF (Jim, 29/9: «ούτε έβγαλε allow»): Android asks once per key, and after a
                 data wipe the key is new — if adbd does not ask again, waiting is for ever. The way
                 out is two presses inside Developer options, so here is the button that opens them. -->
            <button type="button" class="devbtn tvlm-focus" data-nav onclick={() => S.openSelfSettings('dev')}>
              {S.t('ws_dev')} ↗
            </button>
          {/if}
        </div>
      {/if}
    {:else}
      <div class="okbox"><i class="base-icon bi-check-circle-fill" style="font-size:22px;color:var(--success)"></i><span style="font:600 16px var(--font-display)">{S.t('w7_ok')}</span></div>
    {/if}
  </div>
  <div class="tvwrap">
    <TvMock dim>
      <div class="dlg">
        <div class="dt">{S.t('w7_dlg')}</div>
        <div class="db">{S.t('w7_dlgB')}</div>
        <div class="fp mono">7F:3A:9C:12:B0:4E:55:D8:61:AA:0C:2F:9E:71:C3:08</div>
        <div class="always"><span class="cb" class:on={S.authorized}>{#if S.authorized}<i class="base-icon bi-check" style="font-size:10px;color:#111"></i>{/if}</span><span style="font-size:13px">{S.t('w7_always')}</span></div>
        <div class="btns"><span class="cancel">{S.t('cancel')}</span><span class="okb" class:tvlm-blink={!S.authorized}>OK</span></div>
      </div>
      {#if !S.authorized}
        <div class="remote"><span class="okc">OK</span><i class="base-icon bi-remote" style="font-size:16px;color:rgba(255,255,255,.8)"></i></div>
      {/if}
    </TvMock>
  </div>
</div>

<style>
  .devbtn { align-self: flex-start; margin-top: 10px; padding: 9px 16px; border-radius: 999px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.28); color: #fff; font: 700 13.5px var(--font-display); }
  .devbtn:hover { background: rgba(255,255,255,.16); }
  .nod { display: flex; flex-direction: column; gap: 9px; margin-top: 14px; padding: 16px 18px; border-radius: 14px; background: rgba(255,184,0,.08); border: 1px solid rgba(255,184,0,.35); }
  .nod b { font: 700 15px var(--font-display); }
  .nod b.err { color: var(--danger-alt); font: 600 13px var(--font-label); line-height: 1.5; }
  .nod > div { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; line-height: 1.5; color: rgba(255,255,255,.85); }
  .nod .tn { width: 18px; flex: none; font-weight: 700; color: var(--warning); }
  .w7 { display: grid; grid-template-columns: 420px 1fr; gap: 48px; align-content: start; padding-top: 10px; }
  .wait { margin-top: 26px; display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 14px; background: var(--card-bg); border: 1px solid var(--card-border); }
  .okbox { margin-top: 26px; display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 14px; background: rgba(34,197,94,.14); border: 1px solid rgba(34,197,94,.45); }
  .tvwrap { justify-self: center; }
  .dlg { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 400px; background: var(--tv-dialog); border-radius: 8px; padding: 22px 24px; color: var(--tv-text); box-shadow: 0 20px 60px rgba(0,0,0,.6); }
  .dt { font-size: 19px; font-weight: 500; }
  .db { font-size: 13px; color: var(--tv-sub); margin-top: 12px; line-height: 1.5; }
  .fp { font-size: 12px; margin-top: 6px; letter-spacing: .5px; }
  .always { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
  .cb { width: 16px; height: 16px; border-radius: 3px; border: 2px solid var(--tv-sub); display: flex; align-items: center; justify-content: center; }
  .cb.on { border-color: var(--tv-text); background: var(--tv-text); }
  .btns { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
  .cancel { padding: 8px 18px; border-radius: 4px; font-size: 13px; color: var(--tv-sub); }
  .okb { padding: 8px 22px; border-radius: 4px; font-size: 13px; font-weight: 500; background: var(--tv-text); color: #111; }
  .remote { position: absolute; right: 26px; bottom: 22px; display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,.6); border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: 8px 14px 8px 8px; }
  .okc { width: 30px; height: 30px; border-radius: 50%; background: var(--wiz-gold); color: var(--wiz-gold-text); display: flex; align-items: center; justify-content: center; font: 700 11px var(--font-display); animation: tvs-pulse 1.2s ease-out infinite; }
</style>
