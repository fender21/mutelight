import { createHash, randomBytes, randomUUID } from 'crypto';
import { getDb } from './database.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import type {
  ManagedDevice,
  GatewaySummary,
  ApiKeySummary,
  PairStartResponse,
  PairPollResponse,
} from '@shared/protocol';

const PAIR_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
// Unambiguous alphabet: no I/L/O/0/1
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function randomCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

interface GatewayRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  last_seen: number | null;
  created_at: string;
}

interface DeviceRow {
  id: string;
  user_id: string;
  name: string;
  ip_address: string;
  enabled: number;
  state_colors: string;
  default_brightness: number | null;
  transition_time: number | null;
  created_at: string;
}

function toManagedDevice(row: DeviceRow): ManagedDevice {
  return {
    id: row.id,
    name: row.name,
    ip_address: row.ip_address,
    enabled: !!row.enabled,
    stateColors: JSON.parse(row.state_colors || '{}'),
    defaultBrightness: row.default_brightness ?? undefined,
    transitionTime: row.transition_time ?? undefined,
  };
}

class BeaconService {
  // ---------------------------------------------------------------------
  // Pairing (gateway shows a code; user claims it in the dashboard)
  // ---------------------------------------------------------------------

  startPairing(): PairStartResponse {
    const db = getDb();
    db.prepare('DELETE FROM pair_codes WHERE expires_at < ?').run(Date.now());

    let code = randomCode();
    // Regenerate on the (unlikely) collision with a live code
    while (db.prepare('SELECT code FROM pair_codes WHERE code = ?').get(code)) {
      code = randomCode();
    }

    const pollToken = randomUUID();
    db.prepare('INSERT INTO pair_codes (code, poll_token, expires_at) VALUES (?, ?, ?)').run(
      code,
      pollToken,
      Date.now() + PAIR_CODE_TTL_MS
    );

    return { code, pollToken, expiresInMs: PAIR_CODE_TTL_MS };
  }

  pollPairing(pollToken: string): PairPollResponse {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM pair_codes WHERE poll_token = ?')
      .get(pollToken) as { device_token: string | null; expires_at: number } | undefined;

    if (!row) return { claimed: false };
    if (!row.device_token) return { claimed: false };

    // One-time delivery of the gateway credential
    db.prepare('UPDATE pair_codes SET device_token = NULL WHERE poll_token = ?').run(pollToken);
    return { claimed: true, deviceToken: row.device_token };
  }

  claimPairing(userId: string, code: string, name?: string): GatewaySummary {
    const db = getDb();
    const normalized = code.trim().toUpperCase();
    const row = db
      .prepare('SELECT * FROM pair_codes WHERE code = ? AND claimed_by IS NULL AND expires_at > ?')
      .get(normalized, Date.now()) as { code: string } | undefined;

    if (!row) {
      throw new NotFoundError('Pairing code not found or expired');
    }

    const gatewayId = randomUUID();
    const token = `mbgw_${randomBytes(24).toString('hex')}`;
    const gatewayName = name?.trim() || 'My Computer';

    db.prepare('INSERT INTO gateways (id, user_id, name, token_hash) VALUES (?, ?, ?, ?)').run(
      gatewayId,
      userId,
      gatewayName,
      sha256(token)
    );
    db.prepare(
      'UPDATE pair_codes SET claimed_by = ?, gateway_id = ?, device_token = ? WHERE code = ?'
    ).run(userId, gatewayId, token, normalized);

    return {
      id: gatewayId,
      name: gatewayName,
      online: false,
      lastSeen: null,
      createdAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------
  // Gateways
  // ---------------------------------------------------------------------

  getGatewayByToken(token: string): { id: string; userId: string; name: string } | null {
    const row = getDb()
      .prepare('SELECT * FROM gateways WHERE token_hash = ?')
      .get(sha256(token)) as GatewayRow | undefined;
    if (!row) return null;
    return { id: row.id, userId: row.user_id, name: row.name };
  }

  touchGateway(gatewayId: string): void {
    getDb().prepare('UPDATE gateways SET last_seen = ? WHERE id = ?').run(Date.now(), gatewayId);
  }

  listGateways(userId: string): Array<Omit<GatewaySummary, 'online'>> {
    const rows = getDb()
      .prepare('SELECT * FROM gateways WHERE user_id = ? ORDER BY created_at')
      .all(userId) as GatewayRow[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      lastSeen: r.last_seen,
      createdAt: r.created_at,
    }));
  }

  deleteGateway(userId: string, gatewayId: string): boolean {
    const result = getDb()
      .prepare('DELETE FROM gateways WHERE id = ? AND user_id = ?')
      .run(gatewayId, userId);
    return result.changes > 0;
  }

  // ---------------------------------------------------------------------
  // API keys (for /api/beacon integrations)
  // ---------------------------------------------------------------------

  createApiKey(userId: string, label: string): ApiKeySummary {
    const db = getDb();
    const id = randomUUID();
    const key = `mb_${randomBytes(20).toString('hex')}`;
    const prefix = key.slice(0, 10);

    db.prepare('INSERT INTO api_keys (id, user_id, label, key_hash, prefix) VALUES (?, ?, ?, ?, ?)').run(
      id,
      userId,
      label.trim() || 'Unnamed key',
      sha256(key),
      prefix
    );

    return { id, label, key, prefix, createdAt: new Date().toISOString() };
  }

  listApiKeys(userId: string): ApiKeySummary[] {
    const rows = getDb()
      .prepare('SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at')
      .all(userId) as Array<{ id: string; label: string; prefix: string; created_at: string }>;
    return rows.map(r => ({ id: r.id, label: r.label, prefix: r.prefix, createdAt: r.created_at }));
  }

  deleteApiKey(userId: string, keyId: string): boolean {
    const result = getDb()
      .prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?')
      .run(keyId, userId);
    return result.changes > 0;
  }

  getUserIdByApiKey(key: string): string | null {
    const row = getDb()
      .prepare('SELECT user_id FROM api_keys WHERE key_hash = ?')
      .get(sha256(key)) as { user_id: string } | undefined;
    return row?.user_id ?? null;
  }

  // ---------------------------------------------------------------------
  // Managed WLED devices (config authored in the dashboard)
  // ---------------------------------------------------------------------

  listDevices(userId: string): ManagedDevice[] {
    const rows = getDb()
      .prepare('SELECT * FROM wled_devices WHERE user_id = ? ORDER BY created_at')
      .all(userId) as DeviceRow[];
    return rows.map(toManagedDevice);
  }

  createDevice(
    userId: string,
    input: Pick<ManagedDevice, 'name' | 'ip_address'> & Partial<ManagedDevice>
  ): ManagedDevice {
    if (!input.name?.trim() || !input.ip_address?.trim()) {
      throw new ValidationError('name and ip_address are required');
    }
    const id = randomUUID();
    getDb()
      .prepare(
        `INSERT INTO wled_devices
           (id, user_id, name, ip_address, enabled, state_colors, default_brightness, transition_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        userId,
        input.name.trim(),
        input.ip_address.trim(),
        input.enabled === false ? 0 : 1,
        JSON.stringify(input.stateColors ?? {}),
        input.defaultBrightness ?? null,
        input.transitionTime ?? null
      );
    return this.getDevice(userId, id)!;
  }

  getDevice(userId: string, deviceId: string): ManagedDevice | null {
    const row = getDb()
      .prepare('SELECT * FROM wled_devices WHERE id = ? AND user_id = ?')
      .get(deviceId, userId) as DeviceRow | undefined;
    return row ? toManagedDevice(row) : null;
  }

  updateDevice(userId: string, deviceId: string, updates: Partial<ManagedDevice>): ManagedDevice {
    const current = this.getDevice(userId, deviceId);
    if (!current) throw new NotFoundError('Device not found');

    const next: ManagedDevice = {
      ...current,
      ...updates,
      id: current.id,
      stateColors: updates.stateColors ?? current.stateColors,
    };

    getDb()
      .prepare(
        `UPDATE wled_devices
         SET name = ?, ip_address = ?, enabled = ?, state_colors = ?,
             default_brightness = ?, transition_time = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(
        next.name,
        next.ip_address,
        next.enabled ? 1 : 0,
        JSON.stringify(next.stateColors),
        next.defaultBrightness ?? null,
        next.transitionTime ?? null,
        deviceId,
        userId
      );

    return next;
  }

  deleteDevice(userId: string, deviceId: string): boolean {
    const result = getDb()
      .prepare('DELETE FROM wled_devices WHERE id = ? AND user_id = ?')
      .run(deviceId, userId);
    return result.changes > 0;
  }
}

export const beaconService = new BeaconService();
