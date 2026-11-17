/**
 * Helpers that keep every success response in the same shape:
 * { success: true, message, data, [pagination], [meta] }
 */
function sendSuccess(res, { statusCode = 200, message = 'Success', data = null, pagination, meta } = {}) {
  const body = { success: true, message, data };
  if (pagination) body.pagination = pagination;
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

function buildPagination(total, page, limit) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

module.exports = { sendSuccess, buildPagination };
