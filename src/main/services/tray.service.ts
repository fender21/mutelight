import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import path from 'path';
import { logger } from '../utils/logger';

class TrayService {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;
  private muteState = false;
  private discordConnected = false;

  /**
   * Initialize system tray
   */
  init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;

    // Determine icon path based on platform
    const iconName = process.platform === 'darwin' ? 'iconTemplate.png' : 'icon.png';
    const iconPath = path.join(__dirname, '../../assets/icons', iconName);

    try {
      const icon = nativeImage.createFromPath(iconPath);

      if (icon.isEmpty()) {
        logger.warn('Tray icon not found, using default:', iconPath);
        // Create a simple tray without icon for now
        this.tray = new Tray(nativeImage.createEmpty());
      } else {
        this.tray = new Tray(icon.resize({ width: 16, height: 16 }));
      }

      this.tray.setToolTip('MuteLight - Disconnected');

      // Handle double-click to show window
      this.tray.on('double-click', () => {
        this.showWindow();
      });

      // Build initial context menu
      this.updateContextMenu();

      logger.info('System tray initialized');
    } catch (error) {
      logger.error('Failed to initialize system tray:', error);
    }
  }

  /**
   * Update tray context menu
   */
  private updateContextMenu(): void {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open MuteLight',
        click: () => this.showWindow(),
      },
      { type: 'separator' },
      {
        label: `Status: ${this.discordConnected ? 'Connected' : 'Disconnected'}`,
        enabled: false,
      },
      {
        label: `Muted: ${this.muteState ? 'Yes' : 'No'}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Sync Settings',
        click: () => {
          this.mainWindow?.webContents.send('tray:sync-requested');
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  /**
   * Update mute state in tray
   */
  updateMuteState(isMuted: boolean): void {
    this.muteState = isMuted;
    this.updateTooltip();
    this.updateContextMenu();
  }

  /**
   * Update Discord connection state in tray
   */
  updateDiscordState(connected: boolean): void {
    this.discordConnected = connected;
    this.updateTooltip();
    this.updateContextMenu();
  }

  /**
   * Update tray tooltip
   */
  private updateTooltip(): void {
    if (!this.tray) return;

    let tooltip = 'MuteLight';
    if (this.discordConnected) {
      tooltip += ` - ${this.muteState ? 'Muted' : 'Unmuted'}`;
    } else {
      tooltip += ' - Disconnected';
    }

    this.tray.setToolTip(tooltip);
  }

  /**
   * Show main window
   */
  private showWindow(): void {
    if (!this.mainWindow) return;

    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  /**
   * Destroy tray
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

export const trayService = new TrayService();
