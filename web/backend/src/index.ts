import { createApp } from './app';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { initializeDatabase, closeDatabase } from './services/database.service';
import { wsServer } from './websocket/server';

async function startServer() {
  try {
    // Validate configuration
    validateConfig();

    // Initialize database (SQLite, schema applied on boot)
    initializeDatabase();

    // Create Express app
    const app = createApp();

    // Start HTTP server
    const server = app.listen(config.server.port, () => {
      logger.info(`HTTP server listening on port ${config.server.port}`);
    });

    // Initialize WebSocket server
    await wsServer.initialize();

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');

      server.close(() => {
        logger.info('HTTP server closed');
      });

      await wsServer.close();
      closeDatabase();

      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
