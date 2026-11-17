/**
 * Date helpers.
 *
 * Storage rule: every appointment `dateTime` is stored as a UTC instant.
 *
 * Query parameters (`date`, `startDate`, `endDate`) accept two formats:
 *
 *   1. Date only  — "YYYY-MM-DD"
 *      Interpreted as a whole calendar day. By default the day is a UTC day.
 *      If `tzOffset` is supplied (minutes, same sign convention as JavaScript's
 *      Date#getTimezoneOffset(), e.g. -330 for IST, 300 for US EST), the day is
 *      interpreted in that timezone instead, so "2026-11-02" with tzOffset=-330
 *      means 2026-11-01T18:30:00.000Z  ->  2026-11-02T18:30:00.000Z.
 *        - startDate (date only): >= start of that day
 *        - endDate   (date only): <  start of the NEXT day (whole day inclusive)
 *
 *   2. Full ISO 8601 date-time WITH a timezone designator —
 *      "2026-11-02T00:00:00.000Z" or "2026-11-02T00:00:00+05:30"
 *      Used as an exact instant (startDate inclusive, endDate inclusive).
 *
 * Date-times without a timezone designator are rejected, because they would be
 * interpreted in the server's local timezone, which differs between a developer
 * laptop and Render (UTC).
 */

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_WITH_ZONE_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d)(\.\d{1,3})?)?(Z|[+-]([01]\d|2[0-3]):?([0-5]\d))$/;

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/** Returns true when y/m/d form a real calendar date (rejects 2026-02-30). */
function isRealCalendarDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function isDateOnly(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_ONLY_REGEX.exec(value);
  if (!match) return false;
  return isRealCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function isIsoDateTimeWithZone(value) {
  if (typeof value !== 'string') return false;
  const match = ISO_WITH_ZONE_REGEX.exec(value);
  if (!match) return false;
  if (!isRealCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))) return false;
  return !Number.isNaN(new Date(value).getTime());
}

/** Accepts either "YYYY-MM-DD" or an ISO date-time with timezone. */
function isValidQueryDate(value) {
  return isDateOnly(value) || isIsoDateTimeWithZone(value);
}

/**
 * Start of the calendar day `YYYY-MM-DD` in the timezone described by
 * tzOffset (minutes, getTimezoneOffset() convention; 0 = UTC).
 */
function startOfDay(dateOnly, tzOffset = 0) {
  const [, y, m, d] = DATE_ONLY_REGEX.exec(dateOnly);
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)) + tzOffset * MS_PER_MINUTE);
}

function startOfNextDay(dateOnly, tzOffset = 0) {
  return new Date(startOfDay(dateOnly, tzOffset).getTime() + MS_PER_DAY);
}

/** Resolves a start boundary to a Mongo condition fragment. */
function resolveStart(value, tzOffset) {
  return isDateOnly(value) ? { $gte: startOfDay(value, tzOffset) } : { $gte: new Date(value) };
}

/** Resolves an end boundary to a Mongo condition fragment. */
function resolveEnd(value, tzOffset) {
  // Date-only end boundaries are inclusive of the whole day: use "< next midnight"
  // instead of "<= 23:59:59.999" so nothing near midnight slips through.
  return isDateOnly(value) ? { $lt: startOfNextDay(value, tzOffset) } : { $lte: new Date(value) };
}

/**
 * Returns the effective [from, to] instants for a start/end pair so callers
 * can verify ordering. `to` is the exclusive/inclusive boundary as resolved.
 */
function getBoundaryInstant(fragment) {
  return Object.values(fragment)[0];
}

/**
 * Builds a Mongo condition for the `dateTime` field from query params.
 * Returns null when no date filter is requested.
 */
function buildDateTimeFilter({ date, startDate, endDate, tzOffset = 0 }) {
  if (date) {
    return { $gte: startOfDay(date, tzOffset), $lt: startOfNextDay(date, tzOffset) };
  }

  let condition = null;
  if (startDate) condition = { ...condition, ...resolveStart(startDate, tzOffset) };
  if (endDate) condition = { ...condition, ...resolveEnd(endDate, tzOffset) };
  return condition;
}

/** True when startDate resolves to an instant after endDate. */
function isRangeInverted(startDate, endDate, tzOffset = 0) {
  if (!startDate || !endDate) return false;
  const from = getBoundaryInstant(resolveStart(startDate, tzOffset));
  const to = getBoundaryInstant(resolveEnd(endDate, tzOffset));
  return from.getTime() > to.getTime();
}

/** Length of the range in days (used to cap calendar queries). */
function rangeLengthInDays(startDate, endDate, tzOffset = 0) {
  const from = getBoundaryInstant(resolveStart(startDate, tzOffset));
  const to = getBoundaryInstant(resolveEnd(endDate, tzOffset));
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

module.exports = {
  isDateOnly,
  isIsoDateTimeWithZone,
  isValidQueryDate,
  startOfDay,
  startOfNextDay,
  buildDateTimeFilter,
  isRangeInverted,
  rangeLengthInDays,
};
