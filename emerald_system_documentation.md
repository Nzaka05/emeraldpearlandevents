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

### Technology Stack
- **Backend:** Node.js, Express.js
- **Database:** MongoDB Atlas (Mongoose ODM)
- **Frontend:** EJS Templates, TailwindCSS, Vanilla JS
- **Authentication:** JWT (JSON Web Tokens) with dual isolated environments
- **Storage:** Cloudinary (ensures persistence across ephemeral server deployments)
- **Communications:** Brevo (Primary Email) + Gmail SMTP (Fallback), Web Push (VAPID)
- **AI Integration:** Google Gemini 2.5 Flash
- **Hosting:** Render (Backends), Netlify (Frontend)
- **Version Control:** GitHub

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

Each environment requires specific [.env](file:///c:/My%20Web%20Sites/school/live.themewild.com/emerald/.env) configurations.

### Admin Portal ([.env](file:///c:/My%20Web%20Sites/school/live.themewild.com/emerald/.env))
```env
NODE_ENV=production
PORT=3000

# Database
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/test

# Authentication
JWT_SECRET=your_admin_jwt_secret_min_64_chars
SSO_JWT_SECRET=shared_secret_for_sso_bridge
SYNC_SECRET=shared_secret_for_staff_synchronization

# External Services
STAFF_SYSTEM_BASE_URL=https://emerald-staff-system.onrender.com
BREVO_API_KEY=your_brevo_api_key
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
```

### Staff Portal ([.env](file:///c:/My%20Web%20Sites/school/live.themewild.com/emerald/.env))
```env
NODE_ENV=production
PORT=3001

# Database
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/emerald

# Authentication
STAFF_JWT_SECRET=your_staff_jwt_secret_min_64_chars
SSO_JWT_SECRET=shared_secret_for_sso_bridge
SYNC_SECRET=shared_secret_for_staff_synchronization

# Web Push (VAPID)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_EMAIL=mailto:admin@emeraldpearlandevents.com

# M-Pesa Daraja
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_B2C_SHORT_CODE=your_shortcode
MPESA_B2C_RESULT_URL=https://emerald-staff-system.onrender.com/portal/admin-staff/mpesa/callback

# Gemini AI
GEMINI_API_KEY=your_gemini_api_key
```

---

## 7. Deployment Guide

### Client Site (Netlify)
1. Push client code changes to the target branch.
2. Netlify auto-builds based on `netlify.toml` or UI config.
3. Ensure [.env](file:///c:/My%20Web%20Sites/school/live.themewild.com/emerald/.env) vars in the Netlify UI point `ADMIN_BASE_URL` to the Render admin instance.

### Admin & Staff Portals (Render)
To deploy zero-downtime updates:
1. Commit changes to version control (GitHub).
2. Render triggers webhooks to begin building the new instance.
3. **Important Check:** Both portals *must* share the exact same `SSO_JWT_SECRET` and `SYNC_SECRET` in their Render Environment Variables dashboard for SSO and sync webhooks to function.
4. Render handles traffic routing gracefully once the new container passes health checks.

---

## 8. Troubleshooting Common Issues

**1. "SSO Token Invalid" or "Signature Verification Failed"**
*Cause:* The `SSO_JWT_SECRET` differs between the Admin and Staff [.env](file:///c:/My%20Web%20Sites/school/live.themewild.com/emerald/.env) configs, or the 2-minute expiration window was exceeded due to extreme network latency.
*Fix:* Ensure secrets match perfectly in both Render environments.

**2. Staff Member Created in Admin, but not showing in Staff Portal**
*Cause:* Internal Webhook (`/internal/sync-staff`) failed. The Admin portal logs will show a `x-sync-secret` mismatch or network timeout.
*Fix:* Verify `STAFF_SYSTEM_BASE_URL` in Admin [.env](file:///c:/My%20Web%20Sites/school/live.themewild.com/emerald/.env). You can manually re-trigger the sync from the Admin staff dashboard.

**3. Profile Photos Missing After Deploy**
*Cause:* Images were saved to local disk (`/public/uploads`) instead of Cloudinary, and the Render ephemeral disk wiped on the last deploy.
*Fix:* Ensure `CLOUDINARY_URL` is set and the `multer` middleware uses Cloudinary storage engines.

**4. M-Pesa Timed Out**
*Cause:* Daraja timeout settings or the Render instance was spun down (if on a free tier).
*Fix:* Upgrade to a persistent background worker or ping the instance every 10 mins.

---

## 9. Data Flow: The Booking Lifecycle

1. **Client Request:** A client submits a booking request through `emeraldpearlandevents.netlify.app`. 
2. **Admin Review:** The request appears in the Admin Portal. The Admin reviews package details, assigns an estimated staff count, and clicks "Approve".
3. **Invoicing:** An invoice is auto-generated (with potential eTIMS compliance), converted to PDF, uploaded to Cloudinary, and emailed to the client via Brevo.
4. **Staff Sync:** An internal webhook (`POST /portal/admin-staff/assignments`) fires from the Admin system to the Staff system.
5. **Job Posting:** The Staff Portal automatically creates an `Assignment` document. It triggers Web Push notifications to all available, active staff in the required category (e.g., Ushers).
6. **Staff Bidding:** Staff receive the push, log in to the Staff portal, and click "Apply/Accept". 
7. **Capacity Lock:** Once the required staff count is reached, the system auto-locks further applications.
8. **Ops Execution:** A Supervisor is assigned. The team utilizes the Staff Portal for clock-in (GPS validated), live chat, and emergency flagging during the event.
9. **Closure:** Admin marks the event completed, which queues Staff payroll via M-Pesa Daraja and dispatches a post-event survey to the client.

---

## 10. PEARL AI Assistant Guide

**PEARL** is the integrated Business Assistant powered by Google Gemini 2.5 Flash, available in the Staff Portal for Admins.

### Capabilities
- **Business Reporting:** Fetch live revenue, upcoming event statuses, and staff attendance metrics seamlessly. 
- **Persistent Memory:** PEARL retains context of past commands and discussions using MongoDB-backed thread storage.
- **Action Execution:** Can be configured to dispatch emails or update basic system statuses (e.g., "Draft an email to the client for event xyz thanking them").
- **Knowledge Retrieval:** Answers questions about company policy based on preloaded training data (RAG).

### Technical Integration
- Route `POST /api/ai/chat` handles all prompts.
- Employs strict rate limiting and Input Validation to prevent Prompt Injection attacks from compromised staff accounts.
- The `GEMINI_API_KEY` facilitates the connection.

### How to use PEARL
1. Navigate to the **Command Center** in the Staff Admin Portal.
2. Type a business query (e.g., *"How many ushers are assigned to tomorrow's wedding?"*).
3. PEARL queries the `Assignments` and `EventTeam` collections, formulates a natural language response, and displays it in real-time.

---
*End of Documentation*
