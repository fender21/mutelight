import { ipcMain, BrowserWindow, app } from 'electron';
import { configService } from '../services/config.service';
import { discoveryService } from '../services/discovery.service';
import { wledService } from '../services/wled.service';
import { discordService } from '../services/discord.service';
import { trayService } from '../services/tray.service';
import { logger } from '../utils/logger';
import type { VoiceState, DiscordState, EffectConfig } from '@shared/types';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // Device CRUD handlers
  ipcMain.handle('devices:create', async (_event, deviceData) => {
    try {
      const device = configService.createDevice(deviceData);
      logger.info('Device created:', device.id);
      return { success: true, device };
    } catch (error: any) {
      logger.error('Failed to create device:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('devices:update', async (_event, id, updates) => {
    try {
      const device = configService.updateDevice(id, updates);
      if (!device) {
        return { success: false, error: 'Device not found' };
      }
      logger.info('Device updated:', id);
      return { success: true, device };
    } catch (error: any) {
      logger.error('Failed to update device:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('devices:delete', async (_event, id) => {
    try {
      const success = configService.deleteDevice(id);
      if (!success) {
        return { success: false, error: 'Device not found' };
      }
      logger.info('Device deleted:', id);
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to delete device:', error);
      return { success: false, error: error.message };
    }
  });

  // Discovery handler
  ipcMain.handle('devices:discover', async () => {
    try {
      logger.info('Starting WLED device discovery...');
      const devices = await discoveryService.scan();
      logger.info(`Discovery complete: ${devices.length} devices found`);
      return { success: true, devices };
    } catch (error: any) {
      logger.error('Discovery failed:', error);
      return { success: false, error: error.message, devices: [] };
    }
  });

  // Test connection handler
  ipcMain.handle('devices:test-connection', async (_event, ipAddress) => {
    try {
      const online = await wledService.checkDeviceOnline(ipAddress);
      return { success: true, online };
    } catch (error: any) {
      logger.error('Connection test failed:', error);
      return { success: false, error: error.message, online: false };
    }
  });

  // Preview device color handler (with optional effect)
  ipcMain.handle('devices:preview-color', async (_event, deviceId: string, color: string, brightness: number, effect?: EffectConfig) => {
    try {
      const device = configService.getDevices().find(d => d.id === deviceId);
      if (!device) {
        return { success: false, error: 'Device not found' };
      }
      const result = await wledService.setDeviceColor(device.ip_address, color, brightness, 0, effect);
      return { success: result };
    } catch (error: any) {
      logger.error('Preview color failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Restore device to current Discord state handler
  ipcMain.handle('devices:restore-state', async (_event, deviceId: string) => {
    try {
      const device = configService.getDevices().find(d => d.id === deviceId);
      if (!device) {
        return { success: false, error: 'Device not found' };
      }
      const effectiveState = discordService.getEffectiveState();
      await wledService.restoreDeviceFromState(effectiveState, device);
      return { success: true };
    } catch (error: any) {
      logger.error('Restore state failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Get effects list from device
  ipcMain.handle('devices:get-effects', async (_event, deviceId: string) => {
    try {
      const device = configService.getDevices().find(d => d.id === deviceId);
      if (!device) {
        return { success: false, error: 'Device not found', effects: [] };
      }
      const info = await wledService.getDeviceInfo(device.ip_address);
      if (!info) {
        return { success: false, error: 'Failed to fetch device info', effects: [] };
      }
      return { success: true, effects: info.effects };
    } catch (error: any) {
      logger.error('Failed to get effects:', error);
      return { success: false, error: error.message, effects: [] };
    }
  });

  // Capture current device state (for restore on app close)
  ipcMain.handle('devices:capture-state', async (_event, deviceId: string) => {
    try {
      const device = configService.getDevices().find(d => d.id === deviceId);
      if (!device) {
        return { success: false, error: 'Device not found' };
      }
      const state = await wledService.captureDeviceState(deviceId, device.ip_address);
      return { success: !!state, state };
    } catch (error: any) {
      logger.error('Failed to capture state:', error);
      return { success: false, error: error.message };
    }
  });

  // Restore device to original captured state
  ipcMain.handle('devices:restore-original', async (_event, deviceId: string) => {
    try {
      const restored = await wledService.restoreToOriginalState(deviceId);
      return { success: restored };
    } catch (error: any) {
      logger.error('Failed to restore original state:', error);
      return { success: false, error: error.message };
    }
  });

  // Get devices
  ipcMain.handle('config:get-devices', async () => {
    return configService.getDevices();
  });

  // Settings management
  ipcMain.handle('settings:get', async () => {
    return configService.getSettings();
  });

  ipcMain.handle('settings:update', async (_event, settings) => {
    configService.updateSettings(settings);

    // Update auto-start setting if changed
    if (settings.autoStart !== undefined) {
      try {
        app.setLoginItemSettings({
          openAtLogin: settings.autoStart,
        });
        logger.info(`Auto-start ${settings.autoStart ? 'enabled' : 'disabled'}`);
      } catch (error: any) {
        logger.error('Failed to set auto-start:', error.message);
      }
    }

    // Update polling interval if changed
    if (settings.pollingInterval) {
      discordService.updatePollingInterval(settings.pollingInterval);
    }

    return { success: true };
  });

  // Discord status
  ipcMain.handle('discord:get-status', async () => {
    return discordService.getState();
  });

  // Window controls
  ipcMain.on('window:minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    const settings = configService.getSettings();
    if (settings.minimizeToTray) {
      mainWindow.hide();
    } else {
      mainWindow.close();
    }
  });

  logger.info('IPC handlers registered');
}

/**
 * Setup Discord event forwarding to renderer
 */
export function setupDiscordForwarding(mainWindow: BrowserWindow): void {
  // New stateChanged event - primary method for state handling
  discordService.on('stateChanged', (effectiveState: VoiceState, fullState: DiscordState) => {
    logger.info(`Discord state changed: ${effectiveState}`);

    // Update WLED devices with new effective state
    const devices = configService.getDevices();
    wledService.updateAllDevices(effectiveState, devices);

    // Update tray with current voice state (icon color + tooltip)
    trayService.updateVoiceState(effectiveState);

    // Notify renderer with full state info
    mainWindow.webContents.send('discord:state-changed', effectiveState, fullState);

    // Also send legacy event for backward compatibility
    const isMuted = effectiveState === 'muted' || effectiveState === 'deafened';
    mainWindow.webContents.send('discord:mute-state-changed', isMuted);
  });

  // Legacy muteStateChanged event (still emitted for backward compatibility)
  discordService.on('muteStateChanged', (isMuted: boolean) => {
    logger.debug(`Legacy mute state changed: ${isMuted}`);
    // Note: WLED updates are now handled by stateChanged event
  });

  discordService.on('connected', () => {
    trayService.updateDiscordState(true);
    mainWindow.webContents.send('discord:connection-changed', true);
  });

  discordService.on('disconnected', () => {
    trayService.updateDiscordState(false);
    mainWindow.webContents.send('discord:connection-changed', false);
  });
}
