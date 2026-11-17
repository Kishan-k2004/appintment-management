/**
 * End-to-end API test. Runs against a live server and a freshly seeded database
 * (exactly the 3 sample appointments). Every record it creates is deleted again.
 *
 * Usage:  npm run test:e2e                      (defaults to http://localhost:5000)
 *         node tests/e2e.js https://<service>.onrender.com
 *
 * The CORS checks expect FRONTEND_URL to include http://localhost:5173 and
 * NODE_ENV=production (or a non-empty FRONTEND_URL) so other origins get 403.
 */
const BASE = process.argv[2] || process.env.API_URL || 'http://localhost:5000';
let pass = 0, fail = 0;

async function call(method, path, body, headers = {}) {
  const opts = { method, headers: { ...headers } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(BASE + path, opts);
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json, headers: res.headers };
}

function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

(async () => {
  let r = await call('GET', '/api/health');
  check('health 200', r.status === 200 && r.json.data.database === 'connected', r.json);

  r = await call('GET', '/api/appointments');
  if (r.json?.pagination?.total !== 3) {
    console.error(
      `Aborting: database has ${r.json?.pagination?.total} appointments, expected exactly the 3 seeded ones.\n` +
        'Run this test against a separate, freshly seeded database (e.g. .../appointment_manager_test), not real data.'
    );
    process.exit(2);
  }
  check('1 fetch all', r.status === 200 && r.json.data.length === 3 && r.json.pagination.total === 3, r.json);
  check('1 sorted asc', r.json.data[0].customerName === 'Alex Morgan');
  check('1 response shape', r.json.success === true && typeof r.json.message === 'string' && r.json.data[0].id);

  r = await call('POST', '/api/appointments', { customerName: 'John Doe', service: 'Consultation', dateTime: '2026-11-20T10:00:00.000Z', status: 'Pending' });
  check('2 create 201', r.status === 201 && r.json.data.customerName === 'John Doe', r.json);
  const id = r.json.data._id;

  r = await call('POST', '/api/appointments', { customerName: '  Default Status  ', service: 'Review', dateTime: '2026-11-21T23:30:00+05:30' });
  check('2 create default status + trim + offset->UTC', r.status === 201 && r.json.data.status === 'Pending' && r.json.data.customerName === 'Default Status' && r.json.data.dateTime === '2026-11-21T18:00:00.000Z', r.json);
  const id2 = r.json.data._id;

  r = await call('PUT', `/api/appointments/${id}`, { customerName: 'John Updated', service: 'Follow-up', dateTime: '2026-11-20T12:00:00.000Z' });
  check('3 update', r.status === 200 && r.json.data.customerName === 'John Updated' && r.json.data.dateTime === '2026-11-20T12:00:00.000Z', r.json);

  r = await call('PUT', `/api/appointments/${id}`, { _id: 'x', createdAt: '2000-01-01T00:00:00Z', service: 'Review' });
  check('3 update ignores non-editable fields', r.status === 200 && r.json.data._id === id && r.json.data.service === 'Review', r.json);

  r = await call('PATCH', `/api/appointments/${id}/status`, { status: 'Confirmed' });
  check('4 status change', r.status === 200 && r.json.data.status === 'Confirmed', r.json);

  r = await call('GET', '/api/appointments?status=Confirmed');
  check('5 filter status', r.status === 200 && r.json.data.length === 2 && r.json.data.every((a) => a.status === 'Confirmed'), r.json.data);

  r = await call('GET', '/api/appointments?status=Pending,Cancelled');
  check('5 filter multi status', r.json.data.length === 3, r.json.data.map((a) => a.status));

  r = await call('GET', '/api/appointments?date=2026-11-02');
  check('6 filter date', r.json.data.length === 2, r.json.data);

  r = await call('GET', '/api/appointments?startDate=2026-11-02&endDate=2026-11-03');
  check('6 date range inclusive end day', r.json.data.length === 3, r.json.data.length);

  // 2026-11-21T18:00Z is 2026-11-21 23:30 IST -> on 21st in IST, but 2026-11-21 UTC too
  r = await call('GET', '/api/appointments?date=2026-11-22&tzOffset=-330');
  check('6 tzOffset IST next-day excludes 23:30 IST', r.json.data.length === 0, r.json.data);
  r = await call('GET', '/api/appointments?date=2026-11-21&tzOffset=-330');
  check('6 tzOffset IST same day includes 23:30 IST', r.json.data.length === 1, r.json.data);

  r = await call('GET', '/api/appointments?search=aLeX');
  check('7 search case-insensitive', r.json.data.length === 1 && r.json.data[0].customerName === 'Alex Morgan', r.json.data);
  r = await call('GET', '/api/appointments?search=or');
  check('7 search partial', r.json.data.length === 2, r.json.data.map((a) => a.customerName));
  r = await call('GET', '/api/appointments?search=' + encodeURIComponent('.*('));
  check('7 search regex chars safe', r.status === 200 && r.json.data.length === 0, r.json);

  r = await call('GET', '/api/appointments?status=Confirmed&date=2026-11-02&search=jamie');
  check('8 combined filters', r.json.data.length === 1 && r.json.data[0].customerName === 'Jamie Lee', r.json.data);
  r = await call('GET', '/api/appointments?limit=2&page=2');
  check('8 pagination', r.json.data.length === 2 && r.json.pagination.total === 5 && r.json.pagination.totalPages === 3 && r.json.pagination.page === 2, r.json.pagination);

  r = await call('GET', '/api/appointments/calendar?startDate=2026-11-01&endDate=2026-11-30');
  check('9 calendar month', r.status === 200 && r.json.data.length === 5 && r.json.meta.count === 5, r.json);

  // Midnight boundaries
  const m1 = await call('POST', '/api/appointments', { customerName: 'Midnight Start', service: 'Edge', dateTime: '2026-12-01T00:00:00.000Z' });
  const m2 = await call('POST', '/api/appointments', { customerName: 'Before Midnight', service: 'Edge', dateTime: '2026-11-30T23:59:59.999Z' });
  r = await call('GET', '/api/appointments/calendar?startDate=2026-11-01&endDate=2026-11-30');
  const names = r.json.data.map((a) => a.customerName);
  check('9 calendar includes 23:59:59.999 on end day', names.includes('Before Midnight'), names);
  check('9 calendar excludes next-day 00:00', !names.includes('Midnight Start'), names);
  r = await call('GET', '/api/appointments/calendar?startDate=2026-12-01&endDate=2026-12-01');
  check('9 calendar single day includes 00:00', r.json.data.length === 1 && r.json.data[0].customerName === 'Midnight Start', r.json.data);
  r = await call('GET', '/api/appointments/calendar?startDate=2026-11-30T00:00:00.000Z&endDate=2026-11-30T23:59:59.999Z');
  check('9 calendar ISO bounds', r.json.data.map((a) => a.customerName).join() === 'Before Midnight', r.json.data);

  r = await call('DELETE', `/api/appointments/${id}`);
  check('10 delete', r.status === 200 && r.json.data.id === id, r.json);
  r = await call('GET', `/api/appointments/${id}`);
  check('10 deleted -> 404', r.status === 404 && r.json.success === false, r.json);
  for (const x of [id2, m1.json.data._id, m2.json.data._id]) await call('DELETE', `/api/appointments/${x}`);

  // 11 invalid input
  r = await call('POST', '/api/appointments', {});
  check('11 create empty body 400', r.status === 400 && r.json.message === 'Validation failed' && ['customerName', 'service', 'dateTime'].every((f) => r.json.errors.some((e) => e.field === f)), r.json);
  r = await call('POST', '/api/appointments', { customerName: 'A B', service: 'X Y', dateTime: 'not-a-date', status: 'Done' });
  check('11 bad date + status', r.status === 400 && r.json.errors.some((e) => e.field === 'dateTime') && r.json.errors.some((e) => e.field === 'status'), r.json);
  r = await call('POST', '/api/appointments', { customerName: 'A B', service: 'X Y', dateTime: '2026-11-20T10:00:00' });
  check('11 date without timezone rejected', r.status === 400, r.json);
  r = await call('POST', '/api/appointments', { customerName: 'A B', service: 'X Y', dateTime: '2026-02-30T10:00:00Z' });
  check('11 impossible date rejected', r.status === 400, r.json);
  r = await call('POST', '/api/appointments', '{"customerName": bad json');
  check('11 malformed JSON 400', r.status === 400 && r.json.message === 'Invalid JSON in request body', r.json);
  r = await call('GET', '/api/appointments/123');
  check('11 invalid ObjectId 400', r.status === 400 && r.json.errors[0].field === 'id', r.json);
  r = await call('GET', '/api/appointments/64b7f0000000000000000000');
  check('11 nonexistent id 404', r.status === 404, r.json);
  r = await call('PUT', '/api/appointments/64b7f0000000000000000000', { service: 'Abc' });
  check('11 update nonexistent 404', r.status === 404, r.json);
  r = await call('PUT', `/api/appointments/${id2}`, {});
  check('11 update empty body 400', r.status === 400, r.json);
  r = await call('PATCH', '/api/appointments/64b7f0000000000000000000/status', { status: 'Confirmed' });
  check('11 patch nonexistent 404', r.status === 404, r.json);
  r = await call('PATCH', `/api/appointments/64b7f0000000000000000000/status`, { status: 'Done' });
  check('11 patch invalid status 400', r.status === 400, r.json);
  r = await call('DELETE', '/api/appointments/64b7f0000000000000000000');
  check('11 delete nonexistent 404', r.status === 404, r.json);
  r = await call('GET', '/api/appointments?status=Unknown&page=0&limit=500&date=2026-13-01');
  check('11 invalid query params', r.status === 400 && r.json.errors.length === 4, r.json);
  r = await call('GET', '/api/appointments?date=2026-11-02&startDate=2026-11-01');
  check('11 date + range conflict', r.status === 400, r.json);
  r = await call('GET', '/api/appointments?startDate=2026-11-05&endDate=2026-11-01');
  check('11 inverted range', r.status === 400, r.json);
  r = await call('GET', '/api/appointments/calendar?startDate=2026-11-01');
  check('11 calendar missing endDate', r.status === 400 && r.json.errors.some((e) => e.field === 'endDate'), r.json);
  r = await call('GET', '/api/appointments/calendar?startDate=2026-01-01&endDate=2027-06-01');
  check('11 calendar range cap', r.status === 400, r.json);
  r = await call('GET', '/api/appointments?status=Pending&status=Confirmed');
  check('11 repeated query param', r.status === 400, r.json);
  r = await call('GET', '/api/nope');
  check('unknown route 404', r.status === 404 && r.json.success === false, r.json);

  // CORS
  r = await call('GET', '/api/health', undefined, { Origin: 'http://localhost:5173' });
  check('CORS allowed origin', r.headers.get('access-control-allow-origin') === 'http://localhost:5173');
  r = await call('GET', '/api/health', undefined, { Origin: 'https://evil.example' });
  check('CORS disallowed origin 403', r.status === 403 && !r.headers.get('access-control-allow-origin'), r.json);

  r = await call('GET', '/api/appointments');
  check('final state back to 3 seeds', r.json.pagination.total === 3, r.json.pagination);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
