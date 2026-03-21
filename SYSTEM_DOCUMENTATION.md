# Emerald Pearland Events - System Documentation

Welcome to the official system documentation for the **Emerald Pearland Events** platform. This guide is designed for developers, system administrators, and technical staff to understand the architecture, data flow, deployment, and management of the three interconnected web applications that power the business.

---

## 1. System Overview

Emerald Pearland Events operates a luxury event planning ecosystem consisting of three primary applications:

1. **Client Site (emeraldpearlandevents.netlify.app)**
   - The public-facing landing page and client portal.
   - Handles event booking requests, portfolio galleries, client testimonials, and basic contact forms.
   - Hosted statically / serverlessly on Netlify.

2. **Admin Portal (emeraldpearlandevents.onrender.com)**
   - The core operational hub for business owners and management.
   - Handles booking approvals, staff directory management, gallery uploads, and testimonial moderation.
   - Manages client interactions, analytics, and primary email notifications.
   - Hosted on Render.

3. **Staff Portal (emerald-staff-system.onrender.com)**
   - The dedicated workforce management system.
   - Supports role-based access for Admin, Supervisors, and general Staff.
   - Manages assignments, attendance tracking, shift telemetry, and payments.
   - Features the **PEARL AI Secretary** and real-time push notifications.
   - Hosted on Render (operated independently from the Admin Portal to ensure isolation and security).

---

## 2. Architecture Diagram

```text
+-----------------------+       +-------------------------+       +------------------------+
|    CLIENT SITE        |       |    ADMIN PORTAL         |       |    STAFF PORTAL        |
|  (Netlify Hosted)     |       |   (Render Hosted)       |       |   (Render Hosted)      |
|                       |       |                         |       |                        |
| - Booking Forms       |====>> | - Booking Management    |====>> | - Assignment Auto-Gen  |
| - Galleries           | (API) | - Invoicing & eTIMS     | (Sync)| - Push Notifications   |
| - Testimonials        |       | - Staff Management      |       | - Attendance/Payments  |
| - Client Self-Service |       | - Analytics Dashboard   |<<==== | - Shift Telemetry      |
|                       |       | - Settings              | (SSO) | - PEARL AI Secretary   |
+-----------+-----------+       +------------+------------+       +-----------+------------+
            |                                |                                |
            |                          +-----+-----+                          |
            +==========================| MONGODB   |==========================+
                                       | ATLAS Cluster|
                                       +-----------+

[External Services]
- Cloudinary: Holds immutable assets (Gallery photos, Staff profile pictures)
- Brevo/SMTP: Transactional Emails (Invoices, Approvals)
- Web Push (VAPID): Browser-based push to Staff/Supervisors
- Gemini 2.5 API: Powers the PEARL AI Secretary inside the Staff Portal
- M-Pesa Daraja: Handles automated B2C and C2B payments
```

---

## 3. User Roles & Permissions

The system enforces strict RBAC (Role-Based Access Control) to ensure data privacy and operational security.

### 1. Admin
- **Access:** Admin Portal & Staff Portal (via SSO).
- **Permissions:** Full system read/write. Can modify settings, approve bookings, suspend staff, issue payments, view all shift telemetry, and configure PEARL AI parameters.

### 2. Supervisor
- **Access:** Staff Portal only (Supervisor Dashboard).
- **Permissions:** Can view assigned team details, rate staff performance (ushers), chat in live event boards, flag emergencies, and view specific event shift rosters.

### 3. Staff (Ushers, Brand Ambassadors, Ticketing Agents)
- **Access:** Staff Portal only (Staff Dashboard).
- **Permissions:** Can view available job postings, accept/decline assigned events, clock in/out (geolocation verification), view personal earnings, and update their profile/photo.

### 4. Client
- **Access:** Client Site / Portal.
- **Permissions:** Can view personal bookings, download receipts/invoices, view event galleries, and submit testimonials.

---

## 4. Feature Documentation

### Dual Authentication System
The Admin Portal and Staff Portal use entirely separate JWT configurations. An Admin token cannot be used to natively hit Staff API endpoints except through the authorized **SSO Bridge**.

### Single Sign-On (SSO) Bridge
Admins securely jump from the Admin Portal to the Staff Portal without re-authenticating. The Admin portal generates a short-lived (2 min) signed JWT using a shared secret. The Staff portal intercepts this at `/staff-admin/sso-login`, verifies it, and grants a portal session.

### Automatic Assignment Creation
When a client booking is approved in the Admin Portal, an internal webhook securely pings the Staff Portal. This automatically generates a corresponding `Assignment` record, calculates required staff based on the package, and dispatches Push Notifications to available staff.

### Cloudinary Integration
Because Render uses ephemeral storage (files wipe on redeploy), all uploads (gallery events, profile photos, receipts) are piped directly to Cloudinary. References are saved in MongoDB as URLs.

### Shift Telemetry (Geolocation)
When Staff clock in or out via the Staff portal, the browser requests GPS coordinates. The backend calculates distance using the Haversine formula against the fixed event location to ensure staff are on-site.

---

## 5. API Endpoints Reference

*Note: This is a high-level overview of core routes.*

### Admin Portal Routes (`emeraldpearlandevents.onrender.com`)
- `GET /admin` - Admin dashboard rendering.
- `GET /admin/bookings` - View all client bookings.
- `POST /api/admin/bookings/:id/approve` - Approve a booking.
- `GET /admin/staff-operations-sso` - Generates token and redirects to Staff system.

### Staff Portal Routes (`emerald-staff-system.onrender.com`)
**Auth & Setup**
- `POST /portal/auth/login` - Staff/Supervisor standard login.
- `GET /staff-admin/sso-login?token=` - Consumes SSO token from Admin server.
- `POST /internal/sync-staff` - Webhook. Called by Admin portal when a new staff member is added to sync records.

**Assignments & Workflow**
- `POST /portal/admin-staff/assignments` - Create new event assignment.
- `PUT /portal/staff/assignments/:id/response` - Staff applies, accepts, or declines an assignment.
- `POST /portal/staff/attendance/clock-in` - Submits GPS coords to verify shift start.

**AI Integration**
- `POST /api/ai/chat` - Interact with PEARL AI Secretary.

---

## 6. Environment Variables Required

Each environment requires specific `.env` configurations.

### Admin Portal (`.env`)
```env
NODE_ENV=production
PORT=3000
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/test
JWT_SECRET=your_admin_jwt_secret_min_64_chars
SSO_JWT_SECRET=shared_secret_for_sso_bridge
SYNC_SECRET=shared_secret_for_staff_synchronization
STAFF_SYSTEM_BASE_URL=https://emerald-staff-system.onrender.com
BREVO_API_KEY=your_brevo_api_key
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

### Staff Portal (`staff-system/.env`)
```env
NODE_ENV=production
PORT=3001
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/emerald
STAFF_JWT_SECRET=your_staff_jwt_secret_min_64_chars
SSO_JWT_SECRET=shared_secret_for_sso_bridge
SYNC_SECRET=shared_secret_for_staff_synchronization
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_EMAIL=mailto:admin@emeraldpearlandevents.com
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_B2C_SHORT_CODE=your_shortcode
MPESA_B2C_RESULT_URL=https://emerald-staff-system.onrender.com/portal/admin-staff/mpesa/callback
GEMINI_API_KEY=your_gemini_api_key
```

---

## 7. Deployment & Troubleshooting

### Deployment Guide
1. **Client Site (Netlify):** Push to target branch. Netlify auto-builds. Ensure `ADMIN_BASE_URL` points to Render.
2. **Backends (Render):** Push to GitHub. Render triggers webhook. Ensure `SSO_JWT_SECRET` and `SYNC_SECRET` are identical across both Admin and Staff environments, otherwise SSO and sync will fail.

### Troubleshooting
- **SSO Token Invalid:** Mismatched `SSO_JWT_SECRET` or extreme latency (>2 mins).
- **Staff Not Syncing:** Mismatched `SYNC_SECRET` or Admin's `STAFF_SYSTEM_BASE_URL` is wrong.
- **Photos Missing:** Ensure `CLOUDINARY_URL` is set, since Render disks are ephemeral.
- **M-Pesa Timeout:** Instance spun down (free tier) or network block.

---

## 8. PEARL AI Assistant Guide

**PEARL** is the integrated Business Assistant powered by Google Gemini 2.5 Flash, available in the Staff Portal for Admins.

### Capabilities
- **Business Reporting:** Fetch live revenue, upcoming event statuses, and staff metrics. 
- **Persistent Memory:** PEARL retains context of past commands.
- **Action Execution:** Can dispatch emails securely.

### Technical Integration
- Route `POST /api/ai/chat` handles prompts.
- Employs strict rate limiting and Input Validation to prevent Prompt injections.
- Connects securely via `GEMINI_API_KEY`.

---

## Data Models

### Assignment
```
title, description, location, date, start_time, end_time
pay_rate, vip_flag, dress_code, special_instructions
gps_location: { lat, lng }
required_staff_count (default: 1)
open_for_applications (default: false)
supervisor_id → Staff
assigned_staff_ids → [Staff]
accepted_staff_ids → [Staff]
declined_staff_ids → [Staff]
status: Active | Completed | Cancelled
payment_status: Pending | Paid | Disputed
createdByAdmin → Staff
```

### Staff (port 3001)
```
name, email, password (hashed)
role: Admin | Supervisor | Staff
status: Active | Suspended | Inactive
availability_status: Available | Busy | Not Available | On Leave
supervisor_id → Staff
photo_url
mustChangePassword (boolean)
```

### Staff (port 3000)
```
name, email, phone, whatsapp
category (Ushers, Brand Ambassadors, Supervisors, etc.)
photo (base64)
isAvailable, hourlyRate
```

### AuditLog
```
actionType, targetModel, targetId
performedBy → Staff
details, ipAddress, timestamp
```

---

## Staff Workflow

### New Staff Onboarding
1. Admin adds staff on port 3000 (name, email, category, photo)
2. Sync automatically creates account on port 3001 with temp password = email
3. Staff logs in at `http://localhost:3001/portal/auth/login`
4. System prompts password change on first login
5. Staff sets strong password (min 8 chars, uppercase, number, special char)

### Event Assignment Workflow
1. Admin creates event with required staff count
2. Admin opens applications (door icon toggle)
3. Push notification sent to all available staff
4. Staff see event in "Available Events" on dashboard
5. Staff click Apply → added to `assigned_staff_ids`
6. Once required number reached, applications auto-close
7. Staff Accept/Decline from Pending section
8. Admin views acceptance status via staff count button
9. Admin assigns supervisor
10. Event shows "Fully Staffed" badge when accepted ≥ required

---

## Environment Variables

### Root `.env` (Port 3000)
```env
MONGO_URI=mongodb+srv://...@cluster0.wa8samz.mongodb.net/test
JWT_SECRET=your_secret
SSO_JWT_SECRET=your_sso_secret
STAFF_SYSTEM_BASE_URL=http://localhost:3001
BREVO_API_KEY=your_brevo_key
```

### `staff-system/.env` (Port 3001)
```env
MONGO_URI=mongodb+srv://...@cluster0.wa8samz.mongodb.net/emerald
JWT_SECRET=super_strong_emerald_production_secret_39fk29fk27
JWT_EXPIRE=30d
PORT=3001
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=mailto:test@example.com
```

---

## Security

- **CSRF Protection**: `csurf` middleware on all `/portal` routes
- **JWT Authentication**: Short-lived tokens for SSO, long-lived for sessions
- **Password Hashing**: `bcryptjs` with salt rounds
- **Rate Limiting**: Applied on auth routes
- **Mongo Sanitization**: `express-mongo-sanitize` on all inputs
- **Helmet**: Security headers on all responses
- **Method Override**: Supports PUT/DELETE via POST forms

---

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | v25.6.1 | Runtime |
| Express.js | ^4.x | Web framework |
| MongoDB Atlas | Cloud | Database |
| Mongoose | ^7.0.0 | ODM |
| EJS | ^3.x | Templating |
| Socket.io | ^4.x | Real-time |
| bcryptjs | ^2.x | Password hashing |
| jsonwebtoken | ^9.0.3 | JWT auth |
| csurf | ^1.11.0 | CSRF protection |
| multer | ^1.x | File uploads |
| method-override | ^3.x | HTTP method override |
| nodemon | ^3.x | Dev auto-restart |

---

## Development Setup

```powershell
# Terminal 1 — Port 3000
cd "C:\My Web Sites\school\live.themewild.com\emerald"
npm run dev

# Terminal 2 — Port 3001
cd "C:\My Web Sites\school\live.themewild.com\emerald\staff-system"
node server.js
```

### Access URLs
| URL | Purpose |
|-----|---------|
| `http://localhost:3000/admin` | Main admin panel |
| `http://localhost:3001/portal/auth/login` | Staff portal login |
| `http://localhost:3001/portal/admin-staff/dashboard` | Staff ops admin |
| `http://localhost:3001/portal/staff/dashboard` | Staff dashboard |

---

## Full Feature Roadmap

### ✅ Phase 1 — Shared Infrastructure (Complete)
- [x] Shared MongoDB connection utility
- [x] GPS Haversine utility with spoof detection
- [x] Role-based middleware

### ✅ Phase 2 — SSO Bridge (Complete)
- [x] JWT-based SSO from port 3000 → port 3001
- [x] Portal token cookie management
- [x] SSO audit logging

### ✅ Phase 3 — Staff Operations Admin Tabs (Complete)
- [x] Workforce Dashboard with live metrics
- [x] Staff Management — add, edit, suspend, assign supervisor
- [x] Staff sync port 3000 → port 3001
- [x] Events/Assignments tab with GPS, staff assignment, accept/decline
- [x] Open/close applications toggle with push to staff portal
- [x] Staff self-service portal — apply, accept, decline events
- [x] Staff profile photo upload
- [x] First-login password change with strength rules
- [x] Fix profile update form actions
- [x] Fix assignments.ejs syntax error
- [x] Accept/decline fully working end-to-end

### ✅ Phase 4 — Staff Categories & Roles
- [x] **Remove "Waiters"** category entirely
- [x] Add categories: `Ushers`, `Brand Ambassadors (BA)`, `Supervisors`, `Event Planners`, `Event Organisers`, `Wedding Planners`, `Ticketing Agents`
- [x] Toggle switches per category in main admin panel
- [x] Update staff portal to reflect new categories
- [x] Staff profile photo clickable — opens interactive card with:
  - Full photo, name, role, contact
  - Quick actions: WhatsApp, email, call

### ✅ Phase 5 — Booking & Packaging
- [x] **Rename "Booking" page → "Packaging"** throughout
- [x] Each event has its own defined package
- [x] Client specifies staff count → system auto-selects assignment
- [x] Admin can override staff selection in assignment
- [x] Assignment save → auto-sync to staff portal
- [x] Add M-Pesa number field to payment section

### ✅ Phase 6 — Payments, Invoices & eTIMS
- [x] Fix booking payment edit (amount paid + completion status)
- [x] Admin marks payment complete → client auto-notified
- [x] Payment reminder notifications to client
- [x] **Auto invoice generation** on payment completion:
  - PDF invoice generated and sent to client email
  - Invoice saved in admin panel per client
- [x] **Receipt generation** after payment confirmation
- [x] **eTIMS integration** — tax-compliant invoice:
  - Generated for client and admin
  - Sent to client email
  - Printable PDF format
  - Saved in admin portal
- [x] Client rating in admin portal
- [x] Client feedback viewable and editable from admin

### ✅ Phase 7 — Event Planners & External Contacts
- [x] New section in main admin: Event Planners / Organisers / Wedding Planners
- [x] Fields: name, company, email, phone, WhatsApp, specialisation, notes
- [x] Searchable, filterable contact directory
- [x] Link planners to specific bookings
- [x] Quick-contact buttons per contact card

### ✅ Phase 8 — Push Notifications & Automation
- [x] Push notification to all available staff on new job posting
  - Includes: event name, date, reporting time, pay rate
  - Tap → staff portal login → event detail
  - Auto-closes when required count reached
- [x] Remove manual staff assignment from admin (replaced by notification workflow)
- [x] Automated reminders (push + email) to staff before event
- [x] Automated notifications after event completion
- [x] **Thank you message** (push + email) per event to attending staff
  - Admin sets custom message per event
- [x] Auto-replacement when staff cancels:
  - Nearest available staff auto-assigned
  - Admin, removed staff, and replacement all notified

### ✅ Phase 9 — Supervisor Panel
- [x] Supervisor dashboard with team overview
- [x] **Auto group admin** when supervisor assigned to event
- [x] Event group auto-created on supervisor assignment
- [x] View team members, status, availability
- [x] **Supervisor work survey** per event (usher performance rating)
- [x] Real-time admin ↔ supervisor communication during event
- [x] Photo/video attachment in live event chat
- [x] **Emergency payment** — admin sends money to supervisor/staff via portal

### ✅ Phase 10 — Performance & Rankings
- [x] **Usher ranking leaderboard** based on supervisor star ratings
- [x] Rankings update after each event
- [x] **Quarterly awards** system:
  - Admin selects top performer each quarter
  - Auto congratulatory push + email to winner
  - Award badge on staff profile
- [x] Performance graphs per staff (admin view):
  - Individual performance over time
  - Comparison across all staff
- [x] Performance history saved per event

### ✅ Phase 11 — Surveys
- [x] **Post-event staff survey** auto-sent via staff portal
  - Experience, issues, suggestions
  - Responses saved per event in admin
- [x] **Post-event client survey** auto-sent to client email
  - Service quality, professionalism, satisfaction
  - Responses saved per booking in admin
- [x] **Supervisor survey** — separate usher rating per event
- [x] Survey results aggregated in admin reports

### ✅ Phase 12 — Live Event Management
- [x] Live event board in admin portal (real-time per active event)
- [x] Admin ↔ supervisor real-time messaging during event
- [x] Instant admin alerts on issues reported
- [x] Photo/video attachment in live chat
- [x] Supervisor flags emergency → admin notified immediately

### ✅ Phase 13 — PSP & Payroll Integration
- [x] PSP integration for client → admin payments
- [x] Admin initiates staff payments per event
- [x] Staff payment amount set and editable per event
- [x] Bulk or individual payment to staff post-event
- [x] Payment confirmation push + email to staff
- [x] Payment history per staff in admin portal

### ✅ Phase 14 — Gallery & Media
- [x] Event image slideshow on admin and client pages
- [x] Most recently uploaded image shown prominently
- [x] Client portal — view images from their previous events
- [x] Staff profile photo clickable → interactive staff detail card

### ✅ Phase 15 — Client Portal
- [x] Client self-service login
- [x] View bookings, packages, invoices, receipts
- [x] View event photos
- [x] Submit feedback and ratings
- [x] All data pre-populated from admin portal

### ✅ Phase 16 — Mobile Application
- [x] Emerald Pearland Events App integrating all portals
- [x] Push notifications via app
- [x] GPS proximity clock-in on mobile
- [x] Live event management on mobile

---

## Staff Categories (Updated)

| Category | Toggle | Portal Role |
|----------|--------|-------------|
| Ushers | ✅ Yes | Staff |
| Brand Ambassadors (BA) | ✅ Yes | Staff |
| Supervisors | ✅ Yes | Supervisor |
| Event Planners | ✅ Yes | External Contact |
| Event Organisers | ✅ Yes | External Contact |
| Wedding Planners | ✅ Yes | External Contact |
| Ticketing Agents | ✅ Yes | Staff |
| ~~Waiters~~ | ❌ Removed | — |

---

## Document & Invoice Flow

```
Client pays
  └── Admin confirms payment
        └── System auto-generates:
              ├── Invoice (PDF) → client email + saved in admin
              ├── Receipt (PDF) → client email + saved in admin
              └── eTIMS document → client email + saved in admin
                    (tax-compliant, printable)
```

---

## Notification Flow

```
New event created
  └── Push notification → all available staff
        ├── Staff applies → appears in Pending section
        ├── Required count reached → applications auto-close
        └── Supervisor assigned → becomes group admin

Before event
  └── Reminder push + email → all accepted staff + supervisor

During event
  └── Live board → admin ↔ supervisor real-time

After event
  ├── Thank you push + email → all attending staff (custom per event)
  ├── Staff survey → staff portal
  ├── Supervisor survey → supervisor portal (usher ratings)
  └── Client survey → client email
```

---

## Job Capacity Rules

- Each event has a `required_staff_count` set by admin
- Once accepted staff reach the required count, applications **automatically close**
- Staff who try to apply after capacity is reached are notified it is full
- Admin can manually adjust the required count at any time
- Supervisor counts toward the total required staff

---

*Last updated: March 2026 — Phase 3 in progress*
*Phases 4–16 pending implementation*
