import { getContext, setContext } from 'svelte';
import type { Session } from './state.svelte.js';

const KEY = Symbol('tvlm-session');

export function provideSession(s: Session): Session {
  setContext(KEY, s);
  return s;
}

export function getSession(): Session {
  const s = getContext<Session | undefined>(KEY);
  if (!s) throw new Error('@tvlm/ui: no Session in context — render inside <App>');
  return s;
}
