# Emerald Pearland Events Platform - MCP Specification

## 1. SYSTEM MAP

### Architecture Overview
The Emerald Platform operates on a dual-process, event-driven architecture designed to isolate client-facing/administrative operations from live field staff operations. The systems communicate asynchronously via Redis (BullMQ) and securely via short-lived SSO JWTs.

**Core Services:**
- **Main Admin + Client System (Port 3000):** Handles public bookings, CRM, invoicing, client portal access, and primary administrative duties.
- **Staff Operations System (Port 3001):** Dedicated portal for field staff, supervisors, and operations managers. Handles dispatch, GPS clock-ins, and field reporting.
- **MongoDB Database:** Central persistent storage with transactional capabilities and geospatial indexing.
- **Redis Server:** Powers BullMQ (asynchronous job queues for emails, notifications, payments) and socket.io pub/sub adapters.

**Data Flow & Boundaries:**
- The Main System (3000) creates `Bookings` which generate `Events`.
- The Main System assigns staff to events.
- The Staff System (3001) consumes these assignments, tracking attendance (`StaffAttendance`) using HTML5 Geolocation validated against the event coordinates.
- Cross-portal navigation utilizes an SSO bridge: short-lived tokens exchange identity without exposing long-lived auth cookies between the differing domain layers.

---

## 2. DOMAIN MODELS

### `User` (Admin / Client / Staff)
- **Fields:** `name`, `email`, `password` (hashed), `role` (Super Admin, Admin, Client, Supervisor, Staff, Finance), `phone`, `status`.
- **Staff-specific:** `hourlyRate`, `skills`, `currentLocation` (GeoJSON Point).

### `Booking`
- **Fields:** `clientId` (Ref), `serviceType`, `eventDate`, `location` (address + GeoJSON), `status`, `totalAmount`, `depositPaid`.
- **Lifecycle:** `PENDING` → `CONFIRMED` → `COMPLETED` → `CANCELLED`.

### `Event` (Derived from confirmed Bookings)
- **Fields:** `bookingId` (Ref), `date`, `venueCoordinates` (GeoJSON Point), `status`.
- **Lifecycle states:** `PLANNED` → `STAFFING` → `READY` → `LIVE` → `COMPLETED` → `FINANCE_SETTLED`.

### `StaffAssignment`
- **Fields:** `eventId` (Ref), `staffId` (Ref), `role` (e.g., Security, Server), `shiftStart`, `shiftEnd`, `status` (`PENDING`, `ACCEPTED`, `REJECTED`, `COMPLETED`).

### `StaffAttendance`
- **Fields:** `assignmentId` (Ref), `clockInTime`, `clockOutTime`, `clockInLocation` (GeoJSON), `clockOutLocation` (GeoJSON), `selfieUrl`.
- **Constraints:** `clockInLocation` must be within 500m of Event `venueCoordinates` or the Supervisor's live location.

### `PaymentTransaction` (Double-Entry Ledger)
- **Fields:** `bookingId` (Ref), `amount`, `currency`, `type` (`CREDIT`, `DEBIT`), `mpesaReceiptNumber`, `status` (`PENDING`, `SUCCESS`, `FAILED`).
- **Idempotency:** Protected by `IdempotencyLock` collection to prevent duplicate MPESA IPN processing.

### `EventLedger`
- **Fields:** `eventId` (Ref), `totalRevenue`, `totalExpenses` (Staff payroll + logistics), `netProfit`, `status`.

---

## 3. API SURFACE MAP

### Port 3000 (Admin + Client System)

**Auth Domain**
- `POST /auth/login` - Admin/Client login. Sets `admin-token` or `client-token` HttpOnly cookie.
- `GET /auth/sso/generate` - Generates a short-lived cross-portal JWT.

**Bookings Domain**
- `POST /api/bookings` - (Client) Create a new booking.
- `GET /api/admin/bookings` - (Admin) List all bookings.
- `PUT /api/admin/bookings/:id/status` - (Admin) Update booking status.

**Financial Domain**
- `POST /api/payments/mpesa/callback` - (Public) MPESA Daraja IPN webhook.
- `GET /api/admin/finance/ledger` - (Admin) View double-entry ledgers.

### Port 3001 (Staff System)

**Auth & SSO Domain**
- `POST /auth/staff/login` - Staff standard login. Sets `staff_token` cookie.
- `GET /auth/sso/consume?token=...` - Consumes SSO token from Port 3000 to instantly log in a user (e.g., Admin switching to Staff view).

**Staff Operations Domain**
- `GET /api/staff/assignments` - List upcoming shifts for the authenticated staff member.
- `POST /api/staff/attendance/clock-in` - Submit clock-in. Requires `latitude`, `longitude`, and `selfie` data.

---

## 4. AUTHENTICATION & SECURITY MODEL

**JWT & Cookie Strategy:**
- Tokens are stored in **HttpOnly, Secure, SameSite=Strict cookies**.
- There are distinct token namespaces to prevent privilege escalation:
  - `admin-token` (Port 3000 - Admins)
  - `client-token` (Port 3000 - Clients)
  - `staff_token` (Port 3001 - Staff)
- **Token Revocation:** User models track a `tokenVersion`. If a user's permissions are revoked, `tokenVersion` is incremented, immediately invalidating existing JWTs upon the next request middleware check.

**SSO Bridge Flow:**
1. Admin on Port 3000 clicks "Switch to Staff Portal".
2. Port 3000 generates a 30-second JWT payload containing the user ID and target role.
3. Client redirects to `http://localhost:3001/auth/sso/consume?token={JWT}`.
4. Port 3001 verifies the JWT signature (using a shared internal secret), issues a `staff_token` cookie, and redirects to the staff dashboard.

**Security Middleware:**
- Helmet for CSP and headers.
- Express Rate Limiters (`/auth` is strictly limited).
- HMAC signing for internal service-to-service calls (if synchronous fallback is required).

---

## 5. EVENT LIFECYCLE ENGINE

1. **PLANNED:** A Client pays a deposit. The `Booking` transitions to `CONFIRMED`, generating an `Event`.
2. **STAFFING:** Admins assign staff to the event.
3. **READY:** Constraints Check: Minimum required staff have `ACCEPTED` their assignments.
4. **LIVE:** Triggered when the first staff member successfully clocks in (requires 500m geolocation validation). Socket.io broadcasts status to the Admin dashboard.
5. **COMPLETED:** Triggered when the Supervisor clocks out the event, or all staff clock out.
6. **FINANCE_SETTLED:** Automated BullMQ job calculates total payroll based on hours worked * staff `hourlyRate`, writes to `EventLedger`, and marks the event financials as closed.

---

## 6. FINANCIAL SYSTEM MODEL

- **Strict Double-Entry:** Every MPESA payment creates a `PaymentTransaction`. Revenue is credited, while staff payouts and expenses are debited.
- **Idempotency:** The MPESA callback is notoriously unreliable (network retries). Before processing an IPN, an atomic `IdempotencyLock` document is created using the `mpesaReceiptNumber`. If the lock exists, the request is safely ignored (200 OK sent to Safaricom).
- **Payroll Calculation:** At the `COMPLETED` stage, a worker process queries `StaffAttendance`, calculates `duration = clockOutTime - clockInTime`, and multiplies by the user's `hourlyRate`.

---

## 7. REAL-TIME SYSTEM (Socket.io)

- Connected to Redis adapter to allow scaling across multiple Node processes.
- **Namespaces:**
  - `/admin`: Receives live updates on booking status changes, payment IPN receipts, and staff clock-ins.
  - `/staff`: Live location tracking (Supervisors can see staff approaching the venue).
- **Security:** Socket connections require the client to pass their JWT in the initial handshake payload, which is verified before connection is established.

---

## 8. AUTOMATION & NOTIFICATIONS (BullMQ)

- Synchronous operations are strictly limited to HTTP responses. All side-effects happen in BullMQ.
- **Queues:**
  - `email-queue`: Sends booking confirmations, invoices, and password resets.
  - `notification-queue`: In-app notification creation.
  - `payment-recovery-queue`: Sweeps for `PENDING` bookings older than 30 minutes to check MPESA status or release the calendar slot.
- Workers run independently of the web servers, listening to Redis.

---

## 9. KNOWN COMPLETED VS MISSING FEATURES

**Completed (Production Ready):**
- Dual-port architecture with SSO bridge.
- Strict JWT HttpOnly authentication and Role-based middleware.
- API Contract tests (isolated and atomic).
- BullMQ integration for background tasks.
- Idempotency locks for payment processing.

**Partially Implemented:**
- **MPESA Daraja Integration:** API routes exist, but full OAuth token caching and B2C (Business to Customer) payroll payouts are mock/stubbed.
- **Staff Selfie Clock-in:** Geolocation math works, but actual image upload to S3/Cloudinary is pending (currently accepts base64 dummy data).

**Not Implemented:**
- **WhatsApp Bot Integration:** Planned for notifying staff of shifts, but no webhook handlers exist yet.
- **Advanced Shift Swapping:** Staff cannot trade shifts autonomously.

---

## 10. DEBUGGING GUIDE

**1. Tracing a Booking:**
- Check Port 3000 logs: `cat logs/app-3000.log | grep <bookingId>`
- Verify background jobs in Redis BullMQ UI.
- If a booking isn't confirming after payment, check the `IdempotencyLock` collection in MongoDB to see if the IPN failed mid-process.

**2. Debugging Staff Clock-In Failures:**
- Geolocation issues are the #1 cause. Ensure the browser/device has location permissions enabled.
- The 500m constraint is calculated using MongoDB `$geoNear` or turf.js. Check the `venueCoordinates` of the Event. If they are `[0,0]`, clock-in will always fail.

**3. Financial Audits:**
- If an `EventLedger` shows incorrect net profit, query the `PaymentTransaction` collection. Ensure the sum of credits minus debits equals the ledger total. The double-entry logic ensures no money "vanishes".

---

## 11. EXTENSION GUIDE

- **Adding a New Role:** Add the role string to the `roles` enum in the `User` model. Update the `authorize(['SuperAdmin', 'NewRole'])` middleware where applicable.
- **Adding a New Notification Channel (e.g., SMS):** Do not add this to the web request cycle. Create a new worker in `queue/workers/smsWorker.js`, and push jobs to it from the controller: `smsQueue.add('send', { phone, message })`.
- **Adding a Payment Provider (e.g., Stripe):** Implement a new route for the Stripe Webhook. Ensure you wrap the processing logic in the `IdempotencyLock` utility using the Stripe Event ID.
