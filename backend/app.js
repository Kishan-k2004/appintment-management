const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const appointmentRoutes = require('./routes/appointmentRoutes');
const healthRoutes = require('./routes/healthRoutes');
const notFound = require('./middleware/notFoundMiddleware');
const errorHandler = require('./middleware/errorMiddleware');
const ApiError = require('./utils/ApiError');

const app = express();

// Render sits behind a proxy; trust it so req.ip / protocol are correct.
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ---------------------------------- CORS ---------------------------------- */
// Allowed origins come from FRONTEND_URL (comma-separated). In development,
// if FRONTEND_URL is not set, every origin is allowed for convenience.
const corsOptions = {
  origin(origin, callback) {
    // Requests without an Origin header (curl, Postman, server-to-server, health checks)
    if (!origin) return callback(null, true);

    if (config.frontendUrls.length === 0 && !config.isProduction) return callback(null, true);

    if (config.frontendUrls.includes(origin.replace(/\/+$/, ''))) return callback(null, true);

    return callback(new ApiError(403, `Origin ${origin} is not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

/* ------------------------------ Body parsing ------------------------------ */
app.use(express.json({ limit: '10kb' }));

/* --------------------------------- Routes --------------------------------- */
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Appointment Manager API',
    data: { health: '/api/health', appointments: '/api/appointments' },
  });
});

app.use('/api/health', healthRoutes);
app.use('/api/appointments', appointmentRoutes);

/* ----------------------------- Error handling ----------------------------- */
app.use(notFound);
app.use(errorHandler);

module.exports = app;
