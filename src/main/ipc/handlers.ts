import { ipcMain, BrowserWindow, app } from 'electron';
import { configService } from '../services/config.service';
import { discoveryService } from '../services/discovery.service';
import { wledService } from '../services/wled.service';
import { discordService } from '../services/discord.service';
import { trayService } from '../services/tray.service';
import { logger } from '../utils/logger';
import type { VoiceState, DiscordState } from '@shared/types';

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

  // Preview device color handler
  ipcMain.handle('devices:preview-color', async (_event, deviceId: string, color: string, brightness: number) => {
    try {
      const device = configService.getDevices().find(d => d.id === deviceId);
      if (!device) {
        return { success: false, error: 'Device not found' };
      }
      const result = await wledService.previewDeviceColor(device.ip_address, color, brightness);
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
      const zones = configService.getZones().filter(z => z.device_id === deviceId);
      const effectiveState = discordService.getEffectiveState();
      await wledService.restoreDeviceFromState(effectiveState, device, zones);
      return { success: true };
    } catch (error: any) {
      logger.error('Restore state failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Zone CRUD handlers
  ipcMain.handle('zones:create', async (_event, zoneData) => {
    try {
      const zone = configService.createZone(zoneData);
      logger.info('Zone created:', zone.id);
      return { success: true, zone };
    } catch (error: any) {
      logger.error('Failed to create zone:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('zones:update', async (_event, id, updates) => {
    try {
      const zone = configService.updateZone(id, updates);
      if (!zone) {
        return { success: false, error: 'Zone not found' };
      }
      logger.info('Zone updated:', id);
      return { success: true, zone };
    } catch (error: any) {
      logger.error('Failed to update zone:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('zones:delete', async (_event, id) => {
    try {
      const success = configService.deleteZone(id);
      if (!success) {
        return { success: false, error: 'Zone not found' };
      }
      logger.info('Zone deleted:', id);
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to delete zone:', error);
      return { success: false, error: error.message };
    }
  });

  // Preview zone color handler
  ipcMain.handle('zones:preview-color', async (_event, zoneId: string, color: string, brightness: number) => {
    try {
      const zone = configService.getZones().find(z => z.id === zoneId);
      if (!zone) {
        return { success: false, error: 'Zone not found' };
      }
      const device = configService.getDevices().find(d => d.id === zone.device_id);
      if (!device) {
        return { success: false, error: 'Device not found' };
      }
      const result = await wledService.previewZoneColor(
        device.ip_address,
        zone.start_led,
        zone.end_led,
        color,
        brightness
      );
      return { success: result };
    } catch (error: any) {
      logger.error('Preview zone color failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Get devices
  ipcMain.handle('config:get-devices', async () => {
    return configService.getDevices();
  });

  // Get zones
  ipcMain.handle('config:get-zones', async () => {
    return configService.getZones();
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
    const zones = configService.getZones();
    wledService.updateAllDevices(effectiveState, devices, zones);

    // Update tray based on effective state
    const isMuted = effectiveState === 'muted' || effectiveState === 'deafened';
    trayService.updateMuteState(isMuted);

    // Notify renderer with full state info
    mainWindow.webContents.send('discord:state-changed', effectiveState, fullState);

    // Also send legacy event for backward compatibility
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
