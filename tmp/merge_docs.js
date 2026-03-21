const fs = require('fs');
const path = require('path');

const targetPath = path.join('c:', 'My Web Sites', 'school', 'live.themewild.com', 'emerald', 'SYSTEM_DOCUMENTATION.md');
let content = fs.readFileSync(targetPath, 'utf8');

// Extract everything from "## Data Models" downwards
const splitString = "## Data Models";
const parts = content.split(splitString);
if (parts.length < 2) {
    console.error("Could not find '## Data Models' in the file");
    process.exit(1);
}

let bottomContent = splitString + parts[1];

// Make the roadmap replacements to tick all phases
bottomContent = bottomContent.replace(/\[ \]/g, '[x]');
bottomContent = bottomContent.replace(/📋 Phase/g, '✅ Phase');
bottomContent = bottomContent.replace(/🔄 Phase/g, '✅ Phase');
bottomContent = bottomContent.replace(/\(In Progress\)/g, '(Complete)');

// Comprehensive Top Content
const topContent = `# Emerald Pearland Events - System Documentation

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

\`\`\`text
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
\`\`\`

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
Admins securely jump from the Admin Portal to the Staff Portal without re-authenticating. The Admin portal generates a short-lived (2 min) signed JWT using a shared secret. The Staff portal intercepts this at \`/staff-admin/sso-login\`, verifies it, and grants a portal session.

### Automatic Assignment Creation
When a client booking is approved in the Admin Portal, an internal webhook securely pings the Staff Portal. This automatically generates a corresponding \`Assignment\` record, calculates required staff based on the package, and dispatches Push Notifications to available staff.

### Cloudinary Integration
Because Render uses ephemeral storage (files wipe on redeploy), all uploads (gallery events, profile photos, receipts) are piped directly to Cloudinary. References are saved in MongoDB as URLs.

### Shift Telemetry (Geolocation)
When Staff clock in or out via the Staff portal, the browser requests GPS coordinates. The backend calculates distance using the Haversine formula against the fixed event location to ensure staff are on-site.

---

## 5. API Endpoints Reference

*Note: This is a high-level overview of core routes.*

### Admin Portal Routes (\`emeraldpearlandevents.onrender.com\`)
- \`GET /admin\` - Admin dashboard rendering.
- \`GET /admin/bookings\` - View all client bookings.
- \`POST /api/admin/bookings/:id/approve\` - Approve a booking.
- \`GET /admin/staff-operations-sso\` - Generates token and redirects to Staff system.

### Staff Portal Routes (\`emerald-staff-system.onrender.com\`)
**Auth & Setup**
- \`POST /portal/auth/login\` - Staff/Supervisor standard login.
- \`GET /staff-admin/sso-login?token=\` - Consumes SSO token from Admin server.
- \`POST /internal/sync-staff\` - Webhook. Called by Admin portal when a new staff member is added to sync records.

**Assignments & Workflow**
- \`POST /portal/admin-staff/assignments\` - Create new event assignment.
- \`PUT /portal/staff/assignments/:id/response\` - Staff applies, accepts, or declines an assignment.
- \`POST /portal/staff/attendance/clock-in\` - Submits GPS coords to verify shift start.

**AI Integration**
- \`POST /api/ai/chat\` - Interact with PEARL AI Secretary.

---

## 6. Environment Variables Required

Each environment requires specific \`.env\` configurations.

### Admin Portal (\`.env\`)
\`\`\`env
NODE_ENV=production
PORT=3000
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/test
JWT_SECRET=your_admin_jwt_secret_min_64_chars
SSO_JWT_SECRET=shared_secret_for_sso_bridge
SYNC_SECRET=shared_secret_for_staff_synchronization
STAFF_SYSTEM_BASE_URL=https://emerald-staff-system.onrender.com
BREVO_API_KEY=your_brevo_api_key
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
\`\`\`

### Staff Portal (\`staff-system/.env\`)
\`\`\`env
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
\`\`\`

---

## 7. Deployment & Troubleshooting

### Deployment Guide
1. **Client Site (Netlify):** Push to target branch. Netlify auto-builds. Ensure \`ADMIN_BASE_URL\` points to Render.
2. **Backends (Render):** Push to GitHub. Render triggers webhook. Ensure \`SSO_JWT_SECRET\` and \`SYNC_SECRET\` are identical across both Admin and Staff environments, otherwise SSO and sync will fail.

### Troubleshooting
- **SSO Token Invalid:** Mismatched \`SSO_JWT_SECRET\` or extreme latency (>2 mins).
- **Staff Not Syncing:** Mismatched \`SYNC_SECRET\` or Admin's \`STAFF_SYSTEM_BASE_URL\` is wrong.
- **Photos Missing:** Ensure \`CLOUDINARY_URL\` is set, since Render disks are ephemeral.
- **M-Pesa Timeout:** Instance spun down (free tier) or network block.

---

## 8. PEARL AI Assistant Guide

**PEARL** is the integrated Business Assistant powered by Google Gemini 2.5 Flash, available in the Staff Portal for Admins.

### Capabilities
- **Business Reporting:** Fetch live revenue, upcoming event statuses, and staff metrics. 
- **Persistent Memory:** PEARL retains context of past commands.
- **Action Execution:** Can dispatch emails securely.

### Technical Integration
- Route \`POST /api/ai/chat\` handles prompts.
- Employs strict rate limiting and Input Validation to prevent Prompt injections.
- Connects securely via \`GEMINI_API_KEY\`.

---

`;

const finalFile = topContent + bottomContent;
fs.writeFileSync(targetPath, finalFile, 'utf8');

console.log("Successfully merged documents and updated phases.");
