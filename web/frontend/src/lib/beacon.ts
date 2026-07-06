import { api } from './api';
import type { ApiResponse } from '../../../shared/types';
import type {
  ApiKeySummary,
  DiscoveredDevice,
  GatewaySummary,
  ManagedDevice,
  StateLightConfigDTO,
} from '../../../shared/protocol';

/** Extract a readable message from an axios/backend error. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const err = error as { response?: { data?: { error?: string } }; message?: string };
  return err?.response?.data?.error || err?.message || fallback;
}

// ---------------------------------------------------------------------------
// Gateways + pairing
// ---------------------------------------------------------------------------

export const gatewaysApi = {
  async list(): Promise<GatewaySummary[]> {
    const res = await api.get<ApiResponse<{ gateways: GatewaySummary[] }>>('/gateways');
    return res.data.data?.gateways ?? [];
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/gateways/${id}`);
  },
};

export const pairApi = {
  async claim(code: string, name?: string): Promise<GatewaySummary> {
    const res = await api.post<ApiResponse<{ gateway: GatewaySummary }>>('/pair/claim', {
      code,
      ...(name?.trim() ? { name: name.trim() } : {}),
    });
    return res.data.data!.gateway;
  },
};

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export interface DeviceListResult {
  devices: ManagedDevice[];
  discovered: DiscoveredDevice[];
}

export interface CreateDeviceInput {
  name: string;
  ip_address: string;
  enabled?: boolean;
  stateColors?: Partial<Record<string, StateLightConfigDTO>>;
  defaultBrightness?: number;
  transitionTime?: number;
}

export const devicesApi = {
  async list(): Promise<DeviceListResult> {
    const res = await api.get<ApiResponse<DeviceListResult>>('/devices');
    return {
      devices: res.data.data?.devices ?? [],
      discovered: res.data.data?.discovered ?? [],
    };
  },

  async create(input: CreateDeviceInput): Promise<ManagedDevice> {
    const res = await api.post<ApiResponse<{ device: ManagedDevice }>>('/devices', input);
    return res.data.data!.device;
  },

  async update(id: string, patch: Partial<ManagedDevice>): Promise<ManagedDevice> {
    const res = await api.put<ApiResponse<{ device: ManagedDevice }>>(`/devices/${id}`, patch);
    return res.data.data!.device;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/devices/${id}`);
  },

  /** Flash the physical light so the user can identify it. */
  async test(id: string): Promise<boolean> {
    const res = await api.post<ApiResponse<{ sent: boolean }>>(`/devices/${id}/test`, {});
    return res.data.data?.sent ?? false;
  },
};

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

export const keysApi = {
  async list(): Promise<ApiKeySummary[]> {
    const res = await api.get<ApiResponse<{ keys: ApiKeySummary[] }>>('/keys');
    return res.data.data?.keys ?? [];
  },

  /** The returned key includes the full secret (.key) exactly once. */
  async create(label: string): Promise<ApiKeySummary> {
    const res = await api.post<ApiResponse<{ key: ApiKeySummary }>>('/keys', { label });
    return res.data.data!.key;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/keys/${id}`);
  },
};

// ---------------------------------------------------------------------------
// Beacon state display defaults (mirrors the gateway's built-in defaults)
// ---------------------------------------------------------------------------

export const STATE_ORDER = [
  'connected',
  'muted',
  'deafened',
  'streaming',
  'speaking',
  'idle',
  'claude-working',
  'claude-attention',
  'claude-done',
] as const;

export const STATE_DEFAULTS: Record<string, { color: string; enabled: boolean }> = {
  connected: { color: '#22c55e', enabled: true },
  muted: { color: '#ef4444', enabled: true },
  deafened: { color: '#f97316', enabled: true },
  streaming: { color: '#a855f7', enabled: true },
  speaking: { color: '#06b6d4', enabled: true },
  idle: { color: '#333333', enabled: false },
  'claude-working': { color: '#a855f7', enabled: true },
  'claude-attention': { color: '#a855f7', enabled: true },
  'claude-done': { color: '#22c55e', enabled: true },
};

export function stateDisplayColor(state: string): string {
  return STATE_DEFAULTS[state]?.color ?? '#a3a3a3';
}
