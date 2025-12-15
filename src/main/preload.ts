import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

import type { WledDevice, MdnsDevice, VoiceState, DiscordState, EffectConfig, WledEffect, CapturedWledState } from '@shared/types';

// Define the exposed API interface
export interface ElectronAPI {
  // Device CRUD
  createDevice: (device: Omit<WledDevice, 'id' | 'created_at'>) =>
    Promise<{ success: boolean; device?: WledDevice; error?: string }>;
  updateDevice: (id: string, updates: Partial<WledDevice>) =>
    Promise<{ success: boolean; device?: WledDevice; error?: string }>;
  deleteDevice: (id: string) =>
    Promise<{ success: boolean; error?: string }>;
  discoverDevices: () =>
    Promise<{ success: boolean; devices: MdnsDevice[]; error?: string }>;
  testConnection: (ipAddress: string) =>
    Promise<{ success: boolean; online: boolean; error?: string }>;

  // Preview and restore
  previewDeviceColor: (deviceId: string, color: string, brightness: number, effect?: EffectConfig) =>
    Promise<{ success: boolean; error?: string }>;
  restoreDeviceState: (deviceId: string) =>
    Promise<{ success: boolean; error?: string }>;

  // Effects and state capture
  getDeviceEffects: (deviceId: string) =>
    Promise<{ success: boolean; effects: WledEffect[]; error?: string }>;
  captureDeviceState: (deviceId: string) =>
    Promise<{ success: boolean; state?: CapturedWledState; error?: string }>;
  restoreToOriginalState: (deviceId: string) =>
    Promise<{ success: boolean; error?: string }>;

  // Configuration
  getDevices: () => Promise<WledDevice[]>;

  // Settings
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<void>;

  // Discord status
  onMuteStateChange: (callback: (isMuted: boolean) => void) => () => void;
  onDiscordConnectionChange: (callback: (connected: boolean) => void) => () => void;
  onDiscordStateChange: (callback: (effectiveState: VoiceState, fullState: DiscordState) => void) => () => void;
  getDiscordStatus: () => Promise<DiscordState>;

  // Device status
  onDeviceStatusChange: (callback: (status: any) => void) => () => void;

  // Window controls
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
}

// Expose protected methods via contextBridge
const electronAPI: ElectronAPI = {
  // Device CRUD
  createDevice: (device) =>
    ipcRenderer.invoke('devices:create', device),

  updateDevice: (id, updates) =>
    ipcRenderer.invoke('devices:update', id, updates),

  deleteDevice: (id) =>
    ipcRenderer.invoke('devices:delete', id),

  discoverDevices: () =>
    ipcRenderer.invoke('devices:discover'),

  testConnection: (ipAddress) =>
    ipcRenderer.invoke('devices:test-connection', ipAddress),

  // Preview and restore
  previewDeviceColor: (deviceId, color, brightness, effect?) =>
    ipcRenderer.invoke('devices:preview-color', deviceId, color, brightness, effect),

  restoreDeviceState: (deviceId) =>
    ipcRenderer.invoke('devices:restore-state', deviceId),

  // Effects and state capture
  getDeviceEffects: (deviceId) =>
    ipcRenderer.invoke('devices:get-effects', deviceId),

  captureDeviceState: (deviceId) =>
    ipcRenderer.invoke('devices:capture-state', deviceId),

  restoreToOriginalState: (deviceId) =>
    ipcRenderer.invoke('devices:restore-original', deviceId),

  // Configuration
  getDevices: () =>
    ipcRenderer.invoke('config:get-devices'),

  getSettings: () =>
    ipcRenderer.invoke('settings:get'),

  updateSettings: (settings: any) =>
    ipcRenderer.invoke('settings:update', settings),

  onMuteStateChange: (callback: (isMuted: boolean) => void) => {
    const subscription = (_event: IpcRendererEvent, isMuted: boolean) => callback(isMuted);
    ipcRenderer.on('discord:mute-state-changed', subscription);
    return () => ipcRenderer.removeListener('discord:mute-state-changed', subscription);
  },

  onDiscordConnectionChange: (callback: (connected: boolean) => void) => {
    const subscription = (_event: IpcRendererEvent, connected: boolean) => callback(connected);
    ipcRenderer.on('discord:connection-changed', subscription);
    return () => ipcRenderer.removeListener('discord:connection-changed', subscription);
  },

  onDiscordStateChange: (callback: (effectiveState: VoiceState, fullState: DiscordState) => void) => {
    const subscription = (_event: IpcRendererEvent, effectiveState: VoiceState, fullState: DiscordState) =>
      callback(effectiveState, fullState);
    ipcRenderer.on('discord:state-changed', subscription);
    return () => ipcRenderer.removeListener('discord:state-changed', subscription);
  },

  getDiscordStatus: () =>
    ipcRenderer.invoke('discord:get-status'),

  onDeviceStatusChange: (callback: (status: any) => void) => {
    const subscription = (_event: IpcRendererEvent, status: any) => callback(status);
    ipcRenderer.on('devices:status-changed', subscription);
    return () => ipcRenderer.removeListener('devices:status-changed', subscription);
  },

  minimizeWindow: () =>
    ipcRenderer.send('window:minimize'),

  maximizeWindow: () =>
    ipcRenderer.send('window:maximize'),

  closeWindow: () =>
    ipcRenderer.send('window:close'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript declaration for renderer process
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
