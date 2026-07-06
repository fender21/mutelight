import type { AppSettings } from './types';

// Discord Application credentials
// Get these from https://discord.com/developers/applications
export const DISCORD_CLIENT_ID = '1439804981132660797';
// Client secret is loaded from a local .env file (gitignored), never
// committed to source. Create a .env in the repo root with:
//   DISCORD_CLIENT_SECRET=your_secret_here
// Get it from: Discord Developer Portal > your app > OAuth2 > Client Secret
export const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';

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
  bridge: {
    serverUrl: 'ws://localhost:3002',
    apiUrl: 'http://localhost:3001',
    dashboardUrl: 'http://localhost:5174',
    deviceToken: null,
  },
};

// Production cloud endpoints — used as bridge defaults when the app is
// packaged (installed builds talk to mutebeacon.com; dev talks to localhost)
export const PRODUCTION_BRIDGE = {
  serverUrl: 'wss://mutebeacon.com/gateway',
  apiUrl: 'https://mutebeacon.com',
  dashboardUrl: 'https://mutebeacon.com',
  deviceToken: null as string | null,
};

// Bridge (cloud connection) constants
export const BRIDGE_RECONNECT_DELAY = 5000; // 5 seconds, doubles up to max
export const BRIDGE_RECONNECT_MAX_DELAY = 60000; // 1 minute cap
export const BRIDGE_STATUS_INTERVAL = 30000; // status report every 30s
export const BRIDGE_DISCOVERY_INTERVAL = 60000; // re-scan mDNS every 60s while connected
export const PAIR_POLL_INTERVAL = 3000; // poll pairing claim every 3s

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
