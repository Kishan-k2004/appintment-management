/**
 * Operational error carrying an HTTP status code and optional
 * field-level error details. Thrown from controllers and handled by
 * the centralised error middleware.
 */
class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
  }

  static badRequest(message = 'Bad request', errors = []) {
    return new ApiError(400, message, errors);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }
}

module.exports = ApiError;
