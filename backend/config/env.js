/**
 * Centralised environment configuration.
 * Loads variables from .env (local development only — on Render they are
 * injected by the platform) and exposes a typed, validated config object.
 */
require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';

// FRONTEND_URL may contain a comma-separated list of allowed origins,
// e.g. "https://my-app.onrender.com,http://localhost:5173"
const FRONTEND_URLS = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((url) => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const config = {
  nodeEnv: NODE_ENV,
  isProduction: NODE_ENV === 'production',
  port: Number.parseInt(process.env.PORT, 10) || 5000,
  mongoUri: process.env.MONGODB_URI,
  frontendUrls: FRONTEND_URLS,
};

module.exports = config;
