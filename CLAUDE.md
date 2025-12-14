# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MuteLight is an Electron desktop application that monitors Discord mute status via Discord RPC and controls WLED LED strips to provide visual feedback. The application uses a multi-process Vite build system with separate main, preload, and renderer processes.

## Common Commands

### Development
```bash
npm run dev              # Start development server with hot reload
npm run build            # Build all processes for production
npm run build:main       # Build only main process
npm run build:preload    # Build only preload script
npm run build:renderer   # Build only renderer (React UI)
npm run package          # Build and create distributable packages
npm run type-check       # Run TypeScript type checking
```

### Build Process
The dev script (`scripts/dev.js`) orchestrates a multi-stage startup:
1. Starts Vite dev server for renderer (port 5173)
2. Builds main process in watch mode
3. Builds preload script in watch mode
4. Launches Electron after 3-second delay

## Architecture

### Process Structure
- **Main Process** (`src/main/`): Electron main process, handles system integration, Discord RPC, WLED control
- **Preload Script** (`src/main/preload.ts`): IPC bridge between main and renderer
- **Renderer Process** (`src/renderer/`): React-based UI running in browser context

### Core Services (Main Process)

#### Discord Service (`src/main/services/discord.service.ts`)
- Uses `@xhayper/discord-rpc` client library
- Two modes: Event subscription (VOICE_SETTINGS_UPDATE) with polling fallback
- Emits `muteStateChanged` events when user mutes/unmutes or deafens
- Handles reconnection with exponential backoff (max 10 attempts)
- Discord Client ID: `1439804981132660797` (defined in constants)

#### WLED Service (`src/main/services/wled.service.ts`)
- Controls WLED devices via HTTP JSON API (`http://{ip}/json/state`)
- Supports both full-device colors and zone-specific control (LED segments)
- Retry logic: 3 attempts with 1s delay, 5s timeout per request
- Uses `Promise.allSettled` to update all devices in parallel without blocking

#### Config Service (`src/main/services/config.service.ts`)
- Uses `electron-store` for persistent local storage
- Stores: devices (WledDevice[]), zones (LightZone[]), settings (AppSettings)
- All IDs are UUIDs generated with `crypto.randomUUID()`
- Deleting a device automatically deletes associated zones

#### Discovery Service (`src/main/services/discovery.service.ts`)
- Uses `bonjour-service` for mDNS discovery of WLED devices
- Service type: `_wled._tcp.local`
- Default timeout: 10 seconds

#### Tray Service (`src/main/services/tray.service.ts`)
- System tray with context menu showing connection/mute status
- Updates in real-time based on Discord events

### IPC Communication (`src/main/ipc/handlers.ts`)

Key IPC channels:
- `devices:create/update/delete` - Device CRUD operations
- `devices:discover` - Trigger mDNS discovery
- `devices:test-connection` - Check if device is online
- `zones:create/update/delete` - Zone CRUD operations
- `config:get-devices/zones` - Retrieve configuration
- `settings:get/update` - Settings management
- `discord:get-status` - Get current Discord connection/mute state
- `discord:mute-state-changed` - Event from main to renderer (mute changed)
- `discord:connection-changed` - Event from main to renderer (connection changed)

**Event Flow**: Discord service emits events → handlers in `setupDiscordForwarding` → triggers WLED updates + tray updates + forwards to renderer via `webContents.send`

### Data Types (`src/shared/types.ts`)

Core interfaces:
- `WledDevice`: Stores device name, IP, muted/unmuted colors (hex strings)
- `LightZone`: Associates LED segments (start_led to end_led) with a device
- `AppSettings`: autoStart, minimizeToTray, pollingInterval, theme
- `DiscordState`: connected, muted, deafened, lastUpdate

### Frontend Architecture

#### State Management (`src/renderer/src/store/appStore.ts`)
- Uses Zustand for global state
- Stores: devices, zones, settings, Discord state

#### React Router Setup
- Uses HashRouter (required for Electron file:// protocol)
- Routes: `/dashboard` (main view), `/settings`
- Default redirect: `/` → `/dashboard`

#### Key Components
- `DeviceManager`: Device CRUD with discovery
- `ZoneManager`: Zone configuration per device
- `ColorPicker`: Uses `react-colorful` library
- `StatusIndicator`: Shows Discord connection and mute state

### Constants (`src/shared/constants.ts`)

- Discord Client ID: `1439804981132660797`
- Default polling interval: 500ms
- WLED timeout: 5s, 3 retry attempts
- Discord reconnect: 5s delay, max 10 attempts
- Color scheme: Dark backgrounds (#0a0a0a to #1a1a1a), green accent (#22c55e), purple accent (#a855f7)

## Build Configuration

### Vite Configs
Three separate configs for three build targets:
- `vite.config.main.ts`: Builds to `dist-main/`, CJS format, externalizes Electron APIs
- `vite.config.preload.ts`: Builds to `dist-preload/`, CJS format
- `vite.config.renderer.ts`: Builds to `dist-renderer/`, standard SPA build

Path aliases:
- `@main` → `src/main`
- `@renderer` → `src/renderer/src`
- `@shared` → `src/shared`

### Electron Builder
Package command uses `electron-builder` configuration in package.json for creating platform-specific installers (NSIS/portable for Windows, DMG for macOS, AppImage for Linux).

## Important Implementation Details

### WLED Color Control
- Device-level: Sets entire strip via `seg: [{ col: [[r,g,b]] }]`
- Zone-level: Sets LED range via `seg: { i: [startLed, [r,g,b], endLed] }`
- Colors stored as hex strings, converted to RGB arrays before sending

### Discord Mute Detection
The app monitors both self_mute/self_deaf (user-controlled) AND mute/deaf (server-controlled). A user is considered "muted" if ANY of these flags is true, which then triggers the WLED update.

### Error Handling
- WLED devices that fail after retries are marked offline but don't block other devices
- Discord disconnection triggers automatic reconnection with exponential backoff
- All IPC handlers return `{ success: boolean, error?: string }` structure

### Minimize to Tray Behavior
When `minimizeToTray` setting is enabled, closing the window hides it instead of quitting. The `isQuitting` flag on app object distinguishes user-initiated quit from window close.

## Development Tips

- Main process changes require Electron restart (dev script handles this via watch mode)
- Renderer changes use Vite HMR (instant reload)
- Check `dist-main/index.js` if main process fails to build correctly
- Use `logger` service (Winston) for debugging; logs appear in terminal
- DevTools available in development mode via `mainWindow.webContents.openDevTools()`
