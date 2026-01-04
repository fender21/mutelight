import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { User, AuthTokens } from '@shared/types';
import { UnauthorizedError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';

// Temporary in-memory storage (replace with database)
const users = new Map<string, User & { password: string }>();
const refreshTokens = new Set<string>();

export class AuthService {
  async register(email: string, password: string): Promise<User> {
    // Check if user already exists
    const existingUser = Array.from(users.values()).find(u => u.email === email);
    if (existingUser) {
      throw new ConflictError('User already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user: User & { password: string } = {
      id: crypto.randomUUID(),
      email,
      password: hashedPassword,
      createdAt: new Date(),
    };

    users.set(user.id, user);
    logger.info(`User registered: ${email}`);

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    // Find user
    const user = Array.from(users.values()).find(u => u.email === email);
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Generate tokens
    const tokens = this.generateTokens(user.id);
    refreshTokens.add(tokens.refreshToken);

    logger.info(`User logged in: ${email}`);
    return tokens;
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    // Verify refresh token
    if (!refreshTokens.has(refreshToken)) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    try {
      const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;
      
      // Remove old token and generate new ones
      refreshTokens.delete(refreshToken);
      const tokens = this.generateTokens(payload.userId);
      refreshTokens.add(tokens.refreshToken);

      return tokens;
    } catch (error) {
      refreshTokens.delete(refreshToken);
      throw new UnauthorizedError('Invalid refresh token');
    }
  }

  async logout(refreshToken: string): Promise<void> {
    refreshTokens.delete(refreshToken);
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
    const user = users.get(userId);
    if (!user) return null;

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  private generateTokens(userId: string): AuthTokens {
    const accessToken = jwt.sign(
      { userId },
      config.jwt.accessSecret,
      { expiresIn: config.jwt.accessExpiry }
    );

    const refreshToken = jwt.sign(
      { userId },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiry }
    );

    return { accessToken, refreshToken };
  }

  // Helper method to create a default admin user
  async createDefaultAdmin(): Promise<void> {
    const adminEmail = 'admin@mutelight.app';
    const adminPassword = 'changeme123';

    try {
      await this.register(adminEmail, adminPassword);
      logger.info(`Default admin user created: ${adminEmail}`);
    } catch (error) {
      // User might already exist
      logger.debug('Default admin user already exists');
    }
  }
}

export const authService = new AuthService();