# Appointment Manager — Backend API

REST API for the **Appointment Manager** practical assessment (MEVN stack), built with **Node.js, Express 5, MongoDB Atlas and Mongoose**.

> **Frontend (live):** <https://appointment-management-frontend.onrender.com>. The Vue source is in a separate repository: _add repo link here_.
> **Live API:** <https://appintment-management.onrender.com>. Health check: <https://appintment-management.onrender.com/api/health>, appointments: <https://appintment-management.onrender.com/api/appointments>

---

## Contents

1. [Submission summary](#submission-summary)
2. [Architecture](#architecture)
3. [Local setup](#local-setup)
4. [Environment variables](#environment-variables)
5. [MongoDB Atlas setup](#mongodb-atlas-setup)
6. [Dates & timezones](#dates--timezones)
7. [API documentation](#api-documentation)
8. [Deploying to Render](#deploying-to-render)
9. [Tests performed](#tests-performed)
10. [Manual testing with curl](#manual-testing-with-curl)

---

## Submission summary

### Completed (backend, tested)

- List appointments with customer name, service, date/time and status
- Create an appointment, with server-side validation and field-level error messages
- Update appointment details, and change status (`Pending` / `Confirmed` / `Cancelled`)
- Delete an appointment
- Filter by status (send no `status` for **All**, one status, or several comma-separated)
- **Customer-name search:** case-insensitive and partial, and combines with the status filter
- Filter by a single date or a date range; calendar endpoint for month, week and day views
- Pagination with total and page metadata
- Data stored in MongoDB Atlas, so changes survive a page refresh or a server restart
- Idempotent seed script with the three starting appointments
- Health-check endpoint, centralised error handling, CORS restricted to the frontend origin
- Ready to deploy on Render (`render.yaml`, `PORT` from the environment, health check)

### Incomplete / out of scope in this repository

- The Vue frontend is in a separate repository (see the link above).
- No authentication or authorisation. The brief didn't ask for it; anyone who can reach the API can change data.
- No automated unit tests. Testing is an end-to-end script against a running server ([backend/tests/e2e.js](backend/tests/e2e.js)).

### Known limitations

- **Starting-data times are stored as UTC** (`2026-11-02 10:00` is stored as `2026-11-02T10:00:00.000Z`). The brief doesn't give a timezone. A browser in IST shows these as 15:30, 17:00 and 19:30. Appointments created from the UI are stored exactly as the user entered them in local time.
- No double-booking check: two appointments can have the same date and time.
- The free Render plan sleeps when idle. The first request after a pause can take 30–60 seconds.
- The e2e test needs its own freshly seeded database. It refuses to run if other data exists.

### Technical decision: store UTC, require a timezone on input

All `dateTime` values are stored as UTC instants. The API **rejects date-times without a timezone** (`2026-11-20T10:00:00` gives a 400). A value without a timezone would be read in the *server's* timezone, which is IST on a developer laptop and UTC on Render. The same request would then save different times depending on where the API runs. The frontend sends `new Date(local).toISOString()` and converts back to local time for display.

Date filters work the same way. `YYYY-MM-DD` means a whole day, and an optional `tzOffset` (from the browser's `getTimezoneOffset()`) makes that the user's local day. The end of a range is "before next midnight" rather than "≤ 23:59:59", so appointments right at midnight land on the correct day. Tests 9b and 9c cover this.

### AI assistance disclosure

The backend code, the e2e test script and this README were generated with **Claude Code** (Anthropic), directed and reviewed by the candidate. No starter template was used.

---

## Architecture

```
backend/
├── app.js                       # Express app: CORS, JSON parsing, routes, error handlers
├── server.js                    # Entry point: connects to MongoDB, then starts listening
├── config/
│   ├── env.js                   # Loads + normalises environment variables
│   └── db.js                    # Mongoose connection helpers
├── models/
│   └── Appointment.js           # Mongoose schema + indexes
├── controllers/
│   └── appointmentController.js # Request handlers (business logic)
├── routes/
│   ├── appointmentRoutes.js     # /api/appointments routes
│   └── healthRoutes.js          # /api/health
├── validators/
│   └── appointmentValidators.js # express-validator rule sets per endpoint
├── middleware/
│   ├── validateRequest.js       # Turns validation results into a 400 response
│   ├── notFoundMiddleware.js    # 404 for unknown routes
│   └── errorMiddleware.js       # Centralised error handler
├── utils/
│   ├── ApiError.js              # Error class carrying HTTP status + details
│   ├── apiResponse.js           # Consistent success response helpers
│   ├── dateUtils.js             # Date parsing / day-boundary logic
│   └── escapeRegex.js           # Safe regex for name search
├── scripts/
│   └── seed.js                  # Idempotent sample-data seeder
└── tests/
    └── e2e.js                   # End-to-end API test (49 checks)
```

| Decision | Reason |
|---|---|
| `app.js` separated from `server.js` | The app can be imported and tested without opening a port or a DB connection. |
| Validators in their own folder | Keeps routes readable; each endpoint's rules are declared in one place. |
| Express 5 | Async handler errors are forwarded to the error middleware automatically, so no `try/catch` or `asyncHandler` wrappers are needed. |
| Whitelisting editable fields | Controllers copy only `customerName`, `service`, `dateTime`, `status` from the body, so clients can't overwrite `_id`, `createdAt` and similar fields. |
| Regex escaping for `search` | Users can't inject regex patterns (and can't cause ReDoS). |
| Server exits if DB connection fails at startup | Render restarts the service instead of serving 500s. `/api/health` returns 503 if the DB drops later. |
| Seeder uses upsert + `$setOnInsert` | Running it repeatedly never duplicates records or overwrites edits. |
| Indexes on `dateTime`, `{status, dateTime}`, `customerName` | Supports the date-range, status and search queries. |

Dependencies: `express`, `mongoose`, `express-validator`, `cors`, `dotenv`. Nothing else.

---

## Local setup

Requirements: Node.js 18.18+ (tested on Node 22) and a MongoDB Atlas cluster (or a local MongoDB).

```bash
cd backend
npm install
cp .env.example .env        # then edit .env and set MONGODB_URI
npm run seed                # inserts the 3 sample appointments (safe to re-run)
npm run dev                 # starts with auto-reload (node --watch)
# or
npm start                   # production-style start
```

The API runs at `http://localhost:5000`. Check that it's up: `curl http://localhost:5000/api/health`

---

## Environment variables

An example file without secrets is in [backend/.env.example](backend/.env.example). The real `backend/.env` is gitignored.

| Variable | Required | Example | Notes |
|---|---|---|---|
| `MONGODB_URI` | yes | `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/appointment_manager?retryWrites=true&w=majority` | Include a database name. URL-encode special characters in the password. |
| `PORT` | no | `5000` | Render sets this automatically. |
| `NODE_ENV` | no | `development` / `production` | In `production`, 500-error details are hidden and CORS is strict. |
| `FRONTEND_URL` | yes in production | `https://appointment-management-frontend.onrender.com,http://localhost:5173` | Comma-separated allowed origins, no trailing slash. |

**CORS behaviour**

- Requests with no `Origin` header (curl, Postman, Render health checks) are always allowed.
- In development, if `FRONTEND_URL` is empty, every origin is allowed.
- Otherwise, only origins listed in `FRONTEND_URL` are allowed. Any other origin gets a `403`.

---

## MongoDB Atlas setup

1. Sign in at <https://cloud.mongodb.com> and open your project and cluster. The free **M0** tier is enough.
2. **Database user:** go to *Security → Database Access → Add New Database User*. Choose password authentication and give the user the *Read and write to any database* role (or scope it to the `appointment_manager` database).
3. **Network access:** go to *Security → Network Access → Add IP Address*. Add your IP for local development, and `0.0.0.0/0` for Render (the free tier has no fixed outbound IPs).
4. **Connection string:** go to *Database → Connect → Drivers → Node.js* and copy the `mongodb+srv://...` string.
5. Insert your password and **add a database name** after the host:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/appointment_manager?retryWrites=true&w=majority&appName=Cluster0
   ```
   Without a database name, Mongoose uses a database called `test`.
6. Put the string in `backend/.env` as `MONGODB_URI=...`, then run `npm run seed`.

---

## Dates & timezones

- **Storage:** `dateTime` is a UTC instant. Responses always use ISO strings ending in `Z`.
- **Create/update:** `dateTime` must include a timezone, e.g. `2026-11-20T10:00:00.000Z` or `2026-11-20T15:30:00+05:30`.
- **Query dates** (`date`, `startDate`, `endDate`):
  - `YYYY-MM-DD` means a whole day (UTC, or local if `tzOffset` is sent). `endDate` includes that whole day.
  - Or a full ISO date-time with a timezone, used as an exact instant (inclusive).
- **`tzOffset`:** minutes, same sign as `new Date().getTimezoneOffset()`. IST is `-330`, US Eastern (EST) is `300`.

Frontend usage:

```js
// Sending: local datetime-local value -> UTC ISO
const payload = { dateTime: new Date(form.dateTimeLocal).toISOString() };

// Querying in the user's local timezone
const tzOffset = new Date().getTimezoneOffset();
fetch(`${API}/api/appointments?date=2026-11-02&tzOffset=${tzOffset}`);

// Displaying
new Date(appointment.dateTime).toLocaleString();
```

---

## API documentation

Base URL: `http://localhost:5000` locally, or the Render URL once deployed.

### Response format

```json
{ "success": true, "message": "Appointments fetched successfully", "data": [],
  "pagination": { "total": 0, "page": 1, "limit": 10, "totalPages": 0 } }
```
```json
{ "success": false, "message": "Validation failed",
  "errors": [{ "field": "dateTime", "message": "dateTime is required", "location": "body" }] }
```
`pagination` appears only on the list endpoint, and `meta` only on the calendar endpoint. Each appointment has both `_id` and `id` (the same value).

### Appointment fields

| Field | Type | Rules |
|---|---|---|
| `customerName` | string | required, trimmed, 2–100 chars |
| `service` | string | required, trimmed, 2–100 chars |
| `dateTime` | ISO string | required, must include a timezone |
| `status` | string | `Pending` \| `Confirmed` \| `Cancelled`, default `Pending` |
| `createdAt`, `updatedAt` | ISO string | set automatically |

### Endpoints

| Method | Path | Description | Success |
|---|---|---|---|
| GET | `/api/health` | API and database health | 200 (503 if the DB is down) |
| GET | `/api/appointments` | List with filters and pagination | 200 |
| GET | `/api/appointments/calendar` | All appointments in a date range | 200 |
| GET | `/api/appointments/:id` | Single appointment | 200 |
| POST | `/api/appointments` | Create | 201 |
| PUT | `/api/appointments/:id` | Update editable fields (only those sent) | 200 |
| PATCH | `/api/appointments/:id/status` | Change status: `{ "status": "Confirmed" }` | 200 |
| DELETE | `/api/appointments/:id` | Delete | 200 |

**`GET /api/appointments` query parameters** (all optional, combined with AND):

| Param | Description |
|---|---|
| `status` | `Pending`, `Confirmed`, `Cancelled`, or comma-separated, e.g. `Pending,Confirmed`. Leave it out for **All**. |
| `search` | Case-insensitive partial match on `customerName` |
| `date` | A single day, `YYYY-MM-DD`. Can't be combined with `startDate`/`endDate`. |
| `startDate` / `endDate` | Range, both inclusive. `YYYY-MM-DD` or ISO with timezone. |
| `tzOffset` | Minutes, `getTimezoneOffset()` convention |
| `page` / `limit` | Defaults `1` / `10`; `limit` max `100` |
| `sortOrder` | `asc` (default) or `desc`, by `dateTime` |

**`GET /api/appointments/calendar`:** `startDate` and `endDate` are required (range at most 366 days). `tzOffset` and `status` are optional. Returns every match sorted by `dateTime`, with no pagination, plus a `meta` object showing the exact UTC range used.

### Error status codes

| Code | When |
|---|---|
| 400 | Validation failed, malformed JSON, invalid ObjectId, invalid date, conflicting/inverted date range |
| 403 | Origin not allowed by CORS |
| 404 | Appointment not found / unknown route |
| 413 | Body larger than 10 KB |
| 500 | Unexpected error (details hidden in production) |
| 503 | Database unavailable |

---

## Deploying to Render

1. Push this repository to GitHub.
2. In Render, choose **New → Web Service** and select the repository.
3. Configure:

   | Setting | Value |
   |---|---|
   | Root Directory | `backend` |
   | Build Command | `npm ci` |
   | Start Command | `npm start` |
   | Instance type | **Free** |
   | Health Check Path (Advanced) | `/api/health` |

4. Add these environment variables. Enter secrets only in Render, never in the repo:

   | Key | Value |
   |---|---|
   | `MONGODB_URI` | your Atlas connection string |
   | `NODE_ENV` | `production` |
   | `FRONTEND_URL` | the frontend's URL(s), comma-separated |
   | `NODE_VERSION` | `22` |

   Don't set `PORT`. Render injects it.

5. Deploy. The logs should show `MongoDB connected` and `Server running in production mode`.
6. Check it: `curl https://appintment-management.onrender.com/api/health` should return `"database":"connected"`.

Alternatively, choose **New → Blueprint** to use [render.yaml](render.yaml).

To seed the production database, run `npm run seed` locally with `MONGODB_URI` pointing at Atlas. It's idempotent.

---

## Tests performed

The tests in [backend/tests/e2e.js](backend/tests/e2e.js) run against a live server and **MongoDB Atlas** (a separate `appointment_manager_test` database), with `NODE_ENV=production`. **Result: 49 passed, 0 failed.** They also passed against a local in-memory MongoDB.

```bash
# Use a separate, freshly seeded database. The script refuses to run on other data.
MONGODB_URI="<atlas uri with /appointment_manager_test>" npm run seed
MONGODB_URI="<same uri>" NODE_ENV=production FRONTEND_URL=http://localhost:5173 npm start
npm run test:e2e            # or: node tests/e2e.js http://localhost:5000
```

| # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | Fetch all | 3 seeded records, sorted by date, pagination metadata | ✅ |
| 2 | Create | 201, default status `Pending`, name trimmed, `+05:30` input stored as UTC | ✅ |
| 3 | Update details | Fields changed; `_id` / `createdAt` in the body ignored | ✅ |
| 4 | Change status | `Confirmed` saved | ✅ |
| 5 | Filter by status | Single status and comma-separated statuses | ✅ |
| 6 | Filter by date / range | Single day, inclusive end day, `tzOffset` local-day boundaries | ✅ |
| 7 | Search by name | Case-insensitive, partial, regex characters handled safely | ✅ |
| 8 | Combined filters + pagination | Status + date + search; `page=2&limit=2` | ✅ |
| 9 | Calendar | Month range; 23:59:59.999 included, next-day 00:00 excluded; ISO bounds | ✅ |
| 10 | Delete | 200, then GET returns 404 | ✅ |
| 11 | Invalid input | Empty body, bad date, date without timezone, 30 Feb, bad status, malformed JSON, invalid ObjectId, nonexistent IDs (GET/PUT/PATCH/DELETE), invalid query params, conflicting/inverted ranges, calendar range cap, repeated params | ✅ all 400 / 404 |
| 12 | Health / unknown route | 200 connected / 404 | ✅ |
| 13 | CORS | Allowed origin echoed; other origin gets 403 | ✅ |
| 14 | Seed idempotency | Second run: `0 inserted, 3 already present` | ✅ |
| 15 | Startup without DB | Missing or unreachable `MONGODB_URI` makes the process exit with code 1 | ✅ |

---

## Manual testing with curl

```bash
BASE=http://localhost:5000        # or https://appintment-management.onrender.com

curl "$BASE/api/appointments"                                   # all
curl "$BASE/api/appointments?status=Confirmed"                  # filter by status
curl "$BASE/api/appointments?search=alex"                       # search by name
curl "$BASE/api/appointments?status=Confirmed&search=jamie&date=2026-11-02"   # combined
curl "$BASE/api/appointments/calendar?startDate=2026-11-01&endDate=2026-11-30"

curl -X POST "$BASE/api/appointments" -H "Content-Type: application/json" \
  -d '{"customerName":"John Doe","service":"Consultation","dateTime":"2026-11-20T10:00:00.000Z","status":"Pending"}'
ID=<paste _id>
curl -X PUT   "$BASE/api/appointments/$ID" -H "Content-Type: application/json" -d '{"service":"Follow-up"}'
curl -X PATCH "$BASE/api/appointments/$ID/status" -H "Content-Type: application/json" -d '{"status":"Confirmed"}'
curl -X DELETE "$BASE/api/appointments/$ID"

curl -X POST "$BASE/api/appointments" -H "Content-Type: application/json" -d '{}'   # 400 with field errors
curl "$BASE/api/appointments/123"                                                  # 400 invalid id
curl "$BASE/api/appointments/64b7f0000000000000000000"                             # 404
```

On Windows PowerShell, use `curl.exe` and put JSON bodies in a file (`-d "@body.json"`), or use Postman.
