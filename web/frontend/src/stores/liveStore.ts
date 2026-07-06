import { create } from 'zustand';
import { wsClient } from '../lib/api';
import type {
  DiscoveredDevice,
  GatewayLiveUpdate,
  GatewayStatusPayload,
} from '../../../shared/protocol';

export interface GatewayLiveState {
  online: boolean;
  status?: GatewayStatusPayload;
  discovered?: DiscoveredDevice[];
}

interface LiveState {
  /** Live per-gateway state pushed over the WebSocket. */
  gateways: Record<string, GatewayLiveState>;
  started: boolean;

  start: () => void;
  stop: () => void;
}

let updateHandler: ((payload: GatewayLiveUpdate) => void) | null = null;

export const useLiveStore = create<LiveState>((set, get) => ({
  gateways: {},
  started: false,

  start: () => {
    if (get().started) return;

    updateHandler = (payload: GatewayLiveUpdate) => {
      if (!payload?.gatewayId) return;
      set((s) => {
        const prev = s.gateways[payload.gatewayId];
        return {
          gateways: {
            ...s.gateways,
            [payload.gatewayId]: {
              online: payload.online,
              status: payload.status ?? prev?.status,
              discovered: payload.discovered ?? prev?.discovered,
            },
          },
        };
      });
    };
    wsClient.on('gateway_update', updateHandler);
    wsClient.connect();
    set({ started: true });
  },

  stop: () => {
    if (updateHandler) {
      wsClient.off('gateway_update', updateHandler);
      updateHandler = null;
    }
    wsClient.disconnect();
    set({ started: false, gateways: {} });
  },
}));

/** Union of discovered devices across online gateways, deduped by IP. */
export function liveDiscovered(gateways: Record<string, GatewayLiveState>): DiscoveredDevice[] {
  const byIp = new Map<string, DiscoveredDevice>();
  for (const gw of Object.values(gateways)) {
    if (!gw.online) continue;
    for (const d of gw.discovered ?? []) {
      byIp.set(d.ip, d);
    }
  }
  return Array.from(byIp.values());
}

/** Current effective beacon state reported by any online gateway. */
export function liveEffectiveState(
  gateways: Record<string, GatewayLiveState>
): string | null {
  for (const gw of Object.values(gateways)) {
    if (gw.online && gw.status) return gw.status.effectiveState;
  }
  return null;
}
