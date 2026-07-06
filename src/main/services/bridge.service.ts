import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { app } from 'electron';
import { configService } from './config.service';
import { discoveryService } from './discovery.service';
import { wledService } from './wled.service';
import { discordService } from './discord.service';
import { stateManager } from './state-manager.service';
import { logger } from '../utils/logger';
import {
  BRIDGE_RECONNECT_DELAY,
  BRIDGE_RECONNECT_MAX_DELAY,
  BRIDGE_STATUS_INTERVAL,
  BRIDGE_DISCOVERY_INTERVAL,
  PAIR_POLL_INTERVAL,
} from '@shared/constants';
import type {
  CloudMessage,
  GatewayMessage,
  ManagedDevice,
  PairStartResponse,
  PairPollResponse,
} from '@shared/protocol';
import type { WledDevice, StateColors } from '@shared/types';

export interface BridgeStatus {
  paired: boolean;
  connected: boolean;
  pairingCode: string | null;
  serverUrl: string;
}

/** Convert a cloud-managed device into the local cache shape. */
function toWledDevice(d: ManagedDevice): WledDevice {
  return {
    id: d.id,
    name: d.name,
    ip_address: d.ip_address,
    muted_color: d.stateColors['muted']?.color ?? '#ef4444',
    unmuted_color: d.stateColors['connected']?.color ?? '#22c55e',
    stateColors: d.stateColors as StateColors,
    defaultBrightness: d.defaultBrightness,
    transitionTime: d.transitionTime,
  };
}

/**
 * Outbound connection to the MuteBeacon cloud. The gateway's only jobs:
 * authenticate with its device token, stream discovery/status up, and
 * apply beacons + config coming down. No inbound ports.
 */
class BridgeService extends EventEmitter {
  private ws: WebSocket | null = null;
  private connected = false;
  private stopped = false;
  private reconnectDelay = BRIDGE_RECONNECT_DELAY;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private statusTimer: NodeJS.Timeout | null = null;
  private discoveryTimer: NodeJS.Timeout | null = null;
  private pairPollTimer: NodeJS.Timeout | null = null;
  private pairingCode: string | null = null;
  private stateListener: (() => void) | null = null;

  getStatus(): BridgeStatus {
    const settings = configService.getSettings();
    return {
      paired: !!settings.bridge.deviceToken,
      connected: this.connected,
      pairingCode: this.pairingCode,
      serverUrl: settings.bridge.serverUrl,
    };
  }

  /** Entry point: connect if paired, otherwise begin the pairing flow. */
  start(): void {
    this.stopped = false;
    const settings = configService.getSettings();
    if (settings.bridge.deviceToken) {
      this.connect();
    } else {
      void this.startPairing();
    }

    // Report state changes up so the dashboard live view stays current
    if (!this.stateListener) {
      const listener = () => this.sendStatus();
      stateManager.on('stateChanged', listener);
      this.stateListener = () => stateManager.off('stateChanged', listener);
    }
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.stateListener?.();
    this.stateListener = null;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  /** Forget the device token and start pairing again. */
  async unpair(): Promise<void> {
    const settings = configService.getSettings();
    configService.updateSettings({ bridge: { ...settings.bridge, deviceToken: null } });
    this.stop();
    this.start();
  }

  // -------------------------------------------------------------------------
  // Pairing (TV-app style: we show a code, the user types it into the web)
  // -------------------------------------------------------------------------

  async startPairing(): Promise<{ code?: string; error?: string }> {
    if (this.pairPollTimer) {
      clearInterval(this.pairPollTimer);
      this.pairPollTimer = null;
    }
    const { apiUrl } = configService.getSettings().bridge;
    try {
      const res = await fetch(`${apiUrl}/api/pair/start`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { success: boolean; data: PairStartResponse };
      const { code, pollToken, expiresInMs } = data.data;

      this.pairingCode = code;
      this.emit('pairingCode', code);
      logger.info(`Bridge pairing started, code: ${code}`);

      const startedAt = Date.now();
      this.pairPollTimer = setInterval(async () => {
        if (this.stopped) return;
        if (Date.now() - startedAt > expiresInMs) {
          logger.info('Pairing code expired, requesting a new one');
          void this.startPairing();
          return;
        }
        try {
          const pollRes = await fetch(
            `${apiUrl}/api/pair/poll?token=${encodeURIComponent(pollToken)}`
          );
          if (!pollRes.ok) return;
          const poll = (await pollRes.json()) as { success: boolean; data: PairPollResponse };
          if (poll.data.claimed && poll.data.deviceToken) {
            clearInterval(this.pairPollTimer!);
            this.pairPollTimer = null;
            this.pairingCode = null;
            const settings = configService.getSettings();
            configService.updateSettings({
              bridge: { ...settings.bridge, deviceToken: poll.data.deviceToken },
            });
            logger.info('Bridge paired successfully');
            this.emit('paired');
            this.connect();
          }
        } catch (error: any) {
          logger.debug('Pairing poll failed (will retry):', error.message);
        }
      }, PAIR_POLL_INTERVAL);

      return { code };
    } catch (error: any) {
      logger.warn(`Could not reach MuteBeacon to start pairing: ${error.message}`);
      // Retry pairing later — server may simply be unreachable right now
      this.pairPollTimer = setInterval(() => {
        clearInterval(this.pairPollTimer!);
        this.pairPollTimer = null;
        void this.startPairing();
      }, BRIDGE_RECONNECT_DELAY * 2);
      return { error: error.message };
    }
  }

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  private connect(): void {
    if (this.stopped) return;
    const { serverUrl, deviceToken } = configService.getSettings().bridge;
    if (!deviceToken) return;

    logger.info(`Bridge connecting to ${serverUrl}...`);
    try {
      this.ws = new WebSocket(serverUrl);
    } catch (error: any) {
      logger.error('Bridge connection failed to initialize:', error.message);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.send({ type: 'device_auth', deviceToken });
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const message = JSON.parse(raw.toString()) as CloudMessage;
        this.handleMessage(message);
      } catch (error: any) {
        logger.error('Bridge received invalid message:', error.message);
      }
    });

    this.ws.on('close', () => {
      const wasConnected = this.connected;
      this.connected = false;
      this.clearSessionTimers();
      if (wasConnected) this.emit('connectionChanged', false);
      logger.info('Bridge connection closed');
      this.scheduleReconnect();
    });

    this.ws.on('error', (error: Error) => {
      logger.debug('Bridge socket error:', error.message);
    });
  }

  private handleMessage(message: CloudMessage): void {
    switch (message.type) {
      case 'auth_success': {
        this.connected = true;
        this.reconnectDelay = BRIDGE_RECONNECT_DELAY;
        logger.info('Bridge authenticated with MuteBeacon cloud');
        this.emit('connectionChanged', true);
        this.sendStatus();
        void this.runDiscovery();
        this.statusTimer = setInterval(() => this.sendStatus(), BRIDGE_STATUS_INTERVAL);
        this.discoveryTimer = setInterval(() => void this.runDiscovery(), BRIDGE_DISCOVERY_INTERVAL);
        break;
      }

      case 'beacon': {
        const { state, ttlMs, source } = message.payload;
        logger.info(`Beacon received from cloud: ${state} (source: ${source ?? 'unknown'})`);
        if (state === 'clear') {
          stateManager.clearSource('bridge');
        } else {
          stateManager.setSourceState('bridge', state, { ttlMs });
        }
        break;
      }

      case 'config_sync': {
        const managed = message.payload.devices.filter(d => d.enabled);
        const devices = managed.map(toWledDevice);
        configService.updateDevices(devices);
        logger.info(`Config sync applied: ${devices.length} device(s)`);
        // Re-apply the current state so new colors take effect immediately
        void wledService.updateAllDevices(stateManager.getEffectiveState(), devices);
        this.emit('configSynced', devices);
        break;
      }

      case 'command': {
        const { action, ip_address, color, brightness, deviceId } = message.payload;
        if (action === 'test_flash' || action === 'identify') {
          logger.info(`Cloud command: ${action} on ${ip_address}`);
          void (async () => {
            await wledService.setDeviceColor(ip_address, color ?? '#ffffff', brightness ?? 200, 0);
            // Return the device to the current effective state after a moment
            setTimeout(() => {
              const device = configService.getDevices().find(d => d.id === deviceId);
              if (device) {
                void wledService.restoreDeviceFromState(stateManager.getEffectiveState(), device);
              }
            }, 1500);
          })();
        }
        break;
      }

      case 'error': {
        logger.warn('Bridge server error:', message.payload.error);
        // An auth failure means our token is no longer valid — re-pair
        if (/auth/i.test(message.payload.error)) {
          logger.warn('Device token rejected; clearing and restarting pairing');
          void this.unpair();
        }
        break;
      }

      case 'connected':
      default:
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, BRIDGE_RECONNECT_MAX_DELAY);
  }

  // -------------------------------------------------------------------------
  // Upstream reports
  // -------------------------------------------------------------------------

  private sendStatus(): void {
    if (!this.connected) return;
    const statuses = wledService.getDeviceStatuses();
    this.send({
      type: 'status',
      payload: {
        discordConnected: discordService.getState().connected,
        effectiveState: stateManager.getEffectiveState(),
        version: app.getVersion(),
        wledDevices: Array.from(statuses.entries()).map(([ip, s]) => ({
          ip,
          online: s.online,
        })),
      },
    });
  }

  private async runDiscovery(): Promise<void> {
    if (!this.connected) return;
    try {
      const found = await discoveryService.scan();
      this.send({
        type: 'discovery_result',
        payload: {
          devices: found.map(d => ({ name: d.name, ip: d.ip, port: d.port })),
        },
      });
    } catch (error: any) {
      logger.warn('Bridge discovery failed:', error.message);
    }
  }

  private send(message: GatewayMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private clearSessionTimers(): void {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearSessionTimers();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pairPollTimer) {
      clearInterval(this.pairPollTimer);
      this.pairPollTimer = null;
    }
  }
}

export const bridgeService = new BridgeService();
