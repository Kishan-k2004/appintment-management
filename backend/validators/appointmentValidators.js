const { body, param, query } = require('express-validator');
const { APPOINTMENT_STATUSES } = require('../models/Appointment');
const {
  isDateOnly,
  isIsoDateTimeWithZone,
  isValidQueryDate,
  isRangeInverted,
  rangeLengthInDays,
} = require('../utils/dateUtils');

const STATUS_LIST = APPOINTMENT_STATUSES.join(', ');
const EDITABLE_FIELDS = ['customerName', 'service', 'dateTime', 'status'];
const MAX_CALENDAR_RANGE_DAYS = 366;

const QUERY_DATE_MESSAGE =
  'must be a date (YYYY-MM-DD) or an ISO 8601 date-time with timezone (e.g. 2026-11-02T10:00:00.000Z)';

/* ----------------------------- reusable pieces ---------------------------- */

const singleValue = (value) => {
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
    throw new Error('must be provided only once');
  }
  return true;
};

const textField = (field, label, { optional = false } = {}) => {
  let chain = body(field);
  chain = optional
    ? chain.optional()
    : chain.exists({ values: 'falsy' }).withMessage(`${label} is required`).bail();
  return chain
    .isString()
    .withMessage(`${label} must be a string`)
    .bail()
    .trim()
    .notEmpty()
    .withMessage(`${label} cannot be empty`)
    .bail()
    .isLength({ min: 2, max: 100 })
    .withMessage(`${label} must be between 2 and 100 characters`);
};

const dateTimeField = ({ optional = false } = {}) => {
  let chain = body('dateTime');
  chain = optional
    ? chain.optional()
    : chain.exists({ values: 'falsy' }).withMessage('dateTime is required').bail();
  return chain
    .isString()
    .withMessage('dateTime must be a string')
    .bail()
    .custom(isIsoDateTimeWithZone)
    .withMessage(
      'dateTime must be a valid ISO 8601 date-time including a timezone, e.g. 2026-11-20T10:00:00.000Z'
    );
};

const statusField = ({ optional = false } = {}) => {
  let chain = body('status');
  chain = optional
    ? chain.optional()
    : chain.exists({ values: 'falsy' }).withMessage('status is required').bail();
  return chain.isIn(APPOINTMENT_STATUSES).withMessage(`status must be one of: ${STATUS_LIST}`);
};

const queryDate = (field, { required = false } = {}) => {
  let chain = query(field);
  chain = required
    ? chain.exists({ values: 'falsy' }).withMessage(`${field} is required`).bail()
    : chain.optional({ values: 'falsy' });
  return chain.custom(singleValue).bail().custom(isValidQueryDate).withMessage(`${field} ${QUERY_DATE_MESSAGE}`);
};

const tzOffsetQuery = () =>
  query('tzOffset')
    .optional({ values: 'falsy' })
    .custom(singleValue)
    .bail()
    .isInt({ min: -840, max: 840 })
    .withMessage(
      'tzOffset must be an integer number of minutes between -840 and 840 (same sign as Date#getTimezoneOffset)'
    );

// Accepts a single status or a comma-separated list, e.g. "Pending,Confirmed"
const statusQuery = () =>
  query('status')
    .optional({ values: 'falsy' })
    .custom(singleValue)
    .bail()
    .custom((value) => value.split(',').every((s) => APPOINTMENT_STATUSES.includes(s.trim())))
    .withMessage(`status must be one of: ${STATUS_LIST} (comma-separate to combine)`);

// Factory: express-validator chains are mutable, so each rule set needs its own instance.
const rangeOrderCheck = () => query('endDate').custom((endDate, { req }) => {
  const { startDate, tzOffset } = req.query;
  if (
    typeof startDate === 'string' &&
    typeof endDate === 'string' &&
    isValidQueryDate(startDate) &&
    isValidQueryDate(endDate) &&
    isRangeInverted(startDate, endDate, Number(tzOffset) || 0)
  ) {
    throw new Error('endDate must be on or after startDate');
  }
  return true;
});

/* --------------------------------- exports -------------------------------- */

const idParam = [param('id').isMongoId().withMessage('Invalid appointment id')];

const listAppointmentsRules = [
  statusQuery(),
  query('search')
    .optional()
    .custom(singleValue)
    .bail()
    .isLength({ max: 100 })
    .withMessage('search must be at most 100 characters'),
  query('date')
    .optional({ values: 'falsy' })
    .custom(singleValue)
    .bail()
    .custom(isDateOnly)
    .withMessage('date must be a valid date in YYYY-MM-DD format')
    .bail()
    .custom((_value, { req }) => {
      if (req.query.startDate || req.query.endDate) {
        throw new Error('Use either date or startDate/endDate, not both');
      }
      return true;
    }),
  queryDate('startDate'),
  queryDate('endDate'),
  rangeOrderCheck(),
  tzOffsetQuery(),
  query('page')
    .optional({ values: 'falsy' })
    .custom(singleValue)
    .bail()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),
  query('limit')
    .optional({ values: 'falsy' })
    .custom(singleValue)
    .bail()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be an integer between 1 and 100'),
  query('sortOrder')
    .optional({ values: 'falsy' })
    .isIn(['asc', 'desc'])
    .withMessage('sortOrder must be asc or desc'),
];

const calendarRules = [
  queryDate('startDate', { required: true }),
  queryDate('endDate', { required: true }),
  rangeOrderCheck()
    .bail()
    .custom((endDate, { req }) => {
      const { startDate, tzOffset } = req.query;
      if (
        isValidQueryDate(startDate) &&
        isValidQueryDate(endDate) &&
        rangeLengthInDays(startDate, endDate, Number(tzOffset) || 0) > MAX_CALENDAR_RANGE_DAYS
      ) {
        throw new Error(`Calendar range cannot exceed ${MAX_CALENDAR_RANGE_DAYS} days`);
      }
      return true;
    }),
  tzOffsetQuery(),
  statusQuery(),
];

const createAppointmentRules = [
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be a JSON object');
    }
    return true;
  }),
  textField('customerName', 'customerName'),
  textField('service', 'service'),
  dateTimeField(),
  statusField({ optional: true }),
];

const updateAppointmentRules = [
  ...idParam,
  body().custom((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be a JSON object');
    }
    if (!EDITABLE_FIELDS.some((field) => value[field] !== undefined)) {
      throw new Error(`Provide at least one of: ${EDITABLE_FIELDS.join(', ')}`);
    }
    return true;
  }),
  textField('customerName', 'customerName', { optional: true }),
  textField('service', 'service', { optional: true }),
  dateTimeField({ optional: true }),
  statusField({ optional: true }),
];

const updateStatusRules = [...idParam, statusField()];

module.exports = {
  EDITABLE_FIELDS,
  idParam,
  listAppointmentsRules,
  calendarRules,
  createAppointmentRules,
  updateAppointmentRules,
  updateStatusRules,
};
