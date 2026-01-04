export interface User {
  id: string;
  email: string;
  createdAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ConnectorRegistry {
  id: string;
  name: string;
  version: string;
  type: 'local' | 'cloud';
  author: string;
  description: string;
  configSchema: Record<string, any>;
  capabilities: ConnectorCapabilities;
  packageUrl?: string;
  verified: boolean;
  downloads: number;
  createdAt: Date;
}

export interface ConnectorCapabilities {
  supportsEvents: boolean;
  supportsPolling: boolean;
  supportsWebhooks: boolean;
  supportsBidirectional: boolean;
  requiresAuth: boolean;
  authType?: 'oauth2' | 'apikey' | 'basic' | 'custom';
}

export interface ConnectorInstance {
  id: string;
  userId: string;
  connectorId: string;
  name: string;
  config: Record<string, any>;
  location: 'local' | 'cloud';
  deviceId?: string;
  state?: ConnectorState;
  createdAt: Date;
}

export interface ConnectorState {
  connected: boolean;
  lastUpdate: number;
  error?: string;
  data: Record<string, any>;
}

export interface EventRoute {
  id: string;
  userId: string;
  name: string;
  sourceConnectorId: string;
  sourceEvent: string;
  targetConnectorId: string;
  targetAction: string;
  transformation?: EventTransformation;
  conditions?: EventCondition[];
  enabled: boolean;
  createdAt: Date;
}

export interface EventTransformation {
  type: 'script' | 'template' | 'mapping';
  config: any;
}

export interface EventCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'not_contains';
  value: any;
}

export interface Device {
  id: string;
  userId: string;
  name: string;
  token: string;
  lastSeen: Date;
  connectors: string[];
  createdAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface WebSocketMessage {
  type: 'state_update' | 'event' | 'error' | 'command' | 'command_result';
  connectorId?: string;
  payload: any;
  timestamp: number;
}