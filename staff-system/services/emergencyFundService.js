/**
 * emergencyFundService.js
 * Emergency Funds Security Layer — 12-step validation + payout.
 *
 * Exports:
 *   processEmergencyFund(params) — main flow
 *   requestOtp(adminId, eventId, deviceId, adminEmail) — OTP generation
 *   verifyBiometric(adminId, deviceId, ipAddress, userAgent) — biometric session creation
 *   unlockPayout(adminId, eventId, reason, unlockingAdminId) — payout lock removal
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const Assignment         = require('../models/Assignment');
const EmergencyFundAudit = require('../models/EmergencyFundAudit');
const EmergencyOtp       = require('../models/EmergencyOtp');
const RateLimitEntry     = require('../models/RateLimitEntry');
const BiometricSession   = require('../models/BiometricSession');
const mpesaService       = require('./mpesaService');

const EMERGENCY_THRESHOLD = parseInt(process.env.EMERGENCY_THRESHOLD, 10) || 10000;
const ADMIN_RATE_LIMIT    = 3;    // max requests per window
const ADMIN_RATE_WINDOW   = 15;   // minutes
const EVENT_COOLDOWN      = 30;   // minutes after successful payout

// ───────────────────────────────────────────────────────────────
// Helper: Haversine distance (km) between two GPS points
// ───────────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ───────────────────────────────────────────────────────────────
// STEP 1 — Rate Limit Check (MongoDB TTL)
// ───────────────────────────────────────────────────────────────
async function checkRateLimit(adminId, eventId) {
    const now = new Date();

    // Per-admin limit
    const adminKey = `emf:admin:${adminId}`;
    const adminEntry = await RateLimitEntry.findOne({ key: adminKey, expiresAt: { $gt: now } });
    if (adminEntry && adminEntry.count >= ADMIN_RATE_LIMIT) {
        return { limited: true, reason: 'Rate limit exceeded — max 3 emergency fund requests per 15 minutes' };
    }

    // Per-event cooldown (successful payouts only)
    const eventKey = `emf:event:${eventId}`;
    const eventEntry = await RateLimitEntry.findOne({ key: eventKey, expiresAt: { $gt: now } });
    if (eventEntry && eventEntry.count >= 1) {
        return { limited: true, reason: 'Event cooldown active — a successful payout was made within the last 30 minutes' };
    }

    return { limited: false };
}

// ───────────────────────────────────────────────────────────────
// STEP 12 — Update Rate Limit counters
// ───────────────────────────────────────────────────────────────
async function updateRateLimit(adminId, eventId, isSuccess) {
    const now = new Date();

    // Always update per-admin counter
    const adminKey = `emf:admin:${adminId}`;
    await RateLimitEntry.findOneAndUpdate(
        { key: adminKey, expiresAt: { $gt: now } },
        {
            $inc: { count: 1 },
            $setOnInsert: {
                key: adminKey,
                firstRequestAt: now,
                expiresAt: new Date(now.getTime() + ADMIN_RATE_WINDOW * 60 * 1000)
            }
        },
        { upsert: true, new: true }
    );

    // Per-event: only set cooldown on success
    if (isSuccess) {
        const eventKey = `emf:event:${eventId}`;
        await RateLimitEntry.findOneAndUpdate(
            { key: eventKey },
            {
                key: eventKey,
                count: 1,
                firstRequestAt: now,
                expiresAt: new Date(now.getTime() + EVENT_COOLDOWN * 60 * 1000)
            },
            { upsert: true, new: true }
        );
    }
}

// ───────────────────────────────────────────────────────────────
// STEP 7 — Fraud Detection
// ───────────────────────────────────────────────────────────────
async function detectFraud(adminId, eventId, amount, adminLat, adminLng) {
    const flags = [];
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Signal 1 — repeated_failures: 3+ failed in last 1 hour
    const failCount = await EmergencyFundAudit.countDocuments({
        admin_id: adminId,
        payout_status: 'failed',
        timestamp: { $gte: oneHourAgo }
    });
    if (failCount >= 3) flags.push('repeated_failures');

    // Signal 2 — excessive_event_attempts: > 2 attempts on same event today
    const eventAttempts = await EmergencyFundAudit.countDocuments({
        event_id: eventId,
        timestamp: { $gte: todayStart }
    });
    if (eventAttempts > 2) flags.push('excessive_event_attempts');

    // Signal 3 — unusually_high_amount: > 2× average successful payout
    const avgResult = await EmergencyFundAudit.aggregate([
        { $match: { payout_status: 'success' } },
        { $group: { _id: null, avg: { $avg: '$amount' } } }
    ]);
    if (avgResult.length > 0 && avgResult[0].avg > 0) {
        if (amount > 2 * avgResult[0].avg) flags.push('unusually_high_amount');
    }

    // Signal 4 — location_anomaly: admin GPS > 500km from all recent locations (24h)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentAudits = await EmergencyFundAudit.find({
        admin_id: adminId,
        payout_status: 'success',
        timestamp: { $gte: twentyFourHoursAgo },
        admin_lat: { $exists: true, $ne: null },
        admin_lng: { $exists: true, $ne: null }
    }).sort({ timestamp: -1 }).limit(3).lean();

    if (recentAudits.length > 0 && adminLat != null && adminLng != null) {
        const allFarAway = recentAudits.every(a =>
            haversineKm(adminLat, adminLng, a.admin_lat, a.admin_lng) > 500
        );
        if (allFarAway) flags.push('location_anomaly');
    }
    // If no previous records, skip without penalizing

    return flags;
}

// ───────────────────────────────────────────────────────────────
// OTP — Request (generate + send via email)
// ───────────────────────────────────────────────────────────────
async function requestOtp(adminId, eventId, deviceId, adminEmail) {
    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(code, salt);

    // Store hashed OTP with 5-min expiry
    await EmergencyOtp.create({
        admin_id: adminId,
        event_id: eventId,
        otp_hash: otpHash,
        device_id: deviceId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });

    // Send plain code via email
    try {
        const emailService = require('./emailService');
        if (emailService.sendTransactionalEmail) {
            await emailService.sendTransactionalEmail({
                to: adminEmail,
                subject: 'Emergency Fund OTP — Emerald Pearl Events',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2 style="color: #0a2f1c;">Emergency Fund Authorization</h2>
                        <p>Your one-time verification code is:</p>
                        <div style="font-size: 32px; font-weight: bold; color: #d4af37; letter-spacing: 8px; margin: 20px 0;">
                            ${code}
                        </div>
                        <p style="color: #666;">This code expires in 5 minutes. Do not share it with anyone.</p>
                        <p style="color: #999; font-size: 12px;">If you did not request this code, contact your administrator immediately.</p>
                    </div>
                `
            });
        } else {
            // Fallback: log to console in development
            console.log(`[EmergencyOTP] Code for admin ${adminId}: ${code} (email service unavailable)`);
        }
    } catch (emailErr) {
        console.error('[EmergencyOTP] Email send error:', emailErr.message);
        // Still return success — OTP is created, admin can use alternate channel
    }

    return { success: true, message: 'OTP sent to your registered email' };
}

// ───────────────────────────────────────────────────────────────
// OTP — Server-side verification
// ───────────────────────────────────────────────────────────────
async function verifyOtp(adminId, eventId, deviceId, code) {
    const now = new Date();
    const otpRecord = await EmergencyOtp.findOne({
        admin_id: adminId,
        event_id: eventId,
        device_id: deviceId,
        expiresAt: { $gt: now },
        verified: false
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
        return { valid: false, reason: 'No valid OTP found — request a new one' };
    }

    if (otpRecord.attempts >= 3) {
        return { valid: false, reason: 'Maximum OTP attempts exceeded — request a new code' };
    }

    const isMatch = await bcrypt.compare(code, otpRecord.otp_hash);
    if (!isMatch) {
        otpRecord.attempts += 1;
        await otpRecord.save();
        const remaining = 3 - otpRecord.attempts;
        return { valid: false, reason: `Invalid OTP — ${remaining} attempt(s) remaining` };
    }

    otpRecord.verified = true;
    await otpRecord.save();
    return { valid: true };
}

// ───────────────────────────────────────────────────────────────
// Biometric Session — Server-side creation
// ───────────────────────────────────────────────────────────────
async function verifyBiometric(adminId, deviceId, ipAddress, userAgent) {
    const session = await BiometricSession.create({
        admin_id: adminId,
        device_id: deviceId,
        verified_at: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        ip_address: ipAddress || '',
        user_agent: userAgent || ''
    });
    return session;
}

// ───────────────────────────────────────────────────────────────
// Main: processEmergencyFund — 12-step flow
// ───────────────────────────────────────────────────────────────
async function processEmergencyFund({
    adminId, eventId, amount, phone, reason, reasonCategory,
    adminLat, adminLng, deviceId, ipAddress, otpCode
}) {
    // ── STEP 1: Rate Limit Check ──────────────────────────────
    const rl = await checkRateLimit(adminId, eventId);
    if (rl.limited) {
        return { success: false, statusCode: 429, error: rl.reason };
    }

    // ── STEP 2: Event Status Check ────────────────────────────
    const assignment = await Assignment.findById(eventId);
    if (!assignment) {
        return { success: false, statusCode: 400, error: 'Event not found' };
    }
    if (!['LIVE', 'READY'].includes(assignment.lifecycle_state)) {
        return { success: false, statusCode: 400, error: `Event must be LIVE or READY — current state is ${assignment.lifecycle_state || 'PLANNED'}` };
    }

    // ── STEP 3: GPS Validation ────────────────────────────────
    if (adminLat == null || adminLng == null || isNaN(adminLat) || isNaN(adminLng)) {
        // Log failure audit
        await EmergencyFundAudit.create({
            admin_id: adminId, event_id: eventId, amount,
            admin_lat: adminLat, admin_lng: adminLng, admin_device_id: deviceId,
            ip_address: ipAddress, reason,
            reason_category: reasonCategory || 'other',
            payout_status: 'failed', failure_reason: 'GPS coordinates missing',
            biometric_verified: false, approval_status: 'rejected'
        });
        return { success: false, statusCode: 400, error: 'GPS coordinates (lat, lng) are required for emergency fund authorization' };
    }

    // ── STEP 4: Biometric Check ───────────────────────────────
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const bioSession = await BiometricSession.findOne({
        admin_id: adminId,
        verified_at: { $gte: fiveMinAgo },
        verification_method: 'webauthn'
    });

    if (!bioSession) {
        await EmergencyFundAudit.create({
            admin_id: adminId, event_id: eventId, amount,
            admin_lat: adminLat, admin_lng: adminLng, admin_device_id: deviceId,
            ip_address: ipAddress, reason,
            reason_category: reasonCategory || 'other',
            payout_status: 'failed', failure_reason: 'WebAuthn biometric verification not found or expired',
            biometric_verified: false, approval_status: 'rejected'
        });
        return { success: false, statusCode: 403, error: 'WebAuthn biometric verification required — please authenticate with your registered device first' };
    }

    // ── STEP 5: Payout Lock Check ─────────────────────────────
    let dualApprovalRequired = false;
    let approvalType = 'otp';
    let approvalStatus = 'pending';

    const lockedAudit = await EmergencyFundAudit.findOne({
        event_id: eventId,
        payout_locked: true
    });

    if (lockedAudit) {
        dualApprovalRequired = true;
        approvalType = 'second_admin';
    }

    // ── STEP 6: Threshold Check ───────────────────────────────
    if (amount > EMERGENCY_THRESHOLD) {
        dualApprovalRequired = true;
        if (!otpCode) {
            return { success: false, statusCode: 403, error: `Amount exceeds KES ${EMERGENCY_THRESHOLD.toLocaleString()} threshold — OTP verification required` };
        }
        const otpResult = await verifyOtp(adminId, eventId, deviceId, otpCode);
        if (!otpResult.valid) {
            return { success: false, statusCode: 403, error: otpResult.reason };
        }
        approvalType = 'otp';
    }

    // If no dual approval criteria triggered, switch to standard approval route
    if (!dualApprovalRequired) {
        approvalStatus = 'approved';
        approvalType = 'none';
        if (otpCode) {
            const otpResult = await verifyOtp(adminId, eventId, deviceId, otpCode);
            if (otpResult.valid) approvalType = 'otp';
        }
    }

    // ── STEP 7: Fraud Detection ───────────────────────────────
    const fraudFlags = await detectFraud(adminId, eventId, amount, adminLat, adminLng);

    // Get venue coordinates for reference
    let venueLat = assignment.gps_location?.lat || null;
    let venueLng = assignment.gps_location?.lng || null;

    if (fraudFlags.length >= 2) {
        // Auto-reject
        await EmergencyFundAudit.create({
            admin_id: adminId, event_id: eventId, amount,
            admin_lat: adminLat, admin_lng: adminLng, admin_device_id: deviceId,
            ip_address: ipAddress, reason,
            reason_category: reasonCategory || 'other',
            biometric_verified: true,
            approval_type: approvalType, approval_status: 'rejected',
            payout_status: 'failed',
            failure_reason: `Fraud detection: ${fraudFlags.join(', ')}`,
            fraud_flags: fraudFlags,
            venue_lat: venueLat, venue_lng: venueLng
        });

        if (global.io) {
            global.io.to('Admin').emit('cmd:fraud_alert', {
                event_id: eventId, admin_id: adminId, flags: fraudFlags, amount, timestamp: new Date()
            });
        }

        return { success: false, statusCode: 403, error: 'Request flagged by fraud detection — contact a senior administrator', fraudFlags };
    }

    // ── STEP 8: Create Audit Record (pending) ─────────────────
    const audit = await EmergencyFundAudit.create({
        admin_id: adminId,
        event_id: eventId,
        amount,
        target_phone_number: phone, 
        admin_lat: adminLat,
        admin_lng: adminLng,
        admin_device_id: deviceId,
        ip_address: ipAddress,
        biometric_verified: true,
        approval_type: approvalType,
        approval_status: approvalStatus,
        reason,
        reason_category: reasonCategory || 'other',
        payout_status: 'pending',
        fraud_flags: fraudFlags,
        venue_lat: venueLat,
        venue_lng: venueLng,

        first_admin_id: adminId,
        first_admin_verified_at: new Date(),
        first_admin_lat: adminLat,
        first_admin_lng: adminLng,
        dual_approval_required: dualApprovalRequired,
        dual_approval_completed: false,
        dual_approval_expires_at: dualApprovalRequired ? new Date(Date.now() + 30 * 60 * 1000) : null
    });

    if (dualApprovalRequired) {
        // Emit Socket.IO event to Admin Room
        if (global.io) {
            const Staff = require('../models/Staff');
            const admin = await Staff.findById(adminId).select('name').lean();
            global.io.to('Admin').emit('cmd:dual_approval_required', {
                audit_id: audit._id,
                event_id: eventId,
                event_name: assignment.title,
                amount,
                first_admin_name: admin?.name || 'Unknown',
                first_admin_lat: adminLat,
                first_admin_lng: adminLng,
                timestamp: new Date().toISOString(),
                message: `Emergency fund request of KES ${amount} requires your approval`
            });
        }
        
        // Log WebAuthn Dual Approval Submitted Event
        await require('../models/AuditLog').create({
            actionType: 'dual_approval_submitted',
            targetModel: 'Staff',
            targetId: adminId,
            performedBy: adminId,
            details: { audit_id: audit._id, event_id: eventId, amount },
            ipAddress
        }).catch(err => console.error(err));
        
        return {
            success: true,
            statusCode: 202,
            message: 'Emergency fund request submitted and is pending dual authorization.',
            audit: { _id: audit._id, approval_status: 'pending' },
            pending_approval: true
        };
    }

    // Call executePayout for single-auth payouts
    return await executePayout(audit, assignment, adminId);
}

// ───────────────────────────────────────────────────────────────
// Helper: executePayout — 12-step separated execution hook
// ───────────────────────────────────────────────────────────────
async function executePayout(audit, assignment, lockAdminId) {
    let payoutResult;
    try {
        payoutResult = await mpesaService.b2cPayment({
            phone: audit.target_phone_number || '',
            amount: audit.amount,
            assignmentId: audit.event_id,
            staffPaymentId: audit._id.toString(),
            remarks: `Emergency: ${audit.reason || 'Fund disbursement'}`
        });

        // ── STEP 10: On Success ───────────────────────────────
        audit.payout_status = 'success';
        audit.payout_reference = payoutResult?.ConversationID || payoutResult?.OriginatorConversationID || '';
        audit.payout_locked = true;
        audit.locked_by = lockAdminId;
        audit.lock_reason = 'Auto-locked after emergency fund disbursement';
        await audit.save();

        if (global.io) {
            const Staff = require('../models/Staff');
            const lockedAdmin = await Staff.findById(lockAdminId).select('name').lean();
            global.io.to('Admin').emit('emergencyFundSent', {
                event_id: audit.event_id,
                event_title: assignment.title,
                amount: audit.amount,
                admin_name: lockedAdmin?.name || 'Unknown',
                admin_lat: audit.admin_lat,
                admin_lng: audit.admin_lng,
                timestamp: new Date()
            });
            global.io.to('Admin').emit('cmd:payout_locked', {
                event_id: audit.event_id, locked_by: lockAdminId, timestamp: new Date()
            });
        }
    } catch (payoutError) {
        // ── STEP 11: On Failure ───────────────────────────────
        audit.payout_status = 'failed';
        audit.failure_reason = payoutError.message || 'M-Pesa B2C payout failed';
        await audit.save();
        payoutResult = null;
    }

    // ── STEP 12: Update Rate Limit ────────────────────────────
    await updateRateLimit(audit.admin_id, audit.event_id, audit.payout_status === 'success');

    return {
        success: audit.payout_status === 'success',
        statusCode: audit.payout_status === 'success' ? 200 : 502,
        audit: {
            _id: audit._id,
            payout_status: audit.payout_status,
            payout_reference: audit.payout_reference,
            failure_reason: audit.failure_reason,
            fraud_flags: audit.fraud_flags
        },
        payoutResult
    };
}

// ───────────────────────────────────────────────────────────────
// Unlock Payout — requires different admin + reason
// ───────────────────────────────────────────────────────────────
async function unlockPayout(eventId, unlockingAdminId, reason) {
    const lockedAudit = await EmergencyFundAudit.findOne({
        event_id: eventId,
        payout_locked: true,
        unlocked_by: { $exists: false }
    });

    if (!lockedAudit) {
        return { success: false, statusCode: 404, error: 'No active payout lock found for this event' };
    }

    // Must be a different admin
    if (lockedAudit.locked_by?.toString() === unlockingAdminId.toString()) {
        return { success: false, statusCode: 403, error: 'Cannot unlock your own payout lock — a different administrator must approve' };
    }

    lockedAudit.unlocked_by = unlockingAdminId;
    lockedAudit.lock_reason = reason || 'Elevated approval granted';
    await lockedAudit.save();

    return { success: true, message: 'Payout lock removed — event is now eligible for further emergency payouts' };
}

module.exports = {
    processEmergencyFund,
    executePayout,
    requestOtp,
    verifyBiometric,
    verifyOtp,
    unlockPayout,
    // Exported for testing
    _checkRateLimit: checkRateLimit,
    _detectFraud: detectFraud
};
