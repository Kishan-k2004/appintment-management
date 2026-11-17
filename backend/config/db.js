const mongoose = require('mongoose');
const config = require('./env');

/**
 * Connects to MongoDB. Throws if MONGODB_URI is missing or the connection
 * fails, so the caller can decide to exit (the server should not start
 * accepting traffic without a database).
 */
async function connectDB(uri = config.mongoUri) {
  if (!uri) {
    throw new Error('MONGODB_URI is not defined. Set it in your environment or .env file.');
  }

  mongoose.set('strictQuery', true);

  const conn = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  // Never log the full URI — it contains credentials.
  console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });

  return conn;
}

async function disconnectDB() {
  await mongoose.connection.close();
}

module.exports = { connectDB, disconnectDB };
