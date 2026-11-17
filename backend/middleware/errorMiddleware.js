const mongoose = require('mongoose');
const config = require('../config/env');

/**
 * Centralised error handler. Converts known error types into the standard
 * error response shape:
 *   { success: false, message, errors: [] }
 * In production, unexpected (500) errors never leak messages or stack traces.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal server error';
  let errors = Array.isArray(err.errors) ? err.errors : [];

  // Malformed JSON body (thrown by express.json())
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON in request body';
    errors = [];
  }
  // Body too large
  else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
    errors = [];
  }
  // Mongoose schema validation errors
  else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
      location: 'body',
      value: e.value,
    }));
  }
  // Invalid ObjectId or bad type cast
  else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid value for ${err.path}`;
    errors = [{ field: err.path, message: `Invalid ${err.kind}`, location: 'params', value: err.value }];
  }
  // Duplicate key
  else if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate record';
    errors = Object.keys(err.keyValue || {}).map((field) => ({
      field,
      message: `${field} already exists`,
    }));
  }
  // Database unavailable
  else if (
    err instanceof mongoose.Error.MongooseServerSelectionError ||
    err.name === 'MongoNetworkError' ||
    err.name === 'MongoServerSelectionError'
  ) {
    statusCode = 503;
    message = 'Database is temporarily unavailable. Please try again later.';
    errors = [];
  }

  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
    statusCode = 500;
  }

  if (statusCode >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  }

  // Hide internals of unexpected errors in production
  if (config.isProduction && statusCode === 500) {
    message = 'Internal server error';
    errors = [];
  }

  const body = { success: false, message, errors };
  if (!config.isProduction && statusCode === 500 && err.stack) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

module.exports = errorHandler;
