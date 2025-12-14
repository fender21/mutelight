import { WLED_TIMEOUT, WLED_RETRY_ATTEMPTS, WLED_RETRY_DELAY } from '@shared/constants';
import type { WledDevice, LightZone, VoiceState } from '@shared/types';
import { getStateLightConfig, getTransitionTime, DEFAULT_BRIGHTNESS } from '@shared/defaults';
import { logger } from '../utils/logger';

interface WledStatePayload {
  on: boolean;
  bri: number;
  seg?: any[];
  transition?: number;  // Transition time in deciseconds (1/10 second)
}

class WledService {
  private deviceStatusMap = new Map<string, { online: boolean; lastSeen: number }>();

  /**
   * Converts hex color to RGB array
   */
  private hexToRgb(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  }

  /**
   * Makes HTTP request to WLED device with retry logic
   */
  private async sendToWled(
    ipAddress: string,
    payload: WledStatePayload,
    attempt = 1
  ): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), WLED_TIMEOUT);

      const response = await fetch(`http://${ipAddress}/json/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.updateDeviceStatus(ipAddress, true);
      return true;
    } catch (error: any) {
      logger.error(`WLED request failed for ${ipAddress} (attempt ${attempt}):`, error.message);

      // Retry logic
      if (attempt < WLED_RETRY_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, WLED_RETRY_DELAY * attempt));
        return this.sendToWled(ipAddress, payload, attempt + 1);
      }

      this.updateDeviceStatus(ipAddress, false);
      return false;
    }
  }

  /**
   * Sets color for entire WLED device
   * @param ipAddress - Device IP address
   * @param hexColor - Hex color (e.g., '#FF0000')
   * @param brightness - Brightness 0-255 (default 255)
   * @param transitionMs - Transition time in milliseconds (default 0)
   */
  async setDeviceColor(
    ipAddress: string,
    hexColor: string,
    brightness: number = DEFAULT_BRIGHTNESS,
    transitionMs: number = 0
  ): Promise<boolean> {
    const rgb = this.hexToRgb(hexColor);
    const payload: WledStatePayload = {
      on: true,
      bri: Math.max(0, Math.min(255, brightness)),
      seg: [{ col: [rgb] }],
    };

    // Add transition if specified (WLED uses deciseconds)
    if (transitionMs > 0) {
      payload.transition = Math.round(transitionMs / 100);
    }

    logger.debug(`Setting device color: ${ipAddress} -> ${hexColor} (bri: ${brightness}, trans: ${transitionMs}ms)`);
    return this.sendToWled(ipAddress, payload);
  }

  /**
   * Sets color for specific LED zone
   * @param ipAddress - Device IP address
   * @param startLed - Start LED index
   * @param endLed - End LED index
   * @param hexColor - Hex color (e.g., '#FF0000')
   * @param brightness - Brightness 0-255 (default 255)
   * @param transitionMs - Transition time in milliseconds (default 0)
   */
  async setZoneColor(
    ipAddress: string,
    startLed: number,
    endLed: number,
    hexColor: string,
    brightness: number = DEFAULT_BRIGHTNESS,
    transitionMs: number = 0
  ): Promise<boolean> {
    const rgb = this.hexToRgb(hexColor);

    // WLED segment API: { i: [start, [r,g,b], end] }
    const payload: WledStatePayload = {
      on: true,
      bri: Math.max(0, Math.min(255, brightness)),
      seg: {
        i: [startLed, rgb, endLed],
      } as any,
    };

    // Add transition if specified (WLED uses deciseconds)
    if (transitionMs > 0) {
      payload.transition = Math.round(transitionMs / 100);
    }

    logger.debug(`Setting zone color: ${ipAddress} [${startLed}-${endLed}] -> ${hexColor} (bri: ${brightness}, trans: ${transitionMs}ms)`);
    return this.sendToWled(ipAddress, payload);
  }

  /**
   * Updates all devices based on effective voice state
   * Uses new multi-state configuration with fallback to legacy colors
   */
  async updateAllDevices(
    effectiveState: VoiceState,
    devices: WledDevice[],
    zones: LightZone[]
  ): Promise<void> {
    logger.info(`Updating all devices - State: ${effectiveState}`);

    const updatePromises = devices.map(async device => {
      const deviceZones = zones.filter(z => z.device_id === device.id);
      const deviceTransition = getTransitionTime(undefined, device);

      if (deviceZones.length > 0) {
        // Device has zones - update each zone individually
        const zonePromises = deviceZones.map(zone => {
          const config = getStateLightConfig(effectiveState, device, zone);

          // Skip if this state is disabled for the zone
          if (!config.enabled) {
            logger.debug(`Zone ${zone.name} skipped - state ${effectiveState} disabled`);
            return Promise.resolve(true);
          }

          const transition = getTransitionTime(zone, device);

          return this.setZoneColor(
            device.ip_address,
            zone.start_led,
            zone.end_led,
            config.color,
            config.brightness,
            transition
          );
        });

        await Promise.allSettled(zonePromises);
      } else {
        // No zones - update entire device
        const config = getStateLightConfig(effectiveState, device);

        // Skip if this state is disabled
        if (!config.enabled) {
          logger.debug(`Device ${device.name} skipped - state ${effectiveState} disabled`);
          return;
        }

        await this.setDeviceColor(
          device.ip_address,
          config.color,
          config.brightness,
          deviceTransition
        );
      }
    });

    await Promise.allSettled(updatePromises);
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use updateAllDevices(effectiveState, ...) instead
   */
  async updateAllDevicesByMuteState(
    isMuted: boolean,
    devices: WledDevice[],
    zones: LightZone[]
  ): Promise<void> {
    const effectiveState: VoiceState = isMuted ? 'muted' : 'connected';
    return this.updateAllDevices(effectiveState, devices, zones);
  }

  /**
   * Preview a color on a device (for testing)
   */
  async previewDeviceColor(
    ipAddress: string,
    hexColor: string,
    brightness: number = DEFAULT_BRIGHTNESS
  ): Promise<boolean> {
    logger.info(`Previewing device color: ${ipAddress} -> ${hexColor}`);
    return this.setDeviceColor(ipAddress, hexColor, brightness, 0);
  }

  /**
   * Preview a color on a specific zone (for testing)
   */
  async previewZoneColor(
    ipAddress: string,
    startLed: number,
    endLed: number,
    hexColor: string,
    brightness: number = DEFAULT_BRIGHTNESS
  ): Promise<boolean> {
    logger.info(`Previewing zone color: ${ipAddress} [${startLed}-${endLed}] -> ${hexColor}`);
    return this.setZoneColor(ipAddress, startLed, endLed, hexColor, brightness, 0);
  }

  /**
   * Restore device to current Discord state
   */
  async restoreDeviceFromState(
    effectiveState: VoiceState,
    device: WledDevice,
    zones: LightZone[]
  ): Promise<void> {
    logger.info(`Restoring device ${device.name} to state: ${effectiveState}`);
    await this.updateAllDevices(effectiveState, [device], zones);
  }

  /**
   * Checks if a device is reachable
   */
  async checkDeviceOnline(ipAddress: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`http://${ipAddress}/json/info`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const online = response.ok;
      this.updateDeviceStatus(ipAddress, online);
      return online;
    } catch (error) {
      this.updateDeviceStatus(ipAddress, false);
      return false;
    }
  }

  /**
   * Updates internal device status tracking
   */
  private updateDeviceStatus(ipAddress: string, online: boolean): void {
    this.deviceStatusMap.set(ipAddress, {
      online,
      lastSeen: Date.now(),
    });
  }

  /**
   * Gets status for all tracked devices
   */
  getDeviceStatuses(): Map<string, { online: boolean; lastSeen: number }> {
    return new Map(this.deviceStatusMap);
  }
}

export const wledService = new WledService();
