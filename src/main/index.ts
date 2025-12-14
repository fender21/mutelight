import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { configService } from './services/config.service';
import { discordService } from './services/discord.service';
import { trayService } from './services/tray.service';
import { registerIpcHandlers, setupDiscordForwarding } from './ipc/handlers';
import { logger } from './utils/logger';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
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
  if (process.env.NODE_ENV === 'development') {
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
  setupDiscordForwarding(mainWindow);

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

  // Start Discord RPC connection
  const connected = await discordService.connect();
  if (connected) {
    trayService.updateDiscordState(true);
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

app.on('before-quit', () => {
  (app as any).isQuitting = true;
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
