const ApiError = require('../utils/ApiError');

/** Catches requests that did not match any route. */
function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

module.exports = notFound;
