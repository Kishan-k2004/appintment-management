const config = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');
const app = require('./app');

let server;

async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    // Exit so the platform (Render) restarts the service instead of serving errors.
    process.exit(1);
  }

  // Bind to 0.0.0.0 so Render can route traffic to the container.
  server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`Server running in ${config.nodeEnv} mode on port ${config.port}`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();

  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

start();
