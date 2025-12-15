import { WLED_TIMEOUT, WLED_RETRY_ATTEMPTS, WLED_RETRY_DELAY } from '@shared/constants';
import type { WledDevice, VoiceState, EffectConfig, WledEffect, CapturedWledState } from '@shared/types';
import { getStateLightConfig, getTransitionTime, DEFAULT_BRIGHTNESS, DEFAULT_EFFECT_CONFIG } from '@shared/defaults';
import { logger } from '../utils/logger';

interface WledStatePayload {
  on: boolean;
  bri: number;
  seg?: any[];
  transition?: number;  // Transition time in deciseconds (1/10 second)
}

class WledService {
  private deviceStatusMap = new Map<string, { online: boolean; lastSeen: number }>();
  private capturedStates = new Map<string, CapturedWledState>();

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
   * @param effect - Optional effect configuration (defaults to Solid)
   */
  async setDeviceColor(
    ipAddress: string,
    hexColor: string,
    brightness: number = DEFAULT_BRIGHTNESS,
    transitionMs: number = 0,
    effect?: EffectConfig
  ): Promise<boolean> {
    const rgb = this.hexToRgb(hexColor);
    const effectConfig = effect ?? DEFAULT_EFFECT_CONFIG;
    const payload: WledStatePayload = {
      on: true,
      bri: Math.max(0, Math.min(255, brightness)),
      seg: [{
        col: [rgb],
        fx: effectConfig.effectId,
        sx: effectConfig.speed,
        ix: effectConfig.intensity,
      }],
    };

    // Add transition if specified (WLED uses deciseconds)
    if (transitionMs > 0) {
      payload.transition = Math.round(transitionMs / 100);
    }

    logger.debug(`Setting device color: ${ipAddress} -> ${hexColor} (bri: ${brightness}, fx: ${effectConfig.effectId}, trans: ${transitionMs}ms)`);
    return this.sendToWled(ipAddress, payload);
  }

  /**
   * Updates all devices based on effective voice state
   * Uses new multi-state configuration with fallback to legacy colors
   */
  async updateAllDevices(
    effectiveState: VoiceState,
    devices: WledDevice[]
  ): Promise<void> {
    logger.info(`Updating all devices - State: ${effectiveState}`);

    const updatePromises = devices.map(async device => {
      const config = getStateLightConfig(effectiveState, device);
      const deviceTransition = getTransitionTime(device);

      // Skip if this state is disabled
      if (!config.enabled) {
        logger.debug(`Device ${device.name} skipped - state ${effectiveState} disabled`);
        return;
      }

      await this.setDeviceColor(
        device.ip_address,
        config.color,
        config.brightness,
        deviceTransition,
        config.effect
      );
    });

    await Promise.allSettled(updatePromises);
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use updateAllDevices(effectiveState, ...) instead
   */
  async updateAllDevicesByMuteState(
    isMuted: boolean,
    devices: WledDevice[]
  ): Promise<void> {
    const effectiveState: VoiceState = isMuted ? 'muted' : 'connected';
    return this.updateAllDevices(effectiveState, devices);
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
   * Restore device to current Discord state
   */
  async restoreDeviceFromState(
    effectiveState: VoiceState,
    device: WledDevice
  ): Promise<void> {
    logger.info(`Restoring device ${device.name} to state: ${effectiveState}`);
    await this.updateAllDevices(effectiveState, [device]);
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

  /**
   * Fetches device info including effects list and current state
   * GET /json returns full device info with effects array
   */
  async getDeviceInfo(ipAddress: string): Promise<{
    effects: WledEffect[];
    currentState: any;
  } | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), WLED_TIMEOUT);

      const response = await fetch(`http://${ipAddress}/json`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Parse effects array - WLED returns array of effect names indexed by ID
      const effectNames: string[] = data.effects || [];
      const effects: WledEffect[] = effectNames
        .map((name: string, index: number) => ({
          id: index,
          name: name,
        }))
        // Filter out reserved/unsupported effects
        .filter((e: WledEffect) => e.name && e.name !== 'RSVD' && e.name !== '-');

      this.updateDeviceStatus(ipAddress, true);

      return {
        effects,
        currentState: data.state,
      };
    } catch (error: any) {
      logger.error(`Failed to get device info for ${ipAddress}:`, error.message);
      this.updateDeviceStatus(ipAddress, false);
      return null;
    }
  }

  /**
   * Captures current state from device for later restoration
   */
  async captureDeviceState(deviceId: string, ipAddress: string): Promise<CapturedWledState | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), WLED_TIMEOUT);

      const response = await fetch(`http://${ipAddress}/json/state`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const state = await response.json();

      const captured: CapturedWledState = {
        deviceId,
        ip_address: ipAddress,
        capturedAt: Date.now(),
        state,
      };

      this.capturedStates.set(deviceId, captured);
      this.updateDeviceStatus(ipAddress, true);

      logger.info(`Captured state for device ${deviceId} at ${ipAddress}`);
      return captured;
    } catch (error: any) {
      logger.error(`Failed to capture state for ${ipAddress}:`, error.message);
      this.updateDeviceStatus(ipAddress, false);
      return null;
    }
  }

  /**
   * Restores device to previously captured state
   */
  async restoreToOriginalState(deviceId: string): Promise<boolean> {
    const captured = this.capturedStates.get(deviceId);
    if (!captured) {
      logger.warn(`No captured state found for device ${deviceId}`);
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), WLED_TIMEOUT);

      const response = await fetch(`http://${captured.ip_address}/json/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(captured.state),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      logger.info(`Restored original state for device ${deviceId}`);
      this.updateDeviceStatus(captured.ip_address, true);
      return true;
    } catch (error: any) {
      logger.error(`Failed to restore state for ${deviceId}:`, error.message);
      this.updateDeviceStatus(captured.ip_address, false);
      return false;
    }
  }

  /**
   * Gets all captured states
   */
  getCapturedStates(): Map<string, CapturedWledState> {
    return new Map(this.capturedStates);
  }

  /**
   * Clears captured state for a device
   */
  clearCapturedState(deviceId: string): void {
    this.capturedStates.delete(deviceId);
  }
}

export const wledService = new WledService();
