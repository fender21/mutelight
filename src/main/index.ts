// Must run before any other import — services read DISCORD_CLIENT_SECRET
// from process.env at module-load time (see src/shared/constants.ts).
import 'dotenv/config';
import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { configService } from './services/config.service';
import { discordService } from './services/discord.service';
import { wledService } from './services/wled.service';
import { trayService } from './services/tray.service';
import { bridgeService } from './services/bridge.service';
import { registerIpcHandlers, setupStateForwarding } from './ipc/handlers';
import { logger } from './utils/logger';

// A second instance would independently pair/authenticate with Discord and
// the cloud bridge, causing duplicate consent prompts and both instances
// fighting over the same gateway connection. Refuse to run more than one.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;

app.on('second-instance', () => {
  logger.info('Second instance launch detected, focusing existing window');
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 640,
    minWidth: 400,
    minHeight: 560,
    maxWidth: 600,
    backgroundColor: '#0a0a0a',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../dist-preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for some Electron APIs
    },
    ...(process.platform === 'linux' ? { icon: path.join(__dirname, '../assets/icons/icon.png') } : {}),
  });

  // Load app
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
  }

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle close button
  mainWindow.on('close', (event) => {
    const settings = configService.getSettings();
    if (settings.minimizeToTray && !(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Register IPC handlers
  registerIpcHandlers(mainWindow);
  setupStateForwarding(mainWindow);

  // Initialize system tray
  trayService.init(mainWindow);

  logger.info('Main window created');
}

// App lifecycle
app.whenReady().then(async () => {
  logger.info('App ready, initializing...');

  // Apply saved auto-start setting on startup (ensures OS registry matches saved setting)
  try {
    const settings = configService.getSettings();
    app.setLoginItemSettings({
      openAtLogin: settings.autoStart,
    });
  } catch (error) {
    logger.error('Failed to apply auto-start setting:', error);
  }

  // Create main window
  createWindow();

  // Start the cloud bridge (pairs first if no device token yet)
  bridgeService.start();

  // Start Discord RPC connection
  const connected = await discordService.connect();
  if (connected) {
    trayService.updateDiscordState(true);
  }

  // Capture initial WLED states for all configured devices (for restore on quit)
  const devices = configService.getDevices();
  for (const device of devices) {
    try {
      await wledService.captureDeviceState(device.id, device.ip_address);
      logger.info(`Captured initial state for device: ${device.name}`);
    } catch (error) {
      logger.warn(`Failed to capture state for ${device.name}:`, error);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  (app as any).isQuitting = true;

  // Restore WLED devices to original state
  const devices = configService.getDevices();
  for (const device of devices) {
    try {
      const restored = await wledService.restoreToOriginalState(device.id);
      if (restored) {
        logger.info(`Restored original state for device: ${device.name}`);
      }
    } catch (error) {
      logger.warn(`Failed to restore state for ${device.name}:`, error);
    }
  }

  bridgeService.stop();
  discordService.disconnect();
  trayService.destroy();
});

// Handle unhandled errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});
