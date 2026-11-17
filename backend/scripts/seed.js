/**
 * Seeds the database with the initial sample appointments.
 *
 * Idempotent: each record is upserted using (customerName, service, dateTime)
 * as its natural key with $setOnInsert, so running the script repeatedly never
 * creates duplicates and never overwrites changes made through the API.
 *
 * Sample times are stored as UTC (e.g. 10:00 -> 10:00:00.000Z).
 *
 * Usage: npm run seed
 */
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../config/db');
const Appointment = require('../models/Appointment');

const sampleAppointments = [
  {
    customerName: 'Alex Morgan',
    service: 'Consultation',
    dateTime: new Date('2026-11-02T10:00:00.000Z'),
    status: 'Pending',
  },
  {
    customerName: 'Jamie Lee',
    service: 'Follow-up',
    dateTime: new Date('2026-11-02T11:30:00.000Z'),
    status: 'Confirmed',
  },
  {
    customerName: 'Taylor Smith',
    service: 'Review',
    dateTime: new Date('2026-11-03T14:00:00.000Z'),
    status: 'Cancelled',
  },
];

async function seed() {
  await connectDB();
  await Appointment.init(); // make sure indexes exist

  const operations = sampleAppointments.map((appointment) => ({
    updateOne: {
      filter: {
        customerName: appointment.customerName,
        service: appointment.service,
        dateTime: appointment.dateTime,
      },
      update: { $setOnInsert: appointment },
      upsert: true,
    },
  }));

  const result = await Appointment.bulkWrite(operations, { ordered: true });
  const inserted = result.upsertedCount;
  const skipped = sampleAppointments.length - inserted;

  console.log(`Seed complete: ${inserted} inserted, ${skipped} already present (skipped).`);
}

seed()
  .then(() => disconnectDB())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Seeding failed:', err.message);
    if (mongoose.connection.readyState !== 0) await disconnectDB();
    process.exit(1);
  });
