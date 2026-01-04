import { createApp } from './app';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
// import { initializeDatabase } from './services/database.service';
import { WebSocketServer } from './websocket/server';
import { authService } from './services/auth.service';

async function startServer() {
  try {
    // Validate configuration
    validateConfig();
    
    // Initialize database
    // await initializeDatabase();
    
    // Create default admin user
    await authService.createDefaultAdmin();
    
    // Create Express app
    const app = createApp();
    
    // Start HTTP server
    const server = app.listen(config.server.port, () => {
      logger.info(`HTTP server listening on port ${config.server.port}`);
    });
    
    // Initialize WebSocket server
    const wsServer = new WebSocketServer();
    await wsServer.initialize();
    
    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      
      server.close(() => {
        logger.info('HTTP server closed');
      });
      
      await wsServer.close();
      
      // Close database connections
      // await closeDatabase();
      
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