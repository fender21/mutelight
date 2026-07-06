import { randomBytes, randomUUID } from 'crypto';
import { getDb } from './database.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import { getProvider, eventMatches } from '@shared/integrations';
import type { IntegrationInstance, TriggerRule, BeaconState } from '@shared/protocol';

interface IntegrationRow {
  id: string;
  user_id: string;
  provider_id: string;
  name: string;
  enabled: number;
  hook_token: string | null;
  rules: string;
  last_event_at: number | null;
  last_event: string | null;
  event_count: number;
  created_at: string;
}

function toInstance(row: IntegrationRow): IntegrationInstance {
  return {
    id: row.id,
    providerId: row.provider_id,
    name: row.name,
    enabled: !!row.enabled,
    rules: JSON.parse(row.rules || '[]'),
    hookPath: row.hook_token ? `/api/hook/${row.hook_token}` : undefined,
    lastEventAt: row.last_event_at,
    lastEvent: row.last_event,
    eventCount: row.event_count,
    createdAt: row.created_at,
  };
}

function sanitizeRules(rules: unknown): TriggerRule[] {
  if (!Array.isArray(rules)) {
    throw new ValidationError('rules must be an array');
  }
  return rules.map((r: any) => {
    if (typeof r?.event !== 'string' || !r.event.trim() || typeof r?.state !== 'string' || !r.state.trim()) {
      throw new ValidationError('each rule needs a non-empty event and state');
    }
    if (r.ttlMs !== undefined && (typeof r.ttlMs !== 'number' || r.ttlMs < 100 || r.ttlMs > 24 * 60 * 60 * 1000)) {
      throw new ValidationError('rule ttlMs must be between 100 and 86400000');
    }
    return {
      event: r.event.trim().slice(0, 128),
      state: r.state.trim().slice(0, 64),
      ttlMs: r.ttlMs,
      enabled: r.enabled !== false,
    };
  });
}

class IntegrationService {
  list(userId: string): IntegrationInstance[] {
    const rows = getDb()
      .prepare('SELECT * FROM integrations WHERE user_id = ? ORDER BY created_at')
      .all(userId) as IntegrationRow[];
    return rows.map(toInstance);
  }

  get(userId: string, id: string): IntegrationInstance | null {
    const row = getDb()
      .prepare('SELECT * FROM integrations WHERE id = ? AND user_id = ?')
      .get(id, userId) as IntegrationRow | undefined;
    return row ? toInstance(row) : null;
  }

  create(userId: string, providerId: string, name?: string): IntegrationInstance {
    const provider = getProvider(providerId);
    if (!provider) {
      throw new NotFoundError(`Unknown integration provider: ${providerId}`);
    }
    if (provider.kind === 'local') {
      throw new ValidationError(`${provider.name} runs in the desktop app and cannot be connected here`);
    }

    const id = randomUUID();
    // Only webhook providers receive an inbound URL; hooks providers
    // (Claude Code) trigger via /api/beacon with an API key instead.
    const hookToken = provider.kind === 'webhook' ? randomBytes(20).toString('hex') : null;

    getDb()
      .prepare(
        `INSERT INTO integrations (id, user_id, provider_id, name, hook_token, rules)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        userId,
        providerId,
        name?.trim() || provider.name,
        hookToken,
        JSON.stringify(provider.defaultRules)
      );

    return this.get(userId, id)!;
  }

  update(
    userId: string,
    id: string,
    updates: { name?: string; enabled?: boolean; rules?: unknown }
  ): IntegrationInstance {
    const current = this.get(userId, id);
    if (!current) throw new NotFoundError('Integration not found');

    const rules = updates.rules !== undefined ? sanitizeRules(updates.rules) : current.rules;
    getDb()
      .prepare('UPDATE integrations SET name = ?, enabled = ?, rules = ? WHERE id = ? AND user_id = ?')
      .run(
        updates.name?.trim() || current.name,
        (updates.enabled ?? current.enabled) ? 1 : 0,
        JSON.stringify(rules),
        id,
        userId
      );

    return this.get(userId, id)!;
  }

  delete(userId: string, id: string): boolean {
    const result = getDb()
      .prepare('DELETE FROM integrations WHERE id = ? AND user_id = ?')
      .run(id, userId);
    return result.changes > 0;
  }

  // -------------------------------------------------------------------
  // Inbound webhook handling
  // -------------------------------------------------------------------

  getByHookToken(token: string): (IntegrationInstance & { userId: string }) | null {
    const row = getDb()
      .prepare('SELECT * FROM integrations WHERE hook_token = ?')
      .get(token) as IntegrationRow | undefined;
    if (!row) return null;
    return { ...toInstance(row), userId: row.user_id };
  }

  recordEvent(id: string, event: string): void {
    getDb()
      .prepare(
        'UPDATE integrations SET last_event_at = ?, last_event = ?, event_count = event_count + 1 WHERE id = ?'
      )
      .run(Date.now(), event.slice(0, 128), id);
  }

  /**
   * First enabled rule whose pattern matches wins — predictable and easy
   * to reason about in the rule editor (order matters).
   */
  matchRule(instance: IntegrationInstance, event: string): TriggerRule | null {
    for (const rule of instance.rules) {
      if (rule.enabled && eventMatches(rule.event, event)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * For 'hooks'-kind providers (Claude Code): incoming /api/beacon states
   * pass through instance rules when an enabled instance exists, letting
   * users remap or silence states without editing their hook commands.
   * Returns the (possibly remapped) beacon, or null to suppress it.
   */
  applyBeaconRules(
    userId: string,
    state: BeaconState,
    ttlMs: number | undefined
  ): { state: BeaconState; ttlMs?: number } | null {
    const rows = getDb()
      .prepare("SELECT * FROM integrations WHERE user_id = ? AND hook_token IS NULL")
      .all(userId) as IntegrationRow[];
    if (rows.length === 0) {
      return { state, ttlMs }; // no hooks-kind instances: pass through
    }

    for (const row of rows) {
      const instance = toInstance(row);
      if (!instance.enabled) continue;
      // Match ignoring the rule's enabled flag: a DISABLED matching rule
      // means "silence this state", not "pretend the rule doesn't exist"
      const rule = instance.rules.find(r => eventMatches(r.event, state)) ?? null;
      if (rule) {
        this.recordEvent(instance.id, state);
        if (!rule.enabled) return null; // explicitly silenced
        return { state: rule.state, ttlMs: rule.ttlMs ?? ttlMs };
      }
    }

    // Instances exist but none matched: pass through unchanged
    return { state, ttlMs };
  }
}

export const integrationService = new IntegrationService();
