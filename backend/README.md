# Appointment Manager — Backend API

REST API for the Appointment Management System, built with **Node.js, Express 5, MongoDB Atlas and Mongoose**.

---

## Contents

1. [Architecture](#architecture)
2. [Local setup](#local-setup)
3. [Environment variables](#environment-variables)
4. [MongoDB Atlas setup](#mongodb-atlas-setup)
5. [Dates & timezones](#dates--timezones)
6. [API documentation](#api-documentation)
7. [Deploying to Render](#deploying-to-render)
8. [Testing the API (curl)](#testing-the-api-curl)
9. [Testing checklist](#testing-checklist)

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
└── scripts/
    └── seed.js                  # Idempotent sample-data seeder
```

**Key decisions**

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

The API runs at `http://localhost:5000` (or whatever `PORT` is set to).
Check that it's up: `curl http://localhost:5000/api/health`

---

## Environment variables

| Variable | Required | Example | Notes |
|---|---|---|---|
| `MONGODB_URI` | yes | `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/appointment_manager?retryWrites=true&w=majority` | Include a database name. URL-encode special characters in the password. |
| `PORT` | no | `5000` | Render sets this automatically. |
| `NODE_ENV` | no | `development` / `production` | In `production`, 500-error details are hidden and CORS is strict. |
| `FRONTEND_URL` | yes in production | `https://your-frontend.onrender.com,http://localhost:5173` | Comma-separated allowed origins, no trailing slash. |

**CORS behaviour**

- Requests with no `Origin` header (curl, Postman, Render health checks) are always allowed.
- In development, if `FRONTEND_URL` is empty, every origin is allowed.
- Otherwise, only origins listed in `FRONTEND_URL` are allowed. Any other origin gets a `403`.

Never commit `.env`. It's already in `.gitignore`.

---

## MongoDB Atlas setup

1. Sign in at <https://cloud.mongodb.com> and open your project and cluster (for example `Cluster0`).
2. **Database user:** go to *Security → Database Access → Add New Database User*. Choose password authentication and give the user the *Read and write to any database* role (or scope it to the `appointment_manager` database). Store the password somewhere safe. Don't paste it into chats or commit it.
3. **Network access:** go to *Security → Network Access → Add IP Address*.
   - For local development, add your current IP.
   - For Render, add `0.0.0.0/0` (allow from anywhere). Render's free tier has no fixed outbound IPs. Access is still protected by the username and password. On paid Render plans you can allow-list Render's static outbound IPs instead.
4. **Connection string:** go to *Database → Connect → Drivers → Node.js* and copy the `mongodb+srv://...` string.
5. Insert your password and **add a database name** after the host:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/appointment_manager?retryWrites=true&w=majority&appName=Cluster0
   ```
   Without a database name, Mongoose uses a database called `test`.
   If the password contains special characters (`@ : / ? # [ ] %`), URL-encode them. For example, `p@ss` becomes `p%40ss`.
6. Put the string in `backend/.env` as `MONGODB_URI=...`, then run `npm run seed`.

---

## Dates & timezones

**Storage:** `dateTime` is stored as a UTC instant (a BSON `Date`), and the API always returns it as an ISO string ending in `Z`, e.g. `2026-11-02T10:00:00.000Z`.

**Sending dates (create/update):** `dateTime` must be an ISO 8601 string **with a timezone**:
- `2026-11-20T10:00:00.000Z`: UTC
- `2026-11-20T15:30:00+05:30`: converted to `2026-11-20T10:00:00.000Z` before storing

A value without a timezone, such as `2026-11-20T10:00:00`, is rejected. Its meaning would depend on the server's local timezone, which differs between your laptop and Render.

**Querying by date** (`date`, `startDate`, `endDate`) accepts:
- `YYYY-MM-DD`: a whole calendar day. By default it's a UTC day. Add `tzOffset` to interpret it in the user's timezone.
  - `startDate=2026-11-01` means "from 00:00 on Nov 1"
  - `endDate=2026-11-30` means "up to, but not including, 00:00 on Dec 1", so the whole of Nov 30 is included, right up to 23:59:59.999
- A full ISO date-time with a timezone: used as an exact instant (both ends inclusive).

**`tzOffset`** is in minutes and uses the same sign as JavaScript's `new Date().getTimezoneOffset()`. For example, IST is `-330`, US Eastern (EST) is `300`, and UTC is `0`.

**Recommended frontend approach (Vue):**

```js
// Sending: convert the user's local date/time picker value to UTC ISO
const payload = { dateTime: new Date(localDateTimeString).toISOString() };

// Querying a month/week/day in the user's local timezone
const tzOffset = new Date().getTimezoneOffset();
fetch(`/api/appointments/calendar?startDate=2026-11-01&endDate=2026-11-30&tzOffset=${tzOffset}`);

// Or send exact local boundaries as ISO instants (also handles DST transitions):
const start = new Date(2026, 10, 1).toISOString();            // local midnight Nov 1
const end   = new Date(2026, 11, 1, 0, 0, 0, -1).toISOString(); // local 23:59:59.999 Nov 30
fetch(`/api/appointments/calendar?startDate=${start}&endDate=${end}`);

// Displaying: convert UTC back to local
new Date(appointment.dateTime).toLocaleString();
```

The sample seed data is stored at the given times in **UTC** (e.g. Alex Morgan at `2026-11-02T10:00:00.000Z`).

---

## API documentation

Base URL: `http://localhost:5000` locally, or `https://<your-service>.onrender.com` once deployed.

### Response format

Success:
```json
{
  "success": true,
  "message": "Appointments fetched successfully",
  "data": [],
  "pagination": { "total": 0, "page": 1, "limit": 10, "totalPages": 0 }
}
```
`pagination` appears only on the list endpoint. `meta` appears only on the calendar endpoint.

Error:
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "dateTime", "message": "dateTime is required", "location": "body" }
  ]
}
```

### Appointment object

```json
{
  "_id": "6afc813d03e3d4b896afd607",
  "id": "6afc813d03e3d4b896afd607",
  "customerName": "Alex Morgan",
  "service": "Consultation",
  "dateTime": "2026-11-02T10:00:00.000Z",
  "status": "Pending",
  "createdAt": "2026-11-17T16:30:53.826Z",
  "updatedAt": "2026-11-17T16:30:53.826Z"
}
```

| Field | Type | Rules |
|---|---|---|
| `customerName` | string | required, trimmed, 2–100 chars |
| `service` | string | required, trimmed, 2–100 chars |
| `dateTime` | ISO string | required, must include a timezone |
| `status` | string | `Pending` \| `Confirmed` \| `Cancelled`, default `Pending` |

### Endpoints

| Method | Path | Description | Success |
|---|---|---|---|
| GET | `/api/health` | API and database health | 200 (503 if the DB is down) |
| GET | `/api/appointments` | List with filters and pagination | 200 |
| GET | `/api/appointments/calendar` | All appointments in a date range | 200 |
| GET | `/api/appointments/:id` | Single appointment | 200 |
| POST | `/api/appointments` | Create | 201 |
| PUT | `/api/appointments/:id` | Update editable fields | 200 |
| PATCH | `/api/appointments/:id/status` | Change status | 200 |
| DELETE | `/api/appointments/:id` | Delete | 200 |

#### GET `/api/appointments`

| Query param | Description |
|---|---|
| `status` | `Pending`, `Confirmed`, `Cancelled`, or a comma-separated list, e.g. `Pending,Confirmed` |
| `search` | Case-insensitive partial match on `customerName` |
| `date` | A single day, `YYYY-MM-DD`. Can't be combined with `startDate`/`endDate`. |
| `startDate` | Range start (inclusive). `YYYY-MM-DD` or ISO with timezone. |
| `endDate` | Range end (inclusive). `YYYY-MM-DD` or ISO with timezone. |
| `tzOffset` | Minutes, `getTimezoneOffset()` convention. Applies to `YYYY-MM-DD` values. |
| `page` | Default `1` |
| `limit` | Default `10`, max `100` |
| `sortOrder` | `asc` (default) or `desc`, by `dateTime` |

All filters combine with AND.

#### GET `/api/appointments/calendar`

| Query param | Description |
|---|---|
| `startDate` | **required**. `YYYY-MM-DD` or ISO with timezone. |
| `endDate` | **required**. Inclusive. Range at most 366 days. |
| `tzOffset` | optional |
| `status` | optional, same format as above |

Returns every matching appointment, sorted by `dateTime`, with no pagination. Example `meta`:
```json
{ "startDate": "2026-11-01", "endDate": "2026-11-30", "tzOffset": 0,
  "rangeStart": "2026-11-01T00:00:00.000Z", "rangeEnd": "2026-12-01T00:00:00.000Z",
  "rangeEndInclusive": false, "count": 3 }
```

#### POST `/api/appointments`
```json
{ "customerName": "John Doe", "service": "Consultation", "dateTime": "2026-11-20T10:00:00.000Z", "status": "Pending" }
```
`status` is optional.

#### PUT `/api/appointments/:id`
Send any of `customerName`, `service`, `dateTime`, `status` (at least one). Only the fields you send are changed. Other fields in the body are ignored.

#### PATCH `/api/appointments/:id/status`
```json
{ "status": "Confirmed" }
```

#### DELETE `/api/appointments/:id`
Returns `{ "success": true, "message": "Appointment deleted successfully", "data": { "id": "..." } }`.

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

### Option A: Dashboard (manual)

1. Push this repository to GitHub.
2. In Render, choose **New → Web Service** and connect the repository.
3. Configure:
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
   - **Instance type:** Free (or higher)
4. Under **Environment → Environment Variables**, add:
   - `MONGODB_URI`: your full Atlas connection string. Paste it only in Render, never in code or chat.
   - `NODE_ENV`: `production`
   - `FRONTEND_URL`: your frontend URL(s), e.g. `https://your-frontend.onrender.com`. Add `http://localhost:5173` too if you want local frontend dev to call the deployed API.
   - `NODE_VERSION`: `22` (optional; pins the Node version)
   - Do **not** set `PORT`. Render injects it, and the server reads `process.env.PORT`.
5. Under **Settings → Health Check Path**, set `/api/health`.
6. Click **Create Web Service**. Watch the logs for `MongoDB connected` and `Server running in production mode`.
7. Make sure Atlas **Network Access** allows `0.0.0.0/0` (see the Atlas section). Otherwise the connection times out.

### Option B: Blueprint

The repo root contains `render.yaml`. In Render, choose **New → Blueprint**, select the repository, and enter `MONGODB_URI` and `FRONTEND_URL` when prompted.

### Seeding the production database

Run the seeder from your machine against the Atlas URI (it's idempotent):
```bash
cd backend
MONGODB_URI="<your atlas uri>" npm run seed     # macOS/Linux/Git Bash
# PowerShell:  $env:MONGODB_URI="<your atlas uri>"; npm run seed
```
Or put the URI in `.env` and run `npm run seed`.

### Verifying the deployment

```bash
curl https://<your-service>.onrender.com/api/health
curl https://<your-service>.onrender.com/api/appointments
```
Free Render instances sleep after inactivity, so the first request can take 30–60 seconds.

---

## Testing the API (curl)

Set a base URL first (Git Bash, macOS or Linux):
```bash
BASE=http://localhost:5000
# BASE=https://<your-service>.onrender.com
```

```bash
# 1. Fetch all appointments
curl "$BASE/api/appointments"

# 2. Create an appointment (copy the returned _id)
curl -X POST "$BASE/api/appointments" -H "Content-Type: application/json" \
  -d '{"customerName":"John Doe","service":"Consultation","dateTime":"2026-11-20T10:00:00.000Z","status":"Pending"}'
ID=<paste _id here>

# 3. Update appointment details
curl -X PUT "$BASE/api/appointments/$ID" -H "Content-Type: application/json" \
  -d '{"customerName":"John Smith","service":"Follow-up","dateTime":"2026-11-20T12:00:00.000Z"}'

# 4. Change status
curl -X PATCH "$BASE/api/appointments/$ID/status" -H "Content-Type: application/json" \
  -d '{"status":"Confirmed"}'

# 5. Filter by status
curl "$BASE/api/appointments?status=Confirmed"
curl "$BASE/api/appointments?status=Pending,Cancelled"

# 6. Filter by date / range
curl "$BASE/api/appointments?date=2026-11-02"
curl "$BASE/api/appointments?startDate=2026-11-01&endDate=2026-11-03"
curl "$BASE/api/appointments?date=2026-11-02&tzOffset=-330"     # Nov 2 in IST

# 7. Search by customer name (case-insensitive, partial)
curl "$BASE/api/appointments?search=alex"

# 8. Combine filters + pagination
curl "$BASE/api/appointments?status=Confirmed&date=2026-11-02&search=jamie&page=1&limit=5"

# 9. Calendar
curl "$BASE/api/appointments/calendar?startDate=2026-11-01&endDate=2026-11-30"

# 10. Delete
curl -X DELETE "$BASE/api/appointments/$ID"

# 11. Invalid input & nonexistent IDs
curl -X POST "$BASE/api/appointments" -H "Content-Type: application/json" -d '{}'                 # 400
curl -X POST "$BASE/api/appointments" -H "Content-Type: application/json" -d '{"customerName": bad' # 400 invalid JSON
curl -X POST "$BASE/api/appointments" -H "Content-Type: application/json" \
  -d '{"customerName":"Jo","service":"Review","dateTime":"not-a-date"}'                          # 400
curl -X PATCH "$BASE/api/appointments/$ID/status" -H "Content-Type: application/json" -d '{"status":"Done"}' # 400
curl "$BASE/api/appointments/123"                          # 400 invalid id
curl "$BASE/api/appointments/64b7f0000000000000000000"     # 404
curl "$BASE/api/appointments?startDate=2026-11-05&endDate=2026-11-01"  # 400 inverted range
```

**PowerShell note:** use `curl.exe` instead of `curl`, and put JSON bodies in a file (`-d "@body.json"`) to avoid quoting problems. Or use Postman.

**Postman:** create an environment variable `baseUrl`, set the `Content-Type: application/json` header, and use raw JSON bodies as above.

---

## Testing checklist

| # | Scenario | Expected |
|---|---|---|
| 1 | `GET /api/appointments` | 200, 3 seeded records, pagination metadata |
| 2 | `POST` valid body | 201, record returned with `_id`, default status `Pending` |
| 3 | `PUT` with new name/service/dateTime | 200, updated record |
| 4 | `PATCH /:id/status` `Confirmed` | 200, status changed |
| 5 | `?status=Confirmed` | only Confirmed records |
| 6 | `?date=2026-11-02` | Alex Morgan, Jamie Lee |
| 7 | `?search=aLeX` | Alex Morgan |
| 8 | `?status=Confirmed&date=2026-11-02&search=jamie` | Jamie Lee only |
| 9 | `/calendar?startDate=2026-11-01&endDate=2026-11-30` | all November records, sorted |
| 9b | Appointment at `2026-11-30T23:59:59.999Z` | included in the November calendar |
| 9c | Appointment at `2026-12-01T00:00:00.000Z` | excluded from the November calendar |
| 10 | `DELETE /:id` then `GET /:id` | 200 then 404 |
| 11 | Empty body / bad date / bad status / bad JSON | 400 with `errors[]` |
| 11b | Invalid ObjectId / nonexistent id | 400 / 404 |
| 12 | `GET /api/health` | 200 `{ database: "connected" }` |
| 13 | Request from a non-allowed Origin (production) | 403 |
| 14 | `npm run seed` twice | second run: `0 inserted, 3 already present` |
