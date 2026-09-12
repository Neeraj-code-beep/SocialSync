const { validateEnv, config } = require('./src/config/env.config');

// 1. Centralized Environment Validation before any execution
try {
  validateEnv();
} catch (envError) {
  console.error(envError.message);
  process.exit(1);
}

const app = require('./src/app');
const { connectToDB, disconnectDB } = require('./src/db/db');

let server;

async function startServer() {
  try {
    // 2. Connect to Database first
    await connectToDB();

    // 3. Start HTTP Server
    server = app.listen(config.port, () => {
      console.log(`[Server] SocialSync running in ${config.nodeEnv} mode on port ${config.port}`);
    });
  } catch (error) {
    console.error('[Startup Error] Failed to start SocialSync server:', error.message);
    process.exit(1);
  }
}

// 4. Graceful Shutdown Handlers
async function gracefulShutdown(signal) {
  console.log(`\n[Shutdown] Received ${signal}. Initiating graceful shutdown...`);

  if (server) {
    server.close(async () => {
      console.log('[Shutdown] HTTP server closed.');
      await disconnectDB();
      console.log('[Shutdown] Process exited cleanly.');
      process.exit(0);
    });

    // Force shutdown after 10 seconds if connections hang
    setTimeout(() => {
      console.error('[Shutdown Error] Could not close connections in time, forcefully shutting down.');
      process.exit(1);
    }, 10000);
  } else {
    await disconnectDB();
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();
