# Emerald Pearl Events - Zero-Downtime Upgrade Deployment Plan

## PART 1 — PRE-DEPLOYMENT AUDIT & IMPACT ASSESSMENT

### 1. New Models Automated by MongoDB (No risk on start, schemas self-generate)
- `ClientAccount`
- `ClientSession`
- `ClientAuditLog`
- `WebAuthnChallenge`
- `AdminWebAuthnCredential`
- `EmergencyFundAudit`
- `PerformanceReview`
- `StaffPerformanceProfile`
- `EventLedger`
- `ClientEmailLog`
- `StaffMissingAlert`
- `EventPredictionSnapshot`

### 2. Changed Schemas Existing in Production (Addressed by Script)
- `Staff`: No changes directly to schema besides implicit virtual integrations.
- `Assignment`: Gained `lifecycle_state`. Existing documents lack this and must default to PLANNED/COMPLETED.
- `Attendance`: Gained `device_id`, `clockin_photo`, `proximity_result`.
- `ClientInvoice`: Gained `etrNumber` and `etrIssuedAt`.

### 3. Controller Refactoring Map (Route integrity maintained)
- `adminController.js` (Legacy monolith) 
  ↳ Replaced by domain controllers: `adminDashboardRoutes`, `adminStaffRoutes`, `adminEventsRoutes`, `adminFinanceRoutes`, `adminReportsRoutes`.
- Existing sub-routes (`/admin/...`) were natively mapped into Express routers to preserve all paths precisely as they were, guaranteeing no 404s for logged-in staff.

### 4. New Environment Variables
- **CRITICAL** (Will crash if missing):
  - `STAFF_JWT_SECRET`
  - `CLIENT_JWT_SECRET`
  - `WEBAUTHN_RP_ID` (e.g. emeraldpearlandevents.com)
  - `WEBAUTHN_ORIGIN` (e.g. https://portal.emeraldpearlandevents.com)
  - `WEBAUTHN_RP_NAME` (e.g. Emerald Pearl Events)
  - `SYNC_SECRET` (Internal IPC authentication)
- **OPTIONAL**:
  - `CLOUDINARY_URL`
  - `SOCKET_AUTH_REQUIRED`

---

## PART 2 — UPGRADE SEQUENCE (ZERO DOWNTIME)

**Important**: Port 3000 is live. We will prepare the code in a staging directory first.

**Step 1** — Clone the latest repository code to a *staging* directory, NOT the live directory.
```bash
git clone <your-repo> emerald-staging
cd emerald-staging
```

**Step 2** — Run `checkEnv.js` against the new code using your existing live `.env` to safely catch missing environments before touching production.
```bash
cp ../emerald-live/.env .env
node scripts/checkEnv.js
```

**Step 3** — Append your `.env` file with the missing configurations listed in Part 4 below. Do not restart operations yet.

**Step 4** — Run `migrateExistingData.js` to backfill legacy rows. This is 100% idempotent and safe to run while the old code is still spinning.
```bash
node scripts/migrateExistingData.js
```

**Step 5** — Establish new performance compound indexes.
```bash
node scripts/ensureIndexes.js
```

**Step 6** — Hydrate dependencies securely in staging.
```bash
npm install --production
cd staff-system && npm install --production && cd ..
```

**Step 7** — Perform the zero-downtime structural swap.
```bash
rsync -av --exclude 'node_modules' --exclude '.env' emerald-staging/ emerald-live/
cd emerald-live
```

**Step 8** — Reboot the Admin PM2 service using `--update-env` to absorb the exact `.env` additions immediately.
```bash
pm2 reload emerald-admin --update-env
```

**Step 9** — Watch stability buffers.
```bash
pm2 logs emerald-admin --lines 50
```

**Step 10** — Ping the `/health` payload to verify successful cluster boot.
```bash
curl https://admin.emeraldpearlandevents.com/health
```

**Step 11** — Verification endpoints check: Manually login to Admin, Staff, and Client domains.

**Step 12** — Boot Port 3001 (Staff System) fresh since it hasn't historically run.
```bash
pm2 start ecosystem.config.js --only emerald-staff --env production
pm2 save
```

---

## PART 3 — ROLLBACK PLAN

If catastrophic failures occur, reverting is immediate:
**Step 1** — Do NOT reverse database scripts. The migrations inserted `null` blocks or generated isolated ledgers; reversing them accomplishes nothing and deletes data.
**Step 2** — If you kept a backup or didn't overwrite your `emerald-live` completely:
```bash
cd emerald-live
git reset --hard HEAD@{1} # Revert to previous deployment commit
npm install
pm2 reload emerald-admin
```
*(Document the commit hash prior to step 7 for immediate fallback).*

---

## PART 4 — ENVIRONMENT VARS CONFIG BLOCK
Append this directly to your live `.env` before Step 3.

```env
# Added in upgrade - Staff Operations System
STAFF_JWT_SECRET=generate_64_char_random_string_here
PORT_STAFF=3001
BASE_URL_STAFF=https://staff.emeraldpearlandevents.com

# Added in upgrade - Client Portal
CLIENT_JWT_SECRET=generate_different_64_char_random_string_here
CLIENT_JWT_EXPIRY=15m
CLIENT_REFRESH_EXPIRY=30d
CLIENT_PORTAL_URL=https://portal.emeraldpearlandevents.com

# Added in upgrade - WebAuthn
WEBAUTHN_RP_NAME=Emerald Pearl Events
WEBAUTHN_RP_ID=emeraldpearlandevents.com
WEBAUTHN_ORIGIN=https://portal.emeraldpearlandevents.com

# Added in upgrade - Security
EMERGENCY_THRESHOLD=10000
SOCKET_AUTH_REQUIRED=true
SYNC_SECRET=generate_another_64_char_random_string_here
ALLOWED_ORIGINS=https://emeraldpearlandevents.netlify.app,https://portal.emeraldpearlandevents.com

# Added in upgrade - Cloudinary (optional, falls back to local if missing)
CLOUDINARY_URL=
```
