# staff-system — Complete Dependency Map

Generated: 2026-03-15

---

## Table of Contents

1. [Entry Point](#1-entry-point-serverjs)
2. [Routes](#2-routes)
3. [Controllers](#3-controllers)
4. [Models](#4-models)
5. [Services](#5-services)
6. [Middleware](#6-middleware)
7. [Config](#7-config)
8. [Socket Events](#8-socket-events--complete-map)
9. [NPM Packages](#9-npm-packages-packagejson)
10. [Cross-Service Integration](#10-cross-service-integration-port-3000--port-3001)
11. [Known Bugs / Issues](#known-bugs--issues)

---

## 1. Entry Point: `server.js`

**Imports:**
`dotenv`, `express`, `http`, `path`, `cookie-parser`, `csurf`, `cors`, `helmet`, `express-mongo-sanitize` (skipped at runtime), `express-rate-limit`, `mongoose`, `jsonwebtoken`, `method-override`, `express-ejs-layouts`
Routes: `./routes/auth`, `./routes/admin`, `./routes/staff`, `./routes/supervisor`
Models: `./models/Staff`, `./models/AuditLog`
Middleware: `./middleware/auth`
Services: `./services/emailService` — calls `initializeEmailService()` on startup
Config: `./config/socket`

**MongoDB URI:** `MONGO_URI` → `MONGO_URI` → hardcoded Atlas URI (`emerald` db)

### Middleware Stack (registration order)

| Order | Middleware | Mount Path | Notes |
|---|---|---|---|
| 1 | `express.json()` | global | |
| 2 | `express.urlencoded({ extended: true })` | global | |
| 3 | `cookie-parser` | global | |
| 4 | `express.static('public/')` | global | |
| 5 | `cors()` | global | All origins allowed |
| 6 | `helmet({ contentSecurityPolicy: false })` | global | |
| 7 | `methodOverride(fn)` | global | reads `_method` from body |
| 8 | `methodOverride('_method')` | global | reads `_method` from query |
| 9 | `csurf` | `/portal` | skipped if path starts with `/admin-staff/mpesa/` |
| 10 | `res.locals.csrfToken` setter | `/portal` | skipped for mpesa paths |
| 11 | `rateLimit` (1000 req / 10 min) | `/portal/auth/` | |
| 12 | `rateLimit` (100 req / 1 min) | `/portal/auth/login` | |
| 13 | `rateLimit` (100 req / 1 min) | `/portal/auth/forgot-password` | |
| 14 | `rateLimit` (100 req / 1 min) | `/portal/auth/reset-password` | |

### Route Mounts

| Mount Path | Router File |
|---|---|
| `/portal/auth` | `routes/auth.js` |
| `/portal/admin-staff` | `routes/admin.js` |
| `/portal/staff` | `routes/staff.js` |
| `/portal/supervisor` | `routes/supervisor.js` |

### Inline Endpoints (server.js)

| Method | Path | Description |
|---|---|---|
| `POST` | `/internal/sync-booking` | Receives booking sync from port 3000; creates `Assignment`; auth via `x-sync-secret: JWT_SECRET` |
| `POST` | `/internal/sync-staff` | Receives staff create/update/delete from port 3000; auth via `x-sync-secret` |
| `GET` | `/staff-admin/sso-login` | SSO login from main admin; verifies `staff-ops-sso` JWT, issues `portal_token`, logs to `AuditLog` |
| `GET` | `/staff-admin/dashboard` | protect → authorize(Admin, SuperAdmin) → redirects to `/portal/admin-staff/dashboard` |
| `GET` | `/staff-login` | Redirect to `/portal/auth/login` |
| `GET` | `/portal` | Redirect to `/portal/auth/login` |
| `GET` | `/` | Redirect to `/portal/auth/login` |

**Other:**
- CSRF error handler on `/portal` — renders `auth/login` with error on `EBADCSRFTOKEN`
- Socket.IO initialized at bottom via `require('./config/socket')(server)`
- Listens on `PORT` env var, default `3001`

---

## 2. Routes

### `routes/auth.js` → mounted at `/portal/auth`

| Method | Path | Middleware Chain | Controller |
|---|---|---|---|
| GET | `/login` | — | inline: `res.render('auth/login')` |
| POST | `/login` | sanitizeRequestBody → validateLogin | `authController.login` |
| GET | `/logout` | — | `authController.logout` |
| GET | `/portal-choice` | protect | `authController.getPortalChoice` |
| GET | `/secure-login/:token` | — | `authController.secureLogin` |
| GET | `/forgot-password` | — | inline: `res.render('auth/forgot-password')` |
| POST | `/forgot-password` | sanitizeRequestBody | `authController.forgotPassword` |
| POST | `/staff-forgot-password` | sanitizeRequestBody | `authController.staffForgotPassword` |
| GET | `/reset-password/:token` | — | inline: `res.render('auth/reset-password')` |
| POST | `/reset-password/:token` | sanitizeRequestBody | `authController.resetPassword` |
| GET | `/change-password` | protect | inline: `res.render('auth/change-password')` |
| POST | `/change-password` | protect → validatePasswordChange | `authController.changePassword` |

---

### `routes/admin.js` → mounted at `/portal/admin-staff`

**Public (no auth):**

| Method | Path | Controller |
|---|---|---|
| POST | `/mpesa/callback` | `adminController.mpesaCallback` |
| POST | `/mpesa/timeout` | `adminController.mpesaTimeout` |

**Protected (router-level: `protect` → `authorize('Admin')`):**

#### Page (EJS render) routes

| Method | Path | Controller |
|---|---|---|
| GET | `/dashboard` | `adminController.getDashboard` |
| GET | `/staff-management` | `adminController.getStaffManagementPage` |
| GET | `/events` | `adminController.getEventsPage` |
| GET | `/attendance` | `adminController.getAttendancePage` |
| GET | `/payments-page` | `adminController.getPaymentsPage` |
| GET | `/reports` | `adminController.getReportsPage` |
| GET | `/audit-logs-page` | `adminController.getAuditLogsPage` |
| GET | `/security` | `adminController.getSecurityPage` |
| GET | `/settings` | `staffController.getSettings` |
| PUT | `/profile` | sanitizeRequestBody → `staffController.updateProfile` |
| POST | `/profile/photo` | uploadStaffPhoto → `staffController.uploadProfilePhoto` |
| POST | `/change-password` | validatePasswordChange → `staffController.changeOwnPassword` |
| POST | `/location` | sanitizeRequestBody → `adminController.updateAdminLocation` |

#### API (JSON) routes

| Method | Path | Extra Middleware | Controller |
|---|---|---|---|
| GET | `/staff` | — | `adminController.getAllStaff` |
| POST | `/staff` | sanitizeRequestBody → validateStaffCreation → uploadStaffPhoto | `adminController.addStaff` |
| PUT | `/staff/:id` | sanitizeRequestBody → validateStaffUpdate → uploadStaffPhoto | `adminController.editStaff` |
| DELETE | `/staff/:id` | — | `adminController.deleteStaff` |
| PUT | `/staff/:id/suspend` | — | `adminController.toggleSuspend` |
| POST | `/staff/:id/reset-password` | — | `adminController.adminResetPassword` |
| GET | `/staff/:id/performance` | — | `adminController.getStaffPerformance` |
| POST | `/staff/:id/assign-supervisor` | protect → authorize('Admin','Super Admin') | `adminController.assignSupervisor` |
| POST | `/assignments` | sanitizeRequestBody → validateAssignmentCreation | `adminController.createAssignment` |
| PUT | `/assignments/:id/supervisor` | protect → authorize('Admin') | `adminController.assignEventSupervisor` |
| PUT | `/assignments/:id/assign-staff` | protect → authorize('Admin') | `adminController.assignStaffToEvent` |
| PUT | `/assignments/:id` | sanitizeRequestBody | `adminController.updateAssignment` |
| DELETE | `/assignments/:id` | — | `adminController.deleteAssignment` |
| PUT | `/assignments/:id/payment` | sanitizeRequestBody | `adminController.updatePaymentStatus` |
| GET | `/assignments/:id/report` | — | `adminController.getEventReport` |
| GET | `/assignments/:id/report/export` | — | `adminController.exportReport` |
| PUT | `/assignments/:id/toggle-applications` | protect → authorize('Admin') | `adminController.toggleApplications` |
| GET | `/payments` | — | `adminController.getAllPayments` |
| GET | `/export/payments` | — | `adminController.exportPayments` |
| POST | `/assignments/:id/pay-staff` | protect → authorize('Admin') | `adminController.initiateStaffPayment` |
| GET | `/assignments/:id` | protect → authorize('Admin') | `adminController.getSingleAssignment` |
| GET | `/payments/:assignmentId/receipt/:staffId` | protect → authorize('Admin') | `adminController.generatePaymentReceipt` |
| POST | `/assignments/:id/applicants/:staffId` | protect → authorize('Admin') | `adminController.handleApplicant` |
| POST | `/replacements/:id/approve` | — | `adminController.approveReplacement` |
| POST | `/replacements/:id/reject` | — | `adminController.rejectReplacement` |
| GET | `/audit-logs` | — | `adminController.getAuditLogs` |
| GET | `/event-teams` | — | `adminController.getAllTeams` |
| POST | `/event-teams` | — | `adminController.createTeam` |
| GET | `/event-teams/create-data` | — | `adminController.getTeamCreateData` |
| POST | `/event-teams/:teamId/disband` | — | `adminController.disbandTeam` |
| GET | `/event-teams/:teamId/disband-check` | — | `adminController.checkDisbandEligibility` |

---

### `routes/staff.js` → mounted at `/portal/staff`

**Router-level auth:** `protect` → `authorize('Staff', 'Supervisor', 'Admin')`

#### Page routes

| Method | Path | Extra MW | Controller |
|---|---|---|---|
| GET | `/dashboard` | — | `staffController.getDashboard` |
| GET | `/assignments` | — | `staffController.getAssignmentsPage` |
| GET | `/team` | — | `staffController.getTeamPage` |
| POST | `/team/message` | — | `staffController.sendTeamMessage` |
| POST | `/team/message/upload` | inline multer (10 MB, jpeg/png/gif/webp/mp4/mov/webm) | `staffController.sendTeamMediaMessage` |
| GET | `/attendance` | — | `staffController.getAttendancePage` |
| GET | `/payments` | — | `staffController.getPaymentsPage` |
| GET | `/profile` | — | `staffController.getProfilePage` |
| GET | `/settings` | — | `staffController.getSettings` |
| PUT | `/profile` | sanitizeRequestBody | `staffController.updateProfile` |
| POST | `/profile/photo` | uploadStaffPhoto | `staffController.uploadProfilePhoto` |
| POST | `/change-password` | validatePasswordChange | `staffController.changeOwnPassword` |
| POST | `/location` | sanitizeRequestBody | `staffController.updateLocation` |

#### API routes

| Method | Path | Extra MW | Controller |
|---|---|---|---|
| PUT | `/availability` | sanitizeRequestBody | `staffController.updateAvailability` |
| POST | `/assignments/:id/response` | sanitizeRequestBody | `staffController.respondToAssignment` |
| POST | `/attendance` | sanitizeRequestBody → proximityCheck | `staffController.clockInOut` |
| GET | `/attendance-history` | — | `staffController.getAttendanceHistory` |
| GET | `/notifications` | — | `staffController.getNotifications` |
| POST | `/assignments/:id/payment/confirm` | — | `staffController.confirmPayment` |
| POST | `/assignments/:id/payment/dispute` | sanitizeRequestBody | `staffController.disputePayment` |
| GET | `/payment-history` | — | `staffController.getPaymentHistory` |
| GET | `/payments/:assignmentId/receipt` | — | `staffController.downloadPaymentReceipt` |
| POST | `/push-subscribe` | — | `staffController.subscribePush` |

---

### `routes/supervisor.js` → mounted at `/portal/supervisor`

**Router-level auth:** `protect` → `authorize('Supervisor', 'Admin')`

#### Page routes

| Method | Path | Extra MW | Controller |
|---|---|---|---|
| GET | `/dashboard` | — | `supervisorController.getDashboard` |
| GET | `/events` | — | `supervisorController.getEvents` |
| GET | `/team-management` | — | `supervisorController.getTeamManagement` |
| GET | `/communications` | — | `supervisorController.getCommunications` |
| GET | `/ratings` | — | `supervisorController.getRatings` |
| GET | `/profile` | — | `supervisorController.getProfile` |
| GET | `/settings` | — | `staffController.getSettings` |
| PUT | `/profile` | sanitizeRequestBody | `staffController.updateProfile` |
| POST | `/change-password` | validatePasswordChange | `staffController.changeOwnPassword` |
| POST | `/location` | sanitizeRequestBody | `supervisorController.updateLocation` |

#### API routes

| Method | Path | Extra MW | Controller |
|---|---|---|---|
| POST | `/teams/:teamId/remove-member` | sanitizeRequestBody | `supervisorController.removeMember` |
| GET | `/teams/:teamId/suggest-replacements` | — | `supervisorController.getSuggestedReplacements` |
| POST | `/teams/:teamId/readiness` | sanitizeRequestBody | `supervisorController.updateReadiness` |
| POST | `/teams/:teamId/communication` | sanitizeRequestBody | `supervisorController.broadcastMessage` |
| GET | `/teams/:teamId/communications` | — | `supervisorController.getTeamCommunications` |
| POST | `/rate-staff` | sanitizeRequestBody | `supervisorController.rateStaff` |

---

## 3. Controllers

### `controllers/authController.js`

**Imports:** `Staff`, `AuditLog`, `bcrypt`, `jsonwebtoken`, `crypto`, `emailService`

| Export | Description | Models | Services |
|---|---|---|---|
| `login` | Verifies password, logs event, issues `portal_token` cookie, redirects by role | Staff, AuditLog | — |
| `logout` | Clears `portal_token` cookie | — | — |
| `changePassword` | Verifies current password, hashes new, clears `mustChangePassword` | Staff, AuditLog | — |
| `forgotPassword` | Generates reset token, emails link (10 min TTL) | Staff, AuditLog | `sendPasswordResetEmail` |
| `staffForgotPassword` | Same as forgotPassword (identical logic) | Staff, AuditLog | `sendPasswordResetEmail` |
| `resetPassword` | Validates token, hashes new password | Staff, AuditLog | — |
| `secureLogin` | One-time token login link, clears token on use | Staff, AuditLog | — |
| `getPortalChoice` | Renders `auth/portal-choice` for Admin users | — | — |

---

### `controllers/adminController.js`

**Imports:** `Staff`, `Assignment`, `ReplacementRequest`, `EventTeam`, `Attendance`, `TeamActionsLog`, `AuditLog`, `PerformanceReview`, `bcrypt`, `crypto`, `web-push`, `emailService`, `mpesaService`, `pdfkit`, `json2csv`, `middleware/validation`
**Inline requires (inside functions):** `models/EventTeamCommunication`, `models/Assignment` (redundant), `models/Staff` (redundant)

> ⚠️ **BUG** — `AdminNotification` used in `disbandTeam` but never `require()`d → ReferenceError at runtime
> ⚠️ **BUG** — `emailService.sendEmail` called in `assignEventSupervisor` and `disbandTeam` but not exported from emailService → TypeError at runtime

| Export | Description | Key Models | Services / Modules |
|---|---|---|---|
| `getDashboard` | Aggregates metrics, last 10 audit logs, all assignments, pending replacements | Staff, Assignment, Attendance, AuditLog, ReplacementRequest | — |
| `getAllStaff` | Returns all staff minus passwords | Staff | — |
| `addStaff` | Creates staff, generates secure login token, sends welcome email | Staff, AuditLog | emailService.sendStaffWelcomeEmail, web-push |
| `editStaff` | Updates staff fields, emits socket update | Staff, AuditLog | web-push |
| `deleteStaff` | Deletes staff, cleans up all Assignment arrays and EventTeams | Staff, Assignment, EventTeam, AuditLog | — |
| `toggleSuspend` | Toggles Active/Suspended status | Staff, AuditLog | — |
| `adminResetPassword` | Resets staff password, sends email | Staff, AuditLog | emailService.sendAdminPasswordResetNotification |
| `getAuditLogs` | Returns last 100 audit logs | AuditLog | — |
| `getStaffPerformance` | Returns performance reviews for a staff member | PerformanceReview | — |
| `createAssignment` | Creates assignment, assigns staff by role/ID, sends push + email to all | Assignment, Staff, AuditLog | emailService.sendAssignmentNotification, web-push |
| `updateAssignment` | Updates assignment fields, notifies accepted staff, triggers disband prompt on Completed | Assignment, Staff, EventTeam, AuditLog | emailService.sendAssignmentUpdateNotification, web-push |
| `deleteAssignment` | Deletes assignment + its EventTeam | Assignment, EventTeam, AuditLog | — |
| `updatePaymentStatus` | Updates payment status, notifies staff on Sent/Received, sends receipt email | Assignment, Staff, AuditLog | emailService.sendPaymentSentNotification, sendPaymentReceiptEmail, web-push |
| `handleApplicant` | Approve/reject a staff applicant | Assignment | — |
| `getSingleAssignment` | Returns single assignment with populated applicants/accepted | Assignment | — |
| `generatePaymentReceipt` | Generates PDF payment receipt for admin | Assignment, Staff | pdfkit |
| `getAllPayments` | Paginated filtered payment list | Assignment | — |
| `exportReport` | Exports event report as PDF or CSV | Assignment, Attendance, EventTeam, TeamActionsLog | pdfkit, json2csv |
| `exportPayments` | Exports payment logs as CSV | Assignment, Attendance | json2csv |
| `approveReplacement` | Processes replacement: removes/adds staff in team & assignment | ReplacementRequest, EventTeam, Assignment, AuditLog | — |
| `rejectReplacement` | Marks replacement request rejected | ReplacementRequest | — |
| `getEventReport` | Returns JSON event completion report | Assignment, Attendance, EventTeam, TeamActionsLog | — |
| `getAllTeams` | Returns all teams with populated event/supervisor/members | EventTeam | — |
| `createTeam` | Creates an EventTeam | EventTeam | — |
| `getTeamCreateData` | Returns assignments without teams + staff lists | Assignment, EventTeam, Staff | — |
| `disbandTeam` | Disbands team, notifies all members (⚠️ AdminNotification bug) | EventTeam, Assignment, EventTeamCommunication, AuditLog | emailService.sendEmail (⚠️ not exported) |
| `checkDisbandEligibility` | Checks if all payments done before disbanding | EventTeam, Assignment | — |
| `getStaffManagementPage` | Renders staff management page with filters | Staff | — |
| `getEventsPage` | Renders events page with filters | Assignment | — |
| `getAttendancePage` | Renders attendance monitoring page | Attendance, Assignment, Staff | — |
| `getPaymentsPage` | Renders payments page | Assignment | — |
| `getReportsPage` | Renders reports page | Assignment | — |
| `getAuditLogsPage` | Renders audit logs page | AuditLog | — |
| `getSecurityPage` | Renders security page with proximity denials, GPS spoofs | AuditLog, Staff | — |
| `assignSupervisor` | Assigns supervisor_id to a staff member | Staff, AuditLog | — |
| `assignEventSupervisor` | Assigns supervisor to assignment, auto-creates EventTeam + initial communication | Assignment, EventTeam, EventTeamCommunication, AuditLog | emailService.sendEmail (⚠️ not exported) |
| `assignStaffToEvent` | Overwrites assigned_staff_ids on assignment | Assignment | — |
| `toggleApplications` | Flips open_for_applications flag | Assignment | — |
| `updateAdminLocation` | Updates last_location on admin's Staff record | Staff | — |
| `initiateStaffPayment` | Calls mpesaService.b2cPayment, marks payment Sent | Assignment, AuditLog | mpesaService.b2cPayment |
| `mpesaCallback` | Handles Safaricom B2C callback, marks payment Received, sends receipt email | Assignment, Staff | emailService.sendPaymentReceiptEmail |
| `mpesaTimeout` | Logs timeout (no-op, always 200) | — | — |

---

### `controllers/staffController.js`

**Imports:** `Staff`, `Assignment`, `Attendance`, `EventTeam`, `EventTeamCommunication`, `AuditLog`, `bcrypt`, `crypto`, `emailService`, `web-push`
**Inline requires (inside functions):** `axios`, `pdfkit`
**External HTTP call:** `POST http://localhost:3000/internal/sync-staff-update` in `updateProfile()` — fire-and-forget, errors silently suppressed

| Export | Description | Key Models | Notes |
|---|---|---|---|
| `getDashboard` | Renders staff dashboard with pending/accepted assignments, earnings, open events | Assignment, Attendance | — |
| `updateAvailability` | Updates availability_status, emits socket metric update | Staff | — |
| `respondToAssignment` | Accept/Decline/Apply; auto-creates EventTeam on accept; emits staffingAlert when < 60% staffing | Assignment, EventTeam, Staff, AuditLog | — |
| `clockInOut` | Clock in: creates Attendance with location/selfie, detects late; Clock out: sets clock_out, calculates hours | Attendance, Assignment | Goes through `proximityCheck` middleware first |
| `getAttendanceHistory` | Returns last 50 attendance records | Attendance | — |
| `getNotifications` | Builds notification list from team comms, payment actions, late records | EventTeam, EventTeamCommunication, Assignment, Attendance | — |
| `confirmPayment` | Marks assignment payment_status=Received | Assignment, AuditLog | — |
| `disputePayment` | Marks payment_status=Disputed | Assignment, AuditLog | — |
| `downloadPaymentReceipt` | Generates PDF receipt for current user | Assignment | pdfkit |
| `getPaymentHistory` | Returns all accepted assignments with payment info | Assignment | — |
| `subscribePush` | Saves webpush subscription to staff record | Staff | — |
| `updateProfile` | Updates name/phone/skills, syncs to port 3000 | Staff | axios → port 3000 |
| `changeOwnPassword` | Verifies + changes own password | Staff, AuditLog | — |
| `getAssignmentsPage` | Renders assignments page with pending/applied/accepted/declined/past/open | Assignment | — |
| `getTeamPage` | Renders team page with communications | EventTeam, EventTeamCommunication | — |
| `sendTeamMessage` | Persists chat message, emits socket to Team_X room | EventTeam, EventTeamCommunication | — |
| `sendTeamMediaMessage` | Persists image/video message, emits socket | EventTeam, EventTeamCommunication | — |
| `getAttendancePage` | Renders attendance page with stats + active assignment | Attendance, Assignment | — |
| `getPaymentsPage` | Renders payments page with stats | Assignment | — |
| `getProfilePage` | Renders profile page | Staff | — |
| `updateLocation` | Updates last_location | Staff | — |
| `getSettings` | Renders profile page as settings (shared) | Staff | — |
| `uploadProfilePhoto` | Saves uploaded photo URL to staff record | Staff | multer via uploadStaffPhoto mw |

---

### `controllers/supervisorController.js`

**Imports:** `Staff`, `EventTeam`, `ReplacementRequest`, `EventTeamCommunication`, `TeamActionsLog`, `PerformanceReview`, `AuditLog`
**Inline requires:** `models/Assignment` (in `getRatings`), `models/Attendance` (in `getTeamManagement`), `models/Staff` (in `getProfile`, `updateLocation`)

| Export | Description | Key Models |
|---|---|---|
| `getDashboard` | Renders supervisor dashboard with their teams | EventTeam |
| `removeMember` | Creates ReplacementRequest, notifies admin via socket | EventTeam, ReplacementRequest, Staff, TeamActionsLog, AuditLog |
| `getSuggestedReplacements` | Returns available staff not in team | Staff, EventTeam |
| `updateReadiness` | Recalculates team_readiness % | EventTeam |
| `rateStaff` | Creates PerformanceReview | PerformanceReview, AuditLog |
| `broadcastMessage` | Persists message, emits socket to each member + Admin | EventTeam, EventTeamCommunication, TeamActionsLog |
| `getTeamCommunications` | Returns last 30 comms for a team | EventTeamCommunication |
| `getEvents` | Renders events page for supervisor's teams | EventTeam |
| `getTeamManagement` | Renders team management page with attendance map | EventTeam, Attendance |
| `getCommunications` | Renders communications page | EventTeam, EventTeamCommunication |
| `getRatings` | Renders ratings page with given reviews + staff to rate | EventTeam, PerformanceReview, Assignment |
| `getProfile` | Renders profile page | Staff |
| `updateLocation` | Updates last_location, emits `supervisorLocationUpdate` to Admin | Staff |

---

## 4. Models

### `Staff.js` — Collection: `staffs`

| Field | Type | Notes |
|---|---|---|
| `name` | String | required |
| `email` | String | required, unique |
| `password` | String | required (⚠️ no `select: false` — always returned) |
| `role` | String | enum: Admin / Supervisor / Staff; default: Staff |
| `specific_role` | String | e.g. Usher, Bartender, Security |
| `shift_start` | String | e.g. '09:00' |
| `shift_end` | String | |
| `phone` | String | |
| `department` | String | |
| `skills` | [String] | |
| `category` | String | enum: Usher / Brand Ambassador / Supervisor / Event Planner / Organiser / Wedding Planner / Ticketing Agent |
| `photo_url` | String | |
| `status` | String | enum: Active / Suspended; default: Active |
| `mustChangePassword` | Boolean | default: true |
| `resetPasswordToken` | String | SHA256 hashed token |
| `resetPasswordExpire` | Date | |
| `availability_status` | String | enum: Available / Busy / Not Available / On Leave; default: Available |
| `supervisor_id` | ObjectId | **ref: Staff** (self-referencing) |
| `pushSubscription` | Object | Web Push subscription object |
| `secureLoginToken` | String | |
| `secureLoginExpire` | Date | |
| `last_location` | `{ lat: Number, lng: Number, updatedAt: Date }` | Used by proximity middleware |
| `createdAt` | Date | default: now |

---

### `Assignment.js` — Collection: `assignments`

| Field | Type | Notes |
|---|---|---|
| `title` | String | required |
| `description` | String | required |
| `location` | String | required |
| `date` | Date | required |
| `start_time` | String | required |
| `end_time` | String | required |
| `pay_rate` | Number | required |
| `vip_flag` | Boolean | default: false |
| `special_instructions` | String | |
| `dress_code` | String | |
| `gps_location` | `{ lat: Number, lng: Number }` | |
| `supervisor_id` | ObjectId | **ref: Staff** |
| `assigned_staff_ids` | [ObjectId] | **ref: Staff** |
| `required_staff_count` | Number | default: 1 |
| `accepted_staff_ids` | [ObjectId] | **ref: Staff** |
| `declined_staff_ids` | [ObjectId] | **ref: Staff** |
| `applicant_ids` | [ObjectId] | **ref: Staff** |
| `booking_ref` | String | Synced from port 3000 booking |
| `client_name` | String | |
| `client_email` | String | |
| `status` | String | enum: Active / Completed / Cancelled; default: Active |
| `payment_status` | String | enum: Pending / Sent / Received / Disputed / Partial; default: Pending |
| `staff_payments` | Array of subdocs | `{ staff_id(ref:Staff), staff_name, amount, status(Pending/Sent/Received/Disputed), sent_at, received_at, phone, transaction_id }` |
| `payment_confirmed_at` | Date | |
| `payment_disputed_reason` | String | |
| `createdByAdmin` | ObjectId | required; **ref: Staff** |
| `open_for_applications` | Boolean | default: false |
| `createdAt` | Date | default: now |

---

### `Attendance.js` — Collection: `attendances`

| Field | Type | Notes |
|---|---|---|
| `staff_id` | ObjectId | required; **ref: Staff** |
| `assignment_id` | ObjectId | **ref: Assignment** |
| `date` | String | ⚠️ typed as String (YYYY-MM-DD) — may cause query mismatches with Date comparisons |
| `clock_in` | Date | required |
| `clock_out` | Date | |
| `ip_address` | String | |
| `clock_in_location` | `{ lat, lng }` | |
| `clock_out_location` | `{ lat, lng }` | |
| `gps_coordinates` | `{ lat, lng }` | legacy/alternate field |
| `selfie_url` | String | base64 or URL |
| `total_hours` | Number | default: 0; calculated at clock-out |
| `status` | String | enum: On Time / Late / Absent; default: On Time |
| `proximity_denied` | Boolean | default: false |
| `override_by_admin` | Boolean | default: false |
| `supervisor_distance_m` | Number | |

---

### `AuditLog.js` — Collection: `auditlogs`

| Field | Type | Notes |
|---|---|---|
| `actionType` | String | required; values: LOGIN_SUCCESS, LOGIN_FAILED, PASSWORD_RESET, ACCOUNT_CREATED, ACCOUNT_UPDATED, ACCOUNT_DELETED, ACCOUNT_SUSPENDED, ACCOUNT_ACTIVATED, ASSIGNMENT_CREATED, ASSIGNMENT_UPDATED, ASSIGNMENT_DELETED, ASSIGNMENT_ACCEPTED, ASSIGNMENT_DECLINED, PAYMENT_SENT, PAYMENT_CONFIRMED, PAYMENT_DISPUTED, PAYMENT_INITIATED, CLOCK_IN_DENIED, PROXIMITY_OVERRIDE, GPS_SPOOF_DETECTED, SSO_LOGIN, REMOVAL_REQUESTED, REPLACEMENT_APPROVED, PERFORMANCE_REVIEW, SUPERVISOR_ASSIGNED, TEAM_AUTO_CREATED, SECURE_LOGIN_USED, PASSWORD_RESET_REQUESTED, OWN_PASSWORD_CHANGED |
| `targetModel` | String | enum: Staff / Assignment / EventTeam / System; required |
| `targetId` | ObjectId | refPath: targetModel (polymorphic) |
| `performedBy` | ObjectId | **ref: Staff** |
| `details` | Mixed | arbitrary JSON |
| `ipAddress` | String | |
| `timestamp` | Date | default: now |

---

### `EventTeam.js` — Collection: `eventteams`

| Field | Type | Notes |
|---|---|---|
| `event_id` | ObjectId | required; **ref: Assignment** |
| `supervisor_id` | ObjectId | required; **ref: Staff** |
| `member_ids` | [ObjectId] | **ref: Staff** |
| `status` | String | enum: Forming / Active / Completed / Disbanded; default: Forming |
| `disbandedAt` | Date | |
| `disband_requested` | Boolean | default: false |
| `team_readiness` | Number | 0–100%; recalculated on accept/remove |
| `createdAt` | Date | default: now |

---

### `EventTeamCommunication.js` — Collection: `eventteamcommunications`

| Field | Type | Notes |
|---|---|---|
| `team_id` | ObjectId | required; **ref: EventTeam** |
| `message_type` | String | required; enum: announcement / shift_reminder / arrival_confirmation / location_update / system / Chat |
| `sender_id` | ObjectId | required; **ref: Staff** |
| `message_content` | String | required |
| `caption` | String | default: '' |
| `media_url` | String | default: '' |
| `media_type` | String | enum: none / image / video; default: none |
| `mentions` | [ObjectId] | **ref: Staff** |
| `timestamp` | Date | default: now |

---

### `PerformanceReview.js` — Collection: `performancereviews`

| Field | Type | Notes |
|---|---|---|
| `assignment_id` | ObjectId | required; **ref: Assignment** |
| `staff_id` | ObjectId | required; **ref: Staff** |
| `supervisor_id` | ObjectId | required; **ref: Staff** |
| `rating` | Number | required; 1–5 |
| `feedback` | String | |
| `timestamp` | Date | default: now |

---

### `ReplacementRequest.js` — Collection: `replacementrequests`

| Field | Type | Notes |
|---|---|---|
| `team_id` | ObjectId | required; **ref: EventTeam** |
| `event_id` | ObjectId | required; **ref: Assignment** |
| `member_to_remove` | ObjectId | required; **ref: Staff** |
| `suggested_replacement` | ObjectId | optional; **ref: Staff** |
| `submitted_by` | ObjectId | required; **ref: Staff** (supervisor) |
| `reason` | String | |
| `status` | String | enum: Pending / Approved / Rejected; default: Pending |
| `createdAt` | Date | default: now |

---

### `TeamActionsLog.js` — Collection: `teamactionslogs`

| Field | Type | Notes |
|---|---|---|
| `team_id` | ObjectId | required; **ref: EventTeam** |
| `action_type` | String | required (REMOVAL_REQUESTED, BROADCAST, MEMBER_REMOVED, etc.) |
| `performed_by` | ObjectId | required; **ref: Staff** |
| `reason` | String | |
| `timestamp` | Date | default: now |

---

## 5. Services

### `services/emailService.js`

**External APIs:**
- **Brevo** (`sib-api-v3-sdk`): `TransactionalEmailsApi.sendTransacEmail()` — primary provider; activated by `BREVO_API_KEY` env var
- **Nodemailer** (Gmail SMTP): fallback transport using `EMAIL_USER` / `EMAIL_PASSWORD` env vars
  > ⚠️ `nodemailer` is NOT in `package.json` — will throw `MODULE_NOT_FOUND` if Brevo is unavailable
- Priority: 1) Brevo → 2) Gmail SMTP → 3) console.log

**Assets:** `services/emailAssets.js` — reads `public/logo2_email.png` as base64

| Export | Description |
|---|---|
| `initializeEmailService()` | Initializes Brevo client and/or Nodemailer transport on startup |
| `sendStaffWelcomeEmail(staff, plainPassword, loginUrl)` | HTML welcome email with credentials and secure login link |
| `sendPasswordResetEmail(staff, resetUrl)` | Password reset link (10 min expiry) |
| `sendAdminPasswordResetNotification(staff, plainPassword)` | Notifies staff of admin-initiated reset |
| `sendPaymentSentNotification(staff, assignment)` | Notifies staff that payment was sent; prompts confirmation |
| `sendPaymentReceiptEmail(staff, assignment, staffPayment, transactionId)` | Rich HTML M-Pesa receipt with transaction ID |
| `sendAssignmentNotification(staff, assignment)` | Notifies staff of new assignment |
| `sendAssignmentUpdateNotification(staff, assignment)` | Notifies staff of assignment changes |
| `sendEmail({ to, subject, htmlContent })` | ⚠️ **Internal only — NOT exported**; called by `adminController` → TypeError at runtime |

---

### `services/mpesaService.js`

**External APIs:**
- `GET https://[sandbox\|production].safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials` — fetches Bearer token
- `POST https://[sandbox\|production].safaricom.co.ke/mpesa/b2c/v3/paymentrequest` — Business-to-Customer payment

**Config via env vars:** `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_ENVIRONMENT` (sandbox/production), `MPESA_B2C_INITIATOR_NAME`, `MPESA_B2C_SECURITY_CREDENTIAL`, `MPESA_B2C_SHORT_CODE`, `MPESA_B2C_QUEUE_TIMEOUT_URL`, `MPESA_B2C_RESULT_URL`

**Phone normalization:** `07XXXXXXXX` → `2547XXXXXXXX`; strips `+` prefix

| Export | Description |
|---|---|
| `b2cPayment({ phone, amount, assignmentId, staffPaymentId, remarks })` | Initiates Safaricom B2C payment; uses `Occasion: assignmentId\|staffPaymentId` to correlate callback |

---

### `services/emailAssets.js`

| Export | Description |
|---|---|
| `logoBase64` | Base64-encoded content of `public/logo2_email.png` (empty string if file missing) |

---

## 6. Middleware

### `middleware/auth.js`

| Export | Description | Dependencies |
|---|---|---|
| `protect` | Reads `portal_token` cookie, verifies JWT (`JWT_SECRET`), loads `Staff` from DB, sets `req.user` and `res.locals.user`, enforces `mustChangePassword` redirect | `jsonwebtoken`, `Staff` model |
| `authorize(...roles)` | Checks `req.user.role` against whitelist; redirects to `/portal/staff/dashboard?error=...` if unauthorized | — |

---

### `middleware/proximity.js`

**Purpose:** Proximity check for clock-in — ensures staff is within 500 m of supervisor/admin GPS location.

| Export | Description | Dependencies |
|---|---|---|
| `proximityCheck` | Validates GPS, detects spoofed coordinates (0,0 / out-of-range), finds supervisor via EventTeam → Assignment, falls back to any admin with location < 5 min stale, calculates Haversine distance, denies if > 500 m, logs to AuditLog, emits `proximityDenied` socket event | `Staff`, `EventTeam`, `Assignment`, `AuditLog`, `global.io` |

**Audit events logged:** `GPS_SPOOF_DETECTED`, `CLOCK_IN_DENIED`, `PROXIMITY_OVERRIDE`

---

### `middleware/upload.js`

| Export | Description |
|---|---|
| `uploadStaffPhoto` | `multer.single('photo')` — saves to `public/uploads/staff/`, filename: `staff-{timestamp}-{safeName}`, allowed: JPEG / PNG / WebP, max: 5 MB |

---

### `middleware/validation.js`

**Imports:** `validator` (npm)

| Export | Description |
|---|---|
| `sanitizeRequestBody` | Recursively strips HTML tags and escapes `< > & " ' /` from all string body fields |
| `validateStaffCreation` | name (2+ chars, letters only), email (validator.isEmail), role (Admin/Supervisor/Staff), phone (optional regex), shift times (HH:MM), skills (string array) |
| `validateStaffUpdate` | Same as creation but all fields optional |
| `validateAssignmentCreation` | Validates assignment creation fields |
| `validatePasswordChange` | Validates password change request |
| `validateLogin` | Validates login request |

---

## 7. Config

### `config/socket.js`

**Exports:** `function(server)` — initializes Socket.IO, stores as `global.io`, returns `io`

**CORS:** `origin: "*"`, methods: GET, POST

**Server-side `io.on('connection')` event listeners:**

| Client→Server Event | Action |
|---|---|
| `joinRoom(room)` | `socket.join(room)` — rooms: `'Admin'`, `staffId`, `'Team_${teamId}'` |
| `metricUpdate(data)` | Emits `adminMetricUpdate` to `'Admin'` room |
| `staffAttendance(data)` | If `data.team_id`: emits `teamAttendanceUpdate` to `Team_X`; also emits `adminAttendanceUpdate` to `'Admin'` |
| `assignmentResponse(data)` | Emits `adminAssignmentUpdate` to `'Admin'` room |
| `teamMessage(data)` | Emits `newTeamMessage` to `Team_${data.team_id}` |
| `syncProfileUpdate(data)` | Emits `profileSyncUpdate` to `data.userId` room |
| `disconnect` | console.log |

---

## 8. Socket Events — Complete Map

### Server → Client (`global.io.emit` / `global.io.to(...).emit`)

| Event Name | Emitted To | Payload Shape | Source |
|---|---|---|---|
| `metricUpdate` | `'Admin'` | `{ totalStaff, availableStaff, busyStaff, activeAssignments }` | `adminController.emitMetricUpdate()` |
| `profileUpdated` | `staff._id` | full Staff object (minus password) | `adminController.editStaff` |
| `syncProfileUpdate` | `staff._id` | full Staff object | `adminController.editStaff` |
| `accountStatusChanged` | `staff._id` | `{ status: 'Active' \| 'Suspended' }` | `adminController.toggleSuspend` |
| `newAssignment` | broadcast (all) | `{ title, vip }` | `adminController.createAssignment`, `approveReplacement` |
| `assignmentUpdated` | each `acceptedStaff._id` | `{ assignmentId, title, message }` | `adminController.updateAssignment` |
| `disbandPrompt` | `req.user._id` (admin) | `{ teamId, eventTitle, allPaymentsDone, message }` | `adminController.updateAssignment` |
| `removedFromTeam` | `member_to_remove` | `{ assignmentTitle, message }` | `adminController.approveReplacement` |
| `paymentSent` | each `acceptedStaff._id` | `{ assignmentId, title, pay_rate }` | `adminController.updatePaymentStatus` |
| `paymentReceived` | `sp.staff_id` | `{ assignmentId, title, amount, transactionId }` | `adminController.mpesaCallback` |
| `teamAssigned` | `supervisor_id` | `{ teamId, eventTitle, eventDate, message }` | `adminController.assignEventSupervisor` |
| `teamDisbanded` | `team_${team._id}` | `{ teamId, disbandedAt }` | `adminController.disbandTeam` |
| `applicationResult` | `staffId` | `{ assignmentId, assignmentTitle, result: 'approved'\|'rejected' }` | `adminController.handleApplicant` |
| `assignmentResponse` | `'Admin'` | `{ staff, assignment, response: 'accepted'\|'declined' }` | `staffController.respondToAssignment` |
| `staffingAlert` | `'Admin'` | `{ assignmentId, assignmentTitle, acceptedCount, assignedCount, declinedBy, suggestedReplacements[] }` | `staffController.respondToAssignment` |
| `staffAttendance` | `'Admin'` | `{ staff, action: 'clocked in'\|'clocked out', assignment, status\|hours, time }` | `staffController.clockInOut` |
| `teamAttendanceUpdate` | broadcast (all) | `{ assignment_id }` | `staffController.clockInOut` |
| `paymentConfirmed` | `'Admin'` | `{ staff, assignment, pay_rate, time }` | `staffController.confirmPayment` |
| `paymentDisputed` | `'Admin'` | `{ staff, assignment, pay_rate, reason, time }` | `staffController.disputePayment` |
| `newTeamMessage` | `Team_${team._id}` | `{ _id, sender_name, sender_role, message_content, message_type, timestamp }` | `staffController.sendTeamMessage`, `sendTeamMediaMessage` |
| `newTeamMessage` | each `memberId` room | `{ team_id, type, content, sender, timestamp }` | `supervisorController.broadcastMessage` |
| `teamBroadcast` | `'Admin'` | `{ supervisor, team_id, type, content }` | `supervisorController.broadcastMessage` |
| `replacementRequest` | `'Admin'` | `{ supervisor, member, reason, teamId }` | `supervisorController.removeMember` |
| `supervisorLocationUpdate` | `'Admin'` | `{ supervisorId, supervisorName, lat, lng, time }` | `supervisorController.updateLocation` |
| `staffProfileUpdated` | `'Admin'` | `{ staffId, name, changes }` | `staffController.updateProfile` |
| `proximityDenied` | `'Admin'` | `{ staff, distanceMeters, assignment_id, time }` | `middleware/proximity.js` |
| `adminMetricUpdate` | `'Admin'` | `data` (forwarded) | `config/socket.js` (client-forwarded) |
| `adminAttendanceUpdate` | `'Admin'` | `data` (forwarded) | `config/socket.js` (client-forwarded) |
| `adminAssignmentUpdate` | `'Admin'` | `data` (forwarded) | `config/socket.js` (client-forwarded) |
| `profileSyncUpdate` | `data.userId` | `data` (forwarded) | `config/socket.js` (client-forwarded) |

### Client → Server (listeners in `config/socket.js`)

| Event Name | Payload | Action |
|---|---|---|
| `joinRoom` | `room` (string) | `socket.join(room)` |
| `metricUpdate` | `data` | Forwarded as `adminMetricUpdate` to `'Admin'` |
| `staffAttendance` | `{ team_id?, ... }` | Forwarded to `Team_${team_id}` + `'Admin'` |
| `assignmentResponse` | `data` | Forwarded as `adminAssignmentUpdate` to `'Admin'` |
| `teamMessage` | `{ team_id, ...}` | Forwarded as `newTeamMessage` to `Team_${team_id}` |
| `syncProfileUpdate` | `{ userId, ...}` | Forwarded as `profileSyncUpdate` to `userId` room |

### Room Naming Convention

| Room Name | Who Joins | Used For |
|---|---|---|
| `'Admin'` | Admin users (on login) | Broadcast to all admins |
| `staffId` (ObjectId string) | Each staff member (on login) | Personal notifications |
| `Team_${teamId}` | Staff clients | Team-wide events (uppercase T prefix) |
| `team_${teamId}` | — | Disband events (lowercase t prefix — inconsistency) |

---

## 9. NPM Packages (`package.json`)

### Dependencies

| Package | Version | Used For |
|---|---|---|
| `axios` | ^1.13.6 | HTTP calls to port 3000 and Safaricom M-Pesa API |
| `bcrypt` | ^6.0.0 | Password hashing (controllers) |
| `bcryptjs` | ^3.0.3 | ⚠️ Duplicate library — only `bcrypt` is used |
| `compression` | ^1.8.1 | ⚠️ Listed but NOT used in `server.js` |
| `cookie-parser` | ^1.4.7 | Parses `portal_token` cookie |
| `cors` | ^2.8.6 | CORS headers (all origins) |
| `csurf` | ^1.2.2 | CSRF protection on `/portal` routes |
| `dotenv` | ^17.3.1 | Loads `.env` file |
| `ejs` | ^4.0.1 | View engine |
| `express` | ^5.2.1 | Web framework |
| `express-ejs-layouts` | ^2.5.1 | EJS layout wrapper |
| `express-mongo-sanitize` | ^2.2.0 | ⚠️ Imported but NOT applied (commented out — Express 5 compat note) |
| `express-rate-limit` | ^8.2.1 | Rate limiting on auth routes |
| `helmet` | ^8.1.0 | Security headers (CSP disabled) |
| `json2csv` | ^6.0.0-alpha.2 | CSV export in `exportReport`, `exportPayments` |
| `jsonwebtoken` | ^9.0.3 | JWT signing/verification |
| `method-override` | ^3.0.0 | `_method` override for PUT/DELETE in forms |
| `mongoose` | ^9.2.3 | MongoDB ODM |
| `morgan` | ^1.10.1 | ⚠️ Listed but NOT used in `server.js` |
| `multer` | ^2.1.1 | File uploads (staff photos, chat media) |
| `pdfkit` | ^0.17.2 | PDF generation for reports and receipts |
| `sib-api-v3-sdk` | ^8.5.0 | Brevo transactional email API |
| `socket.io` | ^4.8.3 | Real-time bidirectional events |
| `validator` | ^13.15.26 | Email/input validation in `middleware/validation.js` |
| `web-push` | ^3.6.7 | Browser push notifications (VAPID) |

### devDependencies

| Package | Version | Used For |
|---|---|---|
| `sharp` | ^0.34.5 | Image processing (`resizelogo.js`) |

### ⚠️ Missing from `package.json`

| Package | Where Used |
|---|---|
| `nodemailer` | `services/emailService.js` (Gmail SMTP fallback) |

---

## 10. Cross-Service Integration (Port 3000 ↔ Port 3001)

### Port 3000 → Port 3001 (Inbound to staff-system)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/internal/sync-booking` | `x-sync-secret: JWT_SECRET` header | Creates an `Assignment` from a confirmed booking; deduplicates by `booking_ref`; requires at least one Admin staff |
| `POST` | `/internal/sync-staff` | `x-sync-secret: JWT_SECRET` header | `create` → creates Staff with temp password + `mustChangePassword: true`; `update` → updates name/phone/photo; `delete` → deletes Staff by email |
| `GET` | `/staff-admin/sso-login?token=...` | SSO JWT (`staff-ops-sso` type, signed with `SSO_JWT_SECRET`) | Logs in an Admin via one-time token from main admin panel; issues `portal_token` cookie; only allows role `Admin` or `Super Admin` |

### Port 3001 → Port 3000 (Outbound from staff-system)

| Call | Where | Description |
|---|---|---|
| `POST http://localhost:3000/internal/sync-staff-update` | `staffController.updateProfile` | Pushes name/phone changes back to port 3000; auth via `x-sync-secret: JWT_SECRET`; **fire-and-forget** (errors silently suppressed) |

---

## Known Bugs / Issues

| # | Location | Issue | Severity |
|---|---|---|---|
| 1 | `adminController.disbandTeam` | `AdminNotification` model used (`AdminNotification.create(...)`) but never `require()`d → `ReferenceError` at runtime | 🔴 Critical |
| 2 | `adminController.assignEventSupervisor`, `disbandTeam` | Calls `emailService.sendEmail(...)` but `sendEmail` is not in `emailService` `module.exports` → `TypeError: emailService.sendEmail is not a function` | 🔴 Critical |
| 3 | `services/emailService.js` | `nodemailer` required as fallback SMTP but not in `package.json` → `MODULE_NOT_FOUND` if Brevo is unavailable | 🟠 High |
| 4 | `models/Attendance.js` | `date` field typed as `String` but controllers query with `Date` objects (`$gte: today`) → possible query mismatch | 🟠 High |
| 5 | `models/Staff.js` | `password` field has no `select: false` — always returned in queries unless explicitly excluded with `.select('-password')` | 🟡 Medium |
| 6 | `config/socket.js` | `team_${teamId}` (lowercase) used in `disbandTeam` but all other team rooms use `Team_${teamId}` (uppercase) → disband event never reaches clients | 🟠 High |
| 7 | `package.json` | `compression` and `morgan` listed as dependencies but never used in `server.js` | 🟢 Low |
| 8 | `package.json` | Both `bcrypt` and `bcryptjs` listed; only `bcrypt` is used in controllers | 🟢 Low |
