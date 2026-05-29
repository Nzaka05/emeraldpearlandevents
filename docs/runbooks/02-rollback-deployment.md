# Deployment Rollback Runbook

**Purpose:** Quickly revert to previous stable version if deployment introduces critical bugs.  
**RTO:** <5 minutes  
**Owner:** DevOps / Release Engineer

---

## Prerequisites

- Render deployment credentials (GitHub linked account)
- Access to GitHub repository (commit history visible)
- Slack access for notifications

---

## Step 1: Declare Incident

**Objective:** Alert stakeholders and begin rollback decision

1. **Assess severity**
   - Is API completely down? → Critical (rollback immediately)
   - Is specific feature broken? → Major (investigate first)
   - Is performance degraded? → Minor (may not need rollback)

2. **Check error monitoring**
   - Render dashboard → Activity Log → Recent deploys
   - Monitor error rate (expected < 1%, if > 10% = critical)
   - Check `/health/ready` endpoint status

3. **Notify team**
   - Slack #incidents: _"🚨 **Deployment Rollback Initiated** - Version X.Y.Z causing high error rate"_
   - Include affected feature/endpoint
   - Estimated rollback time: 3-5 minutes

---

## Step 2: Identify Previous Stable Version

**Objective:** Find the last known good deployment

1. **Check GitHub commit history**
   - Go to repository: `main` branch
   - View commit log to find pre-incident commit
   - Example stable commit: `abc1234` deployed 30 minutes ago

2. **Verify stability**
   - Check if this commit has passing CI/CD checks (green checkmark)
   - Confirm no known issues with that version from team

3. **Record commit hash or tag**
   - Example: `abc1234567890def` or tag: `v2.1.0`

---

## Step 3: Trigger Deployment from Render

**Objective:** Redeploy previous stable version

### Option A: Manual Redeploy via Render Dashboard (Recommended)

1. **Navigate to Render service**
   - Go to https://dashboard.render.com
   - Select service: `emerald-api` or `emerald-backend`

2. **View deployment history**
   - Click "Deploys" or "Events" tab
   - Find previous successful deployment
   - Look for green checkmark (indicates success)

3. **Trigger manual deployment**
   - Find the stable version in list
   - Click the three-dot menu → `Redeploy`
   - Confirm: _"Redeploy this version?"_
   - Wait 2-3 minutes for deployment to complete

### Option B: Redeploy via GitHub Commit

1. **Find stable commit on GitHub**
   - Go to repository main branch
   - Locate pre-incident commit
   - Copy commit SHA (first 7 characters): e.g., `abc1234`

2. **Trigger Render from git**
   - In Render dashboard, click "Environment"
   - Update `DEPLOY_REF` environment variable to commit SHA
   - Restart service: Click "Manual Deploy" button

### Option C: Git Tag Rollback (if using tags)

1. **Check if tags exist**
   ```bash
   git tag -l "v*" | sort -V | tail -5
   # Output: v2.0.5, v2.0.4, v2.0.3, etc.
   ```

2. **Redeploy previous tag**
   - In Render Environment, set: `DEPLOY_REF=v2.0.4`
   - Click "Manual Deploy"
   - Wait for deployment

---

## Step 4: Monitor Rollback Deployment

**Objective:** Verify rollback succeeds

1. **Watch Render deploy log**
   - Render dashboard → Logs tab
   - Should see: `Building...` → `Deploying...` → `Your service is live` (green)
   - If red/error, check logs for failure reason

2. **Check application health**
   ```bash
   # Wait 30 seconds after deployment completes
   curl -s https://api.emerald.local/health/ready | jq .
   # Expected: { "status": "ok", "checks": { "mongo": { "ok": true }, "redis": { "ok": true } } }
   ```

3. **Verify no errors**
   - Render dashboard → Logs tab
   - Search for "error" or "Error" (case-insensitive)
   - Should see minimal error logs

---

## Step 5: Validate Functionality

**Objective:** Confirm critical features working after rollback

1. **Test core endpoints**
   ```bash
   # Authentication
   curl -X POST https://api.emerald.local/api/v1/admin/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@emerald.local","password":"test"}'

   # Bookings list
   curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
     https://api.emerald.local/api/v1/bookings | jq '.data.bookings | length'
   ```

2. **Check web UI**
   - Visit https://emerald.local
   - Admin dashboard should load
   - Try creating a test booking
   - Verify staff portal sync triggers

3. **Monitor error rate**
   - Render dashboard → Activity Log
   - Error rate should drop to < 1%
   - Response times should normalize

---

## Step 6: Investigate Root Cause

**Objective:** Understand what went wrong (concurrent with rollback)

1. **Compare deployed versions**
   - Problem commit: `def5678`
   - Previous commit: `abc1234`
   - Run: `git log abc1234..def5678 --oneline`
   - Review changed files: `git diff abc1234 def5678 --stat`

2. **Identify suspect changes**
   - Focus on files modified in problem commit
   - Examples: middleware, core routes, database models
   - Look for missing migrations or breaking changes

3. **Check error logs from failed deployment**
   - Render logs → Search for "Error" around deployment time
   - Look for patterns: database connection, dependency import, syntax

---

## Step 7: Communication & Next Steps

**Objective:** Update team and plan fix

1. **Post rollback status**
   - Slack #incidents: _"✅ **Rollback Complete** - Service restored to v2.0.4. Error rate normalized. RTO: 3min"_
   - Include before/after metrics if available

2. **Create incident ticket**
   - Jira: Create "Post-Incident: Investigate Deploy X.Y.Z"
   - Add link to commit
   - Assign to relevant engineer for root cause analysis

3. **Schedule fix deployment**
   - Merge fix to develop branch first
   - Run full CI/CD validation (1+ hour)
   - Deploy to staging for testing (30+ min)
   - Only then deploy to production with team review

---

## Step 8: Prevent Future Issues

**Objective:** Improve deployment process

1. **Review pre-deployment checklist**
   - Was CI/CD validation passed?
   - Was staging tested?
   - Was code reviewed?
   - Were migrations run?

2. **Add regression test** (for this specific issue)
   - Create test case that would catch this bug
   - Add to CI/CD pipeline

3. **Update runbook** (if needed)
   - Document any new failure modes discovered
   - Update team on lessons learned

---

## Emergency Rollback (Complete Service Outage)

**If API is completely down and Render dashboard is inaccessible:**

1. **Contact Render support immediately**
   - Email: support@render.com
   - Provide service ID and request immediate rollback

2. **Use GitHub UI directly** (if available)
   - Go to GitHub repository
   - Go to branch protection rules → Require deployments
   - Look for manual "Rollback" option (if configured)

3. **Access via SSH** (if Render allows)
   - `render ssh --service emerald-api`
   - Manually restart service: `pm2 restart server-prod`
   - Revert environment: `export CURRENT_COMMIT=abc1234`

---

## Rollback Verification Checklist

- [ ] Deployment completed successfully (green checkmark in Render)
- [ ] `/health/ready` returns 200 with ok status
- [ ] `/api/v1/bookings` returns booking list (requires valid token)
- [ ] Admin web dashboard loads
- [ ] No error spike in logs
- [ ] Response times < 500ms for typical requests
- [ ] Team notified in Slack
- [ ] Incident ticket created
- [ ] Root cause investigation assigned

---

## Related Documents

- [Deployment Guide](../deployment/render-guide.md)
- [CI/CD Pipeline Documentation](../.github/workflows/ci.yml)
- [Monitoring & Alerting Setup](../monitoring/alerts.md)

---

## Emergency Contacts

- **Deployment Lead:** [Name] - Slack: @deploy-lead  
- **On-Call Engineer:** Check PagerDuty
- **Platform Support:** support@render.com
