// Voice state enum (priority order - highest priority wins)
export type VoiceState = 'idle' | 'connected' | 'unmuted' | 'speaking' | 'muted' | 'deafened' | 'streaming';

// Per-state light configuration
export interface StateLightConfig {
  color: string;       // Hex color (e.g., '#FF0000')
  brightness: number;  // 0-255
  enabled: boolean;    // Whether to trigger lights for this state
}

// All state configurations
export interface StateColors {
  idle: StateLightConfig;
  connected: StateLightConfig;
  speaking: StateLightConfig;
  muted: StateLightConfig;
  deafened: StateLightConfig;
  streaming: StateLightConfig;
}

// Local data types
export interface WledDevice {
  id: string;
  name: string;
  ip_address: string;
  // Legacy colors (backward compatibility)
  muted_color: string;
  unmuted_color: string;
  // Multi-state configuration (optional, takes precedence over legacy)
  stateColors?: StateColors;
  // Device-wide settings
  defaultBrightness?: number;  // 0-255, default 255
  transitionTime?: number;     // milliseconds, default 0
  created_at?: number;
}

export interface LightZone {
  id: string;
  device_id: string;
  name: string;
  start_led: number;
  end_led: number;
  // Legacy colors (backward compatibility)
  muted_color: string;
  unmuted_color: string;
  // Zone-specific overrides (optional, inherits from device if not set)
  stateColors?: Partial<StateColors>;
  brightness?: number;       // Zone brightness override
  transitionTime?: number;   // Zone transition override
  created_at?: number;
}

// mDNS discovery types
export interface MdnsDevice {
  name: string;
  ip: string;
  port: number;
  type: string;
}

// Application state types
export interface AppConfig {
  devices: WledDevice[];
  zones: LightZone[];
  lastSync: number | null;
}

export interface AppSettings {
  autoStart: boolean;
  minimizeToTray: boolean;
  pollingInterval: number; // milliseconds
  theme: 'dark' | 'light'; // future-proofing
}

export interface DiscordState {
  connected: boolean;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;        // User is actively talking
  streaming: boolean;       // User is screen sharing
  inVoiceChannel: boolean;  // User is in a voice channel
  lastUpdate: number;
}

export interface DeviceStatus {
  deviceId: string;
  online: boolean;
  lastSeen: number;
  error?: string;
}

// IPC message types
export type IpcChannels =
  | 'devices:create'
  | 'devices:update'
  | 'devices:delete'
  | 'devices:discover'
  | 'devices:test-connection'
  | 'devices:preview-color'
  | 'devices:restore-state'
  | 'zones:create'
  | 'zones:update'
  | 'zones:delete'
  | 'zones:preview-color'
  | 'config:get-devices'
  | 'config:get-zones'
  | 'settings:get'
  | 'settings:update'
  | 'discord:get-status'
  | 'discord:mute-state-changed'
  | 'discord:state-changed'
  | 'discord:connection-changed'
  | 'devices:status-changed'
  | 'window:minimize'
  | 'window:maximize'
  | 'window:close';
