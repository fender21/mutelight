import Store from 'electron-store';
import { randomUUID } from 'crypto';
import type { AppConfig, AppSettings, WledDevice } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/constants';

interface StoreSchema {
  config: AppConfig;
  settings: AppSettings;
}

class ConfigService {
  private store: Store<StoreSchema>;

  constructor() {
    this.store = new Store<StoreSchema>({
      defaults: {
        config: {
          devices: [],
          lastSync: null,
        },
        settings: DEFAULT_SETTINGS,
      },
      schema: {
        config: {
          type: 'object',
          properties: {
            devices: { type: 'array' },
            lastSync: { type: ['number', 'null'] },
          },
        },
        settings: {
          type: 'object',
          properties: {
            autoStart: { type: 'boolean' },
            minimizeToTray: { type: 'boolean' },
            pollingInterval: { type: 'number', minimum: 100, maximum: 5000 },
            theme: { type: 'string', enum: ['dark', 'light'] },
          },
        },
      },
    });
  }

  // Config methods
  getConfig(): AppConfig {
    return this.store.get('config');
  }

  setConfig(config: Partial<AppConfig>): void {
    const current = this.getConfig();
    this.store.set('config', { ...current, ...config });
  }

  // Settings methods
  getSettings(): AppSettings {
    return this.store.get('settings');
  }

  updateSettings(settings: Partial<AppSettings>): void {
    const current = this.getSettings();
    this.store.set('settings', { ...current, ...settings });
  }

  // Device management
  updateDevices(devices: WledDevice[]): void {
    this.store.set('config.devices', devices);
    this.store.set('config.lastSync', Date.now());
  }

  getDevices(): WledDevice[] {
    return this.store.get('config.devices');
  }

  // Device CRUD operations
  createDevice(device: Omit<WledDevice, 'id' | 'created_at'>): WledDevice {
    const newDevice: WledDevice = {
      ...device,
      id: randomUUID(),
      created_at: Date.now(),
    };

    const devices = this.getDevices();
    devices.push(newDevice);
    this.store.set('config.devices', devices);
    this.store.set('config.lastSync', Date.now());

    return newDevice;
  }

  updateDevice(id: string, updates: Partial<WledDevice>): WledDevice | null {
    const devices = this.getDevices();
    const index = devices.findIndex(d => d.id === id);

    if (index === -1) return null;

    devices[index] = { ...devices[index], ...updates };
    this.store.set('config.devices', devices);
    this.store.set('config.lastSync', Date.now());

    return devices[index];
  }

  deleteDevice(id: string): boolean {
    const devices = this.getDevices();
    const filtered = devices.filter(d => d.id !== id);

    if (filtered.length === devices.length) return false;

    this.store.set('config.devices', filtered);
    this.store.set('config.lastSync', Date.now());

    return true;
  }

  // Utility
  reset(): void {
    this.store.clear();
  }
}

export const configService = new ConfigService();
