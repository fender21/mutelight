import dotenv from 'dotenv';

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
  
  database: {
    path: process.env.DATABASE_PATH || './data/mutebeacon.db',
  },
  
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    // 30 days: "stay signed in" like modern web apps. Sessions end on
    // explicit logout or 30d after login, whichever comes first.
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '30d',
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    // A dashboard session (login + polling) plus inbound webhooks easily
    // exceeds 100 req/15min from one IP — 100 throttled legitimate use.
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
  },
  
  websocket: {
    port: parseInt(process.env.WS_PORT || '3002', 10),
  },
  
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || 'dev-encryption-key-32-chars-long',
  },
  
  external: {
    sentryDsn: process.env.SENTRY_DSN,
    analyticsKey: process.env.ANALYTICS_KEY,
  },
} as const;

// Validate required configuration
export function validateConfig(): void {
  const required = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ];
  
  if (config.isProduction) {
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
}