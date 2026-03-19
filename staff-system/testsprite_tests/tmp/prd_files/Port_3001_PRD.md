# Product Requirements Document: Port 3001 Staff Operations System

## System Context
*   **Module:** Port 3001 — Staff Operations System
*   **Stack:** Node.js, Express, MongoDB
*   **Authentication:** JWT Bearer tokens
*   **Base URL:** `http://localhost:3001`
*   **Inter-service Communication:** HTTP with `axios-retry` to port 3000

---

## Section 1 — Authentication

### Endpoints
*   `POST /auth/login` → Staff login, returns JWT
*   `POST /auth/logout` → Invalidate session
*   `GET /auth/me` → Get current authenticated staff profile
*   `POST /auth/refresh` → Refresh JWT token

### Business Rules
*   All protected routes require `Authorization: Bearer <token>` header.
*   Staff JWT uses `STAFF_JWT_SECRET`, which is separate from the admin JWT.
*   Role-based access applies: Staff, Supervisor, Admin.
*   Failed login increments the attempt counter.
*   5 failed attempts trigger a 30-minute lockout.
*   Socket.IO handshake requires a valid JWT via `auth.token`.

### Test Scenarios
1.  Valid credentials return `200` with JWT.
2.  Wrong password returns `401`.
3.  5 consecutive wrong passwords trigger lockout.
4.  Locked account returns `423` with minutes remaining.
5.  Valid JWT on a protected route returns `200`.
6.  Expired JWT returns `401`.
7.  No token returns `401`.
8.  Admin JWT cannot authenticate staff routes.

---

## Section 2 — Supervisor GPS Clock-In System

### Endpoints
*   `POST /supervisor/anchor/drop` → Drop geo anchor for event
*   `POST /supervisor/anchor/clear` → Clear geo anchor
*   `GET /supervisor/events/:eventId/team` → Get staff roster
*   `POST /supervisor/clock-in/override` → Override denied clock-in
*   `POST /supervisor/events/:eventId/complete` → Mark event complete
*   `GET /supervisor/events/:eventId/notifications` → Get notification feed

#### Clock-In Endpoints
*   `POST /staff/clock-in` → Staff clock-in attempt
*   `POST /staff/clock-out` → Staff clock-out
*   `GET /staff/attendance/:eventId` → Get attendance status

### Business Rules
*   Supervisor must drop geo anchor before staff can clock in.
*   Default radius is 200 metres.
*   Clock-in uses the Haversine formula to calculate the distance between staff GPS and anchor GPS.
*   Staff within radius: clock-in allowed, Attendance record created.
*   Staff outside radius: clock-in denied, `CLOCK_IN_DENIED` logged.
*   Clock-in must store: `staff_lat`, `staff_lng`, `clockin_photo`, `device_id`, timestamps.
*   `clockOut` automatically calculates `total_hours`.
*   Supervisor override changes a denied Attendance to approved with the reason logged.
*   Supervisor can only manage their assigned event, not other events.

### Test Scenarios
1.  Drop anchor saves `anchor_lat`, `anchor_lng`, `radius_meters` to EventTeam.
2.  Staff GPS within 200m of anchor returns clock-in success.
3.  Staff GPS 201m or more from anchor returns clock-in denied.
4.  Clock-in without GPS coordinates returns `400`.
5.  Clock-in without selfie photo returns `400`.
6.  Clock-out calculates `total_hours` correctly.
7.  Supervisor override on denied clock-in changes status to approved.
8.  Supervisor cannot override clock-in for an event they are not assigned to.
9.  Clear anchor removes anchor data from EventTeam.
10. Staff cannot clock in if no anchor exists for the event.

---

## Section 3 — Emergency Funds Security

### Endpoints
*   `POST /portal/admin-staff/auth/biometric-verify` → Create BiometricSession
*   `POST /portal/admin-staff/emergency-funds/request-otp` → Generate and send OTP
*   `POST /portal/admin-staff/emergency-funds/send` → Send emergency funds
*   `POST /portal/admin-staff/emergency-funds/unlock-payout` → Unlock payout lock

### Test Scenarios (Independently Tested)
**Step 1 — Rate Limit:**
1.  First 3 requests within 15 minutes succeed validation.
2.  4th request within 15 minutes returns `429`.
3.  After 15-minute window resets, requests succeed again.

**Step 2 — Event Status:**
4.  Event in `LIVE` state passes check.
5.  Event in `READY` state passes check.
6.  Event in `PLANNED` state returns `400`.
7.  Event in `COMPLETED` state returns `400`.

**Step 3 — GPS:**
8.  Request with `admin_lat` and `admin_lng` passes check.
9.  Request without `admin_lat` returns `400`.
10. Request without `admin_lng` returns `400`.

**Step 4 — Biometric:**
11. Valid BiometricSession within 5 minutes passes check.
12. BiometricSession older than 5 minutes returns `403`.
13. No BiometricSession record returns `403`.
14. BiometricSession for different `device_id` returns `403`.

**Step 5 — Payout Lock:**
15. Event with no payout lock passes check.
16. Event with `payout_locked` true returns `403` without second admin approval.

**Step 6 — Threshold:**
17. Amount below `EMERGENCY_THRESHOLD` passes without OTP.
18. Amount above `EMERGENCY_THRESHOLD` without verified OTP returns `403`.
19. Amount above `EMERGENCY_THRESHOLD` with verified OTP passes.

**Step 7 — Fraud Detection:**
20. 3 or more failed attempts by same admin in 1 hour flags `repeated_failures`.
21. More than 2 payout attempts on same event today flags `excessive_event_attempts`.
22. Amount more than 2 times average payout flags `unusually_high_amount`.
23. Admin GPS more than 500km from previous authorization locations flags `location_anomaly`.
24. Single fraud flag does not auto-reject.
25. Two or more fraud flags auto-reject with `403`.

**Step 8 through 12 — Execution Flow:**
26. EmergencyFundAudit record created with status `pending` before payout.
27. Successful payout updates audit to `success` and stores `payout_reference`.
28. Failed payout updates audit to `failed` and stores `failure_reason`.
29. Successful payout sets `payout_locked` to true on event.
30. `cmd:payout_locked` Socket.IO event emits after successful payout.
31. `emergencyFundSent` Socket.IO event emits to Admin room after success.
32. Rate limit counters increment after both success and failure.

**Unlock Payout:**
33. Different admin can unlock payout with reason.
34. Same admin who sent funds cannot unlock their own lock; returns `403`.
35. Non `super_admin` role cannot call unlock endpoint; returns `403`.
36. Unlock logs `unlocked_by` and `lock_reason` to EmergencyFundAudit.

---

## Section 4 — AI Event Operations Brain

### Endpoints
*   `GET /portal/admin-staff/events/:id/prediction` → Generate AI prediction

### Business Rules & Test Scenarios
1.  Returns `predictedStaff` as a number.
2.  Returns `estimatedCost` as a number.
3.  Returns `estimatedProfit` as null when no invoice or payment data exists.
4.  Returns `riskLevel` as `LOW`, `MEDIUM`, or `HIGH`.
5.  Returns `confidenceScore` between 0.0 and 1.0.
6.  Returns `recommendations` as an array of strings.
7.  Returns `recommendedSupervisor` object or null if no supervisor data.
8.  Returns `recommendedTeam` array or empty array if no staff data.
9.  Returns `dataQuality` object showing `hasBooking`, `hasInvoice`, `hasReviews`, `historicalEventsUsed`.
10. `confidenceScore` drops to 0.3 or below when no historical events exist.
11. Staff with `average_overall_score` below 3.0 increases risk level.
12. Staff with `attendance_rate` below 70% increases risk level.
13. Staff with 1 disciplinary flag adds 0.1 to risk score.
14. Staff with 2 disciplinary flags adds 0.25 to risk score.
15. Staff with 3 or more disciplinary flags adds 0.5 to risk score and forces minimum `MEDIUM`.
16. Supervisor with fraud flag history adds 0.3 to risk score.
17. Prediction snapshot saved to `EventPredictionSnapshot` after generation.
18. `cmd:risk_escalation` emits to Admin room if risk level is `HIGH`.

---

## Section 5 — Live Command Center

### Endpoints
*   `GET /supervisor/command-center/:eventId` → Supervisor command center view
*   `GET /supervisor/command-center/:eventId/data` → Supervisor command center JSON

### Business Rules & Test Scenarios
1.  `getActiveEventsSummary` returns only `LIVE` and `READY` events.
2.  `getEventDetail` returns full staff roster with clock-in status per member.
3.  `getCommandCenterMetrics` returns `total_active_events`, `total_staff_deployed_today`, `total_clocked_in_now`, `total_missing_staff_now`, `total_emergency_funds_sent_today`, `total_fraud_flags_today`, `events_by_risk_level`.
4.  Missing staff job creates `StaffMissingAlert` for staff not clocked in 15 minutes after event start.
5.  Missing staff job does not create duplicate alerts for already-alerted staff.
6.  Server startup triggers recovery check for any `LIVE` events with unalerted missing staff.
7.  `SupervisorNotification` record created every time a Socket.IO event fires to Supervisor room.
8.  Notifications endpoint returns paginated results newest first with limit 50.

### Socket.IO Test Scenarios
9.  Socket connection with valid JWT succeeds.
10. Socket connection without JWT returns authentication error.
11. `Admin` role socket joins `Admin` room.
12. `Supervisor` role socket joins `Supervisor:eventId` room.
13. `cmd:staff_clocked_in` fires after successful clock-in.
14. `cmd:clock_in_denied` fires after denied clock-in.
15. `cmd:staff_missing_alert` fires when staff is 15 minutes late.
16. `cmd:event_state_change` fires on every lifecycle transition.
17. `cmd:anchor_confirmed` fires after geo anchor is dropped.

---

## Section 6 — Staff Rating and Performance Intelligence

### Endpoints
*   `GET /supervisor/events/:eventId/reviews/pending` → Staff pending review list
*   `POST /supervisor/events/:eventId/reviews/submit` → Batch submit reviews
*   `GET /portal/admin-staff/performance/data` → Full dashboard data
*   `GET /portal/admin-staff/performance/staff/:id` → Individual staff profile
*   `GET /portal/admin-staff/performance/supervisors` → Supervisor rankings
*   `POST /portal/admin-staff/performance/flag/:staffId` → Add disciplinary flag
*   `POST /portal/admin-staff/performance/reviews/reopen/:eventId` → Reopen review window

### Business Rules & Test Scenarios

**Overall Score Calculation:**
1.  `punctuality_rating` 1, `professionalism_rating` 1, `teamwork_rating` 1, `client_interaction_rating` 1, `task_completion_rating` 1 must return `overall_score` 1.0.
2.  `punctuality_rating` 5, `professionalism_rating` 5, `teamwork_rating` 5, `client_interaction_rating` 5, `task_completion_rating` 5 must return `overall_score` 5.0.
3.  Mixed ratings must apply weights: punctuality 20%, professionalism 25%, teamwork 20%, client interaction 20%, task completion 15%.
4.  `overall_score` cannot be set manually in request body.

**Review Window:**
5.  Review submission within 48 hours of `COMPLETED` transition succeeds.
6.  Review submission after 48 hours returns `403`.
7.  Admin reopen extends window by 24 hours.
8.  Duplicate review for same staff and same event returns `409`.

**Batch Submission:**
9.  All valid reviews in batch return full success response.
10. Partial failure returns success true with submitted count, failed count, and results array.
11. Failed review in batch does not roll back successful reviews in same batch.

**Score Trend:**
12. Staff with last 3 reviews averaging 0.3 higher than previous 3 returns `improving`.
13. Staff with last 3 reviews averaging 0.3 lower than previous 3 returns `declining`.
14. Staff with difference less than or equal to 0.3 returns `stable`.
15. Staff with fewer than 6 total reviews returns `stable` as default.

**Attendance Rate:**
16. Staff with zero completed assignments returns `null`, not 0.
17. `attendance_rate` only counts `COMPLETED` and `FINANCE_SETTLED` assignments in denominator.
18. Staff who clocked in and out on all assigned events returns 100.

**Team Compatibility:**
19. Two staff who worked together with high scores returns compatibility above 0.8.
20. Two staff who never worked together returns 0.5.
21. Two staff who worked together with low scores returns below 0.5.

**Disciplinary Flags:**
22. Adding flag emits `cmd:disciplinary_flag` to Admin room.
23. Flag appears in staff profile immediately after submission.

---

## Section 7 — ETR System

### Endpoints
*   `GET /portal/admin-staff/etr` → List all ETRs
*   `GET /portal/admin-staff/etr/:eventId` → Single ETR
*   `POST /portal/admin-staff/etr/:eventId/generate` → Manually generate
*   `POST /portal/admin-staff/etr/:eventId/resend` → Resend to client
*   `GET /portal/admin-staff/etr/:eventId/download` → Download PDF

### Business Rules & Test Scenarios
1.  ETR number follows format `ETR-YYYY-NNNNN` exactly.
2.  `generateETR` pulls data from `EventLedger`, `ClientInvoice`, `ExpenseReceipt`, `Attendance`, `StaffPayroll`, `EventPredictionSnapshot`.
3.  `estimatedProfit` is null when no revenue data is available.
4.  ETR does not include individual staff names, individual payroll, internal profit, emergency fund details, or fraud flags.
5.  `getLatestETR` returns record with highest version number.
6.  `markETROpened` sets `delivery_status` to `delivered` and sets `opened_at` timestamp.
7.  Automated trigger fires on `COMPLETED` transition.
8.  Thank you email fires as Step 1 independently.
9.  `generateETR` fires as Step 2 independently.
10. `resendETR` fires as Step 3 independently.
11. `cmd:etr_generated` fires as Step 4 independently.
12. Failure of Step 1 does not prevent Step 2 from running.
13. Failure of Step 2 does not prevent Step 3 from running.
14. Failure of any step does not block `COMPLETED` state transition.
15. Regenerating ETR increments version number.
16. PDF URL is stored in `ClientETR` record after generation.

---

## Section 8 — Finance Engine

### Endpoints
*   `GET /portal/admin-staff/events/:id/financials` → Event financial summary
*   `POST /portal/admin-staff/expenses/log` → Log expense
*   `GET /portal/admin-staff/payroll` → Payroll list
*   `POST /portal/admin-staff/payroll/:staffId/pay` → Trigger staff payment

### Business Rules & Test Scenarios
1.  Every money movement creates a Transaction record.
2.  `EventLedger` balance updates after every expense.
3.  Payroll record generated automatically from Attendance on `clockOut`.
4.  StaffPayroll status starts as `pending`.
5.  Successful M-Pesa B2C callback updates StaffPayroll to `paid`.
6.  Failed payment updates status to `failed` with reason.
7.  `EventLedger` `total_expenses` increases after each ExpenseReceipt.
8.  Double-entry ledger never updates balances directly, only via Transaction inserts.

---

## Section 9 — Inter-Service Communication

### Business Rules & Test Scenarios
1.  Port 3001 internal sync calls to port 3000 use `axios-retry` with exponential backoff.
2.  If port 3000 is temporarily unavailable, port 3001 retries before failing.
3.  Sync calls use `x-sync-secret` header for internal authentication.
4.  Sync failure is logged but does not crash port 3001 operations.

---

## Section 10 — Mobile and API Readiness

### Business Rules & Test Scenarios
1.  All endpoints accept `Authorization: Bearer` header in addition to cookies.
2.  All JSON responses follow envelope format with `success`, `data`, `timestamp` fields.
3.  Socket.IO accepts token via handshake `auth.token` field.
4.  CORS allows origins defined in `ALLOWED_ORIGINS` environment variable.
5.  File uploads return permanent cloud URL not local file path.

---

## Section 11 — Environment Variables

The following environment variables are required to be loaded for Port 3001:

*   `PORT_STAFF`
*   `JWT_SECRET`
*   `STAFF_JWT_SECRET`
*   `MONGO_URI`
*   `MPESA_CONSUMER_KEY`
*   `MPESA_CONSUMER_SECRET`
*   `MPESA_ENVIRONMENT`
*   `MPESA_B2C_SHORT_CODE`
*   `MPESA_B2C_INITIATOR_NAME`
*   `MPESA_B2C_SECURITY_CREDENTIAL`
*   `MPESA_B2C_QUEUE_TIMEOUT_URL`
*   `MPESA_B2C_RESULT_URL`
*   `CLOUDINARY_URL`
*   `ALLOWED_ORIGINS`
*   `EMERGENCY_THRESHOLD`
*   `SOCKET_AUTH_REQUIRED`
*   `BASE_URL_ADMIN`
*   `BASE_URL_STAFF`
*   `EMAIL_HOST`
*   `EMAIL_PORT`
*   `EMAIL_USER`
*   `EMAIL_PASS`
*   `CLIENT_JWT_SECRET`
