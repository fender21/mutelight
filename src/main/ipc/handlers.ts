import { ipcMain, BrowserWindow, app } from 'electron';
import { configService } from '../services/config.service';
import { wledService } from '../services/wled.service';
import { discordService } from '../services/discord.service';
import { trayService } from '../services/tray.service';
import { stateManager, StateChangeMeta } from '../services/state-manager.service';
import { bridgeService } from '../services/bridge.service';
import { logger } from '../utils/logger';
import type { VoiceState, BeaconState } from '@shared/types';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // Settings management (device management lives in the cloud dashboard)
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

  // Beacon state (effective state across all sources)
  ipcMain.handle('beacon:get-state', async () => {
    return {
      state: stateManager.getEffectiveState(),
      source: stateManager.getWinningSource(),
    };
  });

  // Manual override (tray/renderer): state null resumes automatic
  ipcMain.handle('beacon:set-manual-state', async (_event, state: BeaconState | null) => {
    stateManager.setSourceState('manual', state);
    return { success: true };
  });

  // Bridge (cloud connection) management
  ipcMain.handle('bridge:get-status', async () => {
    return bridgeService.getStatus();
  });

  ipcMain.handle('bridge:start-pairing', async () => {
    return bridgeService.startPairing();
  });

  ipcMain.handle('bridge:unpair', async () => {
    await bridgeService.unpair();
    return { success: true };
  });

  // Window controls
  ipcMain.on('window:minimize', () => {
    mainWindow.minimize();
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
 * Wire the single state fan-out plus each event source into the StateManager.
 * The StateManager is the only thing that drives WLED/tray/renderer; sources
 * (Discord RPC, cloud bridge, tray manual overrides) just feed it.
 */
export function setupStateForwarding(mainWindow: BrowserWindow): void {
  // The one fan-out: effective beacon state -> lights + tray + renderer
  stateManager.on('stateChanged', (effectiveState: BeaconState, meta: StateChangeMeta) => {
    logger.info(`Beacon state changed: ${effectiveState} (source: ${meta.source ?? 'none'})`);

    const devices = configService.getDevices();
    wledService.updateAllDevices(effectiveState, devices);

    trayService.updateVoiceState(effectiveState);

    mainWindow.webContents.send('beacon:state-changed', effectiveState, meta);
  });

  // Source: Discord RPC (the one integration that must live locally)
  discordService.on('stateChanged', (effectiveState: VoiceState) => {
    stateManager.setSourceState('discord', effectiveState);
  });

  discordService.on('connected', () => {
    trayService.updateDiscordState(true);
    mainWindow.webContents.send('discord:connection-changed', true);
  });

  discordService.on('disconnected', () => {
    stateManager.clearSource('discord');
    trayService.updateDiscordState(false);
    mainWindow.webContents.send('discord:connection-changed', false);
  });

  // Source: cloud bridge — forward its lifecycle to the renderer
  bridgeService.on('connectionChanged', (connected: boolean) => {
    mainWindow.webContents.send('bridge:connection-changed', connected);
  });

  bridgeService.on('pairingCode', (code: string) => {
    mainWindow.webContents.send('bridge:pairing-code', code);
  });

  bridgeService.on('paired', () => {
    mainWindow.webContents.send('bridge:paired');
  });
}
