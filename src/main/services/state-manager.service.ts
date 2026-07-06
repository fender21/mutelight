import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import type { BeaconState, BeaconSource } from '@shared/types';

interface SourceEntry {
  state: BeaconState;
  expiresAt: number | null;
}

export interface StateChangeMeta {
  source: BeaconSource | null;
}

// Higher priority wins. Manual tray overrides beat cloud beacons,
// which beat the ambient Discord voice state.
const SOURCE_PRIORITY: Record<BeaconSource, number> = {
  manual: 100,
  bridge: 50,
  discord: 10,
};

/**
 * Single owner of the effective beacon state. Every event source
 * (Discord RPC, cloud bridge, tray manual overrides) feeds in here;
 * the one 'stateChanged' listener drives WLED, tray, and renderer.
 */
class StateManagerService extends EventEmitter {
  private sources = new Map<BeaconSource, SourceEntry>();
  private lastEmitted: BeaconState | null = null;
  private expiryTimer: NodeJS.Timeout | null = null;

  setSourceState(source: BeaconSource, state: BeaconState | null, opts?: { ttlMs?: number }): void {
    if (state === null) {
      this.clearSource(source);
      return;
    }
    const expiresAt = opts?.ttlMs && opts.ttlMs > 0 ? Date.now() + opts.ttlMs : null;
    this.sources.set(source, { state, expiresAt });
    logger.debug(`StateManager: ${source} -> ${state}${expiresAt ? ` (ttl ${opts?.ttlMs}ms)` : ''}`);
    this.scheduleExpiry();
    this.resolveAndEmit();
  }

  clearSource(source: BeaconSource): void {
    if (this.sources.delete(source)) {
      logger.debug(`StateManager: ${source} cleared`);
      this.scheduleExpiry();
      this.resolveAndEmit();
    }
  }

  getEffectiveState(): BeaconState {
    return this.resolve().state;
  }

  getWinningSource(): BeaconSource | null {
    return this.resolve().source;
  }

  getSourceState(source: BeaconSource): BeaconState | null {
    const entry = this.sources.get(source);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) return null;
    return entry.state;
  }

  private resolve(): { state: BeaconState; source: BeaconSource | null } {
    const now = Date.now();
    let best: { state: BeaconState; source: BeaconSource; priority: number } | null = null;
    for (const [source, entry] of this.sources) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) continue;
      const priority = SOURCE_PRIORITY[source];
      if (!best || priority > best.priority) {
        best = { state: entry.state, source, priority };
      }
    }
    return best ? { state: best.state, source: best.source } : { state: 'idle', source: null };
  }

  private resolveAndEmit(): void {
    const { state, source } = this.resolve();
    if (state === this.lastEmitted) return;
    this.lastEmitted = state;
    this.emit('stateChanged', state, { source } satisfies StateChangeMeta);
  }

  private scheduleExpiry(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    let next: number | null = null;
    for (const entry of this.sources.values()) {
      if (entry.expiresAt !== null && (next === null || entry.expiresAt < next)) {
        next = entry.expiresAt;
      }
    }
    if (next === null) return;
    this.expiryTimer = setTimeout(() => {
      const now = Date.now();
      for (const [source, entry] of this.sources) {
        if (entry.expiresAt !== null && entry.expiresAt <= now) {
          this.sources.delete(source);
          logger.debug(`StateManager: ${source} expired`);
        }
      }
      this.scheduleExpiry();
      this.resolveAndEmit();
    }, Math.max(0, next - Date.now()));
  }

  destroy(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.removeAllListeners();
    this.sources.clear();
  }
}

export const stateManager = new StateManagerService();
