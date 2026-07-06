/**
 * MuteBeacon bridge protocol — messages exchanged between the desktop
 * gateway (Electron client) and the MuteBeacon cloud over WebSocket,
 * plus the REST DTOs for the public trigger/pairing endpoints.
 *
 * MIRROR COPY for the Electron client. The canonical file lives at
 * web/shared/protocol.ts (separate TS project root) — keep both in sync.
 */

// ---------------------------------------------------------------------------
// Beacon states
// ---------------------------------------------------------------------------

/** States with built-in default colors. Integrations may send any string. */
export type KnownBeaconState =
  | 'idle'
  | 'connected'
  | 'speaking'
  | 'muted'
  | 'deafened'
  | 'streaming'
  | 'off'
  | 'claude-working'
  | 'claude-attention'
  | 'claude-done';

/** Open set: known states get defaults, unknown states need explicit colors. */
export type BeaconState = KnownBeaconState | (string & {});

// ---------------------------------------------------------------------------
// Device configuration (cloud-owned, synced down to the gateway)
// ---------------------------------------------------------------------------

export interface EffectConfigDTO {
  effectId: number; // 0 = Solid
  speed: number; // 0-255
  intensity: number; // 0-255
}

export interface StateLightConfigDTO {
  color: string; // '#RRGGBB'
  brightness: number; // 0-255
  enabled: boolean;
  effect?: EffectConfigDTO;
}

/** A WLED device as managed in the MuteBeacon dashboard. */
export interface ManagedDevice {
  id: string;
  name: string;
  ip_address: string;
  enabled: boolean;
  /** Keyed by BeaconState; missing keys fall back to defaults. */
  stateColors: Partial<Record<string, StateLightConfigDTO>>;
  defaultBrightness?: number; // 0-255
  transitionTime?: number; // ms
}

/** A WLED device the gateway found via mDNS (not yet necessarily managed). */
export interface DiscoveredDevice {
  name: string;
  ip: string;
  port: number;
}

// ---------------------------------------------------------------------------
// WebSocket messages: gateway -> cloud
// ---------------------------------------------------------------------------

export interface GatewayStatusPayload {
  discordConnected: boolean;
  effectiveState: BeaconState;
  version: string;
  wledDevices: Array<{ ip: string; online: boolean }>;
}

export type GatewayMessage =
  | { type: 'device_auth'; deviceToken: string }
  | { type: 'status'; payload: GatewayStatusPayload }
  | { type: 'discovery_result'; payload: { devices: DiscoveredDevice[] } }
  | { type: 'state_report'; payload: { effectiveState: BeaconState; source: string } };

// ---------------------------------------------------------------------------
// WebSocket messages: cloud -> gateway (also reused for dashboard live view)
// ---------------------------------------------------------------------------

export type CloudMessage =
  | { type: 'connected'; payload: { message: string } }
  | { type: 'auth_success'; payload: { deviceId?: string; userId?: string } }
  | { type: 'beacon'; payload: BeaconEventPayload }
  | { type: 'config_sync'; payload: { devices: ManagedDevice[] } }
  | { type: 'command'; payload: GatewayCommandPayload }
  | { type: 'gateway_update'; payload: GatewayLiveUpdate } // cloud -> dashboard
  | { type: 'error'; payload: { error: string } };

export interface BeaconEventPayload {
  state: BeaconState;
  /** Transient states auto-clear after this; omit for sticky states. */
  ttlMs?: number;
  /** Integration that fired the trigger (e.g. 'claude', 'webhook'). */
  source?: string;
}

export interface GatewayCommandPayload {
  action: 'test_flash' | 'identify';
  deviceId: string; // ManagedDevice id
  ip_address: string;
  color?: string;
  brightness?: number;
}

/** Pushed to dashboard sessions when a gateway reports in. */
export interface GatewayLiveUpdate {
  gatewayId: string;
  online: boolean;
  status?: GatewayStatusPayload;
  discovered?: DiscoveredDevice[];
}

// ---------------------------------------------------------------------------
// REST DTOs
// ---------------------------------------------------------------------------

/**
 * Pairing flow (TV-app style):
 * 1. Client: POST /api/pair/start -> { code, pollToken } and shows the code.
 * 2. User types the code into the dashboard -> POST /api/pair/claim (JWT auth).
 * 3. Client: GET /api/pair/poll?token=... until { claimed: true, deviceToken }.
 */
export interface PairStartResponse {
  code: string; // short human code, e.g. 'K7F3QP'
  pollToken: string;
  expiresInMs: number;
}

export interface PairPollResponse {
  claimed: boolean;
  deviceToken?: string; // long-lived gateway credential, returned once
}

/** POST /api/pair/claim — dashboard user claims a code shown by the client. */
export interface PairClaimRequest {
  code: string;
  name?: string; // friendly gateway name
}

/**
 * POST /api/beacon — the universal trigger endpoint (API-key auth).
 * Send state 'clear' to release the bridge override and fall back to
 * whatever the gateway's other sources (Discord, manual) say.
 */
export interface BeaconRequest {
  state: BeaconState;
  ttlMs?: number;
  source?: string;
}

export interface GatewaySummary {
  id: string;
  name: string;
  online: boolean;
  lastSeen: number | null;
  createdAt: string;
}

export interface ApiKeySummary {
  id: string;
  label: string;
  /** Only returned once, at creation time. */
  key?: string;
  prefix: string;
  createdAt: string;
}
