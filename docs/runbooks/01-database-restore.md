# Database Restore Runbook

**Purpose:** Restore database from backup to recover lost or corrupted data.  
**RPO:** <15 minutes (point-in-time recovery window)  
**RTO:** <1 hour  
**Owner:** DevOps / Database Administrator

---

## Prerequisites

- MongoDB Atlas cluster access (admin credentials required)
- Render deployment credentials (GitHub authentication)
- Access to backup snapshots (automated hourly backups)

---

## Step 1: Assess Damage

**Objective:** Determine scope and impact of data loss

1. **Check MongoDB Alert Manager**
   - Navigate to https://cloud.mongodb.com/v2
   - Go to `Alerts` → review recent alerts
   - Check `Backup` section for snapshot availability

2. **Identify affected data**
   - SSH to Render instance or use MongoDB Compass
   - Query affected collections:
     ```bash
     db.bookings.countDocuments({ createdAt: { $gte: ISODate("2024-01-15T10:00:00Z") } })
     db.payments.countDocuments({ createdAt: { $gte: ISODate("2024-01-15T10:00:00Z") } })
     ```
   - Document the time range of data loss

3. **Note the target recovery point**
   - Example: "Restore to 2024-01-15 09:45 UTC" (15 minutes before incident)

---

## Step 2: Select Backup

**Objective:** Choose the appropriate snapshot to restore

1. **List available snapshots**
   - MongoDB Atlas console → Backup → Snapshots
   - Filter by date/time range
   - Verify snapshot was taken BEFORE the incident

2. **Verify backup integrity**
   - Check "Backup Status" shows "Ready"
   - Confirm snapshot size is > 1GB (reasonable for production data)

3. **Record snapshot ID** (example: `5f8a9c1a2b3c4d5e6f7g8h9i`)

---

## Step 3: Prepare Restore Window

**Objective:** Minimize downtime by coordinating deployment pause

1. **Notify stakeholders**
   - Send alert in team Slack: _"Database restore in progress. API may be intermittently unavailable for 30-45 minutes."_

2. **Pause booking system**
   - POST to `/api/v1/admin/system/pause` with admin token
   - Or manually kill booking queue: `npx pm2 kill` on Render dashboard

3. **Stop reconciliation job**
   - SSH into Render: `render ssh --service emerald-api`
   - Kill cron jobs: `pkill -f reconciliation`

---

## Step 4: Restore Database

**Objective:** Trigger point-in-time restore in MongoDB Atlas

1. **Navigate to Backup Restore**
   - MongoDB Atlas console → Backups → Snapshots
   - Click snapshot → `Restore` → `Restore to New Cluster`

2. **Configure restore parameters**
   - Target Cluster: Select same region/tier as original
   - Database Name: `emerald_production` (matching original)
   - Disable automatic index creation (we'll recreate them)

3. **Initiate restore**
   - Click `Restore`
   - Wait 5-10 minutes for restore to complete
   - Status page will show "Restore Complete"

---

## Step 5: Verify Restored Data

**Objective:** Confirm restore integrity before cutover

1. **Connect to restored cluster**
   - Use MongoDB Compass with connection string from Atlas
   - Or use mongosh: `mongosh "mongodb+srv://admin:<password>@restored-cluster.mongodb.net/emerald_production"`

2. **Validate document counts**
   ```javascript
   // Run on restored cluster
   db.bookings.countDocuments()     // Should match pre-incident count
   db.payments.countDocuments()
   db.customers.countDocuments()
   db.admins.countDocuments()
   ```

3. **Spot-check critical records**
   ```javascript
   db.bookings.findOne({ bookingReference: 'EPE-BWD-...' })
   db.payments.findOne({ status: 'Confirmed' })
   ```

4. **If corruption found:**
   - Restore to earlier snapshot (repeat Steps 2-4)
   - Document root cause for post-incident review

---

## Step 6: Perform Cutover

**Objective:** Switch application to restored database

### Option A: DNS Cutover (Recommended)

1. **Update MongoDB connection string**
   - SSH to Render: `render ssh --service emerald-api`
   - Edit `.env`: Change `MONGODB_URI` to restored cluster connection
   - Restart service: `pm2 restart server-prod`

2. **Monitor application**
   - Check `/health/ready` endpoint - should return 200
   - Monitor error logs: `pm2 logs server-prod`
   - Verify bookings API: `curl -H "Authorization: Bearer $TOKEN" https://api.emerald.local/api/v1/bookings`

### Option B: Cluster Swap (MongoDB Atlas)

1. **Create DNS alias to new cluster** (if using read replicas)
2. **Switch Atlas config to point restored cluster as primary**
3. **Restart application** (forces new connection)

---

## Step 7: Run Health Checks

**Objective:** Confirm system fully operational

1. **API health**
   ```bash
   curl https://api.emerald.local/health/ready
   # Expected: 200 with { "status": "ok", "checks": { "mongo": { "ok": true } } }
   ```

2. **Application smoke tests**
   - Create test booking: `POST /api/v1/bookings`
   - Verify booking appears in list: `GET /api/v1/bookings`
   - Check staff portal sync: Booking should appear on staff portal within 60s

3. **Resume booking system**
   - POST to `/api/v1/admin/system/resume` with admin token
   - Test new booking creation from web UI

4. **Monitor reconciliation**
   - Check BullMQ queue status: `GET /api/v1/admin/security/queue-health`
   - Verify sync jobs processing: Count should decrease over 5 minutes

---

## Step 8: Decommission Old Cluster

**Objective:** Clean up and document

1. **Confirm restored cluster is stable**
   - Run for minimum 1 hour without errors
   - Monitor error rate and response times

2. **Delete old/corrupted cluster**
   - MongoDB Atlas → Clusters → Select old cluster → Delete
   - Confirm deletion (this is irreversible)

3. **Update documentation**
   - Record incident start/end time
   - Update backup retention policy if needed
   - Notify team in Slack: _"Database restore complete. System fully operational."_

4. **Post-incident review**
   - Schedule retrospective meeting
   - Document root cause analysis
   - Update preventive measures (e.g., scheduled backup validation)

---

## Rollback Procedure

**If restored data is worse than original:**

1. Revert MongoDB URI back to original cluster
2. Restart application
3. Return to Step 6 (Perform Cutover) with original cluster

---

## Emergency Contacts

- **Database Owner:** [Team Lead] - Slack: @db-admin
- **DevOps Lead:** [Name] - Email: devops@emerald.local
- **On-Call SRE:** See PagerDuty escalation

---

## Related Documents

- [Database Backup Policy](../policies/backup-policy.md)
- [MongoDB Atlas Documentation](https://docs.mongodb.com/manual/)
- [Render Deployment Guide](../deployment/render-guide.md)
