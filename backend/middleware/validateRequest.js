const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * Runs after express-validator chains. If any rule failed, responds with a
 * 400 and a list of { field, message, location, value } errors.
 */
function validateRequest(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  // Only report the first error per field to keep messages readable.
  const errors = result.array({ onlyFirstError: true }).map((err) => ({
    field: err.path,
    message: err.msg,
    location: err.location,
    value: err.value,
  }));

  return next(ApiError.badRequest('Validation failed', errors));
}

module.exports = validateRequest;
