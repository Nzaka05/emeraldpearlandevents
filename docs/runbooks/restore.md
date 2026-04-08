# Database Restore Runbook

## Purpose
Restore the Emerald production database from MongoDB Atlas backups safely.

## Scope
- Cluster: emerald production cluster
- Data source: Atlas snapshots / point-in-time restore (PITR)

## Preconditions
- Atlas access with backup/restore permissions
- Maintenance window approved
- Current app release tag noted
- Latest backup timestamp confirmed

## Restore Strategy
1. Create a new restore target cluster from backup (recommended).
2. Validate restored data on the target cluster.
3. Switch application `MONGO_URI` to restored cluster when validated.
4. Keep previous cluster unchanged until post-cutover verification is complete.

## Procedure
1. In Atlas, open the target cluster and go to Backup.
2. Select the restore point (snapshot or PITR timestamp).
3. Restore to a new cluster (do not overwrite live first).
4. Wait for cluster provisioning and restore completion.
5. Run smoke checks:
   - Admin login
   - Booking list loads
   - Staff portal login
   - Payment records and event assignments
6. Update environment variable `MONGO_URI` on Render services.
7. Redeploy services and re-run smoke checks.
8. Monitor logs and error rates for at least 30 minutes.

## Validation Checklist
- Application starts without DB connection errors
- Recent bookings exist and are queryable
- Staff assignments and payment data are intact
- Critical endpoints return expected status codes

## Rollback
If validation fails:
1. Revert `MONGO_URI` to previous cluster.
2. Redeploy services.
3. Confirm service health.
4. Open incident report with observed restore mismatch details.

## Notes
- Keep PITR enabled in Atlas for rapid recovery.
- Record each restore event date/time and operator in ops logs.
