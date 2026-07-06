import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { config } from '../config';
import { User, AuthTokens } from '@shared/types';
import { UnauthorizedError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';
import { getDb } from './database.service';

interface UserRow {
  id: string;
  email: string;
  password: string;
  created_at: string;
}

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, createdAt: new Date(row.created_at) };
}

export class AuthService {
  async register(email: string, password: string): Promise<User> {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      throw new ConflictError('User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = randomUUID();
    db.prepare('INSERT INTO users (id, email, password) VALUES (?, ?, ?)').run(
      id,
      email,
      hashedPassword
    );
    logger.info(`User registered: ${email}`);

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow;
    return toUser(row);
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
      | UserRow
      | undefined;
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const tokens = this.generateTokens(user.id);
    db.prepare('INSERT INTO refresh_tokens (token, user_id) VALUES (?, ?)').run(
      tokens.refreshToken,
      user.id
    );

    logger.info(`User logged in: ${email}`);
    return tokens;
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const db = getDb();
    const row = db.prepare('SELECT token FROM refresh_tokens WHERE token = ?').get(refreshToken);
    if (!row) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    try {
      const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;

      db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
      const tokens = this.generateTokens(payload.userId);
      db.prepare('INSERT INTO refresh_tokens (token, user_id) VALUES (?, ?)').run(
        tokens.refreshToken,
        payload.userId
      );

      return tokens;
    } catch (error) {
      db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
      throw new UnauthorizedError('Invalid refresh token');
    }
  }

  async logout(refreshToken: string): Promise<void> {
    getDb().prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
  }

  async verifyAccessToken(token: string): Promise<string> {
    try {
      const payload = jwt.verify(token, config.jwt.accessSecret) as any;
      return payload.userId;
    } catch (error) {
      throw new UnauthorizedError('Invalid access token');
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(userId) as
      | UserRow
      | undefined;
    return row ? toUser(row) : null;
  }

  private generateTokens(userId: string): AuthTokens {
    const accessToken = jwt.sign({ userId }, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiry,
    } as jwt.SignOptions);

    const refreshToken = jwt.sign({ userId }, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiry,
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
  }
}

export const authService = new AuthService();
