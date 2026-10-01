// Preload (bundled to dist/main/preload.cjs so the renderer stays sandboxed): `window.tvlm` = TvlmApi.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { TVLM_IPC, type TvlmApi } from './ipc.js';

const on = <A extends unknown[]>(channel: string, cb: (...args: A) => void) => {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
};

const api: TvlmApi = {
  brand: () => ipcRenderer.invoke(TVLM_IPC.brand),
  config: () => ipcRenderer.invoke(TVLM_IPC.config),
  configSet: (patch) => ipcRenderer.send(TVLM_IPC.configSet, patch),
  mirror: (target) => ipcRenderer.invoke(TVLM_IPC.mirror, target),
  usbHint: () => ipcRenderer.invoke(TVLM_IPC.usbHint),
  discover: (args) => ipcRenderer.invoke(TVLM_IPC.discover, args),
  onDiscoverFound: (cb) => on(TVLM_IPC.discoverFound, cb),
  connect: (args) => ipcRenderer.invoke(TVLM_IPC.connect, args),
  onUnauthorized: (cb) => on(TVLM_IPC.connectUnauthorized, cb),
  abort: (token) => ipcRenderer.send(TVLM_IPC.abort, token),
  pair: (hostPort, code) => ipcRenderer.invoke(TVLM_IPC.pair, hostPort, code),
  shell: (handle, cmd) => ipcRenderer.invoke(TVLM_IPC.shell, handle, cmd),
  authState: (handle) => ipcRenderer.invoke(TVLM_IPC.authState, handle),
  screencap: (handle) => ipcRenderer.invoke(TVLM_IPC.screencap, handle),
  reboot: (handle) => ipcRenderer.invoke(TVLM_IPC.reboot, handle),
  close: (handle) => ipcRenderer.invoke(TVLM_IPC.close, handle),
  installBegin: (handle, opts) => ipcRenderer.invoke(TVLM_IPC.installBegin, handle, opts),
  installChunk: (job, chunk) => ipcRenderer.invoke(TVLM_IPC.installChunk, job, chunk),
  installEnd: (job) => ipcRenderer.invoke(TVLM_IPC.installEnd, job),
};

contextBridge.exposeInMainWorld('tvlm', api);
