import type { AppSettings } from './types';

// Discord Application credentials
// Get these from https://discord.com/developers/applications
export const DISCORD_CLIENT_ID = '1439804981132660797';
// IMPORTANT: You must add the client secret from your Discord application
// Go to your app in Discord Developer Portal > OAuth2 > Client Secret
export const DISCORD_CLIENT_SECRET = 'W7xc1bYos5c2ao9H2jhju02O4LdK72MS';

// mDNS discovery constants
export const MDNS_SERVICE_TYPE = '_wled._tcp.local';
export const MDNS_DISCOVERY_TIMEOUT = 10000; // 10 seconds
export const MDNS_SCAN_INTERVAL = 60000; // 1 minute for background scans

// Default settings
export const DEFAULT_SETTINGS: AppSettings = {
  autoStart: false,
  minimizeToTray: true,
  pollingInterval: 500, // 500ms default
  theme: 'dark',
};

// WLED API constants
export const WLED_TIMEOUT = 5000; // 5 seconds
export const WLED_RETRY_ATTEMPTS = 3;
export const WLED_RETRY_DELAY = 1000; // 1 second

// Discord reconnection
export const DISCORD_RECONNECT_DELAY = 5000; // 5 seconds
export const DISCORD_MAX_RECONNECT_ATTEMPTS = 10;

// UI Colors (matching spec)
export const COLORS = {
  background: {
    primary: '#0a0a0a',
    secondary: '#1a1a1a',
    tertiary: '#2a2a2a',
  },
  accent: {
    green: '#22c55e',
    purple: '#a855f7',
  },
  status: {
    online: '#22c55e',
    offline: '#ef4444',
    warning: '#f59e0b',
  },
  text: {
    primary: '#ffffff',
    secondary: '#a0a0a0',
    muted: '#6b7280',
  },
};
