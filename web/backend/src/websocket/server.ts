import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { beaconService } from '../services/beacon.service';
import type {
  BeaconEventPayload,
  CloudMessage,
  DiscoveredDevice,
  GatewayCommandPayload,
  GatewayStatusPayload,
} from '@shared/protocol';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string; // set for dashboard sessions
  gatewayId?: string; // set for gateway (desktop client) sessions
  isAlive?: boolean;
}

/**
 * One WS server, two kinds of clients:
 *  - gateways (desktop clients) authenticate with a device token
 *  - dashboard sessions authenticate with a user JWT
 * Beacons and config flow down to gateways; status/discovery flow up
 * and are mirrored to the owning user's dashboard sessions.
 */
export class WebSocketServer {
  private wss!: WSServer;
  private server!: ReturnType<typeof createServer>;
  private heartbeatInterval?: NodeJS.Timeout;

  private gatewaySockets = new Map<string, AuthenticatedWebSocket>(); // gatewayId -> ws
  private userGateways = new Map<string, Set<string>>(); // userId -> gatewayIds online
  private userSockets = new Map<string, Set<AuthenticatedWebSocket>>(); // userId -> dashboard sessions
  private gatewayOwner = new Map<string, string>(); // gatewayId -> userId
  private lastStatus = new Map<string, GatewayStatusPayload>(); // gatewayId -> last status
  private lastDiscovered = new Map<string, DiscoveredDevice[]>(); // gatewayId -> last mDNS scan

  async initialize() {
    this.server = createServer();
    this.wss = new WSServer({ server: this.server });

    this.setupEventHandlers();
    this.startHeartbeat();

    await new Promise<void>((resolve) => {
      this.server.listen(config.websocket.port, () => {
        logger.info(`WebSocket server listening on port ${config.websocket.port}`);
        resolve();
      });
    });
  }

  private setupEventHandlers() {
    this.wss.on('connection', (ws: AuthenticatedWebSocket) => {
      ws.isAlive = true;

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(ws, message);
        } catch (error) {
          logger.error('Failed to process WebSocket message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      ws.on('close', () => {
        this.removeClient(ws);
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        this.removeClient(ws);
      });

      this.sendMessage(ws, {
        type: 'connected',
        payload: { message: 'Connected to MuteBeacon' },
      });
    });
  }

  private async handleMessage(ws: AuthenticatedWebSocket, message: any) {
    switch (message.type) {
      case 'auth':
        await this.handleUserAuth(ws, message.token);
        break;

      case 'device_auth':
        this.handleGatewayAuth(ws, message.deviceToken);
        break;

      case 'status':
        this.handleGatewayStatus(ws, message.payload);
        break;

      case 'discovery_result':
        this.handleDiscoveryResult(ws, message.payload?.devices ?? []);
        break;

      case 'state_report':
        // Covered by status reports; accepted for forward compatibility
        break;

      default:
        this.sendError(ws, `Unknown message type: ${message.type}`);
    }
  }

  // -------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------

  private async handleUserAuth(ws: AuthenticatedWebSocket, token: string) {
    try {
      const payload = jwt.verify(token, config.jwt.accessSecret) as any;
      ws.userId = payload.userId;
      let set = this.userSockets.get(payload.userId);
      if (!set) {
        set = new Set();
        this.userSockets.set(payload.userId, set);
      }
      set.add(ws);

      this.sendMessage(ws, { type: 'auth_success', payload: { userId: payload.userId } });

      // Bring the fresh dashboard session up to date with live gateway state
      for (const gatewayId of this.userGateways.get(payload.userId) ?? []) {
        this.sendMessage(ws, {
          type: 'gateway_update',
          payload: {
            gatewayId,
            online: true,
            status: this.lastStatus.get(gatewayId),
            discovered: this.lastDiscovered.get(gatewayId),
          },
        });
      }
    } catch (error) {
      this.sendError(ws, 'Authentication failed');
      ws.close();
    }
  }

  private handleGatewayAuth(ws: AuthenticatedWebSocket, deviceToken: string) {
    const gateway = beaconService.getGatewayByToken(deviceToken ?? '');
    if (!gateway) {
      this.sendError(ws, 'Gateway authentication failed');
      ws.close();
      return;
    }

    // Replace any stale socket for this gateway
    const existing = this.gatewaySockets.get(gateway.id);
    if (existing && existing !== ws) {
      existing.terminate();
    }

    ws.gatewayId = gateway.id;
    this.gatewaySockets.set(gateway.id, ws);
    this.gatewayOwner.set(gateway.id, gateway.userId);
    let set = this.userGateways.get(gateway.userId);
    if (!set) {
      set = new Set();
      this.userGateways.set(gateway.userId, set);
    }
    set.add(gateway.id);
    beaconService.touchGateway(gateway.id);

    logger.info(`Gateway connected: ${gateway.name} (${gateway.id})`);
    this.sendMessage(ws, { type: 'auth_success', payload: { deviceId: gateway.id } });

    // Push current device config immediately so the gateway cache is fresh
    this.pushConfigToGateway(gateway.id, gateway.userId);
    this.notifyUser(gateway.userId, { type: 'gateway_update', payload: { gatewayId: gateway.id, online: true } });
  }

  // -------------------------------------------------------------------
  // Upstream from gateways -> mirrored to dashboard sessions
  // -------------------------------------------------------------------

  private handleGatewayStatus(ws: AuthenticatedWebSocket, status: GatewayStatusPayload) {
    if (!ws.gatewayId) return;
    this.lastStatus.set(ws.gatewayId, status);
    beaconService.touchGateway(ws.gatewayId);
    const userId = this.gatewayOwner.get(ws.gatewayId);
    if (userId) {
      this.notifyUser(userId, {
        type: 'gateway_update',
        payload: { gatewayId: ws.gatewayId, online: true, status },
      });
    }
  }

  private handleDiscoveryResult(ws: AuthenticatedWebSocket, devices: DiscoveredDevice[]) {
    if (!ws.gatewayId) return;
    this.lastDiscovered.set(ws.gatewayId, devices);
    const userId = this.gatewayOwner.get(ws.gatewayId);
    if (userId) {
      this.notifyUser(userId, {
        type: 'gateway_update',
        payload: { gatewayId: ws.gatewayId, online: true, discovered: devices },
      });
    }
  }

  // -------------------------------------------------------------------
  // Public API used by REST routes
  // -------------------------------------------------------------------

  /** Deliver a beacon trigger to every online gateway of this user. */
  sendBeaconToUser(userId: string, payload: BeaconEventPayload): number {
    let delivered = 0;
    for (const gatewayId of this.userGateways.get(userId) ?? []) {
      const ws = this.gatewaySockets.get(gatewayId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, { type: 'beacon', payload });
        delivered++;
      }
    }
    return delivered;
  }

  /** Push the user's full device config to all their gateways. */
  pushConfigToUser(userId: string): void {
    for (const gatewayId of this.userGateways.get(userId) ?? []) {
      this.pushConfigToGateway(gatewayId, userId);
    }
  }

  /**
   * Send a command (e.g. test flash) to ALL online gateways — only the
   * gateway on the same LAN as the device can actually reach it, and the
   * others fail harmlessly.
   */
  sendCommandToUser(userId: string, payload: GatewayCommandPayload): boolean {
    let sent = false;
    for (const gatewayId of this.userGateways.get(userId) ?? []) {
      const ws = this.gatewaySockets.get(gatewayId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.sendMessage(ws, { type: 'command', payload });
        sent = true;
      }
    }
    return sent;
  }

  isGatewayOnline(gatewayId: string): boolean {
    const ws = this.gatewaySockets.get(gatewayId);
    return !!ws && ws.readyState === WebSocket.OPEN;
  }

  getDiscoveredForUser(userId: string): DiscoveredDevice[] {
    const seen = new Map<string, DiscoveredDevice>();
    for (const gatewayId of this.userGateways.get(userId) ?? []) {
      for (const d of this.lastDiscovered.get(gatewayId) ?? []) {
        seen.set(d.ip, d);
      }
    }
    return Array.from(seen.values());
  }

  private pushConfigToGateway(gatewayId: string, userId: string): void {
    const ws = this.gatewaySockets.get(gatewayId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.sendMessage(ws, {
        type: 'config_sync',
        payload: { devices: beaconService.listDevices(userId) },
      });
    }
  }

  private notifyUser(userId: string, message: CloudMessage): void {
    for (const ws of this.userSockets.get(userId) ?? []) {
      this.sendMessage(ws, message);
    }
  }

  // -------------------------------------------------------------------
  // Plumbing
  // -------------------------------------------------------------------

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws: AuthenticatedWebSocket) => {
        if (!ws.isAlive) {
          ws.terminate();
          this.removeClient(ws);
          return;
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  private removeClient(ws: AuthenticatedWebSocket) {
    if (ws.userId) {
      this.userSockets.get(ws.userId)?.delete(ws);
    }
    if (ws.gatewayId) {
      const gatewayId = ws.gatewayId;
      if (this.gatewaySockets.get(gatewayId) === ws) {
        this.gatewaySockets.delete(gatewayId);
        const userId = this.gatewayOwner.get(gatewayId);
        if (userId) {
          this.userGateways.get(userId)?.delete(gatewayId);
          this.notifyUser(userId, {
            type: 'gateway_update',
            payload: { gatewayId, online: false },
          });
        }
        logger.info(`Gateway disconnected: ${gatewayId}`);
      }
    }
  }

  private sendMessage(ws: WebSocket, message: CloudMessage | { type: string; payload: any }) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ ...message, timestamp: Date.now() }));
    }
  }

  private sendError(ws: WebSocket, error: string) {
    this.sendMessage(ws, { type: 'error', payload: { error } });
  }

  async close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.wss.clients.forEach((client) => client.close());
    return new Promise<void>((resolve) => {
      this.wss.close(() => {
        this.server.close(() => {
          logger.info('WebSocket server closed');
          resolve();
        });
      });
    });
  }
}

// Singleton so REST routes can push into live sockets
export const wsServer = new WebSocketServer();
