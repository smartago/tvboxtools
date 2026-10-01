/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set at build time by `build:launcher` (vite.config.ts `define`). One product since 27/9/2026. */
  readonly TVLM_BRAND?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
