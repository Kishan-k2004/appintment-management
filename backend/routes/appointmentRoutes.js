const express = require('express');
const controller = require('../controllers/appointmentController');
const validateRequest = require('../middleware/validateRequest');
const rules = require('../validators/appointmentValidators');

// Express 5 forwards rejected promises from async handlers to the error
// middleware automatically, so no asyncHandler wrapper is needed.
const router = express.Router();

router
  .route('/')
  .get(rules.listAppointmentsRules, validateRequest, controller.getAppointments)
  .post(rules.createAppointmentRules, validateRequest, controller.createAppointment);

// Must be declared before "/:id" so "calendar" is not treated as an id.
router.get('/calendar', rules.calendarRules, validateRequest, controller.getCalendarAppointments);

router
  .route('/:id')
  .get(rules.idParam, validateRequest, controller.getAppointmentById)
  .put(rules.updateAppointmentRules, validateRequest, controller.updateAppointment)
  .delete(rules.idParam, validateRequest, controller.deleteAppointment);

router.patch('/:id/status', rules.updateStatusRules, validateRequest, controller.updateAppointmentStatus);

module.exports = router;
