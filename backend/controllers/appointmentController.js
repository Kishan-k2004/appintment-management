const Appointment = require('../models/Appointment');
const ApiError = require('../utils/ApiError');
const escapeRegex = require('../utils/escapeRegex');
const { sendSuccess, buildPagination } = require('../utils/apiResponse');
const { buildDateTimeFilter } = require('../utils/dateUtils');
const { EDITABLE_FIELDS } = require('../validators/appointmentValidators');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

/** Copies only whitelisted fields from the request body (prevents mass assignment). */
function pickEditableFields(body = {}) {
  return EDITABLE_FIELDS.reduce((acc, field) => {
    if (body[field] !== undefined) acc[field] = body[field];
    return acc;
  }, {});
}

/** Parses a validated "Pending,Confirmed" style status param into a Mongo condition. */
function buildStatusFilter(status) {
  if (!status) return undefined;
  const statuses = [...new Set(status.split(',').map((s) => s.trim()))];
  return statuses.length === 1 ? statuses[0] : { $in: statuses };
}

/**
 * Builds the Mongo filter from (already validated) query params.
 * All filters are combined with AND semantics.
 */
function buildAppointmentFilter(query) {
  const { status, search, date, startDate, endDate } = query;
  const tzOffset = Number(query.tzOffset) || 0;
  const filter = {};

  const statusFilter = buildStatusFilter(status);
  if (statusFilter) filter.status = statusFilter;

  const trimmedSearch = typeof search === 'string' ? search.trim() : '';
  if (trimmedSearch) {
    // Case-insensitive, partial match on customer name
    filter.customerName = { $regex: escapeRegex(trimmedSearch), $options: 'i' };
  }

  const dateTimeFilter = buildDateTimeFilter({ date, startDate, endDate, tzOffset });
  if (dateTimeFilter) filter.dateTime = dateTimeFilter;

  return filter;
}

/**
 * GET /api/appointments
 * Query: status, search, date, startDate, endDate, tzOffset, page, limit, sortOrder
 */
async function getAppointments(req, res) {
  const page = Number.parseInt(req.query.page, 10) || DEFAULT_PAGE;
  const limit = Number.parseInt(req.query.limit, 10) || DEFAULT_LIMIT;
  const sortDirection = req.query.sortOrder === 'desc' ? -1 : 1;
  const filter = buildAppointmentFilter(req.query);

  const [total, appointments] = await Promise.all([
    Appointment.countDocuments(filter),
    Appointment.find(filter)
      .sort({ dateTime: sortDirection, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  return sendSuccess(res, {
    message: 'Appointments fetched successfully',
    data: appointments,
    pagination: buildPagination(total, page, limit),
  });
}

/**
 * GET /api/appointments/calendar?startDate=2026-11-01&endDate=2026-11-30
 * Returns every appointment in the range (no pagination), sorted by dateTime,
 * so the frontend can render month / week / day views.
 */
async function getCalendarAppointments(req, res) {
  const { startDate, endDate, status } = req.query;
  const tzOffset = Number(req.query.tzOffset) || 0;

  const filter = { dateTime: buildDateTimeFilter({ startDate, endDate, tzOffset }) };
  const statusFilter = buildStatusFilter(status);
  if (statusFilter) filter.status = statusFilter;

  const appointments = await Appointment.find(filter).sort({ dateTime: 1, _id: 1 });

  return sendSuccess(res, {
    message: 'Calendar appointments fetched successfully',
    data: appointments,
    meta: {
      startDate,
      endDate,
      tzOffset,
      rangeStart: filter.dateTime.$gte.toISOString(),
      rangeEnd: (filter.dateTime.$lt || filter.dateTime.$lte).toISOString(),
      rangeEndInclusive: Boolean(filter.dateTime.$lte),
      count: appointments.length,
    },
  });
}

/** GET /api/appointments/:id */
async function getAppointmentById(req, res) {
  const appointment = await Appointment.findById(req.params.id);
  if (!appointment) throw ApiError.notFound('Appointment not found');

  return sendSuccess(res, {
    message: 'Appointment fetched successfully',
    data: appointment,
  });
}

/** POST /api/appointments */
async function createAppointment(req, res) {
  const appointment = await Appointment.create(pickEditableFields(req.body));

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Appointment created successfully',
    data: appointment,
  });
}

/**
 * PUT /api/appointments/:id
 * Updates any of the editable fields supplied in the body.
 */
async function updateAppointment(req, res) {
  const updates = pickEditableFields(req.body);

  const appointment = await Appointment.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!appointment) throw ApiError.notFound('Appointment not found');

  return sendSuccess(res, {
    message: 'Appointment updated successfully',
    data: appointment,
  });
}

/** PATCH /api/appointments/:id/status */
async function updateAppointmentStatus(req, res) {
  const appointment = await Appointment.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { new: true, runValidators: true }
  );
  if (!appointment) throw ApiError.notFound('Appointment not found');

  return sendSuccess(res, {
    message: `Appointment status updated to ${appointment.status}`,
    data: appointment,
  });
}

/** DELETE /api/appointments/:id */
async function deleteAppointment(req, res) {
  const appointment = await Appointment.findByIdAndDelete(req.params.id);
  if (!appointment) throw ApiError.notFound('Appointment not found');

  return sendSuccess(res, {
    message: 'Appointment deleted successfully',
    data: { id: appointment.id },
  });
}

module.exports = {
  getAppointments,
  getCalendarAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
  deleteAppointment,
};
