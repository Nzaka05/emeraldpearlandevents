/**
 * reconciliationJob.js
 *
 * Runs every 15 minutes. Finds all bookings where syncStatus is 'failed'
 * or 'pending' (and the last attempt was > 5 minutes ago), then retries
 * the sync to the staff portal. After 5 failed attempts the record is
 * left as 'failed' for manual review — it will not be retried further.
 *
 * Place this file at: server/jobs/reconciliationJob.js
 * Call startReconciliationJob() from server-prod.js after DB connects.
 */

const logger = require('../utils/logger');
const { createSyncHeaders } = require('../../staff-system/middleware/syncAuth');

const MAX_ATTEMPTS = 5;
const RETRY_AFTER_MS = 5 * 60 * 1000;       // 5 minutes
const JOB_INTERVAL_MS = 15 * 60 * 1000;     // 15 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Core sync function — mirrors what the booking confirm handler does
// ─────────────────────────────────────────────────────────────────────────────

async function syncToStaffPortal(booking) {
    const fetch = require('node-fetch');

    const STAFF_SYSTEM_BASE_URL =
        process.env.STAFF_SYSTEM_BASE_URL || 'https://emerald-staff-system.onrender.com';
    const SYNC_SECRET = process.env.SYNC_SECRET;

    const Customer = require('../models/Customer');
    const customer = await Customer.findById(booking.customerId).select('name email').lean();

    const payload = {
        title: `${booking.eventType} — ${customer?.name || 'Client'}`,
        description: booking.notes || '',
        location: booking.location,
        date: booking.eventDate,
        start_time: null,   // set by admin in staff portal after sync
        end_time: null,
        pay_rate: 1000,     // default — admin updates in staff portal
        required_staff_count: booking.usherCount || 1,
        booking_ref: booking.bookingReference,
        client_name: customer?.name || '',
        client_email: customer?.email || '',
        clientPaymentAmount: booking.amountPaid || 0,
        usherCount: booking.usherCount || 0
    };

    const hmacHeaders = createSyncHeaders(SYNC_SECRET, payload);
    const response = await fetch(`${STAFF_SYSTEM_BASE_URL}/internal/sync-booking`, {
        method: 'POST',
        headers: hmacHeaders,
        body: JSON.stringify(payload),
        timeout: 10000  // 10 second timeout per attempt
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Staff portal responded ${response.status}: ${text}`);
    }

    return await response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main reconciliation pass
// ─────────────────────────────────────────────────────────────────────────────

async function runReconciliation() {
    logger.info('Reconciliation job running');
    const Booking = require('../models/Booking');

    const cutoff = new Date(Date.now() - RETRY_AFTER_MS);

    // Find bookings that need a sync retry:
    // - syncStatus is 'failed' or 'pending'
    // - last attempt was > 5 minutes ago (or never attempted)
    // - haven't exceeded max attempts
    const staleBookings = await Booking.find({
        syncStatus: { $in: ['failed', 'pending'] },
        $or: [
            { lastSyncAttempt: { $lt: cutoff } },
            { lastSyncAttempt: null }
        ],
        syncAttempts: { $lt: MAX_ATTEMPTS }
    }).select('_id bookingReference eventType eventDate location notes customerId amountPaid usherCount syncAttempts').lean();

    if (staleBookings.length === 0) {
        logger.info('No bookings require sync retry');
        return;
    }

    logger.info({ count: staleBookings.length }, 'Found bookings to retry sync');

    const results = await Promise.allSettled(
        staleBookings.map(async (booking) => {
            try {
                await syncToStaffPortal(booking);

                await Booking.findByIdAndUpdate(booking._id, {
                    syncStatus: 'synced',
                    lastSyncAttempt: new Date(),
                    $inc: { syncAttempts: 1 },
                    $unset: { lastSyncError: 1 }
                });

                logger.info(
                    { bookingId: booking._id?.toString(), syncAttempts: (booking.syncAttempts || 0) + 1 },
                    'Sync retry succeeded'
                );
            } catch (err) {
                const nextAttempt = (booking.syncAttempts || 0) + 1;
                const exhausted = nextAttempt >= MAX_ATTEMPTS;

                await Booking.findByIdAndUpdate(booking._id, {
                    syncStatus: exhausted ? 'failed' : 'pending',
                    lastSyncAttempt: new Date(),
                    $inc: { syncAttempts: 1 },
                    lastSyncError: err.message
                });

                logger.error(
                    { err, bookingId: booking._id?.toString(), syncAttempts: nextAttempt },
                    'Sync retry failed'
                );

                if (exhausted) {
                    logger.warn(
                        { bookingId: booking._id?.toString(), syncAttempts: nextAttempt, maxAttempts: MAX_ATTEMPTS },
                        'Sync retries exhausted for booking'
                    );
                } else {
                    logger.warn(
                        { bookingId: booking._id?.toString(), syncAttempts: nextAttempt, maxAttempts: MAX_ATTEMPTS },
                        'Sync retry scheduled for next reconciliation pass'
                    );
                }
            }
        })
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    logger.info({ succeeded, total: staleBookings.length }, 'Reconciliation pass complete');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler
// ─────────────────────────────────────────────────────────────────────────────

function startReconciliationJob() {
    logger.info({ intervalMs: JOB_INTERVAL_MS }, 'Reconciliation job scheduled');

    // Run once immediately on startup to catch anything that failed during a
    // previous deployment or crash
    runReconciliation().catch(err =>
        logger.error({ err }, 'Reconciliation startup run failed')
    );

    setInterval(() => {
        runReconciliation().catch(err =>
            logger.error({ err }, 'Reconciliation scheduled run failed')
        );
    }, JOB_INTERVAL_MS);
}

module.exports = {
    startReconciliationJob,
    _runNow: runReconciliation  // exposed for manual testing / admin trigger
};
