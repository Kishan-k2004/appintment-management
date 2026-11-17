const mongoose = require('mongoose');

const APPOINTMENT_STATUSES = Object.freeze(['Pending', 'Confirmed', 'Cancelled']);

const appointmentSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      minlength: [2, 'Customer name must be at least 2 characters'],
      maxlength: [100, 'Customer name must be at most 100 characters'],
    },
    service: {
      type: String,
      required: [true, 'Service is required'],
      trim: true,
      minlength: [2, 'Service must be at least 2 characters'],
      maxlength: [100, 'Service must be at most 100 characters'],
    },
    // Stored as a BSON Date, which is always UTC in MongoDB.
    dateTime: {
      type: Date,
      required: [true, 'Date and time are required'],
    },
    status: {
      type: String,
      enum: {
        values: APPOINTMENT_STATUSES,
        message: `Status must be one of: ${APPOINTMENT_STATUSES.join(', ')}`,
      },
      default: 'Pending',
    },
  },
  {
    timestamps: true, // adds createdAt / updatedAt
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        return ret;
      },
    },
  }
);

// Indexes supporting the most common queries (date ranges + status filters, name search)
appointmentSchema.index({ dateTime: 1 });
appointmentSchema.index({ status: 1, dateTime: 1 });
appointmentSchema.index({ customerName: 1 });

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;
module.exports.APPOINTMENT_STATUSES = APPOINTMENT_STATUSES;
