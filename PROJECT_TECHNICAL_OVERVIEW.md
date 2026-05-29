# Emerald Pearland Events Platform - Technical Overview

Generated: 2026-04-23

## 1. Project Overview

This codebase is a dual-portal event operations platform with two primary web applications:

1. Admin Portal (main server, port 3000)
2. Staff Portal (staff-system server, port 3001)

At a high level, the platform handles public event bookings, internal operations, customer/client self-service, staffing workflows, attendance, payroll/finance, and real-time command-center communication.

Primary runtime entry points:

- [server-prod.js](server-prod.js)
- [staff-system/server.js](staff-system/server.js)
- [ecosystem.config.js](ecosystem.config.js)

Architecture type:

- Distributed modular monolith (two Express apps sharing MongoDB and internal sync APIs)

---

## 2. Folder & File Structure

Major directories and purpose:

- [server](server): Main backend internals (routes, models, middleware, services, jobs, utils)
- [staff-system](staff-system): Staff operations backend + views + financial domain modules
- [modules](modules): Extracted domain modules for bookings and payments
- [admin](admin): Static admin HTML/JS pages
- [views](views): Main server EJS templates (client/admin/staff/supervisor/email/pdf)
- [public](public): Main server static assets
- [staff-system/public](staff-system/public): Staff-system static assets
- [config](config): Shared infra configs (queues)
- [shared](shared): Shared config/middleware/utils fragments
- [tests](tests): Jest tests for contracts, APIs, payments, bookings, finance

---

## 3. Backend Architecture

Frameworks/libraries:

- Node.js, Express, Mongoose
- EJS + express-ejs-layouts
- JWT auth, Passport (Google OAuth)
- Socket.IO
- BullMQ (optional async mode), Redis (optional)
- node-cron
- helmet, cors, express-rate-limit, express-mongo-sanitize

Main API mounts (main server):

- Health: [server/routes/health.routes.js](server/routes/health.routes.js)
- Admin API: [server/routes/adminRoutes.js](server/routes/adminRoutes.js)
- Security API: [server/routes/security.routes.js](server/routes/security.routes.js)
- Booking/public API: [server/routes/bookingRoutes.js](server/routes/bookingRoutes.js)
- Client portal routes/API: [server/routes/clientPortalRoutes.js](server/routes/clientPortalRoutes.js)
- Admin command center: [server/routes/adminCommandCenterRoutes.js](server/routes/adminCommandCenterRoutes.js)

Staff-system mounts:

- Auth: [staff-system/routes/auth.js](staff-system/routes/auth.js)
- Admin split routers: [staff-system/routes/adminDashboardRoutes.js](staff-system/routes/adminDashboardRoutes.js), [staff-system/routes/adminStaffRoutes.js](staff-system/routes/adminStaffRoutes.js), [staff-system/routes/adminEventsRoutes.js](staff-system/routes/adminEventsRoutes.js), [staff-system/routes/adminFinanceRoutes.js](staff-system/routes/adminFinanceRoutes.js), [staff-system/routes/adminReportsRoutes.js](staff-system/routes/adminReportsRoutes.js)
- Legacy admin routes still mounted: [staff-system/routes/admin.js](staff-system/routes/admin.js)
- Staff routes: [staff-system/routes/staff.js](staff-system/routes/staff.js)
- Supervisor routes: [staff-system/routes/supervisor.js](staff-system/routes/supervisor.js)

---

## 4. Authentication & Authorization

Admin Portal auth:

- Login issues JWT in httpOnly cookies adminToken + portal_token via [server/routes/adminRoutes.js](server/routes/adminRoutes.js)
- Verification middleware: [server/middleware/adminAuth.js](server/middleware/adminAuth.js)
- Token expiry: 24h

Staff Portal auth:

- Login sets staff_portal_token + legacy portal_token in [staff-system/controllers/authController.js](staff-system/controllers/authController.js)
- Route guards in [staff-system/middleware/auth.js](staff-system/middleware/auth.js)
- Role checks with authorize middleware (Admin/Super Admin/Supervisor/Staff)

Client Portal auth:

- Access token in client_token cookie
- Refresh tokens hashed in [server/models/ClientSession.js](server/models/ClientSession.js)
- Auth service in [server/services/clientAuthService.js](server/services/clientAuthService.js)

SSO between portals:

- Main admin issues nonce-backed SSO token in [server-prod.js](server-prod.js)
- Staff system exchanges nonce at /admin/sso-exchange and starts session in [staff-system/server.js](staff-system/server.js)

---

## 5. Database Design

Database:

- MongoDB + Mongoose

Main server model set (examples):

- Admin, Booking, Customer, Staff, PricingSettings, Gallery, Testimonial
- ClientAccount, ClientSession, ClientAuditLog, ClientEmailLog, ClientPayment, ClientETR
- SecurityEvent, Analytics, AdminNotification

Staff-system model set (examples):

- Staff, Assignment, Attendance, EventTeam, EventTeamCommunication
- Transaction, EventLedger, StaffPayroll, ExpenseReceipt
- EmergencyOtp, EmergencyFundAudit, BiometricSession
- PerformanceReview, Survey, LiveMessage, SupervisorNotification

Key relationships:

- Booking.customerId -> Customer
- Booking.assignedStaff/supervisor -> Staff
- Assignment staff/supervisor arrays -> Staff
- Attendance -> Staff + Assignment + Payroll
- EventLedger -> Assignment + Transaction history

Indexing strategy:

- Booking indexes for status/date/sync/payment idempotency
- Assignment indexes for payment state and idempotency
- TTL indexes for sessions/challenges/OTP
- Geo indexes for attendance and staff location checks

---

## 6. Real-Time & Events

Socket.IO is initialized in:

- [staff-system/config/socket.js](staff-system/config/socket.js)

Core real-time channels/events:

- Admin <-> Supervisor live messaging
- Emergency flags + acknowledgements
- Live metrics and attendance updates
- Team room communications
- Finance/live telemetry emits from ledger and jobs

---

## 7. Business Logic

Core workflow highlights:

1. Booking intake and validation from public endpoint in [server/routes/bookingRoutes.js](server/routes/bookingRoutes.js)
2. Booking/customer persistence and admin notifications
3. Staff-system synchronization via internal endpoints
4. Payment processing with callback normalization + idempotent handling in [modules/payments/payments.service.js](modules/payments/payments.service.js)
5. Staff assignment/attendance/supervisor lifecycle management in staff routes/controllers
6. Double-entry style event ledger updates in [staff-system/financials/services/ledgerService.js](staff-system/financials/services/ledgerService.js)

---

## 8. Frontend Structure

Rendering and frontend composition:

- Main admin pages are static HTML in [admin](admin)
- Client and staff-facing pages are EJS templates in [views](views) and [staff-system/views](staff-system/views)
- Shared static assets in [public](public) and [staff-system/public](staff-system/public)
- Service workers present in both systems for PWA-style behavior

---

## 9. API Design

Main endpoint groups:

- /api/v1 (bookings/public)
- /api/v1/admin (admin APIs)
- /api/v1/admin/security (security center)
- /client and /api/v1/client (client portal views/APIs)
- /portal/* (staff portal auth/admin/staff/supervisor/finance)
- /internal/* (cross-service synchronization)

External integrations:

- M-Pesa
- Google OAuth
- Cloudinary
- Web Push
- Email providers

---

## 10. Security Analysis

Implemented protections:

- JWT-based auth across all portals
- bcrypt password hashing
- Helmet, CORS allowlist, rate limiting, sanitize middleware
- CSRF protections in client/staff portal browser flows
- Security logging + audit trails + environment boot checks

Notable risk areas identified during analysis:

1. Public booking read/update routes exist without explicit auth in [server/routes/bookingRoutes.js](server/routes/bookingRoutes.js)
2. Internal sync header mismatch observed in booking webhook flow vs receiver expectations
3. Staff auth accepts fallback secret (broad trust surface)
4. M-Pesa callbacks are public and rely on payload handling without source-signature verification

---

## 11. Performance & Scalability

Current strengths:

- Good indexing on critical collections
- Queue abstraction supports async mode
- Compression and structured logging enabled

Likely bottlenecks:

- Refresh token validation currently scans active sessions and compares hashes iteratively
- Cross-service sync can create coupling and retry pressure during partial outages
- Legacy and split-route overlap increases maintenance complexity

---

## 12. DevOps & Config

Deployment/runtime shape:

- PM2 dual-process config in [ecosystem.config.js](ecosystem.config.js)
- Netlify proxies dynamic routes to backend in [netlify.toml](netlify.toml)
- Main server default port 3000, staff server default port 3001

Environment management:

- Required env validation in [scripts/checkEnv.js](scripts/checkEnv.js)
- Example env templates in [.env.example](.env.example) and [.env.production.example](.env.production.example)

---

## 13. Known Gaps / Incomplete Areas

Observed partial or TODO areas:

- Legacy staff admin routes remain mounted alongside split domain routers
- Some route TODO markers remain (example: payments export route comment)
- Client health limiter fallback no-op due missing limiter implementation
- Some staff-system services and sync pathways still have transitional logic

---

## 14. Summary

System strengths:

- Broad feature coverage across booking, CRM, staffing, attendance, finance, and client self-service
- Clear separation between main and staff operations servers
- Mature middleware/security baseline and strong finance-ledger discipline

System weaknesses:

- Security consistency gaps on selected routes/integration edges
- Operational coupling from HTTP sync between apps
- Mixed legacy/new route structure in staff-system

Overall architecture assessment:

- Technically capable and feature-rich, but requires targeted hardening and cleanup to reduce security and operational risk.
