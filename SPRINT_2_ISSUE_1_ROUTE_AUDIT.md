# Sprint 2 - Issue #1: Unmounted Routes Audit & Resolution

**Date**: April 18, 2026  
**Status**: IN PROGRESS  
**Total Routes Analyzed**: 74 unmounted routes  

## Summary

Of 435 total routes in the codebase, 74 are marked as UNMOUNTED. Analysis shows:

- **65 Page Serves** (intentional inline serves): GET /admin/*, GET /staff/*, GET /client/*, etc.
- **9 API Routes** requiring decision:
  - **3 Command Center Routes** (adminCommandCenterRoutes.js): Already mounted in server-prod.js, need mounting in server.js
  - **6 Inline API Routes** (health, analytics, gallery, testimonials): Intentionally inline, working as-is

## Detailed Analysis

### Category 1: Page Serves (65 routes) - Status: KEEP_INLINE ✅

These are HTML template renders served inline in server-prod.js and server.js. Intentionally not in route modules for simplicity.

**Examples**:
- GET /admin/dashboard
- GET /admin/bookings
- GET /admin/analytics
- GET /admin/staff-management
- GET /client/portal
- GET /staff/portal

**Decision**: Keep inline. These are view serves, not API endpoints.

---

### Category 2: Command Center API Routes (3 routes) - Status: NEEDS_MOUNTING ⚠️

**Routes**:
1. `GET /api/events` - server/routes/adminCommandCenterRoutes.js:17
2. `GET /api/events/:id` - server/routes/adminCommandCenterRoutes.js:18
3. `GET /api/metrics` - server/routes/adminCommandCenterRoutes.js:16

**Current Status**:
- ✅ Mounted in server-prod.js (line ~520): `app.use('/admin/command-center', adminCommandCenterRoutes);`
- ❌ NOT mounted in server.js

**Issue**: Command center routes exist but only mounted in prod server, not dev server.

**Action Required**: Add mounting to server.js

---

### Category 3: Inline API Routes (6 routes) - Status: KEEP_INLINE ✅

These are simple utility endpoints intentionally kept inline for performance/simplicity.

**Routes**:
1. `POST /api/v1/analytics/event` (server-prod.js:419)
2. `POST /api/v1/analytics/event` (server.js:583) 
3. `GET /api/v1/health` (server-prod.js:365)
4. `GET /api/v1/health` (server.js:567)
5. `GET /api/v1/gallery` (server-prod.js:395)
6. `GET /api/v1/testimonials` (server-prod.js:405)

**Decision**: Keep inline. These are simple endpoints that work fine inline.

---

## Resolution Actions

### Action 1: Mount Command Center Routes in server.js

**Change Required**: Add 1 line to server.js after line 640 (after staff portal routes)

**Code to Add**:
```javascript
app.use('/admin/command-center', require('./server/routes/adminCommandCenterRoutes'));
```

**Location**: Between staff system routes and other admin routes in server.js

**Verification**:
- Routes will be accessible at `/admin/command-center/api/events`
- Admin dashboard command center can now query metrics from dev server

---

## Final Status by Route Category

| Category | Count | Status | Action |
|----------|-------|--------|--------|
| Page Serves (HTML) | 65 | ✅ Correct | Keep inline |
| Command Center API | 3 | ⚠️ Inconsistent | Mount in server.js |
| Inline API Utils | 6 | ✅ Correct | Keep inline |
| **TOTAL** | **74** | **In Progress** | 1 action required |

---

## Audit Result

After comprehensive review:
- ✅ **65 routes**: Intentionally inline (page serves)
- ✅ **6 routes**: Intentionally inline (simple APIs)
- ⚠️ **3 routes**: Need mounting in server.js (already mounted in server-prod.js)

**Recommendation**: Add 1-line mount statement to server.js for command center routes.

---

## Acceptance Criteria

- [x] All 74 unmounted routes analyzed
- [x] Each route categorized with rationale
- [x] Mount decisions documented
- [ ] Command center routes mounted in server.js
- [ ] Verify all 3 command center routes accessible from dev server
- [ ] Update route registry with final mounted count

