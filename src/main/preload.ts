import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

import type { WledDevice, LightZone, MdnsDevice, VoiceState, DiscordState } from '@shared/types';

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
  previewDeviceColor: (deviceId: string, color: string, brightness: number) =>
    Promise<{ success: boolean; error?: string }>;
  previewZoneColor: (zoneId: string, color: string, brightness: number) =>
    Promise<{ success: boolean; error?: string }>;
  restoreDeviceState: (deviceId: string) =>
    Promise<{ success: boolean; error?: string }>;

  // Zone CRUD
  createZone: (zone: Omit<LightZone, 'id' | 'created_at'>) =>
    Promise<{ success: boolean; zone?: LightZone; error?: string }>;
  updateZone: (id: string, updates: Partial<LightZone>) =>
    Promise<{ success: boolean; zone?: LightZone; error?: string }>;
  deleteZone: (id: string) =>
    Promise<{ success: boolean; error?: string }>;

  // Configuration
  getDevices: () => Promise<WledDevice[]>;
  getZones: () => Promise<LightZone[]>;

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
  previewDeviceColor: (deviceId, color, brightness) =>
    ipcRenderer.invoke('devices:preview-color', deviceId, color, brightness),

  previewZoneColor: (zoneId, color, brightness) =>
    ipcRenderer.invoke('zones:preview-color', zoneId, color, brightness),

  restoreDeviceState: (deviceId) =>
    ipcRenderer.invoke('devices:restore-state', deviceId),

  // Zone CRUD
  createZone: (zone) =>
    ipcRenderer.invoke('zones:create', zone),

  updateZone: (id, updates) =>
    ipcRenderer.invoke('zones:update', id, updates),

  deleteZone: (id) =>
    ipcRenderer.invoke('zones:delete', id),

  // Configuration
  getDevices: () =>
    ipcRenderer.invoke('config:get-devices'),

  getZones: () =>
    ipcRenderer.invoke('config:get-zones'),

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
