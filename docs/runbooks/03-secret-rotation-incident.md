# Secret Rotation & Incident Response Runbook

**Purpose:** Safely rotate security secrets without service interruption.  
**RTO:** <15 minutes  
**Owner:** Security / DevOps Lead

---

## Prerequisites

- Render deployment dashboard access
- MongoDB Atlas access (for database URLs if needed)
- GitHub secrets access (for CI/CD secrets)
- SSH access to production if available

---

## Supported Secrets by Type

| Secret | Type | Rotation Frequency | Impact on Restart |
|--------|------|-------------------|------------------|
| `JWT_SECRET` | Admin auth token signing | Every 6 months | Users must re-login |
| `STAFF_JWT_SECRET` | Staff auth token signing | Every 6 months | Staff must re-login |
| `CLIENT_JWT_SECRET` | Client auth token signing | Every 6 months | Clients must re-login |
| `SYNC_SECRET` | Booking sync endpoint auth | Every 3 months | Staff portal sync disabled until restart |
| `SSO_SECRET` | Google OAuth callback signing | Every 6 months | SSO temporarily unavailable |
| `MONGODB_URI` | Database connection string | Upon compromise only | Database unavailable until restart |
| `REDIS_URL` | Message queue connection | Upon compromise only | Job queue offline until restart |

---

## SCENARIO 1: Rotate JWT_SECRET (Low Impact)

**When:** Scheduled maintenance, every 6 months  
**Impact:** All active users logged out, must re-login  

### Step 1: Prepare

1. **Notify users** (Slack + email 24 hours before)
   ```
   "Scheduled maintenance Wed 2pm UTC - 15 min downtime for security update"
   ```

2. **Generate new secret** (20+ random characters)
   ```bash
   openssl rand -base64 24 | tr -d '\n' && echo
   # Output: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
   ```

3. **Record both old and new secrets**
   - Keep old secret in notes temporarily
   - Will be needed for gradual rollout (optional)

### Step 2: Deploy New Secret

**Option A: Zero-downtime rotation (requires app modification)**

1. Accept both old and new JWT secrets in verification
2. Deploy code change
3. Update `JWT_SECRET` environment variable
4. No restart needed

**Option B: Brief downtime (simpler)**

1. Go to Render dashboard: emerald-api service
2. Click "Environment" tab
3. Edit `JWT_SECRET` = [new secret value]
4. Save environment variables
5. Render auto-restarts service (~2 minutes)
6. Verify health: `curl https://api.emerald.local/health/ready`

### Step 3: Notify Users

1. Monitor error logs for auth failures
   - Expect 10-15 minutes of 401 "token expired" errors
   - This is normal - users are re-authenticating

2. Update Slack: _"✅ JWT rotation complete. If you see login prompts, please re-authenticate. Support: #help"_

3. Monitor for 1 hour post-rotation

---

## SCENARIO 2: Rotate SYNC_SECRET (Medium Impact)

**When:** Suspected compromise, upon breach discovery  
**Impact:** Booking sync to staff portal disabled until restart  

### Step 1: Prepare  

1. **Generate new secret**
   ```bash
   openssl rand -base64 32 | tr -d '\n' && echo
   ```

2. **Coordinate with staff portal team**
   - Notify staff system admin of rotation
   - They will need to update their `SYNC_SECRET` to match

### Step 2: Rotate in Emerald API

1. **Update Render environment**
   - Dashboard → emerald-api → Environment
   - Change `SYNC_SECRET` to new value
   - Save (will trigger restart)

2. **Wait for deployment**
   - Status should show "Live" (green) within 2 minutes
   - Check logs: Should see "Service started" messages

### Step 3: Update Staff Portal System

1. **Notify staff portal team**
   - Slack: _"SYNC_SECRET rotated in Emerald API. Please update staff portal SYNC_SECRET env var to: [new secret]"_
   - Provide explicit new secret value in private channel (not in public chat)

2. **Coordinate restart**
   - Both systems must have matching `SYNC_SECRET` before restarting
   - If mismatch: Sync will fail with 403 Unauthorized errors

3. **Monitor sync queue**
   - After both systems restarted, check: `GET /api/v1/admin/security/queue-health`
   - Look for `syncQueue.failed` count
   - Should remain stable (not increasing)

---

## SCENARIO 3: Rotate MONGODB_URI (High Impact - Full Outage)

**When:** Database compromise, URL exposed, or switching database clusters  
**Impact:** Complete database unavailability for 3-5 minutes  

### Step 1: Prepare (Critical)

1. **Notify stakeholders immediately**
   ```
   "🚨 DATABASE EMERGENCY - Preparing MongoDB credential rotation. Expect 5min downtime."
   ```

2. **Verify new database URL works**
   ```bash
   # From command line with admin access
   mongosh "mongodb+srv://admin:new_password@new-cluster.mongodb.net/emerald_production"
   # Should connect successfully
   ```

3. **If using MongoDB Atlas cluster rotation:**
   - Create failover cluster or failover read replica
   - Test connectivity from staging environment first

### Step 2: Execute Rotation

1. **Pause all background jobs** (to avoid connection pool issues)
   - SSH to Render or use dashboard controls
   - Kill BullMQ workers: `pm2 kill` (if possible)

2. **Update Render environment**
   - Dashboard → emerald-api → Environment
   - Update `MONGODB_URI` to new database URL
   - Save environment variables

3. **Render service restarts automatically**
   - Monitor: Dashboard → Activity/Logs
   - Should see "Service started" after 2-3 minutes

4. **Verify connectivity**
   ```bash
   curl https://api.emerald.local/health/ready
   # Must return 200 with mongo.ok = true
   ```

5. **Resume background jobs**
   - Restart workers if manually stopped
   - Monitor sync queue for backlog processing

### Step 3: Validate Data Integrity

```bash
# Verify core collections exist
mongosh "new_database_url" << EOF
db.bookings.countDocuments()
db.payments.countDocuments()
db.customers.countDocuments()
db.admins.countDocuments()
EOF
```

### Step 4: Post-Rotation Cleanup

1. **Old database:**
   - If old MongoDB Atlas cluster, delete after 24-hour observation period
   - Confirm new system stable first

2. **Document incident**
   - Record rotation start/end time
   - Note RTO and any issues encountered

---

## SCENARIO 4: SSO_SECRET Compromise Response

**When:** Google OAuth callback secret exposed  
**Impact:** SSO login temporarily unavailable, standard login works  

### Step 1: Rotate Secret

1. **Go to Google Cloud Console**
   - Project: Emerald API
   - OAuth 2.0 Client IDs → emerald-api-client
   - Generate new client secret
   - Keep old secret for now

2. **Update in Render**
   - Dashboard → emerald-api → Environment
   - Set `SSO_SECRET` = new secret from Google
   - Save and trigger restart

### Step 2: Revoke Old Secret

1. **In Google Cloud Console**
   - Under the same OAuth client
   - Delete/revoke old secret
   - Confirm in audit logs

2. **Notify users**
   - "SSO temporarily unavailable, use standard email/password login"
   - ETA for restoration: 5 minutes after service restart

---

## SCENARIO 5: REDIS_URL Compromise (Message Queue)

**When:** Redis connection string leaked or suspected compromise  
**Impact:** Background job queue offline temporarily  

### Step 1: If using managed Redis (Heroku/Render Redis)

1. **Create new Redis instance**
   - Render dashboard → Redis
   - Create new Redis instance in same region
   - Note new connection string

2. **Update Render environment**
   - Set `REDIS_URL` to new connection string
   - Trigger restart

3. **Old Redis instance**
   - After 1 hour of no errors, delete old Redis instance
   - Existing queue jobs will be lost (acceptable for queues)

### Step 2: Monitor background jobs

```bash
GET /api/v1/admin/security/queue-health
# Check: waiting, active, failed counts should stabilize quickly
```

---

## Emergency Secret Rotation (Complete Compromise)

**If multiple secrets compromised simultaneously:**

1. **Declare security incident**
   - Notify CEO, CTO, and security team immediately
   - Slack: `#security-incidents` private channel

2. **Rotate all critical secrets in parallel**
   - JWT_SECRET, SYNC_SECRET, SSO_SECRET
   - Generate all new secrets first (don't update one-by-one)
   - Update environment variables all at once
   - Single Render restart covers all changes

3. **Force all users to re-authenticate**
   - Clear all JWT tokens from database (invalidate sessions)
   - Users will be logged out automatically after token expiry
   - Post notification: "Please re-login for security update"

4. **Notify affected parties**
   - Staff portal team (for SYNC_SECRET)
   - External integrations (if any depend on API)
   - Customers (if frontend affected)

---

## Verification Checklist

After any secret rotation:

- [ ] Service restarted successfully (green status in Render)
- [ ] `/health/ready` returns 200 status
- [ ] Core API endpoints respond (test with curl + auth)
- [ ] Auth working: Can login with admin/staff/client credentials
- [ ] Background jobs running: `queue-health` shows processing
- [ ] No error spike in logs (< 1% error rate)
- [ ] External systems notified (staff portal, integrations)
- [ ] Team notified in Slack
- [ ] Incident documented (if security-related)

---

## Rollback Procedure

**If rotation causes unexpected failures:**

1. **Revert to old secret immediately**
   - Render dashboard → Environment → revert value
   - Save (triggers restart)

2. **Investigate root cause**
   - Why did new secret cause failures?
   - Usually: external system not notified in time

3. **Re-rotate with coordination**
   - Notify all dependent systems BEFORE rotating
   - Implement new secret in dependencies first
   - Then update in Emerald

---

## Related Documentation

- [GitHub Secrets Management](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Render Environment Variables](https://render.com/docs/environment-variables)
- [MongoDB Atlas Security](https://docs.atlas.mongodb.com/security/)
- [OAuth 2.0 Security](https://tools.ietf.org/html/rfc6749)

---

## Emergency Contacts

- **Security Lead:** [Name] - Slack: @security-lead
- **DevOps Lead:** [Name] - on-call via PagerDuty
- **CEO (for disclosure):** [Email]
- **External: Render Support:** support@render.com
