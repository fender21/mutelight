# MuteLight Future Architecture Plan

## Executive Summary

This document outlines the re-engineering plan for MuteLight to transform it from a Discord-WLED integration tool into a universal automation platform supporting multiple connectors. The new architecture will consist of:

1. **Local Desktop Application** - Handles connectors requiring local access (Discord RPC, local device discovery)
2. **Cloud Web Application** - Manages cloud-based connectors (webhooks, APIs) and provides centralized configuration
3. **Connector SDK** - Enables developers to build custom connectors
4. **Communication Bridge** - Secure connection between local and cloud components

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Cloud Web App                            │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────────┐  │
│  │  Web UI     │  │  API Server │  │  Connector Registry    │  │
│  │  (React)    │  │  (Node.js)  │  │  (Package Manager)     │  │
│  └─────────────┘  └─────────────┘  └────────────────────────┘  │
│                           │                                      │
│  ┌─────────────────────────────────────────────────┐           │
│  │          Cloud Connectors                        │           │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────┐  │           │
│  │  │Shopify  │ │ Stripe  │ │Webhooks │ │ ... │  │           │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────┘  │           │
│  └─────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                              │
                   WebSocket/REST API
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    Local Desktop App                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Tray UI    │  │ Bridge Service│  │  Connector Manager   │  │
│  │  (Electron) │  │  (WebSocket) │  │  (Plugin System)     │  │
│  └─────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────┐       │
│  │          Local Connectors                            │       │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │       │
│  │  │Discord  │ │  WLED   │ │  USB    │ │Local API│  │       │
│  │  │  RPC    │ │Discovery│ │ Devices │ │ Servers │  │       │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │       │
│  └─────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: Core Infrastructure Changes

### 1.1 Connector Interface System

Create a standardized connector interface that all integrations must implement:

```typescript
// Base connector interface
interface IConnector extends EventEmitter {
  // Metadata
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly type: 'local' | 'cloud';
  readonly capabilities: ConnectorCapabilities;
  
  // Lifecycle
  initialize(config: ConnectorConfig): Promise<void>;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  destroy(): Promise<void>;
  
  // State
  getState(): ConnectorState;
  getHealth(): Promise<HealthStatus>;
  
  // Configuration
  getConfigSchema(): ConfigSchema;
  validateConfig(config: unknown): ValidationResult;
  updateConfig(config: Partial<ConnectorConfig>): Promise<void>;
  
  // Actions
  executeAction(action: string, params: unknown): Promise<ActionResult>;
  getAvailableActions(): ActionDefinition[];
}

// Connector capabilities
interface ConnectorCapabilities {
  supportsEvents: boolean;
  supportsPolling: boolean;
  supportsWebhooks: boolean;
  supportsBidirectional: boolean;
  requiresAuth: boolean;
  authType?: 'oauth2' | 'apikey' | 'basic' | 'custom';
}

// State management
interface ConnectorState {
  connected: boolean;
  lastUpdate: number;
  error?: string;
  data: Record<string, unknown>;
}
```

### 1.2 Event System Enhancement

Implement a robust event system for connector communication:

```typescript
// Event types
enum EventType {
  STATE_CHANGED = 'state_changed',
  ACTION_TRIGGERED = 'action_triggered',
  ERROR = 'error',
  CONNECTION_CHANGED = 'connection_changed',
  CONFIG_UPDATED = 'config_updated'
}

// Event routing
interface EventRoute {
  sourceConnector: string;
  targetConnector: string;
  sourceEvent: string;
  targetAction: string;
  transformation?: EventTransformation;
  conditions?: EventCondition[];
}

// Event transformation
interface EventTransformation {
  type: 'script' | 'template' | 'mapping';
  config: unknown;
}
```

### 1.3 Local Application Changes

#### Remove UI Components
- Remove React renderer process
- Convert to system tray application only
- Minimal configuration UI in tray menu
- Delegate all complex UI to web app

#### Add Bridge Service
```typescript
class BridgeService extends EventEmitter {
  private wsClient: WebSocket;
  private apiClient: ApiClient;
  private authToken: string;
  
  // Establish secure connection to cloud
  connect(cloudUrl: string, authToken: string): Promise<void>;
  
  // Sync local connector states to cloud
  syncConnectorStates(): Promise<void>;
  
  // Forward local events to cloud
  forwardEvent(event: ConnectorEvent): Promise<void>;
  
  // Receive commands from cloud
  handleCloudCommand(command: CloudCommand): Promise<void>;
  
  // Manage authentication
  refreshAuth(): Promise<string>;
}
```

#### Connector Manager Refactor
```typescript
class ConnectorManager {
  private connectors: Map<string, IConnector>;
  private loader: ConnectorLoader;
  
  // Load connectors from plugins directory
  loadConnectors(directory: string): Promise<void>;
  
  // Install connector from registry
  installConnector(packageName: string): Promise<void>;
  
  // Manage connector lifecycle
  startConnector(id: string): Promise<void>;
  stopConnector(id: string): Promise<void>;
  
  // Route events between connectors
  setupEventRouting(routes: EventRoute[]): void;
}
```

### 1.4 Plugin System

Enable third-party connector development:

```typescript
// Connector package structure
interface ConnectorPackage {
  name: string;
  version: string;
  main: string;
  mutelight: {
    type: 'local' | 'cloud';
    connectorClass: string;
    configSchema: string;
    permissions: string[];
  };
  dependencies: Record<string, string>;
}

// Connector loader
class ConnectorLoader {
  // Validate connector package
  validatePackage(packagePath: string): ValidationResult;
  
  // Load connector in sandboxed environment
  loadConnector(packagePath: string): Promise<IConnector>;
  
  // Manage permissions
  checkPermissions(connector: IConnector, required: string[]): boolean;
}
```

## Phase 2: Cloud Web Application

### 2.1 Architecture

#### Backend Services
```
┌─────────────────────────────────────────────────────────┐
│                   API Gateway                            │
│              (Authentication & Routing)                  │
└─────────────────────────────────────────────────────────┘
                            │
    ┌───────────────────────┼───────────────────────┐
    │                       │                       │
┌───────────────┐  ┌────────────────┐  ┌──────────────────┐
│  Auth Service │  │ Config Service │  │ Connector Service│
│  (JWT/OAuth)  │  │   (Database)   │  │   (Registry)     │
└───────────────┘  └────────────────┘  └──────────────────┘
    │                       │                       │
┌───────────────┐  ┌────────────────┐  ┌──────────────────┐
│ Bridge Service│  │ Events Service │  │ Analytics Service│
│  (WebSocket)  │  │ (Event Router) │  │   (Metrics)      │
└───────────────┘  └────────────────┘  └──────────────────┘
```

#### Database Schema
```sql
-- Users & Authentication
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Connector Instances
CREATE TABLE connector_instances (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  connector_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  config JSONB NOT NULL,
  location 'local' | 'cloud' NOT NULL,
  device_id UUID, -- For local connectors
  created_at TIMESTAMP DEFAULT NOW()
);

-- Event Routes (Automations)
CREATE TABLE event_routes (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  source_connector_id UUID REFERENCES connector_instances(id),
  source_event VARCHAR(255) NOT NULL,
  target_connector_id UUID REFERENCES connector_instances(id),
  target_action VARCHAR(255) NOT NULL,
  transformation JSONB,
  conditions JSONB,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Connector Registry
CREATE TABLE connector_registry (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  type 'local' | 'cloud' NOT NULL,
  author VARCHAR(255),
  description TEXT,
  config_schema JSONB NOT NULL,
  capabilities JSONB NOT NULL,
  package_url VARCHAR(500),
  verified BOOLEAN DEFAULT false,
  downloads INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.2 Web UI Features

#### Dashboard
- Overview of all connectors (local and cloud)
- Real-time status updates via WebSocket
- Quick actions and controls

#### Connector Management
- Browse connector registry
- Install/uninstall connectors
- Configure connector instances
- Test connections

#### Automation Builder
- Visual flow editor for creating event routes
- Condition builder with UI
- Transformation editor (visual or code)
- Testing and debugging tools

#### Settings
- User account management
- API key generation
- Device management (registered local apps)
- Billing/usage (for cloud connectors)

### 2.3 API Design

#### RESTful Endpoints
```
# Authentication
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
POST   /api/auth/register

# Connectors
GET    /api/connectors                 # List registry
GET    /api/connectors/:id             # Get connector details
GET    /api/connectors/instances       # List user's instances
POST   /api/connectors/instances       # Create instance
PUT    /api/connectors/instances/:id   # Update instance
DELETE /api/connectors/instances/:id   # Delete instance
POST   /api/connectors/instances/:id/test # Test connection

# Automations
GET    /api/automations                # List automations
POST   /api/automations                # Create automation
PUT    /api/automations/:id            # Update automation
DELETE /api/automations/:id            # Delete automation
POST   /api/automations/:id/toggle     # Enable/disable
POST   /api/automations/:id/test       # Test automation

# Devices (Local Apps)
GET    /api/devices                    # List registered devices
POST   /api/devices/register           # Register new device
DELETE /api/devices/:id                # Unregister device
GET    /api/devices/:id/connectors     # List device connectors
```

#### WebSocket Events
```typescript
// Client -> Server
interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'command';
  payload: unknown;
}

// Server -> Client
interface ServerMessage {
  type: 'state_update' | 'event' | 'error' | 'command_result';
  connectorId?: string;
  payload: unknown;
}
```

## Phase 3: Connector Examples

### 3.1 Discord Connector (Local)

Refactor existing Discord service to new connector interface:

```typescript
class DiscordConnector extends BaseConnector implements IConnector {
  readonly id = 'discord-rpc';
  readonly name = 'Discord RPC';
  readonly type = 'local';
  readonly capabilities = {
    supportsEvents: true,
    supportsPolling: true,
    supportsWebhooks: false,
    supportsBidirectional: false,
    requiresAuth: true,
    authType: 'oauth2' as const
  };
  
  getAvailableActions() {
    return [];  // Discord is read-only
  }
  
  // Events emitted:
  // - voice_state_changed: {muted, deafened, speaking, channel}
  // - presence_updated: {status, activities}
  // - connection_changed: {connected}
}
```

### 3.2 WLED Connector (Local)

Refactor WLED service:

```typescript
class WLEDConnector extends BaseConnector implements IConnector {
  readonly id = 'wled';
  readonly name = 'WLED';
  readonly type = 'local';
  readonly capabilities = {
    supportsEvents: false,
    supportsPolling: true,
    supportsWebhooks: false,
    supportsBidirectional: true,
    requiresAuth: false
  };
  
  getAvailableActions() {
    return [
      {
        name: 'set_color',
        params: { color: 'string', brightness: 'number' }
      },
      {
        name: 'set_effect',
        params: { effect: 'number', speed: 'number' }
      },
      {
        name: 'toggle_power',
        params: { on: 'boolean' }
      }
    ];
  }
}
```

### 3.3 Shopify Connector (Cloud)

Example cloud connector:

```typescript
class ShopifyConnector extends BaseConnector implements IConnector {
  readonly id = 'shopify';
  readonly name = 'Shopify';
  readonly type = 'cloud';
  readonly capabilities = {
    supportsEvents: true,
    supportsPolling: false,
    supportsWebhooks: true,
    supportsBidirectional: true,
    requiresAuth: true,
    authType: 'oauth2' as const
  };
  
  getAvailableActions() {
    return [
      {
        name: 'create_discount',
        params: { code: 'string', percentage: 'number' }
      },
      {
        name: 'update_inventory',
        params: { sku: 'string', quantity: 'number' }
      },
      {
        name: 'send_notification',
        params: { customerId: 'string', message: 'string' }
      }
    ];
  }
  
  // Webhook events:
  // - order_created: {order}
  // - product_updated: {product}
  // - customer_created: {customer}
}
```

### 3.4 Stripe Connector (Cloud)

```typescript
class StripeConnector extends BaseConnector implements IConnector {
  readonly id = 'stripe';
  readonly name = 'Stripe';
  readonly type = 'cloud';
  readonly capabilities = {
    supportsEvents: true,
    supportsPolling: false,
    supportsWebhooks: true,
    supportsBidirectional: true,
    requiresAuth: true,
    authType: 'apikey' as const
  };
  
  // Webhook events:
  // - payment_succeeded: {payment_intent}
  // - subscription_created: {subscription}
  // - invoice_paid: {invoice}
}
```

## Phase 4: Developer SDK

### 4.1 Connector Development Kit

```typescript
// @mutelight/connector-sdk
export {
  BaseConnector,
  IConnector,
  ConnectorConfig,
  ConnectorState,
  ConnectorCapabilities,
  ActionDefinition,
  EventDefinition,
  ConfigSchema,
  // Decorators
  Connector,
  Action,
  Event,
  ConfigField,
  // Utilities
  Logger,
  Storage,
  HttpClient,
  ValidationHelper
};
```

### 4.2 CLI Tool

```bash
# Connector development CLI
npx @mutelight/cli create-connector my-connector
npx @mutelight/cli test-connector ./my-connector
npx @mutelight/cli publish-connector ./my-connector
```

### 4.3 Documentation

- Getting Started Guide
- Connector API Reference
- Best Practices
- Example Connectors
- Testing Guide
- Publishing Guide

## Phase 5: Migration Strategy

### 5.1 Gradual Migration

1. **Phase 5.1.1**: Refactor services to connector interface (local app only)
2. **Phase 5.1.2**: Add bridge service to local app
3. **Phase 5.1.3**: Deploy basic cloud app with authentication
4. **Phase 5.1.4**: Migrate UI to cloud app
5. **Phase 5.1.5**: Add connector registry and SDK
6. **Phase 5.1.6**: Open platform for third-party developers

### 5.2 Backward Compatibility

- Maintain existing config format initially
- Auto-migrate user settings to cloud on first login
- Keep local-only mode for users who don't want cloud features

### 5.3 Data Migration

```typescript
class ConfigMigrator {
  // Migrate from electron-store to cloud database
  async migrateToCloud(localConfig: LocalConfig, userId: string): Promise<void> {
    // Convert devices to WLED connector instances
    for (const device of localConfig.devices) {
      await this.createConnectorInstance({
        userId,
        connectorId: 'wled',
        name: device.name,
        config: {
          ip: device.ip,
          timeout: 5000
        }
      });
    }
    
    // Convert settings
    await this.migrateSettings(localConfig.settings, userId);
  }
}
```

## Phase 6: Security Considerations

### 6.1 Authentication & Authorization

- JWT tokens for API authentication
- OAuth2 for third-party connectors
- Device registration with unique tokens
- Scope-based permissions for connectors

### 6.2 Data Security

- End-to-end encryption for sensitive config
- Secure WebSocket connections (WSS)
- API rate limiting
- Input validation on all endpoints
- Sandboxed connector execution

### 6.3 Privacy

- Local-first approach (local connectors stay local)
- Opt-in cloud features
- Data deletion on account termination
- GDPR compliance

## Implementation Timeline

### Month 1-2: Foundation
- Refactor existing services to connector interface
- Implement connector manager and loader
- Create base connector SDK

### Month 3-4: Local App Changes
- Remove UI components
- Add bridge service
- Implement plugin system
- Update build process

### Month 5-6: Cloud Infrastructure
- Set up cloud services (auth, config, events)
- Implement WebSocket bridge
- Create REST API
- Set up database

### Month 7-8: Web Application
- Build React web UI
- Implement automation builder
- Create connector registry UI
- Add device management

### Month 9-10: Developer Experience
- Finalize SDK
- Create CLI tools
- Write documentation
- Build example connectors

### Month 11-12: Launch Preparation
- Security audit
- Performance optimization
- Beta testing program
- Marketing website
- Developer onboarding

## Success Metrics

1. **Platform Adoption**
   - Number of registered users
   - Active connector instances
   - Created automations

2. **Developer Ecosystem**
   - Published connectors
   - Active developers
   - SDK downloads

3. **Performance**
   - Event latency < 100ms
   - API response time < 200ms
   - 99.9% uptime

4. **User Satisfaction**
   - Setup time < 5 minutes
   - Support ticket volume
   - User retention rate

## Conclusion

This architecture transformation positions MuteLight as a universal automation platform while maintaining its core strength in local device integration. The separation of local and cloud components provides flexibility, security, and scalability while enabling a thriving developer ecosystem through the connector SDK.

The phased approach ensures continuous delivery of value while building toward the complete platform vision. By maintaining backward compatibility and providing clear migration paths, existing users can adopt new features at their own pace.