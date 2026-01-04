import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { config } from '../config';
import { logger } from '../utils/logger';
import { WebSocketMessage } from '@shared/types';
import jwt from 'jsonwebtoken';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  deviceId?: string;
  isAlive?: boolean;
}

export class WebSocketServer {
  private wss: WSServer;
  private server: ReturnType<typeof createServer>;
  private clients: Map<string, AuthenticatedWebSocket> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;

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
    this.wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
      logger.info('New WebSocket connection attempt');
      
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
        logger.info('WebSocket connection closed');
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        this.removeClient(ws);
      });

      // Send connection confirmation
      this.sendMessage(ws, {
        type: 'connected',
        payload: { message: 'Connected to MuteLight WebSocket server' },
      });
    });
  }

  private async handleMessage(ws: AuthenticatedWebSocket, message: any) {
    switch (message.type) {
      case 'auth':
        await this.handleAuth(ws, message.token);
        break;
        
      case 'device_auth':
        await this.handleDeviceAuth(ws, message.deviceToken);
        break;
        
      case 'subscribe':
        await this.handleSubscribe(ws, message.connectors);
        break;
        
      case 'unsubscribe':
        await this.handleUnsubscribe(ws, message.connectors);
        break;
        
      case 'command':
        await this.handleCommand(ws, message);
        break;
        
      default:
        this.sendError(ws, `Unknown message type: ${message.type}`);
    }
  }

  private async handleAuth(ws: AuthenticatedWebSocket, token: string) {
    try {
      const payload = jwt.verify(token, config.jwt.accessSecret) as any;
      ws.userId = payload.userId;
      this.clients.set(`user:${payload.userId}`, ws);
      
      this.sendMessage(ws, {
        type: 'auth_success',
        payload: { userId: payload.userId },
      });
    } catch (error) {
      this.sendError(ws, 'Authentication failed');
      ws.close();
    }
  }

  private async handleDeviceAuth(ws: AuthenticatedWebSocket, deviceToken: string) {
    // TODO: Validate device token against database
    ws.deviceId = deviceToken; // For now, use token as ID
    this.clients.set(`device:${deviceToken}`, ws);
    
    this.sendMessage(ws, {
      type: 'auth_success',
      payload: { deviceId: deviceToken },
    });
  }

  private async handleSubscribe(ws: AuthenticatedWebSocket, connectorIds: string[]) {
    // TODO: Store subscriptions in database or memory
    this.sendMessage(ws, {
      type: 'subscribed',
      payload: { connectorIds },
    });
  }

  private async handleUnsubscribe(ws: AuthenticatedWebSocket, connectorIds: string[]) {
    // TODO: Remove subscriptions
    this.sendMessage(ws, {
      type: 'unsubscribed',
      payload: { connectorIds },
    });
  }

  private async handleCommand(ws: AuthenticatedWebSocket, message: any) {
    const { targetDevice, command, params } = message;
    
    // Forward command to target device
    const deviceWs = this.clients.get(`device:${targetDevice}`);
    if (deviceWs && deviceWs.readyState === WebSocket.OPEN) {
      this.sendMessage(deviceWs, {
        type: 'command',
        payload: { command, params, requestId: message.requestId },
      });
    } else {
      this.sendError(ws, 'Target device not connected');
    }
  }

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
    }, 30000); // 30 seconds
  }

  private removeClient(ws: AuthenticatedWebSocket) {
    if (ws.userId) {
      this.clients.delete(`user:${ws.userId}`);
    }
    if (ws.deviceId) {
      this.clients.delete(`device:${ws.deviceId}`);
    }
  }

  private sendMessage(ws: WebSocket, message: Partial<WebSocketMessage>) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        ...message,
        timestamp: Date.now(),
      }));
    }
  }

  private sendError(ws: WebSocket, error: string) {
    this.sendMessage(ws, {
      type: 'error',
      payload: { error },
    });
  }

  // Public methods for broadcasting
  public broadcastToUser(userId: string, message: Partial<WebSocketMessage>) {
    const ws = this.clients.get(`user:${userId}`);
    if (ws) {
      this.sendMessage(ws, message);
    }
  }

  public broadcastToDevice(deviceId: string, message: Partial<WebSocketMessage>) {
    const ws = this.clients.get(`device:${deviceId}`);
    if (ws) {
      this.sendMessage(ws, message);
    }
  }

  public broadcastToAll(message: Partial<WebSocketMessage>) {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        this.sendMessage(client, message);
      }
    });
  }

  async close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    // Close all connections
    this.wss.clients.forEach((client) => {
      client.close();
    });
    
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