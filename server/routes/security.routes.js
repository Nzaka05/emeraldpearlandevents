/**
 * Admin Security Center Routes
 * All endpoints require admin authentication
 */

const express = require('express');
const router = express.Router();
const { verifyAdminJWT } = require('../middleware/adminAuth');
const SecurityEvent = require('../models/SecurityEvent');
const Booking = require('../models/Booking');
const Payment = require('../models/ClientPayment');
const logger = require('../utils/logger');
const { bookingQueue, paymentQueue, notificationQueue, syncQueue } = require('../../config/queues');
const { createSyncHeaders } = require('../../staff-system/middleware/syncAuth');

// Middleware to verify admin role
const requireAdmin = (req, res, next) => {
    const allowedRoles = ['admin', 'super_admin', 'manager'];
    if (!allowedRoles.includes(req.admin?.role)) {
        return res.status(403).json({
            success: false,
            message: 'Access denied: admin role required'
        });
    }
    next();
};

// GET /api/v1/admin/security/events
router.get('/events', verifyAdminJWT, requireAdmin, async (req, res) => {
    try {
        const { eventType, limit = 100 } = req.query;
        const filter = {};

        if (eventType) {
            filter.eventType = eventType;
        }

        const events = await SecurityEvent.find(filter)
            .sort({ createdAt: -1 })
            .limit(Math.min(parseInt(limit), 100))
            .lean();

        res.json({
            success: true,
            data: { events }
        });
    } catch (err) {
        logger.error({ err }, 'Security events endpoint error');
        res.status(500).json({
            success: false,
            message: 'Error fetching security events'
        });
    }
});

// GET /api/v1/admin/security/sync-status
router.get('/sync-status', verifyAdminJWT, requireAdmin, async (req, res) => {
    try {
        const bookingSyncCounts = await Booking.aggregate([
            {
                $group: {
                    _id: '$syncStatus',
                    count: { $sum: 1 }
                }
            }
        ]);

        const paymentSyncCounts = await Payment.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const bookingsResult = {
            pending: 0,
            synced: 0,
            failed: 0
        };

        const paymentsResult = {
            pending: 0,
            synced: 0,
            failed: 0
        };

        bookingSyncCounts.forEach(item => {
            if (item._id === 'pending') bookingsResult.pending = item.count;
            else if (item._id === 'synced') bookingsResult.synced = item.count;
            else if (item._id === 'failed') bookingsResult.failed = item.count;
        });

        paymentSyncCounts.forEach(item => {
            if (item._id === 'Pending') paymentsResult.pending = item.count;
            else if (item._id === 'Confirmed') paymentsResult.synced = item.count;
            else if (item._id === 'Failed') paymentsResult.failed = item.count;
        });

        res.json({
            success: true,
            data: {
                bookings: bookingsResult,
                payments: paymentsResult
            }
        });
    } catch (err) {
        logger.error({ err }, 'Sync status endpoint error');
        res.status(500).json({
            success: false,
            message: 'Error fetching sync status'
        });
    }
});

// POST /api/v1/admin/security/sync-retry/:bookingId
router.post('/sync-retry/:bookingId', verifyAdminJWT, requireAdmin, async (req, res) => {
    try {
        const { bookingId } = req.params;

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Trigger sync retry by queuing or calling directly
        try {
            // Simulate the reconciliation sync directly
            const fetch = require('node-fetch');
            const Customer = require('../models/Customer');

            const STAFF_SYSTEM_BASE_URL = process.env.STAFF_SYSTEM_BASE_URL || 'https://emerald-staff-system.onrender.com';
            const SYNC_SECRET = process.env.SYNC_SECRET;

            const customer = await Customer.findById(booking.customerId).select('name email').lean();

            const payload = {
                title: `${booking.eventType} — ${customer?.name || 'Client'}`,
                description: booking.notes || '',
                location: booking.location,
                date: booking.eventDate,
                start_time: null,
                end_time: null,
                pay_rate: 1000,
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
                timeout: 10000
            });

            if (!response.ok) {
                throw new Error(`Staff portal responded ${response.status}`);
            }

            booking.syncStatus = 'synced';
            booking.lastSyncAttempt = new Date();
            booking.syncAttempts = (booking.syncAttempts || 0) + 1;
            booking.lastSyncError = null;
            await booking.save();

            logger.info({ bookingId }, 'Manual sync retry succeeded');

            res.json({
                success: true,
                data: { booking }
            });
        } catch (syncErr) {
            booking.syncStatus = 'pending';
            booking.lastSyncAttempt = new Date();
            booking.syncAttempts = (booking.syncAttempts || 0) + 1;
            booking.lastSyncError = syncErr.message;
            await booking.save();

            logger.warn({ err: syncErr, bookingId }, 'Manual sync retry failed');

            res.status(503).json({
                success: false,
                message: 'Sync retry failed: ' + syncErr.message
            });
        }
    } catch (err) {
        logger.error({ err }, 'Sync retry endpoint error');
        res.status(500).json({
            success: false,
            message: 'Error processing sync retry'
        });
    }
});

// GET /api/v1/admin/security/queue-health
router.get('/queue-health', verifyAdminJWT, requireAdmin, async (req, res) => {
    try {
        const queueNames = ['bookingQueue', 'paymentQueue', 'notificationQueue', 'syncQueue'];
        const queues = [bookingQueue, paymentQueue, notificationQueue, syncQueue];
        const queueStats = [];

        for (let i = 0; i < queues.length; i++) {
            try {
                const counts = await queues[i].getJobCounts?.();
                queueStats.push({
                    name: queueNames[i],
                    waiting: counts?.waiting || 0,
                    active: counts?.active || 0,
                    completed: counts?.completed || 0,
                    failed: counts?.failed || 0,
                    delayed: counts?.delayed || 0
                });
            } catch (err) {
                logger.warn({ err, queueName: queueNames[i] }, 'Failed to get queue stats');
                queueStats.push({
                    name: queueNames[i],
                    waiting: 0,
                    active: 0,
                    completed: 0,
                    failed: 0,
                    delayed: 0
                });
            }
        }

        res.json({
            success: true,
            data: { queues: queueStats }
        });
    } catch (err) {
        logger.error({ err }, 'Queue health endpoint error');
        res.status(500).json({
            success: false,
            message: 'Error fetching queue health'
        });
    }
});

// GET /api/v1/admin/security/env-check
router.get('/env-check', verifyAdminJWT, requireAdmin, (req, res) => {
    try {
        const requiredVars = [
            'JWT_SECRET',
            'STAFF_JWT_SECRET',
            'CLIENT_JWT_SECRET',
            'SSO_JWT_SECRET',
            'SYNC_SECRET',
            'REDIS_URL',
            'ALLOWED_ORIGINS',
            'MONGO_URI'
        ];

        const variables = {};
        requiredVars.forEach(varName => {
            variables[varName] = !!process.env[varName];
        });

        res.json({
            success: true,
            data: { variables }
        });
    } catch (err) {
        logger.error({ err }, 'Env check endpoint error');
        res.status(500).json({
            success: false,
            message: 'Error checking environment'
        });
    }
});

module.exports = router;
