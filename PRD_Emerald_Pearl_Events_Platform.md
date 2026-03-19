# Product Requirements Document — Emerald Pearl Events Platform

**Version:** 1.0  
**Date:** 2026-03-18  
**Author:** System Architect  
**Status:** Authoritative  

---

## 1. Product Overview

Emerald Pearl Events Platform is a full-stack event management and staffing operations system built for **Emerald Pearland Events**, a Kenyan events services company. The platform manages the complete lifecycle from client booking through event execution to financial settlement.

**Primary functions:**

- Client event booking and CRM
- Staff recruitment, assignment, and workforce management
- Geo-fenced attendance with selfie verification and device fingerprinting
- Supervisor-led team operations with real-time communication
- Double-entry financial system (invoices, payroll, ledger, expense tracking)
- Automated client communication (invoices, thank-you messages, ETR)
- Post-event surveys and performance reviews

**Currency:** KES (Kenyan Shilling)  
**Region:** Kenya  
**Primary payment method:** M-Pesa (Safaricom Daraja API)

---

## 2. System Architecture

### 2.1 Two-Server Topology

| Property | Admin Portal | Staff Operations |
|---|---|---|
| **Port** | 3000 | 3001 |
| **Database** | MongoDB Atlas — `test` | MongoDB Atlas — `emerald` |
| **Runtime** | Node.js + Express | Node.js + Express |
| **Templating** | EJS | EJS |
| **Real-time** | — | Socket.io v4 |
| **Entry Point** | `server-prod.js` | `staff-system/server.js` |

### 2.2 Inter-Service Communication

| Mechanism | Direction | Details |
|---|---|---|
| Staff Sync | Port 3000 → 3001 | `POST /internal/sync-staff` with `x-sync-secret` header, 8 s timeout, non-blocking |
| SSO Bridge | Port 3000 → 3001 | Short-lived JWT (2 min), `SSO_JWT_SECRET`, issues `portal_token` cookie |
| HTTP retry | Both | `axios-retry` with exponential backoff |

### 2.3 Separation of Concerns

```
Port 3000 (Admin Portal)
├── Client-facing booking form
├── Admin dashboard (analytics, galleries, CRM)
├── Staff directory (name, category, photo, contact)
├── Booking management (status transitions, payments)
└── Email notifications (Brevo transactional API)

Port 3001 (Staff Operations)
├── Staff self-service portal
├── Admin workforce management (CRUD, suspend, assign)
├── Event lifecycle & assignment engine
├── Attendance system (GPS, selfie, device fingerprint)
├── Supervisor panel & team communications
├── Financial module (invoices, payroll, ledger, expenses)
├── Surveys & performance reviews
└── Audit logging
```

---

## 3. Core Modules

### 3.1 Admin Portal (Port 3000)

#### 3.1.1 Staff Management
- CRUD operations on staff records (name, phone, email, WhatsApp, category, photo, hourlyRate)
- Photo stored as base64 in MongoDB
- Categories: `Ushers`, `Brand Ambassadors`, `Supervisors`, `Event Planners`, `Event Organisers`, `Wedding Planners`, `Ticketing Agents`
- Availability toggle (`isAvailable`)
- Auto-sync to Port 3001 on create/update/delete

#### 3.1.2 Booking / Event Management
- Event types: `Wedding`, `Anniversary`, `Birthday Party`, `Family & House Party`, `Traditional Ceremony`, `Memorial Service`, `Corporate Event`, `Brand Ambassador Event`, `Product Launch`, `Private Celebration`, `Luxury Decor & Styling`, `Other`
- Budget ranges: `Under KES 50,000`, `KES 50,000 – 100,000`, `KES 100,000 – 250,000`, `KES 250,000 – 500,000`, `KES 500,000+`, `Not Sure Yet`
- Need ushers values: `Yes`, `No`, `Not specified`
- Selected services with `serviceName`, `quantity`, `estimatedCost`
- Status machine: `new` → `contacted` → `confirmed` → `completed` → `cancelled`
- Booking reference auto-generated: `EPE-{timestamp}`
- Assigned staff and supervisor references
- Payment tracking: `isPaid`, `amountPaid`, `estimatedTotal`

#### 3.1.3 Client Payments
- Model: `ClientPayment`
- Payment methods: `MPesa`, `Bank Transfer`, `PayPal`, `Cash`, `Card`, `Other`
- Status: `Pending` | `Confirmed` | `Failed` | `Refunded`
- Auto-generated receipt: `EPE-PMT-{YYYY}-{sequential 4-digit}`
- Links to `Booking` and `Customer`

#### 3.1.4 Reporting & Dashboard
- Revenue analytics (total, by period, by event type)
- Booking pipeline metrics
- Staff utilization
- Email campaign tracking (confirmation, follow-up, reminders)

#### 3.1.5 Email Notifications (Brevo)
- Booking confirmation
- Follow-up emails
- 48-hour staff reminders
- Payment confirmations
- Invoice delivery
- ETR delivery
- Thank-you messages

---

### 3.2 Staff Operations System (Port 3001)

#### 3.2.1 Staff Management
- Full CRUD with `specific_role` and `category` fields
- Roles: `Admin` | `Supervisor` | `Staff`
- Status: `Active` | `Suspended`
- Availability: `Available` | `Busy` | `Not Available` | `On Leave`
- Supervisor assignment (`supervisor_id` → Staff)
- Password management (`mustChangePassword`, reset tokens)
- GPS location tracking (`last_location: { lat, lng, updatedAt }`)
- Push subscription storage for web push notifications

#### 3.2.2 Event / Assignment Management
- Assignment fields: `title`, `description`, `location`, `date`, `start_time`, `end_time`, `pay_rate`, `vip_flag`, `dress_code`, `special_instructions`
- GPS anchor: `gps_location: { lat, lng }` with 2D index
- Staff pools: `assigned_staff_ids`, `accepted_staff_ids`, `declined_staff_ids`, `applicant_ids`
- `required_staff_count` — applications auto-close when filled
- `open_for_applications` toggle
- Client reference: `booking_ref`, `client_name`, `client_email`, `clientPaymentAmount`
- Per-staff payment tracking: `staff_payments[]` with individual status, method, receipt
- `lifecycle_state` — see §4 Event Lifecycle

#### 3.2.3 Team & Assignment Management
- `EventTeam` model: `event_id`, `supervisor_id`, `member_ids[]`, `team_readiness` (0–100)
- Readiness computed: `(member_count / assigned_staff_count) * 100`
- Labels: `Waiting` (0), `Incomplete` (<50), `Ready` (<100), `Fully Deployed` (100)
- `ReplacementRequest`: supervisor requests member removal with reason, admin approves

#### 3.2.4 Finance Module — see §6 Financial System

#### 3.2.5 Reporting
- Event performance reports (per-assignment)
- Financial snapshots
- PDF/CSV export support
- Event Transaction Reports (ETR)

#### 3.2.6 Dashboard
- Workforce metrics: active staff, clocked-in count, pending assignments
- Audit log feed
- Real-time Socket.io updates
- Replacement request alerts

---

## 4. Event Lifecycle — Strict State Machine

### 4.1 States

| State | Description |
|---|---|
| `PLANNED` | Event created with basic details. No staff assigned. |
| `STAFFING` | Applications open. Staff are being recruited/assigned. Supervisor may be assigned. |
| `READY` | `accepted_staff_ids.length >= required_staff_count`. Supervisor assigned. Team readiness ≥ 100%. |
| `LIVE` | Event date has arrived. Clock-in is enabled. Geo anchor active. |
| `CLOSED` | Event completed. Clock-out finalized. Attendance records sealed. Equivalent to `Completed` status. |
| `FINANCE_SETTLED` | All payroll disbursed. Client invoice paid. Ledger balanced. ETR generated. |

### 4.2 Allowed Transitions

```
PLANNED → STAFFING
STAFFING → READY
READY → LIVE
LIVE → CLOSED
CLOSED → FINANCE_SETTLED
```

### 4.3 Forbidden Transitions

- Any backward transition (e.g., `READY` → `STAFFING`) is **forbidden**
- `PLANNED` → `LIVE` (cannot skip staffing)
- `STAFFING` → `CLOSED` (cannot skip execution)
- `FINANCE_SETTLED` → any state (terminal)
- `Cancelled` status can be set from `PLANNED` or `STAFFING` only

### 4.4 Transition Validation Rules

| Transition | Preconditions |
|---|---|
| `PLANNED → STAFFING` | `open_for_applications = true` OR at least one `assigned_staff_ids` entry |
| `STAFFING → READY` | `accepted_staff_ids.length >= required_staff_count` AND `supervisor_id` is set |
| `READY → LIVE` | Event `date` has arrived (server-side date check) |
| `LIVE → CLOSED` | All active attendance records have `clock_out` timestamps |
| `CLOSED → FINANCE_SETTLED` | All `staff_payments[].status` are `Received` or `Disputed` AND `ClientInvoice.paymentStatus` is `paid` |

### 4.5 Parallel Status Field

The `status` field (`Active` | `Completed` | `Cancelled`) remains for backward compatibility:
- `Active` maps to `PLANNED`, `STAFFING`, `READY`, `LIVE`
- `Completed` maps to `CLOSED`, `FINANCE_SETTLED`
- `Cancelled` is orthogonal and terminal

---

## 5. Authentication & Authorization

### 5.1 Authentication Methods

| Method | Scope | Details |
|---|---|---|
| JWT Cookie (`portal_token`) | Port 3001 | 30-day expiry, `httpOnly: true` |
| SSO JWT (query param) | Port 3000 → 3001 | 2-minute expiry, `SSO_JWT_SECRET` |
| Secure Login Token | Port 3001 | One-time hashed token, 10-min expiry |
| Password Reset Token | Port 3001 | SHA-256 hashed, 10-min expiry |

### 5.2 Role-Based Access Control

| Role | Access |
|---|---|
| `Admin` | All `/portal/admin-staff/*` routes. Full CRUD on all entities. Financial operations. |
| `Supervisor` | `/portal/supervisor/*` routes. Team management, broadcasting, performance reviews, replacement requests. own-team scope only. |
| `Staff` | `/portal/staff/*` routes. View own assignments, clock in/out, profile management, accept/decline events. |

### 5.3 Security Middleware Stack

| Middleware | Purpose |
|---|---|
| `helmet` | Security headers |
| `csurf` | CSRF protection on all `/portal` routes |
| `express-mongo-sanitize` | NoSQL injection prevention |
| `bcryptjs` | Password hashing (salt rounds = 10) |
| Rate limiting | Applied on auth routes |
| `method-override` | PUT/DELETE via POST forms |

### 5.4 First-Login Flow

1. Staff created on Port 3000 → synced to Port 3001 with `password = hashed(email)`, `mustChangePassword = true`
2. Staff logs in → system detects `mustChangePassword`
3. Redirect to `/portal/auth/change-password`
4. Password requirements: min 8 characters, uppercase, number, special character
5. On success: `mustChangePassword = false`, redirect to role-appropriate dashboard

---

## 6. Financial System

> [!IMPORTANT]
> Financial accuracy is a non-negotiable constraint. All monetary operations must create corresponding `Transaction` and `EventLedger` entries atomically.

### 6.1 Double-Entry Architecture

Two complementary collections form the financial backbone:

#### Transaction (Global Ledger)
- Scope: System-wide, across all events
- Auto-ID: `EPE-TXN-{YYYY}-{0001}`
- Types: `clientPayment`, `staffPayroll`, `expense`, `refund`, `adjustment`, `invoice`
- Direction: `in` (revenue) | `out` (expense)
- Source system: `main-portal` | `staff-portal`
- Status: `Pending` | `Completed` | `Failed` | `Reversed`

#### EventLedger (Per-Event Ledger)
- Scope: Single event
- Auto-ID: `EPE-LDG-{YYYY}-{0001}`
- Types: `clientPayment`, `staffPayroll`, `operationalExpense`, `incidentPayment`, `refund`, `adjustment`
- `balanceAfter` field tracks running event balance
- Cross-reference: `transactionId` links to global `Transaction`

### 6.2 Client Invoicing

**Model:** `ClientInvoice`
- Auto-ID: `EPE-INV-{YYYY}-{0001}`
- Service line items: `[{ name, description, quantity, unitPrice, total }]`
- Tax: `vatRate` (default 16%), computed `vatAmount`
- Computed: `subtotal`, `totalAmount`
- Payment status: `pending` | `paid` | `partial`
- Invoice status: `Draft` | `Sent` | `Paid` | `Overdue` | `Cancelled`
- PDF generation: `pdfUrl` stored on record
- ETR fields: `etrNumber`, `etrIssuedAt`
- Communication tracking: `thankYouSentAt`, `invoiceEmailSentAt`, `surveySentAt`

**Invoice Generation Trigger:** When event status transitions to `confirmed` (booking) or admin manually creates invoice.

### 6.3 Staff Payroll

**Model:** `StaffPayroll`
- Auto-ID: `EPE-PAY-{YYYY}-{0001}`
- Derived from attendance: `hoursWorked` from `Attendance.total_hours`
- Computed on save: `totalPay = basePay + overtimePay + bonus - deductions`
- Payment methods: `MPesa`, `Bank Transfer`, `Cash`, `Other`
- Status: `Pending` → `Sent` → `Received` | `Disputed` | `Disbursed`
- M-Pesa receipt tracking: `mpesaReceiptNumber`

### 6.4 Operational Expenses

**Model:** `ExpenseReceipt`
- Auto-ID: `EPE-EXP-{YYYY}-{0001}`
- Categories: `transport`, `equipment`, `incident`, `logistics`, `catering`, `venue`, `other`
- Status: `Pending` | `Approved` | `Rejected`
- Receipt image upload: `receiptImageUrl`
- Approval tracking: `approvedBy`, `adminExplanation`

### 6.5 Event Financial Snapshot (ETR)

**Model:** `EventFinancialSnapshot`
- Auto-ID: `EPE-SNP-{YYYY}-{0001}`
- One per event (`eventId` has unique index)
- Aggregated fields:
  - `clientPayment` (total received)
  - `staffPayrollTotal` (total disbursed to staff)
  - `operationalExpenses`
  - `incidentExpenses`
- Computed on save:
  - `totalExpenses = staffPayrollTotal + operationalExpenses + incidentExpenses`
  - `eventProfit = clientPayment - totalExpenses`
  - `profitMargin = round((eventProfit / clientPayment) * 100)`
- `isFinal` flag — set when event reaches `FINANCE_SETTLED`

### 6.6 M-Pesa Daraja Integration

- Payment method: `MPesa` is the default for both `ClientPayment` and `StaffPayroll`
- `transactionId` stores Daraja transaction reference
- `mpesaReceiptNumber` on payroll records
- Integration target: Safaricom Daraja API for STK Push (B2C for payroll, C2B for client payments)

---

## 7. Client Communication Flow

### 7.1 Sequence

```
1. Event confirmed
   └── Invoice generated (ClientInvoice created, PDF rendered)
        └── Invoice email sent to client
             └── invoiceEmailSentAt = Date.now()

2. Client pays
   └── Payment recorded (ClientPayment)
        └── Invoice.paymentStatus = 'paid'
             └── Transaction + EventLedger entries created

3. Event completed (lifecycle_state → CLOSED)
   └── Thank-you message sent to client
        └── thankYouSentAt = Date.now()
   └── ETR generated (EventFinancialSnapshot, etrNumber on ClientInvoice)
        └── etrIssuedAt = Date.now()
        └── ETR email sent to client
   └── Client survey dispatched
        └── surveySentAt = Date.now()
```

### 7.2 ETR Retrieval

```javascript
// getLatestETR(eventId)
// Returns the most recent EventFinancialSnapshot for the given event.
// If isFinal === true, this is the authoritative version.
// Versioning: each save creates a new updatedAt timestamp.
// Only one snapshot per event (unique index on eventId).
async function getLatestETR(eventId) {
    return await EventFinancialSnapshot.findOne({ eventId })
        .sort({ updatedAt: -1 });
}
```

---

## 8. Supervisor Operations

### 8.1 Core Functions

| Function | Route | Description |
|---|---|---|
| `assignSupervisorToEvent` | `PUT /portal/admin-staff/assignments/:id/supervisor` | Admin assigns supervisor to event. Creates `EventTeam` with supervisor as team lead. |
| `dropGeoAnchor` | Embedded in Assignment | `gps_location: { lat, lng }` set on assignment creation/update. Indexed as `2d`. |
| `validateClockInRadius` | `shared/utils/geo.js` | Haversine distance calculation. Default radius: **200 meters**. |
| `clockIn` | `POST /portal/staff/clock-in` | Captures GPS, selfie, device fingerprint. Validates proximity. |
| `clockOut` | `POST /portal/staff/clock-out` | Records clock-out GPS and time. Computes `total_hours`. |
| `overrideProximityDenial` | Admin/Supervisor action | Sets `proximity_override = true`, records `proximity_override_by`, `proximity_override_at`, `proximity_override_reason`. |

### 8.2 Team Management

| Function | Route | Description |
|---|---|---|
| `getDashboard` | `GET /portal/supervisor/dashboard` | View all assigned teams with readiness labels |
| `removeMember` | `POST /supervisor/teams/:teamId/remove-member` | Creates `ReplacementRequest` for admin approval |
| `broadcastMessage` | `POST /supervisor/teams/:teamId/communication` | Persists to `EventTeamCommunication`, emits via Socket.io |
| `rateStaff` | `POST /supervisor/rate-staff` | Creates `PerformanceReview` (1–5 stars + feedback) |
| `updateReadiness` | `POST /supervisor/teams/:teamId/readiness` | Recalculates team readiness percentage |

### 8.3 Broadcast Message Types

`announcement` | `shift_reminder` | `arrival_confirmation` | `location_update` | `task_instructions`

### 8.4 Fraud Prevention

| Mechanism | Implementation |
|---|---|
| **Selfie Verification** | `selfie_url` captured at clock-in. `selfie_verified` flag set by supervisor/admin. `selfie_verified_by` and `selfie_verified_at` tracked. |
| **Device Fingerprint** | `device_fingerprint: { user_agent, platform, device_id, session_token, ip_address, captured_at }`. Indexed on `device_id` for cross-reference anomaly detection. |
| **GPS Spoof Detection** | `rejectPoorAccuracy(accuracy)` — rejects if accuracy > 100 meters. |
| **Proximity Validation** | `calculateDistanceMeters(staffLocation, geoAnchor)` using Haversine formula. Deny if > 200m. Record `proximity_distance` and `proximity_denied`. |
| **Override Audit Trail** | All proximity overrides logged with `proximity_override_by`, `proximity_override_at`, `proximity_override_reason`. Creates `AuditLog` entry. |

---

## 9. Attendance & Payroll Link

### 9.1 Clock-In Flow

1. Staff submits GPS coordinates, selfie, device fingerprint
2. System validates `rejectPoorAccuracy(accuracy)`
3. System computes `calculateDistanceMeters(staffCoords, assignment.gps_location)`
4. If distance ≤ 200m → `Attendance` created with `status: 'Clocked In'`
5. If distance > 200m → `Attendance` created with `proximity_denied: true`, `status: 'Proximity Denied'`
6. Supervisor or admin may override → `proximity_override: true`

### 9.2 Clock-Out → Payroll Trigger

```
Clock-Out submitted
  ├── Attendance.clock_out = Date.now()
  ├── Attendance.total_hours = (clock_out - clock_in) / 3600000
  ├── Attendance.status = 'Completed'
  │
  ├── StaffPayroll created:
  │   ├── hoursWorked = Attendance.total_hours
  │   ├── basePay = hoursWorked × Assignment.pay_rate
  │   ├── totalPay = basePay + overtimePay + bonus - deductions
  │   └── status = 'Pending'
  │
  ├── Attendance.payroll_id = StaffPayroll._id
  ├── Attendance.payroll_generated = true
  ├── Attendance.payroll_generated_at = Date.now()
  │
  ├── Transaction created (type: 'staffPayroll', direction: 'out')
  └── EventLedger entry created (type: 'staffPayroll', direction: 'out')
```

### 9.3 Attendance Statuses

`On Time` | `Late` | `Absent` | `Clocked In` | `Proximity Denied` | `Completed`

---

## 10. API Requirements

### 10.1 General Rules

- All protected routes require `Authorization: Bearer <token>` (via `portal_token` cookie)
- CSRF token required on all form submissions (`csurf` middleware)
- All API responses are JSON: `{ success: boolean, data?: any, error?: string }`
- View routes render EJS templates
- Standard HTTP status codes:

| Code | Usage |
|---|---|
| `200` | Successful operation |
| `400` | Validation error, missing fields, invalid state transition |
| `401` | Missing or invalid token |
| `403` | Insufficient role / not authorized for resource |
| `404` | Resource not found |
| `500` | Server error |

### 10.2 Auth Routes (Port 3001)

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/portal/auth/login` | Public | Login page |
| `POST` | `/portal/auth/login` | Public | Submit credentials, receive `portal_token` cookie |
| `GET` | `/portal/auth/logout` | Authenticated | Clear cookie |
| `GET` | `/portal/auth/change-password` | Authenticated | Password change form |
| `POST` | `/portal/auth/change-password` | Authenticated | Submit new password |
| `POST` | `/portal/auth/forgot-password` | Public | Request reset link |
| `POST` | `/portal/auth/reset-password/:token` | Public | Submit new password via reset token |
| `GET` | `/portal/auth/secure-login/:token` | Public | One-time login link |

### 10.3 Admin Routes (Port 3001)

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/portal/admin-staff/dashboard` | Admin | Dashboard view |
| `GET` | `/portal/admin-staff/staff-management` | Admin | Staff list view |
| `GET` | `/portal/admin-staff/events` | Admin | Events & assignments view |
| `POST` | `/portal/admin-staff/assignments` | Admin | Create event |
| `PUT` | `/portal/admin-staff/assignments/:id` | Admin | Update event |
| `PUT` | `/portal/admin-staff/assignments/:id/supervisor` | Admin | Assign supervisor |
| `PUT` | `/portal/admin-staff/assignments/:id/assign-staff` | Admin | Assign staff |
| `PUT` | `/portal/admin-staff/assignments/:id/toggle-applications` | Admin | Open/close applications |
| `GET` | `/portal/admin-staff/assignments/:id/report` | Admin | Event report |
| `GET` | `/portal/admin-staff/attendance` | Admin | Attendance view |
| `GET` | `/portal/admin-staff/payments` | Admin | Payments view |
| `GET` | `/portal/admin-staff/reports` | Admin | Reports view |
| `GET` | `/portal/admin-staff/audit-logs` | Admin | Audit logs view |

### 10.4 Staff Routes (Port 3001)

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/portal/staff/dashboard` | Staff/Supervisor | Dashboard |
| `GET` | `/portal/staff/assignments` | Staff | View assignments |
| `POST` | `/portal/staff/assignments/:id/response` | Staff | Accept/decline/apply |
| `GET` | `/portal/staff/profile` | Staff | View profile |
| `PUT` | `/portal/staff/profile` | Staff | Update profile |
| `POST` | `/portal/staff/profile/photo` | Staff | Upload photo |
| `POST` | `/portal/staff/clock-in` | Staff | Clock in with GPS/selfie |
| `POST` | `/portal/staff/clock-out` | Staff | Clock out |
| `POST` | `/portal/staff/change-password` | Staff | Change password |

### 10.5 Supervisor Routes (Port 3001)

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/portal/supervisor/dashboard` | Supervisor | Team overview |
| `POST` | `/supervisor/teams/:teamId/remove-member` | Supervisor | Request member removal |
| `GET` | `/supervisor/teams/:teamId/suggest-replacements` | Supervisor | Get available replacements |
| `POST` | `/supervisor/teams/:teamId/readiness` | Supervisor | Update team readiness |
| `POST` | `/supervisor/rate-staff` | Supervisor | Rate staff performance |
| `POST` | `/supervisor/teams/:teamId/communication` | Supervisor | Broadcast message to team |
| `GET` | `/supervisor/teams/:teamId/communications` | Supervisor | Get message history |

### 10.6 Internal Routes (Port 3001)

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/internal/sync-staff` | `x-sync-secret` header | Sync staff from Port 3000 |

### 10.7 Admin Routes (Port 3000)

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/admin` | Admin | Main admin dashboard |
| `GET` | `/admin/staff` | Admin | Staff directory |
| `GET/POST/PUT/DELETE` | `/api/admin/staff` | Admin | Staff CRUD API |
| `GET` | `/admin/staff-operations-sso` | Admin | SSO bridge to Port 3001 |

---

## 11. Data Models

### 11.1 Staff (Port 3000 — `server/models/Staff.js`)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | String | ✅ | — | |
| `category` | String | ✅ | — | |
| `phone` | String | ✅ | — | |
| `email` | String | ❌ | `null` | |
| `whatsapp` | String | ❌ | `null` | |
| `photo` | String | ❌ | `null` | Base64 encoded |
| `isAvailable` | Boolean | ❌ | `true` | |
| `assignedBookings` | [ObjectId → Booking] | ❌ | `[]` | |
| `hourlyRate` | Number | ❌ | `0` | |
| `notes` | String | ❌ | `''` | |

### 11.2 Staff (Port 3001 — `staff-system/models/Staff.js`)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `name` | String | ✅ | — | |
| `email` | String | ✅ (unique) | — | |
| `password` | String | ✅ | — | bcrypt hashed |
| `role` | Enum | ❌ | `Staff` | `Admin` \| `Supervisor` \| `Staff` |
| `specific_role` | String | ❌ | `''` | e.g. Usher, Bartender |
| `category` | Enum | ❌ | `Usher` | `Usher` \| `Brand Ambassador` \| `Supervisor` \| `Event Planner` \| `Organiser` \| `Wedding Planner` \| `Ticketing Agent` |
| `status` | Enum | ❌ | `Active` | `Active` \| `Suspended` |
| `availability_status` | Enum | ❌ | `Available` | `Available` \| `Busy` \| `Not Available` \| `On Leave` |
| `supervisor_id` | ObjectId → Staff | ❌ | `null` | |
| `mustChangePassword` | Boolean | ❌ | `true` | |
| `photo_url` | String | ❌ | — | |
| `phone` | String | ❌ | — | |
| `department` | String | ❌ | — | |
| `skills` | [String] | ❌ | `[]` | |
| `shift_start` / `shift_end` | String | ❌ | — | e.g. `09:00` |
| `last_location` | `{ lat, lng, updatedAt }` | ❌ | — | 2D indexed |
| `pushSubscription` | Object | ❌ | — | Web push subscription |
| `secureLoginToken` / `secureLoginExpire` | String / Date | ❌ | — | One-time login |
| `resetPasswordToken` / `resetPasswordExpire` | String / Date | ❌ | — | Password reset |

### 11.3 Assignment (Event)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `title` | String | ✅ | — | |
| `description` | String | ✅ | — | |
| `location` | String | ✅ | — | |
| `date` | Date | ✅ | — | |
| `start_time` / `end_time` | String | ✅ | — | |
| `pay_rate` | Number | ✅ | — | KES per hour |
| `vip_flag` | Boolean | ❌ | `false` | |
| `dress_code` | String | ❌ | — | |
| `special_instructions` | String | ❌ | — | |
| `gps_location` | `{ lat, lng }` | ❌ | — | Geo anchor, 2D indexed |
| `supervisor_id` | ObjectId → Staff | ❌ | — | |
| `assigned_staff_ids` | [ObjectId → Staff] | ❌ | `[]` | |
| `required_staff_count` | Number | ❌ | `1` | |
| `accepted_staff_ids` | [ObjectId → Staff] | ❌ | `[]` | |
| `declined_staff_ids` | [ObjectId → Staff] | ❌ | `[]` | |
| `applicant_ids` | [ObjectId → Staff] | ❌ | `[]` | |
| `booking_ref` | String | ❌ | `null` | Links to Port 3000 booking |
| `client_name` / `client_email` | String | ❌ | `''` | |
| `clientPaymentAmount` | Number | ❌ | `0` | |
| `usherCount` | Number | ❌ | `0` | |
| `status` | Enum | ❌ | `Active` | `Active` \| `Completed` \| `Cancelled` |
| `lifecycle_state` | Enum | ❌ | `PLANNED` | `PLANNED` \| `STAFFING` \| `READY` \| `LIVE` \| `CLOSED` \| `FINANCE_SETTLED` |
| `payment_status` | Enum | ❌ | `Pending` | `Pending` \| `Sent` \| `Received` \| `Disputed` \| `Partial` |
| `staff_payments` | [{...}] | ❌ | `[]` | Per-staff payment sub-documents |
| `open_for_applications` | Boolean | ❌ | `false` | |
| `createdByAdmin` | ObjectId → Staff | ✅ | — | |

### 11.4 Attendance

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `staff_id` | ObjectId → Staff | ✅ | — | |
| `assignment_id` | ObjectId → Assignment | ❌ | — | |
| `date` | String | ❌ | — | YYYY-MM-DD |
| `clock_in` | Date | ✅ | — | |
| `clock_out` | Date | ❌ | — | |
| `clock_in_location` / `clock_out_location` | `{ lat, lng }` | ❌ | — | 2D indexed |
| `selfie_url` | String | ❌ | — | Photo path/URL |
| `selfie_verified` | Boolean | ❌ | `false` | |
| `selfie_verified_by` / `selfie_verified_at` | ObjectId / Date | ❌ | — | |
| `device_fingerprint` | Object | ❌ | — | `{ user_agent, platform, device_id, session_token, ip_address, captured_at }` |
| `proximity_denied` | Boolean | ❌ | `false` | |
| `proximity_distance` | Number | ❌ | — | Metres from geo anchor |
| `proximity_override` | Boolean | ❌ | `false` | |
| `proximity_override_by` / `proximity_override_at` / `proximity_override_reason` | ObjectId / Date / String | ❌ | — | |
| `payroll_id` | ObjectId → StaffPayroll | ❌ | — | |
| `payroll_generated` | Boolean | ❌ | `false` | |
| `payroll_generated_at` | Date | ❌ | — | |
| `total_hours` | Number | ❌ | `0` | |
| `status` | Enum | ❌ | `On Time` | `On Time` \| `Late` \| `Absent` \| `Clocked In` \| `Proximity Denied` \| `Completed` |

### 11.5 Transaction

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `transactionId` | String (unique) | Auto | — | `EPE-TXN-{YYYY}-{0001}` |
| `type` | Enum | ✅ | — | `clientPayment` \| `staffPayroll` \| `expense` \| `refund` \| `adjustment` \| `invoice` |
| `sourceSystem` | Enum | ❌ | `staff-portal` | `main-portal` \| `staff-portal` |
| `eventId` | ObjectId → Assignment | ❌ | — | |
| `eventName` | String | ❌ | `''` | |
| `amount` | Number | ✅ | — | |
| `currency` | String | ❌ | `KES` | |
| `direction` | Enum | ✅ | — | `in` \| `out` |
| `description` | String | ✅ | — | |
| `status` | Enum | ❌ | `Completed` | `Pending` \| `Completed` \| `Failed` \| `Reversed` |
| `createdBy` | ObjectId → Staff | ❌ | — | |
| `metadata` | Mixed | ❌ | `{}` | |

### 11.6 EventLedger

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `ledgerId` | String (unique) | Auto | — | `EPE-LDG-{YYYY}-{0001}` |
| `eventId` | ObjectId → Assignment | ✅ | — | |
| `type` | Enum | ✅ | — | `clientPayment` \| `staffPayroll` \| `operationalExpense` \| `incidentPayment` \| `refund` \| `adjustment` |
| `amount` | Number | ✅ | — | |
| `direction` | Enum | ✅ | — | `in` \| `out` |
| `description` | String | ✅ | — | |
| `balanceAfter` | Number | ❌ | `0` | Running balance |
| `transactionId` | String | ❌ | `''` | Cross-ref to Transaction |
| `createdBy` | ObjectId → Staff | ❌ | — | |

### 11.7 ClientInvoice

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `invoiceNumber` | String (unique) | ✅ | Auto | `EPE-INV-{YYYY}-{0001}` |
| `eventId` | ObjectId → Assignment | ❌ | — | |
| `clientName` | String | ✅ | — | |
| `clientEmail` | String | ✅ | — | |
| `clientPhone` | String | ❌ | `''` | |
| `companyName` | String | ❌ | `''` | |
| `eventName` | String | ✅ | — | |
| `eventDate` | Date | ❌ | — | |
| `eventLocation` | String | ❌ | `''` | |
| `services` | [ServiceLine] | ❌ | `[]` | `{ name, description, quantity, unitPrice, total }` |
| `subtotal` | Number | ❌ | `0` | |
| `vatRate` | Number | ❌ | `16` | Kenya VAT = 16% |
| `vatAmount` | Number | ❌ | `0` | |
| `totalAmount` | Number | ❌ | `0` | |
| `currency` | String | ❌ | `KES` | |
| `paymentStatus` | Enum | ❌ | `pending` | `pending` \| `paid` \| `partial` |
| `invoiceStatus` | Enum | ❌ | `Draft` | `Draft` \| `Sent` \| `Paid` \| `Overdue` \| `Cancelled` |
| `pdfUrl` | String | ❌ | `''` | |
| `etrNumber` | String | ❌ | `''` | |
| `etrIssuedAt` | Date | ❌ | — | |
| `thankYouSentAt` | Date | ❌ | — | |
| `invoiceEmailSentAt` | Date | ❌ | — | |
| `surveySentAt` | Date | ❌ | — | |

### 11.8 Survey

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `type` | Enum | ✅ | — | `Staff` \| `Supervisor` \| `Client` |
| `assignment_id` | ObjectId → Assignment | ✅ | — | |
| `respondent_id` | ObjectId → Staff | ❌ | `null` | null for client surveys |
| `respondent_name` | String | ❌ | `''` | |
| `responses` | [{ question, answer, answer_type }] | ❌ | `[]` | `answer_type`: `text` \| `rating` \| `multiple_choice` \| `boolean` |
| `overall_rating` | Number (1–5) | ❌ | `null` | |
| `submitted` | Boolean | ❌ | `false` | |
| `submitted_at` | Date | ❌ | `null` | |
| `token` | String (unique, sparse) | ❌ | — | For client survey links |

---

## 12. Testing Scenarios (TestSprite)

> [!IMPORTANT]
> Each scenario below is designed for direct conversion into automated test cases. Every scenario includes preconditions, actions, expected results, and relevant API endpoints.

### 12.1 Authentication

| ID | Scenario | Method | Endpoint | Expected |
|---|---|---|---|---|
| `AUTH-001` | Successful staff login | `POST` | `/portal/auth/login` | 200, `portal_token` cookie set, redirect to dashboard |
| `AUTH-002` | Login with wrong password | `POST` | `/portal/auth/login` | 200 (re-render), `{ error: 'Invalid credentials' }` |
| `AUTH-003` | Login with non-existent email | `POST` | `/portal/auth/login` | 200 (re-render), `{ error: 'Invalid credentials' }` |
| `AUTH-004` | Login with suspended account | `POST` | `/portal/auth/login` | 200 (re-render), `{ error: 'Account suspended...' }`, `AuditLog` with `LOGIN_FAILED` |
| `AUTH-005` | Access protected route without token | `GET` | `/portal/admin-staff/dashboard` | 401 or redirect to login |
| `AUTH-006` | Access admin route as Staff role | `GET` | `/portal/admin-staff/dashboard` | 403 |
| `AUTH-007` | First-login password change redirect | `POST` | `/portal/auth/login` | 200, redirect to `/portal/auth/change-password` when `mustChangePassword = true` |
| `AUTH-008` | Password change with weak password | `POST` | `/portal/auth/change-password` | 200 (re-render), `{ error: 'Password must be at least 8 characters' }` |
| `AUTH-009` | SSO token login from Port 3000 | `GET` | `/staff-admin/sso-login?token=...` | `portal_token` cookie set, redirect to admin dashboard |
| `AUTH-010` | SSO with expired token | `GET` | `/staff-admin/sso-login?token=...` | 401 or redirect to login |
| `AUTH-011` | Forgot password request | `POST` | `/portal/auth/forgot-password` | 200, generic success message (no user enumeration) |
| `AUTH-012` | Reset password with valid token | `POST` | `/portal/auth/reset-password/:token` | 200, redirect to login with success message |
| `AUTH-013` | Reset password with expired token | `POST` | `/portal/auth/reset-password/:token` | 200 (re-render), `{ error: 'Invalid or expired reset link...' }` |
| `AUTH-014` | Secure login one-time token | `GET` | `/portal/auth/secure-login/:token` | `portal_token` cookie set, redirect to change-password |
| `AUTH-015` | Secure login reuse (already consumed) | `GET` | `/portal/auth/secure-login/:token` | Redirect to login with error |
| `AUTH-016` | Logout clears cookie | `GET` | `/portal/auth/logout` | `portal_token = 'none'`, redirect to login |

### 12.2 Event Lifecycle Transitions

| ID | Scenario | Precondition | Action | Expected |
|---|---|---|---|---|
| `EVT-001` | Create event in PLANNED state | Authenticated Admin | `POST /portal/admin-staff/assignments` | 200, `lifecycle_state: 'PLANNED'`, `status: 'Active'` |
| `EVT-002` | Transition PLANNED → STAFFING | Event exists, `open_for_applications = true` | Update event | `lifecycle_state: 'STAFFING'` |
| `EVT-003` | Transition STAFFING → READY | `accepted_staff_ids.length >= required_staff_count`, supervisor assigned | Update event | `lifecycle_state: 'READY'` |
| `EVT-004` | Reject STAFFING → READY without supervisor | No supervisor | Update event | 400, validation error |
| `EVT-005` | Reject STAFFING → READY with insufficient staff | `accepted < required` | Update event | 400, validation error |
| `EVT-006` | Transition READY → LIVE | Event date arrived | System/admin trigger | `lifecycle_state: 'LIVE'` |
| `EVT-007` | Transition LIVE → CLOSED | All attendance records have `clock_out` | Complete event | `lifecycle_state: 'CLOSED'`, `status: 'Completed'` |
| `EVT-008` | Transition CLOSED → FINANCE_SETTLED | All payments settled, invoice paid | Settle event | `lifecycle_state: 'FINANCE_SETTLED'` |
| `EVT-009` | Reject backward transition READY → STAFFING | Event in READY | Attempt downgrade | 400, forbidden transition |
| `EVT-010` | Cancel event from PLANNED | Event in PLANNED | Cancel | `status: 'Cancelled'` |
| `EVT-011` | Reject cancel from LIVE | Event in LIVE | Attempt cancel | 400, forbidden |

### 12.3 Clock-In / Clock-Out

| ID | Scenario | Precondition | Action | Expected |
|---|---|---|---|---|
| `CLK-001` | Clock-in within 200m radius | Event LIVE, staff assigned, GPS within 200m | `POST /portal/staff/clock-in` | 200, `Attendance` created, `status: 'Clocked In'` |
| `CLK-002` | Clock-in outside 200m radius | Event LIVE, staff GPS > 200m | `POST /portal/staff/clock-in` | 200, `proximity_denied: true`, `status: 'Proximity Denied'` |
| `CLK-003` | Clock-in with poor GPS accuracy (>100m) | Staff accuracy = 150m | `POST /portal/staff/clock-in` | 400, rejected by `rejectPoorAccuracy` |
| `CLK-004` | Clock-in with selfie | Staff provides selfie photo | `POST /portal/staff/clock-in` | `selfie_url` populated |
| `CLK-005` | Clock-in with device fingerprint | Staff sends `user_agent`, `platform`, `device_id` | `POST /portal/staff/clock-in` | `device_fingerprint` object populated and indexed |
| `CLK-006` | Clock-out triggers payroll | Staff clocked in, attendance record exists | `POST /portal/staff/clock-out` | `total_hours` computed, `StaffPayroll` created, `payroll_generated: true` |
| `CLK-007` | Clock-out creates Transaction + Ledger | Staff clocked out | `POST /portal/staff/clock-out` | `Transaction` (type: `staffPayroll`), `EventLedger` entry created |
| `CLK-008` | Duplicate clock-in rejected | Staff already clocked in for this event today | `POST /portal/staff/clock-in` | 400, duplicate rejected |

### 12.4 Supervisor Operations

| ID | Scenario | Precondition | Action | Expected |
|---|---|---|---|---|
| `SUP-001` | Override proximity denial | Staff proximity denied, supervisor authenticates | Admin/Supervisor override | `proximity_override: true`, `proximity_override_by` set |
| `SUP-002` | Broadcast announcement to team | Team exists, supervisor owns team | `POST /supervisor/teams/:id/communication` | `EventTeamCommunication` created, Socket.io `newTeamMessage` emitted |
| `SUP-003` | Broadcast with invalid message type | Supervisor sends type `invalid_type` | `POST /supervisor/teams/:id/communication` | 400, `{ error: 'Invalid message type' }` |
| `SUP-004` | Request member removal | Supervisor owns team | `POST /supervisor/teams/:id/remove-member` | `ReplacementRequest` created, Socket.io `replacementRequest` emitted to Admin |
| `SUP-005` | Rate staff performance (valid) | Supervisor, rating 1–5 | `POST /supervisor/rate-staff` | `PerformanceReview` created, `AuditLog` entry |
| `SUP-006` | Rate staff with invalid rating | rating = 6 | `POST /supervisor/rate-staff` | 400, `{ error: 'Rating must be between 1 and 5' }` |
| `SUP-007` | Unauthorized team access | Supervisor tries to manage another supervisor's team | Any team route | 403, `{ error: 'Not authorized' }` |

### 12.5 Payments & Financial

| ID | Scenario | Precondition | Action | Expected |
|---|---|---|---|---|
| `FIN-001` | Record client payment | Active booking on Port 3000 | `POST` payment API | `ClientPayment` created, receipt number `EPE-PMT-YYYY-NNNN` |
| `FIN-002` | Generate invoice for event | Event confirmed | Invoice creation | `ClientInvoice` with `EPE-INV-YYYY-NNNN`, services, VAT calculated |
| `FIN-003` | VAT calculation accuracy | Invoice with subtotal = 10000 | Create invoice | `vatAmount = 1600`, `totalAmount = 11600` (16% VAT) |
| `FIN-004` | Send invoice email | Invoice created | Email trigger | `invoiceEmailSentAt` set, email delivered via Brevo |
| `FIN-005` | Create Transaction on client payment | Payment confirmed | Record payment | `Transaction` created, `type: 'clientPayment'`, `direction: 'in'` |
| `FIN-006` | Create EventLedger on client payment | Payment linked to event | Record payment | `EventLedger` entry, `balanceAfter` updated |
| `FIN-007` | Staff payroll auto-generation | Clock-out completed | Clock-out triggers | `StaffPayroll` with `totalPay = basePay + overtime + bonus - deductions` |
| `FIN-008` | ETR generation on event completion | Event CLOSED | Complete event | `EventFinancialSnapshot` created, `etrNumber` set on `ClientInvoice` |
| `FIN-009` | ETR retrieval | ETR exists for event | `getLatestETR(eventId)` | Returns snapshot with `isFinal`, profit calculations |
| `FIN-010` | Expense receipt creation | Admin records expense | Create expense | `ExpenseReceipt` with `EPE-EXP-YYYY-NNNN` |
| `FIN-011` | Event profit calculation | Snapshot created | Compute | `eventProfit = clientPayment - totalExpenses`, `profitMargin` as percentage |
| `FIN-012` | Payment failure handling | M-Pesa STK push fails | Payment attempt | `Transaction.status = 'Failed'`, original amounts unchanged |
| `FIN-013` | Payment reversal | Admin reverses payment | Reverse action | New `Transaction` with `status: 'Reversed'`, counter `EventLedger` entry |

### 12.6 Staff Sync (Inter-Service)

| ID | Scenario | Precondition | Action | Expected |
|---|---|---|---|---|
| `SYNC-001` | Create staff syncs to Port 3001 | Port 3000 running | Create staff on Port 3000 | `POST /internal/sync-staff` called, staff created on Port 3001 |
| `SYNC-002` | Update staff syncs | Staff exists on both ports | Update on Port 3000 | Sync reflects name, email, phone changes |
| `SYNC-003` | Sync failure does not break main flow | Port 3001 down | Create staff on Port 3000 | Staff created on Port 3000 (sync fails silently, 8s timeout) |

### 12.7 Attendance → Payroll Linkage

| ID | Scenario | Precondition | Action | Expected |
|---|---|---|---|---|
| `APL-001` | Clock-out generates payroll record | Staff clocked in, `pay_rate = 500` | Clock out after 4 hours | `StaffPayroll.hoursWorked = 4`, `basePay = 2000` |
| `APL-002` | Attendance links to payroll | Payroll generated | Check attendance | `payroll_id` populated, `payroll_generated = true` |
| `APL-003` | Ledger entry on payroll creation | Payroll created | Check ledger | `EventLedger` with `type: 'staffPayroll'`, `direction: 'out'` |

---

## 13. Constraints

| Constraint | Details |
|---|---|
| **No breaking changes** | All existing API endpoints must continue to function. New fields must have defaults. |
| **Backward compatibility** | `status` field (`Active`/`Completed`/`Cancelled`) must coexist with `lifecycle_state`. |
| **Financial accuracy** | All monetary operations must create dual entries (Transaction + EventLedger). Computed fields must match arithmetic expectations. |
| **Service resilience** | Staff sync failure on Port 3001 must not block Port 3000 operations. 8-second timeout with silent fallback. |
| **Data integrity** | Auto-generated IDs (`EPE-TXN-`, `EPE-INV-`, etc.) must be unique and sequential. |
| **Security** | All protected routes validate JWT. CSRF on all form submissions. Passwords hashed with bcrypt (10 rounds). No user enumeration on forgot-password. |
| **GPS accuracy** | Clock-in rejected if GPS accuracy > 100m. Proximity denied if distance > 200m from geo anchor. |

---

## 14. Future Enhancements

| Feature | Phase | Description |
|---|---|---|
| AI Event Prediction | Future | ML-based demand forecasting and staff allocation optimization |
| Live Command Center | Phase 12 | Real-time admin ↔ supervisor dashboard during active events |
| Staff Rating System | Phase 10 | Leaderboard, quarterly awards, performance badges |
| Financial Analytics Dashboard | Phase 13 | Revenue trends, profit margins, payment velocity, KPI tracking |
| Client Portal | Phase 15 | Client self-service: view bookings, invoices, event photos, submit feedback |
| Mobile Application | Phase 16 | Native app with push notifications, GPS clock-in, live event management |
| PSP Integration | Phase 13 | Payment service provider for automated B2C (payroll) and C2B (client) flows |
| Post-Event Surveys | Phase 11 | Automated staff/supervisor/client survey dispatch and aggregation |
| Auto-Replacement | Phase 8 | Nearest available staff auto-assigned when assigned staff cancels |

---

## 15. Appendix — ID Format Reference

| Entity | Format | Example |
|---|---|---|
| Booking Reference | `EPE-{timestamp}` | `EPE-1710720000000` |
| Transaction | `EPE-TXN-{YYYY}-{0001}` | `EPE-TXN-2026-0042` |
| Event Ledger | `EPE-LDG-{YYYY}-{0001}` | `EPE-LDG-2026-0107` |
| Client Invoice | `EPE-INV-{YYYY}-{0001}` | `EPE-INV-2026-0015` |
| Staff Payroll | `EPE-PAY-{YYYY}-{0001}` | `EPE-PAY-2026-0089` |
| Expense Receipt | `EPE-EXP-{YYYY}-{0001}` | `EPE-EXP-2026-0003` |
| Financial Snapshot | `EPE-SNP-{YYYY}-{0001}` | `EPE-SNP-2026-0012` |
| Client Payment Receipt | `EPE-PMT-{YYYY}-{0001}` | `EPE-PMT-2026-0034` |

---

*This document is authoritative and self-contained. All schemas, routes, and test scenarios are derived from the production codebase as of March 2026.*
