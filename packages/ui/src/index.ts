// @tvlm/ui — the Svelte 5 UI every face mounts: `<App brand transport platform lang startIn …/>`.
// Import './styles.css' (or '@tvlm/ui/styles.css') once in the host.
export { default as App } from './App.svelte';
export { Session, WIZARD_STEPS, W, BOXES, TEST_IDS } from './state.svelte.js';
export type { SessionOptions, SessionHooks, SelfInfo, SettingsScreen, Target, Platform, Mode, BoxId, TaskPage, ScanState, InstStatus, TestId, StatusKind, HumanPrompt, GateAsk, GateRow, UiApp } from './state.svelte.js';
export { I18n, LANGS, TABLES, hasLang } from './i18n/index.svelte.js';
export type { StrKey, Strings } from './i18n/index.svelte.js';
export { getSession, provideSession } from './context.js';
export { hydratePrefs, prefGet, prefSet, prefClear } from './prefs.js';
export type { PrefsHost } from './prefs.js';
