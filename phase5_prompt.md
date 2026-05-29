# EMERALD PEARLAND EVENTS — PHASE 5 IMPLEMENTATION PROMPT
## Observability, Testing & Long-Term Resilience
### For VS Code — Prompt-by-Prompt Build Guide

---

> **CONTEXT FOR AI ASSISTANT**
> You are working on the **Emerald Pearland Events** platform — a Node.js/Express + MongoDB Atlas backend deployed on Render, with a Netlify-hosted frontend. Phases 0–4 are complete. The system now has: secure auth, unified server entrypoint, BullMQ/Redis queue workers, domain-modular structure (/modules/bookings, /modules/payments, etc.), /api/v1 routing, and performance-optimized database queries.
>
> Phase 5 is the **final production hardening phase**. Each prompt below is self-contained. Execute them in order. Do not skip ahead.

---

## PROMPT 1 — Install Logging Dependencies & Create Logger Module

**Paste this prompt into your AI assistant:**

```
I am working on the Emerald Pearland Events Node.js/Express backend (deployed on Render).
Phase 5 task: Replace all console.log usage with structured JSON logging using pino.

Step 1 — Install dependencies:
  npm install pino pino-pretty pino-http

Step 2 — Create the file: server/utils/logger.js
  - Initialize a pino logger with these settings:
    - base field: { service: 'emerald-api', env: process.env.NODE_ENV }
    - In development (NODE_ENV !== 'production'), use pino-pretty transport for human-readable output
    - In production, output raw JSON (no pretty-print)
    - Log level: process.env.LOG_LEVEL || 'info'
  - Export the logger as default

Step 3 — Create the file: server/middleware/requestLogger.js
  - Use pino-http to create an HTTP request logger middleware
  - Attach a child logger with requestId (crypto.randomUUID()) to req.logger on every request
  - Exclude /health/live from request logs (too noisy)
  - Export the middleware as default

Step 4 — Wire it into server-prod.js:
  - Import requestLogger and apply it early in the middleware chain (before routes)
  - Replace the first console.log startup message with logger.info({ port }, 'Server started')

Show me the complete code for all three files and the server-prod.js changes only.
Do not modify any route or controller files yet — just the infrastructure.
```

---

## PROMPT 2 — Replace console.log in Core Service Files

**Paste this prompt into your AI assistant:**

```
Continuing Phase 5 of Emerald Pearland Events. The pino logger is set up at server/utils/logger.js.

Now replace console.log / console.error calls in these specific files with structured pino log calls.
For each file, import the logger: const logger = require('../utils/logger');
Use req.logger inside route handlers where req is available, otherwise use the module-level logger.

Files to update:
1. server/jobs/reconciliationJob.js
   - Replace all console.log/error with logger.info / logger.error
   - On sync retry success: logger.info({ bookingId, syncAttempts }, 'Sync retry succeeded')
   - On sync retry failure: logger.error({ err, bookingId, syncAttempts }, 'Sync retry failed')
   - On job start: logger.info('Reconciliation job running')

2. worker.js (BullMQ worker entry point)
   - Replace console.log on job start/complete/fail with logger.info / logger.warn / logger.error
   - Include jobId, jobName, queueName in every log object

3. server/modules/payments/payments.service.js
   - Replace console.log with logger.info
   - Replace console.error with logger.error({ err }, 'descriptive message')
   - Never log raw payment amounts or M-Pesa transaction IDs at info level — use debug level

4. server/modules/bookings/bookings.service.js
   - Same pattern — replace all console statements

Show me the full updated content of each file.
```

---

## PROMPT 3 — Add /health/ready and /health/live Endpoints

**Paste this prompt into your AI assistant:**

```
Continuing Phase 5 of Emerald Pearland Events.

Create the file: server/routes/health.routes.js

Implement two health endpoints:

1. GET /health/live
   - Returns 200 immediately if the Node process is running
   - Response: { status: 'ok', uptime: process.uptime() }
   - No database checks — this is for the load balancer liveness probe

2. GET /health/ready
   - Performs real dependency checks before responding
   - Check MongoDB: run db.admin().ping() with a 3-second timeout
   - Check Redis: run client.ping() with a 3-second timeout (use the same ioredis connection used by BullMQ)
   - Response shape:
     {
       status: 'ok' | 'degraded',
       checks: {
         mongo: { ok: true|false, latencyMs: number },
         redis: { ok: true|false, latencyMs: number },
         uptime: process.uptime()
       }
     }
   - Return HTTP 200 if all checks pass, HTTP 503 if any check fails
   - Log a warning with logger.warn if any dependency check fails

Wire health.routes.js into server-prod.js:
  - Mount BEFORE auth middleware (health checks must not require a token)
  - app.use('/health', require('./routes/health.routes'))

Show me the complete health.routes.js file and the two lines to add to server-prod.js.
```

---

## PROMPT 4 — Set Up Jest Testing Infrastructure

**Paste this prompt into your AI assistant:**

```
Continuing Phase 5 of Emerald Pearland Events.

Set up the Jest testing infrastructure for this Node.js/Express project.

Step 1 — Install dependencies:
  npm install --save-dev jest supertest @jest/globals mongodb-memory-server dotenv-flow

Step 2 — Update package.json:
  - Set "test" script to: jest --runInBand --forceExit
  - Set "test:watch" script to: jest --watch
  - Set "test:coverage" script to: jest --coverage --runInBand --forceExit
  - Add Jest config block:
    {
      "testEnvironment": "node",
      "testMatch": ["**/tests/**/*.test.js"],
      "setupFilesAfterFramework": ["./tests/setup.js"],
      "coverageThreshold": { "global": { "branches": 60, "functions": 60, "lines": 60 } }
    }

Step 3 — Create tests/setup.js:
  - Start an in-memory MongoDB server (mongodb-memory-server) before all tests
  - Connect mongoose to the in-memory URI
  - Clear all collections between each test (beforeEach)
  - Disconnect and stop the memory server after all tests

Step 4 — Create tests/helpers/auth.helper.js:
  - Export a function createAdminToken() that returns a signed JWT for an admin user (using JWT_SECRET from env)
  - Export a function createStaffToken() for a staff user
  - These helpers are used across all integration tests

Step 5 — Create a .env.test file in the project root:
  - NODE_ENV=test
  - JWT_SECRET=test-secret-do-not-use-in-production
  - STAFF_JWT_SECRET=test-staff-secret
  - CLIENT_JWT_SECRET=test-client-secret
  - LOG_LEVEL=silent  (suppress logs during tests)

Show me complete code for all files. Do not write any tests yet — just the infrastructure.
```

---

## PROMPT 5 — Write Booking Lifecycle Unit Tests

**Paste this prompt into your AI assistant:**

```
Continuing Phase 5 of Emerald Pearland Events. Jest is configured. The Booking model is at server/models/Booking.js and the bookings service is at server/modules/bookings/bookings.service.js.

Create the file: tests/bookings/booking.lifecycle.test.js

Write unit tests covering these booking lifecycle scenarios.
Use the in-memory MongoDB from tests/setup.js. Mock any HTTP calls (staff portal sync) with jest.mock.

Test Suite 1 — Status Transitions:
  - A new booking starts with status 'pending'
  - A pending booking can be confirmed → status becomes 'confirmed'
  - A confirmed booking can be cancelled → status becomes 'cancelled'
  - A cancelled booking cannot be re-confirmed (expect an error or rejected promise)

Test Suite 2 — syncStatus Field:
  - A new booking has syncStatus: 'pending'
  - After a successful sync call, syncStatus becomes 'synced'
  - After a failed sync call, syncStatus becomes 'failed' and lastSyncError is set
  - syncAttempts increments on each failed sync attempt
  - After 5 failed attempts, the booking syncStatus becomes permanently 'failed' and no further retries occur

Test Suite 3 — Validation:
  - Creating a booking without a required field (e.g. clientId) throws a validation error
  - Creating a booking with an invalid eventDate (past date) throws a validation error

For each test, use descriptive it() strings so failures are self-explanatory.
Show me the complete test file.
```

---

## PROMPT 6 — Write Payment Flow Unit Tests

**Paste this prompt into your AI assistant:**

```
Continuing Phase 5 of Emerald Pearland Events.

Create the file: tests/payments/payment.flow.test.js

Write unit tests for the M-Pesa payment flow. The payment service is at server/modules/payments/payments.service.js. The idempotency key field is on the Payment/Assignment model.

Test Suite 1 — Idempotency Key Deduplication:
  - Calling the payment write function twice with the same idempotencyKey only creates ONE record in the database
  - The second call returns the existing record, not a new one
  - Different idempotencyKeys create separate records

Test Suite 2 — M-Pesa Callback Handling:
  - A 'completed' callback updates the booking paymentStatus to 'paid'
  - A 'failed' callback updates the booking paymentStatus to 'failed' and does not update any amount
  - A duplicate 'completed' callback (same CheckoutRequestID) is silently ignored (idempotent)

Test Suite 3 — Payment Status Sync:
  - paymentSyncStatus starts as 'pending' on a new payment record
  - After a successful sync to staff portal, paymentSyncStatus becomes 'synced'
  - After a failed sync, paymentSyncStatus becomes 'failed'

Mock the actual M-Pesa HTTP calls using jest.mock — we are only testing our data layer logic.
Show me the complete test file.
```

---

## PROMPT 7 — Write API Contract Tests with Supertest

**Paste this prompt into your AI assistant:**

```
Continuing Phase 5 of Emerald Pearland Events.

Create the file: tests/api/bookings.api.test.js

Use Supertest to write API contract tests against the Express app (import the app from server-prod.js without calling .listen()).
Use createAdminToken() from tests/helpers/auth.helper.js for authenticated requests.

Test these API contracts:

1. POST /api/v1/bookings
   - Returns 201 with { success: true, data: { booking } } shape on valid input
   - Returns 400 with { success: false, error: string } on missing required fields
   - Returns 401 when no Authorization header is present

2. GET /api/v1/bookings
   - Returns 200 with { success: true, data: { bookings: [], meta: { total, page, limit } } }
   - Accepts ?page=1&limit=10 query params and respects them
   - Returns 401 when unauthenticated

3. PATCH /api/v1/bookings/:id/confirm
   - Returns 200 with updated booking on valid id
   - Returns 404 with { success: false, error: 'Booking not found' } on invalid id
   - Returns 401 when unauthenticated
   - Returns 403 when authenticated but wrong role (use createStaffToken())

4. GET /health/ready
   - Returns 200 with { status: 'ok', checks: { mongo: {...}, redis: {...} } }
   - (Mock the redis check to return ok: true in test env)

For each test, verify BOTH the status code AND the response body shape.
Show me the complete test file.
```

---

## PROMPT 8 — Build the Admin Security Center (Backend Routes)

**Paste this prompt into your AI assistant:**

```
Continuing Phase 5 of Emerald Pearland Events.

Create the backend for the Admin Security Center page.

Step 1 — Create server/models/SecurityEvent.js (Mongoose model):
  Fields:
  - eventType: String, enum: ['login_success', 'login_failed', 'role_change', 'secret_rotation', 'payout_attempt', 'sso_used', 'session_revoked']
  - userId: ObjectId ref User (optional)
  - userEmail: String
  - ipAddress: String
  - userAgent: String
  - metadata: Mixed (extra context object)
  - createdAt: Date (auto)
  Index: { createdAt: -1 } and { eventType: 1, createdAt: -1 }

Step 2 — Create server/utils/securityLogger.js:
  - Export a function logSecurityEvent(eventType, data) that creates a SecurityEvent document
  - This is fire-and-forget (do not await in request handlers — use .catch(logger.error))

Step 3 — Add security event logging to existing auth flows:
  In server/modules/auth (or adminRoutes.js login handler):
  - On successful login: logSecurityEvent('login_success', { userEmail, ipAddress: req.ip, userAgent: req.headers['user-agent'] })
  - On failed login: logSecurityEvent('login_failed', { userEmail, ipAddress: req.ip })

Step 4 — Create server/routes/security.routes.js:
  All routes require protect + authorize('Admin') middleware.

  GET /api/v1/admin/security/events
    - Returns last 100 security events, sorted by createdAt descending
    - Accepts ?eventType= filter query param
    - Response: { success: true, data: { events: [...] } }

  GET /api/v1/admin/security/sync-status
    - Returns counts of bookings grouped by syncStatus
    - Returns counts of payments grouped by paymentSyncStatus
    - Response: { success: true, data: { bookings: { pending, synced, failed }, payments: { pending, synced, failed } } }

  POST /api/v1/admin/security/sync-retry/:bookingId
    - Manually triggers a sync retry for a single booking
    - Calls the same sync function used by reconciliationJob.js
    - Returns the updated booking

  GET /api/v1/admin/security/queue-health
    - Returns BullMQ queue stats for each queue (bookings, payments, notifications, sync)
    - For each queue: { waiting, active, completed, failed, delayed }
    - Use bullmq Queue.getJobCounts() method

Wire security.routes.js into server-prod.js.
Show me complete code for all files.
```

---

## PROMPT 9 — Build the Admin Security Center (Frontend UI)

**Paste this prompt into your AI assistant:**

```
Continuing Phase 5 of Emerald Pearland Events.

Create the Admin Security Center UI page.
This is an HTML/CSS/JS page that lives in the admin panel (same tech stack as the existing admin panel).
Assume the admin panel uses vanilla JS with fetch() calls and the existing session/JWT is stored in localStorage as 'adminToken'.
The base API URL is window.API_BASE || 'https://your-render-url.onrender.com'.

Create the file: admin/security-center.html

The page should have 4 panels:

Panel 1 — Security Events Timeline
  - Loads from GET /api/v1/admin/security/events
  - Shows a scrollable list: timestamp | eventType badge (color-coded) | userEmail | IP address
  - Filter dropdown by eventType
  - Auto-refreshes every 60 seconds

Panel 2 — Sync Status Dashboard
  - Loads from GET /api/v1/admin/security/sync-status
  - Shows 3 stat cards for Bookings: Synced (green), Pending (yellow), Failed (red) with counts
  - Same for Payments
  - Each 'Failed' count is a clickable link that opens a modal listing the failed records
  - Each failed record in the modal has a 'Retry Sync' button that calls POST /api/v1/admin/security/sync-retry/:id

Panel 3 — Queue Health
  - Loads from GET /api/v1/admin/security/queue-health
  - Shows a table: Queue Name | Waiting | Active | Completed | Failed | Delayed
  - Failed count shown in red if > 0
  - Refresh button

Panel 4 — Environment Integrity
  - Shows a static checklist of required environment variables (JWT_SECRET, STAFF_JWT_SECRET, CLIENT_JWT_SECRET, SSO_SECRET, SYNC_SECRET, REDIS_URL, ALLOWED_ORIGINS, MONGODB_URI)
  - For each: shows green ✓ "Configured" (we cannot reveal values — just indicate presence)
  - This calls a new endpoint: GET /api/v1/admin/security/env-check which returns { variables: { JWT_SECRET: true, ... } } — add this endpoint to security.routes.js as well

Use a dark professional UI aesthetic appropriate for a security operations panel.
Include a navigation link back to the main admin dashboard.
Show me the complete HTML file and the env-check endpoint addition.
```

---

## PROMPT 10 — Set Up GitHub Actions CI Pipeline

**Paste this prompt into your AI assistant:**

```
Continuing Phase 5 of Emerald Pearland Events.

Set up GitHub Actions CI for the project. The repository has a Node.js backend (server/) and is deployed to Render.

Create the file: .github/workflows/ci.yml

The workflow should:

Trigger on:
  - push to main branch
  - pull_request to main branch

Jobs:

Job 1 — lint-and-audit (runs first):
  - Node.js 20
  - npm ci
  - Run ESLint: npx eslint server/ --ext .js (install eslint if not present)
  - Run npm audit --audit-level=high (fail if high-severity vulnerabilities found)

Job 2 — test (runs after lint-and-audit passes):
  - Node.js 20
  - Services: MongoDB 6.0 (use mongo:6.0 docker service) and Redis 7 (use redis:7 docker service)
  - npm ci
  - Set environment variables for the test run:
    - NODE_ENV: test
    - MONGODB_URI: mongodb://localhost:27017/emerald_test
    - REDIS_HOST: localhost
    - REDIS_PORT: 6379
    - JWT_SECRET: ci-test-secret
    - STAFF_JWT_SECRET: ci-staff-secret
    - CLIENT_JWT_SECRET: ci-client-secret
  - Run: npm test
  - Upload coverage report as an artifact (if tests pass)

Job 3 — secret-scan (runs in parallel with lint-and-audit):
  - Use the trufflesecurity/trufflehog action to scan for leaked secrets
  - Scan only the diff on pull_request events
  - Scan the full repo on push to main

Also create: .eslintrc.js in the project root:
  - Extends: eslint:recommended
  - env: node, es2021
  - Rules: no-console: warn (we now use pino, so console use should be flagged)
  - Ignore: node_modules/, tests/ (test files can use console)

Show me the complete ci.yml and .eslintrc.js files.
```

---

## PROMPT 11 — Write Disaster Recovery Runbooks

**Paste this prompt into your AI assistant:**

```
Continuing Phase 5 of Emerald Pearland Events.

Create the disaster recovery documentation. These are operational runbooks for the lead developer (Nzaka).

Create the following files:

1. docs/runbooks/01-database-restore.md
   Sections:
   - When to use this runbook (data loss, corrupted records, accidental deletion)
   - Prerequisites (Atlas access, Render admin access)
   - Step-by-step: How to identify the restore point (Atlas point-in-time restore UI)
   - Step-by-step: How to restore to a staging URI first and verify data
   - Step-by-step: How to cut over Render's MONGODB_URI to the restored cluster
   - How to verify post-restore: count bookings, check latest payment records, confirm sync status fields are present
   - How to re-enable the Render web service after restore
   - RPO target: < 15 minutes of transaction loss
   - RTO target: booking access restored within 1 hour

2. docs/runbooks/02-rollback-deployment.md
   Sections:
   - When to use this (broken deploy, 500 errors spiking, health/ready returning 503)
   - How to rollback on Render (Manual Deploy → select previous deploy → click Deploy)
   - How to verify rollback succeeded (health endpoint, test a booking read)
   - How to communicate the incident to users if downtime exceeded 5 minutes

3. docs/runbooks/03-secret-rotation-incident.md
   Sections:
   - When to rotate (suspected leak, staff departure, quarterly rotation)
   - Pre-rotation checklist (announce maintenance window, note current active sessions)
   - Step-by-step rotation for each secret (JWT_SECRET, STAFF_JWT_SECRET, etc.) in Render dashboard
   - How to verify new secrets work (test admin login, test staff login, test M-Pesa webhook)
   - How to handle users who are logged out (communicate via email/WhatsApp)

4. docs/runbooks/04-mpesa-reconciliation.md
   Sections:
   - When to use (payment shows paid on M-Pesa side but booking not updated, or vice versa)
   - How to query Safaricom transaction status API manually
   - How to manually update a booking's paymentStatus with a MongoDB update command (include exact command)
   - How to trigger a manual sync for a single booking via the Security Center UI
   - How to use the dead-letter queue in BullMQ to replay failed payment jobs

Write in clear, numbered steps. Assume the reader is the developer under stress during an incident.
Show me all four runbook files.
```

---

## PROMPT 12 — Final Phase 5 Verification & Checklist Update

**Paste this prompt into your AI assistant:**

```
Continuing Phase 5 of Emerald Pearland Events. All Phase 5 tasks should now be implemented.

Perform a final verification sweep across the codebase:

1. Confirm logger.js exists at server/utils/logger.js and is a pino instance
2. Confirm requestLogger middleware is applied in server-prod.js before routes
3. Confirm no bare console.log calls remain in server/modules/ or server/jobs/ (show me a grep result)
4. Confirm /health/ready and /health/live routes are mounted and do NOT require auth
5. Confirm tests/ directory has: setup.js, helpers/auth.helper.js, bookings/booking.lifecycle.test.js, payments/payment.flow.test.js, api/bookings.api.test.js
6. Confirm npm test runs without errors (run it and show output)
7. Confirm SecurityEvent model exists at server/models/SecurityEvent.js
8. Confirm security.routes.js has all 5 endpoints: /events, /sync-status, /sync-retry/:id, /queue-health, /env-check
9. Confirm admin/security-center.html exists
10. Confirm .github/workflows/ci.yml exists with all 3 jobs
11. Confirm docs/runbooks/ contains all 4 runbook files

For any item that is missing or incomplete, implement it now.
Then run: npm test and show me the full output.
```

---

## Phase 5 — Completion Definition

Phase 5 is **DONE** when all of the following are true:

| Item | Verification |
|------|-------------|
| `server/utils/logger.js` exists | pino-based structured logger |
| `server/middleware/requestLogger.js` exists | requestId on every log |
| No bare `console.log` in `server/modules/` or `server/jobs/` | `grep -r "console.log" server/modules server/jobs` returns empty |
| `/health/live` returns 200 without auth | curl test |
| `/health/ready` returns 200 with mongo + redis checks | curl test |
| `tests/` has 5 files and `npm test` passes | CI green |
| Code coverage ≥ 60% on tested modules | Jest coverage report |
| `server/models/SecurityEvent.js` exists | file check |
| `server/routes/security.routes.js` has all 5 endpoints | code review |
| `admin/security-center.html` loads in browser | manual check |
| `.github/workflows/ci.yml` has lint + test + secret-scan jobs | file check |
| `docs/runbooks/` has 4 runbook files | file check |
| `npm audit` shows no high-severity vulnerabilities | CI output |

---

*Emerald Pearland Events — Master Blueprint Phase 5 | Confidential — Internal*
