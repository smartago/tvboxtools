<script lang="ts">
  // Dev-only "tweaks" bar (top-right, like the prototype): brand · lang · platform · scenario · startIn · box · speed.
  // Each change rewrites the query string and reloads — the app itself never reads these.
  interface Props {
    q: Record<string, string>;
  }
  let { q }: Props = $props();
  const opts: Array<[string, string[]]> = [
    // which EDITION: 0 = sideload (downloads APKs), 1 = the Play build (never does)
    ['play', ['0', '1']],
    ['lang', ['en', 'el']],
    ['platform', ['desktop', 'web', 'android']],
    ['scenario', ['happy', 'unauthorized', 'accounts', 'nodevices']],
    ['startIn', ['wizard', 'workspace']],
    ['box', ['xiaomi', 'googletv', 'androidtv', 'other', 'firetv']],
    ['speed', ['1', '0.3', '0']],
  ];
  let open = $state(true);
  function set(k: string, v: string) {
    const u = new URL(location.href);
    u.searchParams.set(k, v);
    location.href = u.toString();
  }
</script>

<div class="tweaks" class:open>
  <button type="button" class="tab" onclick={() => (open = !open)}>tweaks {open ? '▸' : '◂'}</button>
  {#if open}
    <div class="rows">
      {#each opts as [k, vals] (k)}
        <label><span>{k}</span><select value={q[k] ?? vals[0]} onchange={(e) => set(k, (e.currentTarget as HTMLSelectElement).value)}>{#each vals as v (v)}<option value={v}>{v}</option>{/each}</select></label>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tweaks { position: fixed; top: 8px; right: 8px; z-index: 50; display: flex; align-items: flex-start; gap: 6px; font: 11px/1.4 ui-monospace, Menlo, monospace; }
  .tab { background: rgba(0,0,0,.6); color: #EAC35A; border: 1px solid rgba(255,255,255,.2); border-radius: 6px; padding: 4px 8px; font: inherit; cursor: pointer; }
  .rows { display: flex; flex-direction: column; gap: 4px; background: rgba(0,0,0,.7); border: 1px solid rgba(255,255,255,.2); border-radius: 8px; padding: 8px; backdrop-filter: blur(6px); }
  label { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: rgba(255,255,255,.7); }
  select { font: inherit; background: #1A2744; color: #fff; border: 1px solid rgba(255,255,255,.25); border-radius: 4px; padding: 2px 4px; }
</style>
