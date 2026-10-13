<script lang="ts">
  // PLUI TvSwitch (DS components/options/TvSwitch.jsx): track 70×35 white/20 (ON = accent), knob 33 black, 150ms slide.
  // The prototype renders it at scale(.8). Accent here = the wizard teal.
  interface Props {
    on: boolean;
    disabled?: boolean;
    onchange?: (on: boolean) => void;
    scale?: number;
    label?: string;
  }
  let { on, disabled = false, onchange, scale = 0.8, label = 'switch' }: Props = $props();
</script>

<button type="button" class="sw" class:on role="switch" aria-checked={on} aria-label={label} {disabled} data-nav onclick={() => !disabled && onchange?.(!on)} style:transform="scale({scale})">
  <span class="track"><span class="knob"></span></span>
</button>

<style>
  .sw { background: none; border: none; padding: 0; transform-origin: right center; flex: none; }
  .sw:disabled { cursor: default; }
  .track { display: block; width: 70px; height: 35px; border-radius: 999px; background: var(--wash-20); position: relative; transition: background var(--dur-fast); }
  .sw.on .track { background: var(--wiz-teal); }
  .knob { position: absolute; top: 1px; left: 1px; width: 33px; height: 33px; border-radius: 999px; background: #000; transition: left var(--dur-fast); }
  .sw.on .knob { left: 36px; }
  .sw:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; border-radius: 999px; }
</style>
