const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

/**
 * GET /api/health
 * Returns 200 when the API and database are reachable, 503 otherwise.
 * Configure this path as the Health Check Path in Render.
 */
router.get('/', (_req, res) => {
  const dbState = DB_STATES[mongoose.connection.readyState] || 'unknown';
  const healthy = dbState === 'connected';

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    message: healthy ? 'API is healthy' : 'API is running but the database is not connected',
    data: {
      status: healthy ? 'ok' : 'degraded',
      database: dbState,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = router;
