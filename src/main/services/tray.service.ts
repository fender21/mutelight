import { Tray, Menu, nativeImage, BrowserWindow, app, NativeImage } from 'electron';
import { logger } from '../utils/logger';
import type { VoiceState } from '@shared/types';
import { DEFAULT_STATE_COLORS } from '@shared/defaults';

class TrayService {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;
  private muteState = false;
  private discordConnected = false;
  private currentState: VoiceState = 'idle';
  private currentColor: string = '#666666';

  /**
   * Initialize system tray
   */
  init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;

    try {
      // Create initial icon with idle state color (gray)
      const initialColor = this.getColorForState('idle');
      const icon = this.generateColoredIcon(initialColor);
      this.tray = new Tray(icon);
      this.currentColor = initialColor;

      this.tray.setToolTip('MuteLight - Disconnected');

      // Handle double-click to show window
      this.tray.on('double-click', () => {
        this.showWindow();
      });

      // Build initial context menu
      this.updateContextMenu();

      logger.info('System tray initialized with colored icon');
    } catch (error) {
      logger.error('Failed to initialize system tray:', error);
    }
  }

  /**
   * Convert hex color to RGB array
   */
  private hexToRgb(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  }

  /**
   * Generate a solid colored square icon
   */
  private generateColoredIcon(hexColor: string): NativeImage {
    const size = 16;
    const [r, g, b] = this.hexToRgb(hexColor);

    // Create raw RGBA pixel data for a solid color square
    const pixels = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      pixels[i * 4] = r;
      pixels[i * 4 + 1] = g;
      pixels[i * 4 + 2] = b;
      pixels[i * 4 + 3] = 255; // Full opacity
    }

    return nativeImage.createFromBuffer(pixels, {
      width: size,
      height: size,
    });
  }

  /**
   * Get the color for a given voice state
   */
  private getColorForState(state: VoiceState): string {
    // Map state to color from defaults
    const stateConfig = DEFAULT_STATE_COLORS[state];
    if (stateConfig) {
      return stateConfig.color;
    }
    // Fallback color (gray)
    return '#666666';
  }

  /**
   * Update tray icon with current state color
   */
  private updateTrayIcon(hexColor: string): void {
    if (!this.tray) return;

    try {
      const icon = this.generateColoredIcon(hexColor);
      this.tray.setImage(icon);
      this.currentColor = hexColor;
      logger.debug(`Tray icon updated to color: ${hexColor}`);
    } catch (error) {
      logger.error('Failed to update tray icon:', error);
    }
  }

  /**
   * Update effective voice state and tray icon
   */
  updateVoiceState(state: VoiceState): void {
    this.currentState = state;
    const color = this.getColorForState(state);
    this.updateTrayIcon(color);
    this.muteState = state === 'muted' || state === 'deafened';
    this.updateTooltip();
    this.updateContextMenu();
  }

  /**
   * Update tray context menu
   */
  private updateContextMenu(): void {
    if (!this.tray) return;

    const stateDisplay = this.currentState.charAt(0).toUpperCase() + this.currentState.slice(1);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open MuteLight',
        click: () => this.showWindow(),
      },
      { type: 'separator' },
      {
        label: `Discord: ${this.discordConnected ? 'Connected' : 'Disconnected'}`,
        enabled: false,
      },
      {
        label: `State: ${stateDisplay}`,
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
      // Capitalize state name for display
      const stateDisplay = this.currentState.charAt(0).toUpperCase() + this.currentState.slice(1);
      tooltip += ` - ${stateDisplay}`;
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
