import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

import type { AppSettings, DiscordState, BeaconState, BeaconSource } from '@shared/types';

export interface BridgeStatus {
  paired: boolean;
  connected: boolean;
  pairingCode: string | null;
  serverUrl: string;
}

// The client is a thin gateway: pairing + status + a couple of local
// settings. All device management lives in the MuteBeacon dashboard.
export interface ElectronAPI {
  // Settings
  getSettings: () => Promise<AppSettings>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<{ success: boolean }>;

  // Beacon state
  getBeaconState: () => Promise<{ state: BeaconState; source: BeaconSource | null }>;
  setManualState: (state: BeaconState | null) => Promise<{ success: boolean }>;
  onBeaconStateChange: (
    callback: (state: BeaconState, meta: { source: BeaconSource | null }) => void
  ) => () => void;

  // Discord
  getDiscordStatus: () => Promise<DiscordState>;
  onDiscordConnectionChange: (callback: (connected: boolean) => void) => () => void;

  // Cloud bridge
  getBridgeStatus: () => Promise<BridgeStatus>;
  startPairing: () => Promise<{ code?: string; error?: string }>;
  unpair: () => Promise<{ success: boolean }>;
  onBridgeConnectionChange: (callback: (connected: boolean) => void) => () => void;
  onBridgePairingCode: (callback: (code: string) => void) => () => void;
  onBridgePaired: (callback: () => void) => () => void;

  // Window controls
  minimizeWindow: () => void;
  closeWindow: () => void;
}

function subscribe<Args extends unknown[]>(
  channel: string,
  callback: (...args: Args) => void
): () => void {
  const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
    callback(...(args as Args));
  ipcRenderer.on(channel, subscription);
  return () => ipcRenderer.removeListener(channel, subscription);
}

const electronAPI: ElectronAPI = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),

  getBeaconState: () => ipcRenderer.invoke('beacon:get-state'),
  setManualState: (state) => ipcRenderer.invoke('beacon:set-manual-state', state),
  onBeaconStateChange: (callback) => subscribe('beacon:state-changed', callback),

  getDiscordStatus: () => ipcRenderer.invoke('discord:get-status'),
  onDiscordConnectionChange: (callback) => subscribe('discord:connection-changed', callback),

  getBridgeStatus: () => ipcRenderer.invoke('bridge:get-status'),
  startPairing: () => ipcRenderer.invoke('bridge:start-pairing'),
  unpair: () => ipcRenderer.invoke('bridge:unpair'),
  onBridgeConnectionChange: (callback) => subscribe('bridge:connection-changed', callback),
  onBridgePairingCode: (callback) => subscribe('bridge:pairing-code', callback),
  onBridgePaired: (callback) => subscribe('bridge:paired', callback),

  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript declaration for renderer process
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
