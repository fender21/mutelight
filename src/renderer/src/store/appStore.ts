import { create } from 'zustand';
import type { WledDevice, AppSettings, DiscordState, DeviceStatus } from '@shared/types';

interface AppState {
  // Configuration
  devices: WledDevice[];
  isSyncing: boolean;
  lastSync: Date | null;

  // Settings
  settings: AppSettings | null;

  // Discord
  discordState: DiscordState;

  // Device status
  deviceStatuses: Map<string, DeviceStatus>;

  // Actions
  setDevices: (devices: WledDevice[]) => void;
  setSyncing: (syncing: boolean) => void;
  setSettings: (settings: AppSettings) => void;
  updateDiscordState: (state: Partial<DiscordState>) => void;
  updateDeviceStatus: (deviceId: string, status: DeviceStatus) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  devices: [],
  isSyncing: false,
  lastSync: null,
  settings: null,
  discordState: {
    connected: false,
    muted: false,
    deafened: false,
    speaking: false,
    streaming: false,
    inVoiceChannel: false,
    lastUpdate: Date.now(),
  },
  deviceStatuses: new Map(),

  // Actions
  setDevices: (devices) => set({ devices, lastSync: new Date() }),

  setSyncing: (syncing) => set({ isSyncing: syncing }),

  setSettings: (settings) => set({ settings }),

  updateDiscordState: (state) =>
    set((prev) => ({
      discordState: { ...prev.discordState, ...state, lastUpdate: Date.now() },
    })),

  updateDeviceStatus: (deviceId, status) =>
    set((prev) => {
      const newStatuses = new Map(prev.deviceStatuses);
      newStatuses.set(deviceId, status);
      return { deviceStatuses: newStatuses };
    }),
}));
