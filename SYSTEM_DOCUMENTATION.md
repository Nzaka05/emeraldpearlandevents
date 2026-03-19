# Emerald Pearland Events Booking System
## System Documentation v3.0

---

## Overview

A full-stack event booking and staff operations platform built with **Node.js**, **Express.js**, and **MongoDB Atlas**. The system runs across two servers and manages event bookings, staff assignments, attendance, and payments.

---

## Architecture

### Two-Server Setup

| Server | Port | Purpose | Start Command |
|--------|------|---------|---------------|
| Main Admin | 3000 | Client bookings, admin panel, staff directory | `npm run dev` |
| Staff Operations | 3001 | Staff portal, assignments, attendance, payroll | `node server.js` |

### Database

- **Provider**: MongoDB Atlas (Cluster0)
- **Main Admin DB**: `test` database
- **Staff Operations DB**: `emerald` database
- **Connection**: `mongodb+srv://admin:****@cluster0.wa8samz.mongodb.net`

### Project Path
```
C:\My Web Sites\school\live.themewild.com\emerald\
├── server-prod.js              # Port 3000 entry point
├── server/
│   ├── routes/adminRoutes.js   # Main admin routes
│   └── utils/staffSync.js      # Staff sync utility
├── shared/
│   ├── config/db.js            # MongoDB connection
│   ├── middleware/roles.js     # Role-based access
│   └── utils/geo.js            # Haversine GPS utility
├── staff-system/               # Port 3001 root
│   ├── server.js               # Port 3001 entry point
│   ├── models/                 # Mongoose models
│   ├── controllers/            # Route controllers
│   ├── routes/                 # Express routers
│   ├── views/                  # EJS templates
│   └── middleware/             # Auth, CSRF, upload
└── .env                        # Root environment variables
```

---

## Port 3000 — Main Admin System

### Features
- Client booking management
- Event gallery
- Staff directory (basic — name, category, photo, contact)
- Admin dashboard with analytics
- Email notifications via Brevo
- Scheduled cron jobs

### Key Routes
| Route | Purpose |
|-------|---------|
| `/admin` | Admin dashboard |
| `/admin/staff` | Staff directory |
| `/api/admin/staff` | Staff CRUD API |
| `/admin/staff-operations-sso` | SSO bridge to port 3001 |

### Staff Sync
When a staff member is added/updated/deleted on port 3000, it automatically syncs to port 3001 via internal API:
- **Endpoint**: `POST /internal/sync-staff` on port 3001
- **Auth**: `x-sync-secret` header
- **Fields synced**: name, email, phone (photo excluded due to size)
- **Timeout**: 8 seconds (non-blocking — sync failure does not break main operations)

---

## Port 3001 — Staff Operations System

### Features
- SSO login from port 3000 admin
- Staff management (add, edit, suspend, assign supervisor)
- Event/assignment management
- Staff self-service portal
- Attendance & clock-in/out
- Payroll management
- Audit logs
- Real-time notifications via Socket.io

### User Roles

| Role | Access Level |
|------|-------------|
| `Admin` | Full access to all admin tabs |
| `Supervisor` | Supervisor panel — manage assigned teams |
| `Staff` | Staff portal — view assignments, clock in/out |

### Admin Tabs
1. **Workforce Dashboard** — Live metrics, audit logs, clocked-in staff
2. **Staff Management** — Full CRUD, suspend/unsuspend, assign supervisor
3. **Events/Assignments** — Create events, assign staff, track acceptance
4. **Event Teams** — Team composition and readiness
5. **Attendance** — Clock-in/out records
6. **Payments** — Payment status and confirmation
7. **Reports** — Event and performance reports
8. **Audit Logs** — Full action history
9. **Security** — Account security settings

### Key Routes

#### Admin Portal
| Route | Purpose |
|-------|---------|
| `GET /portal/admin-staff/dashboard` | Admin dashboard |
| `GET /portal/admin-staff/staff-management` | Staff management |
| `GET /portal/admin-staff/events` | Events & assignments |
| `POST /portal/admin-staff/assignments` | Create event |
| `PUT /portal/admin-staff/assignments/:id` | Update event |
| `PUT /portal/admin-staff/assignments/:id/supervisor` | Assign supervisor |
| `PUT /portal/admin-staff/assignments/:id/assign-staff` | Assign staff |
| `PUT /portal/admin-staff/assignments/:id/toggle-applications` | Open/close applications |
| `GET /portal/admin-staff/assignments/:id/report` | Event report |

#### Staff Portal
| Route | Purpose |
|-------|---------|
| `GET /portal/staff/dashboard` | Staff dashboard |
| `GET /portal/staff/assignments` | View assignments |
| `POST /portal/staff/assignments/:id/response` | Accept/decline/apply |
| `GET /portal/staff/profile` | View profile |
| `PUT /portal/staff/profile` | Update profile |
| `POST /portal/staff/profile/photo` | Upload profile photo |
| `POST /portal/staff/change-password` | Change password |

#### Auth Routes
| Route | Purpose |
|-------|---------|
| `GET /portal/auth/login` | Login page |
| `POST /portal/auth/login` | Submit login |
| `GET /portal/auth/logout` | Logout |
| `GET /portal/auth/change-password` | First login password change |
| `POST /portal/auth/change-password` | Submit new password |

---

## SSO Bridge

Allows admin on port 3000 to access port 3001 without separate login.

**Flow:**
1. Admin clicks "Staff Operations" on port 3000 dashboard
2. Port 3000 generates a short-lived JWT (2 min) signed with `SSO_JWT_SECRET`
3. Redirects to `port 3001 /staff-admin/sso-login?token=...`
4. Port 3001 verifies JWT, issues `portal_token` cookie, logs `SSO_LOGIN` audit event
5. Redirects to `/portal/admin-staff/dashboard`

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

### 🔄 Phase 3 — Staff Operations Admin Tabs (In Progress)
- [x] Workforce Dashboard with live metrics
- [x] Staff Management — add, edit, suspend, assign supervisor
- [x] Staff sync port 3000 → port 3001
- [x] Events/Assignments tab with GPS, staff assignment, accept/decline
- [x] Open/close applications toggle with push to staff portal
- [x] Staff self-service portal — apply, accept, decline events
- [x] Staff profile photo upload
- [x] First-login password change with strength rules
- [ ] Fix profile update form actions
- [ ] Fix assignments.ejs syntax error
- [ ] Accept/decline fully working end-to-end

### 📋 Phase 4 — Staff Categories & Roles
- [ ] **Remove "Waiters"** category entirely
- [ ] Add categories: `Ushers`, `Brand Ambassadors (BA)`, `Supervisors`, `Event Planners`, `Event Organisers`, `Wedding Planners`, `Ticketing Agents`
- [ ] Toggle switches per category in main admin panel
- [ ] Update staff portal to reflect new categories
- [ ] Staff profile photo clickable — opens interactive card with:
  - Full photo, name, role, contact
  - Quick actions: WhatsApp, email, call

### 📋 Phase 5 — Booking & Packaging
- [ ] **Rename "Booking" page → "Packaging"** throughout
- [ ] Each event has its own defined package
- [ ] Client specifies staff count → system auto-selects assignment
- [ ] Admin can override staff selection in assignment
- [ ] Assignment save → auto-sync to staff portal
- [ ] Add M-Pesa number field to payment section

### 📋 Phase 6 — Payments, Invoices & eTIMS
- [ ] Fix booking payment edit (amount paid + completion status)
- [ ] Admin marks payment complete → client auto-notified
- [ ] Payment reminder notifications to client
- [ ] **Auto invoice generation** on payment completion:
  - PDF invoice generated and sent to client email
  - Invoice saved in admin panel per client
- [ ] **Receipt generation** after payment confirmation
- [ ] **eTIMS integration** — tax-compliant invoice:
  - Generated for client and admin
  - Sent to client email
  - Printable PDF format
  - Saved in admin portal
- [ ] Client rating in admin portal
- [ ] Client feedback viewable and editable from admin

### 📋 Phase 7 — Event Planners & External Contacts
- [ ] New section in main admin: Event Planners / Organisers / Wedding Planners
- [ ] Fields: name, company, email, phone, WhatsApp, specialisation, notes
- [ ] Searchable, filterable contact directory
- [ ] Link planners to specific bookings
- [ ] Quick-contact buttons per contact card

### 📋 Phase 8 — Push Notifications & Automation
- [ ] Push notification to all available staff on new job posting
  - Includes: event name, date, reporting time, pay rate
  - Tap → staff portal login → event detail
  - Auto-closes when required count reached
- [ ] Remove manual staff assignment from admin (replaced by notification workflow)
- [ ] Automated reminders (push + email) to staff before event
- [ ] Automated notifications after event completion
- [ ] **Thank you message** (push + email) per event to attending staff
  - Admin sets custom message per event
- [ ] Auto-replacement when staff cancels:
  - Nearest available staff auto-assigned
  - Admin, removed staff, and replacement all notified

### 📋 Phase 9 — Supervisor Panel
- [ ] Supervisor dashboard with team overview
- [ ] **Auto group admin** when supervisor assigned to event
- [ ] Event group auto-created on supervisor assignment
- [ ] View team members, status, availability
- [ ] **Supervisor work survey** per event (usher performance rating)
- [ ] Real-time admin ↔ supervisor communication during event
- [ ] Photo/video attachment in live event chat
- [ ] **Emergency payment** — admin sends money to supervisor/staff via portal

### 📋 Phase 10 — Performance & Rankings
- [ ] **Usher ranking leaderboard** based on supervisor star ratings
- [ ] Rankings update after each event
- [ ] **Quarterly awards** system:
  - Admin selects top performer each quarter
  - Auto congratulatory push + email to winner
  - Award badge on staff profile
- [ ] Performance graphs per staff (admin view):
  - Individual performance over time
  - Comparison across all staff
- [ ] Performance history saved per event

### 📋 Phase 11 — Surveys
- [ ] **Post-event staff survey** auto-sent via staff portal
  - Experience, issues, suggestions
  - Responses saved per event in admin
- [ ] **Post-event client survey** auto-sent to client email
  - Service quality, professionalism, satisfaction
  - Responses saved per booking in admin
- [ ] **Supervisor survey** — separate usher rating per event
- [ ] Survey results aggregated in admin reports

### 📋 Phase 12 — Live Event Management
- [ ] Live event board in admin portal (real-time per active event)
- [ ] Admin ↔ supervisor real-time messaging during event
- [ ] Instant admin alerts on issues reported
- [ ] Photo/video attachment in live chat
- [ ] Supervisor flags emergency → admin notified immediately

### 📋 Phase 13 — PSP & Payroll Integration
- [ ] PSP integration for client → admin payments
- [ ] Admin initiates staff payments per event
- [ ] Staff payment amount set and editable per event
- [ ] Bulk or individual payment to staff post-event
- [ ] Payment confirmation push + email to staff
- [ ] Payment history per staff in admin portal

### 📋 Phase 14 — Gallery & Media
- [ ] Event image slideshow on admin and client pages
- [ ] Most recently uploaded image shown prominently
- [ ] Client portal — view images from their previous events
- [ ] Staff profile photo clickable → interactive staff detail card

### 📋 Phase 15 — Client Portal
- [ ] Client self-service login
- [ ] View bookings, packages, invoices, receipts
- [ ] View event photos
- [ ] Submit feedback and ratings
- [ ] All data pre-populated from admin portal

### 📋 Phase 16 — Mobile Application
- [ ] Emerald Pearland Events App integrating all portals
- [ ] Push notifications via app
- [ ] GPS proximity clock-in on mobile
- [ ] Live event management on mobile

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
