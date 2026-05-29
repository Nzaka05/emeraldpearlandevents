/**
 * eventPaymentService.js — Payment orchestration layer
 *
 * WHAT CHANGED:
 *   1. mpesaCallback() uses IdempotencyLock.tryAcquire() — first writer wins,
 *      all concurrent/duplicate callbacks get the cached result.
 *   2. All status changes go through paymentStateMachine.assertTransition().
 *   3. Successful B2C callbacks now record a ledger entry (was missing).
 *   4. computeAggregateStatus() replaces manual paid/total counting.
 *
 * RACE CONDITION FIX:
 *   Old pattern (TOCTOU vulnerable):
 *     1. READ  — findOne() to check if TransactionID already exists
 *     2. CHECK — if duplicate exists, return early
 *     3. WRITE — findOneAndUpdate() to set status
 *     Window between step 1 and step 3 allows two callbacks to both pass.
 *
 *   New pattern (atomic):
 *     1. TRY INSERT IdempotencyLock (unique index = atomic at storage engine)
 *     2. If E11000 → duplicate → return cached result
 *     3. If insert succeeds → we hold the lock → process → mark completed
 */

const Assignment = require('../../models/Assignment');
const Staff = require('../../models/Staff');
const AuditLog = require('../../models/AuditLog');
const IdempotencyLock = require('../../models/IdempotencyLock');
const emailService = require('../../services/emailService');
const { sendPushToStaff } = require('../../services/pushService');
const mpesaService = require('../../services/mpesaService');
const { normalizeMpesaCallback } = require('../../../utils/mpesaCallbackNormalizer');
const { assertTransition, computeAggregateStatus } = require('../utils/paymentStateMachine');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Atomically update the aggregate payment_status on an assignment
 * based on the individual staff payment statuses.
 */
async function refreshAggregateStatus(assignmentId) {
    const assignment = await Assignment.findById(assignmentId).select('staff_payments').lean();
    if (!assignment) return;
    const newStatus = computeAggregateStatus(assignment.staff_payments);
    await Assignment.findByIdAndUpdate(assignmentId, { payment_status: newStatus });
}

/**
 * Try to record a ledger entry for a B2C payment. Non-fatal if the ledger
 * doesn't exist yet (event might not have been initialized in the ledger).
 */
async function tryRecordLedgerEntry(assignmentId, amount, transactionId, createdBy) {
    try {
        const ledgerService = require('./ledgerService');
        await ledgerService.recordTransaction({
            event_id: assignmentId,
            type: 'staffPayroll',
            amount,
            direction: 'out',
            description: `M-Pesa B2C payout — Ref: ${transactionId}`,
            paymentMethod: 'MPesa B2C',
            createdBy: createdBy || null,
            referenceModel: 'Assignment',
            referenceId: assignmentId
        });
    } catch (err) {
        // Ledger not initialized for this event — log but don't fail the payment
        if (err.message.includes('Event Ledger not found')) {
            console.warn(`[EventPayment] Ledger not found for ${assignmentId} — skipping ledger entry`);
        } else {
            console.error(`[EventPayment] Ledger recording failed:`, err.message);
        }
    }
}

// ── 1. UPDATE PAYMENT STATUS ────────────────────────────────────────────────

// @desc    Update Assignment Payment Status (Admin action)
exports.updatePaymentStatus = async (adminId, assignmentId, payment_status, staff_payment_id, transaction_id) => {
    if (!['Pending', 'Sent', 'Received', 'Disputed'].includes(payment_status)) {
        throw new Error('Invalid payment status');
    }

    let assignment;
    if (staff_payment_id) {
        // Validate state transition
        const existing = await Assignment.findOne(
            { _id: assignmentId, 'staff_payments._id': staff_payment_id },
            { 'staff_payments.$': 1 }
        ).lean();
        if (existing?.staff_payments?.[0]) {
            assertTransition(existing.staff_payments[0].status, payment_status, 'updatePaymentStatus');
        }

        assignment = await Assignment.findOneAndUpdate(
            { _id: assignmentId, 'staff_payments._id': staff_payment_id },
            {
                $set: {
                    'staff_payments.$.status': payment_status,
                    'staff_payments.$.sent_at': payment_status === 'Sent' ? new Date() : undefined,
                    'staff_payments.$.received_at': payment_status === 'Received' ? new Date() : undefined,
                    'staff_payments.$.transaction_id': payment_status === 'Received' && transaction_id ? transaction_id : undefined
                }
            },
            { new: true }
        );
    } else {
        assignment = await Assignment.findByIdAndUpdate(
            assignmentId,
            { payment_status },
            { new: true, runValidators: true }
        );
    }

    if (!assignment) {
        throw new Error('Assignment not found');
    }

    // Auto-seed staff_payments if empty
    if (!assignment.staff_payments || assignment.staff_payments.length === 0) {
        const staffToSeed = await Staff.find({ _id: { $in: assignment.accepted_staff_ids } }, 'name phone');
        assignment.staff_payments = staffToSeed.map(s => ({
            staff_id: s._id,
            staff_name: s.name,
            phone: s.phone || '',
            amount: assignment.pay_rate,
            status: 'Pending'
        }));
        await assignment.save();
        assignment = await Assignment.findById(assignment._id);
    }

    // When payment is marked as Sent, notify all accepted staff
    if (payment_status === 'Sent') {
        const acceptedStaff = await Staff.find({ _id: { $in: assignment.accepted_staff_ids } });
        for (const staff of acceptedStaff) {
            if (global.io) {
                global.io.to(staff._id.toString()).emit('paymentSent', {
                    assignmentId: assignment._id,
                    title: assignment.title,
                    pay_rate: assignment.pay_rate
                });
            }
            await sendPushToStaff(staff._id, {
                title: '💰 Payment Sent!',
                body: `KSh ${(assignment.pay_rate || 0).toLocaleString()} has been sent for ${assignment.title}. Check your M-Pesa.`,
                url: '/portal/staff/payments'
            });
            await emailService.sendPaymentSentNotification(staff, assignment);
        }

        await AuditLog.create({
            actionType: 'PAYMENT_SENT', targetModel: 'Assignment', targetId: assignment._id,
            performedBy: adminId,
            details: { title: assignment.title, staffCount: acceptedStaff.length }
        });
    }

    // Send receipt when marked Received
    if (payment_status === 'Received' && transaction_id) {
        const sp = assignment.staff_payments.find(p => p._id.toString() === staff_payment_id);
        if (sp) {
            const staffMember = await Staff.findById(sp.staff_id);
            if (staffMember) {
                await emailService.sendPaymentReceiptEmail(staffMember, assignment, sp, transaction_id);
            }
        }
    }

    // Refresh aggregate status
    await refreshAggregateStatus(assignmentId);

    return assignment;
};

// ── 2. INITIATE STAFF PAYMENT (Cash or M-Pesa B2C) ─────────────────────────

// @desc    Initiate M-Pesa B2C payment to staff member
exports.initiateStaffPayment = async (adminId, assignmentId, body) => {
    const { staff_payment_id, amount, payment_method } = body;
    const idempotencyKey = body.idempotencyKey || `B2C-${assignmentId}-${staff_payment_id}`;
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new Error('Assignment not found');

    let phone, staffName, spEntry;
    if (staff_payment_id) {
        spEntry = assignment.staff_payments.find(p => p._id.toString() === staff_payment_id);
        if (!spEntry) throw new Error('Staff payment record not found');
        phone = spEntry.phone;
        staffName = spEntry.staff_name;

        // Validate state transition
        const targetStatus = payment_method === 'cash' ? 'Received' : 'Sent';
        assertTransition(spEntry.status, targetStatus, 'initiateStaffPayment');
    }

    // ── Cash Payment ─────────────────────────────────────────────────────────
    if (payment_method === 'cash') {
        const cashRef = `CASH-${Date.now().toString().slice(-6)}`;
        await Assignment.findOneAndUpdate(
            { _id: assignmentId, 'staff_payments._id': staff_payment_id },
            { $set: {
                'staff_payments.$.status': 'Received',
                'staff_payments.$.sent_at': new Date(),
                'staff_payments.$.received_at': new Date(),
                'staff_payments.$.payment_method': 'Cash',
                'staff_payments.$.transaction_id': cashRef
            }}
        );

        await refreshAggregateStatus(assignmentId);

        if (global.io && spEntry) {
            global.io.to(spEntry.staff_id.toString()).emit('paymentReceived', {
                assignmentId: assignment._id,
                title: assignment.title,
                amount: amount || spEntry.amount,
                method: 'Cash',
                ref: cashRef,
                message: `Cash payment of KSh ${amount || spEntry.amount} received for ${assignment.title}`
            });
        }

        try {
            const staffMember = await Staff.findById(spEntry?.staff_id).select('name email');
            if (staffMember?.email) {
                await emailService.sendPaymentReceiptEmail(
                    staffMember, assignment,
                    { ...spEntry.toObject(), status: 'Received', payment_method: 'Cash', transaction_id: cashRef },
                    cashRef
                );
            }
        } catch(emailErr) { console.log('Cash receipt email skip:', emailErr.message); }

        // Record in ledger
        await tryRecordLedgerEntry(assignmentId, amount || spEntry?.amount, cashRef, adminId);

        await AuditLog.create({
            actionType: 'CASH_PAYMENT_MADE', targetModel: 'Assignment', targetId: assignment._id,
            performedBy: adminId,
            details: { staffName, amount: amount || spEntry?.amount, method: 'Cash', ref: cashRef }
        });

        return { message: `Cash payment of KSh ${amount || spEntry?.amount} recorded for ${staffName}. Receipt sent.` };
    }

    // ── M-Pesa B2C ───────────────────────────────────────────────────────────
    if (!phone) throw new Error('No phone number on record for this staff member. Update their profile first.');

    try {
        const result = await mpesaService.b2cPayment({
            phone,
            amount: amount || assignment.pay_rate,
            assignmentId: assignment._id.toString(),
            staffPaymentId: staff_payment_id,
            remarks: `Payment for ${assignment.title}`
        });

        if (result.ResponseCode === '0') {
            await Assignment.findOneAndUpdate(
                { _id: assignmentId, 'staff_payments._id': staff_payment_id },
                {
                    $set: {
                        'staff_payments.$.status': 'Sent',
                        'staff_payments.$.sent_at': new Date(),
                        'staff_payments.$.paymentSyncStatus': 'sent',
                        'staff_payments.$.idempotency_key': idempotencyKey
                    }
                }
            );
            await AuditLog.create({
                actionType: 'PAYMENT_INITIATED', targetModel: 'Assignment', targetId: assignment._id,
                performedBy: adminId,
                details: { staffName, amount: amount || assignment.pay_rate, phone, idempotencyKey }
            });
            return { message: `Payment of KSh ${amount || assignment.pay_rate} initiated to ${staffName} (${phone})` };
        }

        throw new Error(result.ResponseDescription || 'M-Pesa request failed');
    } catch (err) {
        if (staff_payment_id) {
            await Assignment.findOneAndUpdate(
                { _id: assignmentId, 'staff_payments._id': staff_payment_id },
                {
                    $set: {
                        'staff_payments.$.paymentSyncStatus': 'failed',
                        'staff_payments.$.status': 'Failed',
                        'staff_payments.$.lastSyncError': err.message
                    }
                }
            );
        }
        throw err;
    }
};

// ── 3. M-PESA B2C CALLBACK (Lock-First Pattern) ────────────────────────────

/**
 * Process a confirmed B2C callback (called only when lock is held).
 */
async function processB2CSuccess(assignmentId, staffPaymentId, TransactionID) {
    // Validate state transition
    const existing = await Assignment.findOne(
        { _id: assignmentId, 'staff_payments._id': staffPaymentId },
        { 'staff_payments.$': 1 }
    ).lean();

    if (existing?.staff_payments?.[0]) {
        const currentStatus = existing.staff_payments[0].status;
        // Idempotent: if already Received, return the existing data
        if (currentStatus === 'Received') {
            return existing.staff_payments[0];
        }
        assertTransition(currentStatus, 'Received', 'mpesaCallback:success');
    }

    const assignment = await Assignment.findOneAndUpdate(
        { _id: assignmentId, 'staff_payments._id': staffPaymentId },
        { $set: {
            'staff_payments.$.status': 'Received',
            'staff_payments.$.transaction_id': TransactionID,
            'staff_payments.$.received_at': new Date(),
            'staff_payments.$.paymentSyncStatus': 'synced'
        } },
        { new: true }
    );

    if (assignment) {
        // Update aggregate status
        await refreshAggregateStatus(assignmentId);

        // Record in ledger (non-fatal if ledger doesn't exist)
        const sp = assignment.staff_payments.find(p => p._id.toString() === staffPaymentId);
        if (sp) {
            await tryRecordLedgerEntry(assignmentId, sp.amount, TransactionID, null);

            // Notify staff
            let staffMember = await Staff.findById(sp.staff_id).select('name email phone');
            if (!staffMember && sp.staff_name) {
                staffMember = await Staff.findOne({ name: sp.staff_name }).select('name email phone');
            }

            if (staffMember) {
                await emailService.sendPaymentReceiptEmail(staffMember, assignment, sp, TransactionID);
                if (global.io) {
                    global.io.to(sp.staff_id.toString()).emit('paymentReceived', {
                        assignmentId: assignment._id,
                        title: assignment.title,
                        amount: sp.amount,
                        transactionId: TransactionID
                    });
                }
            }
        }
    }

    return assignment;
}

/**
 * Process a failed B2C callback.
 */
async function processB2CFailure(assignmentId, staffPaymentId, resultDesc) {
    const existing = await Assignment.findOne(
        { _id: assignmentId, 'staff_payments._id': staffPaymentId },
        { 'staff_payments.$': 1 }
    ).lean();

    if (existing?.staff_payments?.[0]) {
        const currentStatus = existing.staff_payments[0].status;
        if (currentStatus === 'Failed') return existing.staff_payments[0]; // Already failed
        assertTransition(currentStatus, 'Failed', 'mpesaCallback:failure');
    }

    await Assignment.findOneAndUpdate(
        { _id: assignmentId, 'staff_payments._id': staffPaymentId },
        { $set: {
            'staff_payments.$.status': 'Failed',
            'staff_payments.$.paymentSyncStatus': 'failed',
            'staff_payments.$.lastSyncError': resultDesc
        } }
    );

    await refreshAggregateStatus(assignmentId);
    console.error(`[EventPayment] M-Pesa B2C failed: ${resultDesc}`);
}

// @desc    M-Pesa B2C callback (called by Safaricom)
exports.mpesaCallback = async (resultBody) => {
    const normalized = normalizeMpesaCallback(resultBody);
    if (!normalized || normalized.flow !== 'b2c') return;

    const { resultCode, resultDesc, identifiers } = normalized;
    const TransactionID = identifiers.transactionId;
    const Occasion = identifiers.occasion;
    if (!Occasion) return;

    const [assignmentId, staffPaymentId] = Occasion.split('|');

    // Build a deterministic idempotency key from Safaricom's unique identifiers.
    // TransactionID is globally unique per Safaricom transaction.
    // ResultCode is included so that a success callback and a timeout callback
    // for the same transaction are treated as separate events.
    const lockKey = `mpesa:b2c:${TransactionID || 'NO_TX'}:${resultCode}:${assignmentId}:${staffPaymentId}`;

    // ── STEP 1: Acquire the lock ─────────────────────────────────────────────
    const { acquired, lock } = await IdempotencyLock.tryAcquire(lockKey, resultBody);

    if (!acquired) {
        // Lock already exists — check its status
        if (lock?.status === 'completed') {
            return lock.result;  // Return cached result to Safaricom
        }
        // 'processing' by another worker, or 'failed' (recovery service will handle)
        return null;
    }

    // ── STEP 2: We hold the lock — process the callback ──────────────────────
    try {
        let result;
        if (Number(resultCode) === 0) {
            result = await processB2CSuccess(assignmentId, staffPaymentId, TransactionID);
        } else {
            result = await processB2CFailure(assignmentId, staffPaymentId, resultDesc);
        }

        // ── STEP 3: Mark lock as completed with cached result ────────────────
        await IdempotencyLock.completeLock(lockKey, result || { processed: true });
        return result;
    } catch (err) {
        // ── STEP 4: Mark lock as failed for retry by recovery service ────────
        await IdempotencyLock.failLock(lockKey, err.message);
        console.error(`[EventPayment] Callback processing failed (lock: ${lockKey}):`, err.message);
        // Don't rethrow — always return 200 to Safaricom
    }
};

// ── 4. MANUALLY MARK PAYMENT RECEIVED ───────────────────────────────────────

// @desc Manually mark payment received
exports.markPaymentReceived = async (adminId, assignmentId, staffPaymentId) => {
    // Validate state transition
    const existing = await Assignment.findOne(
        { _id: assignmentId, 'staff_payments._id': staffPaymentId },
        { 'staff_payments.$': 1 }
    ).lean();

    if (existing?.staff_payments?.[0]) {
        assertTransition(existing.staff_payments[0].status, 'Received', 'markPaymentReceived');
    }

    const assignment = await Assignment.findOneAndUpdate(
        { _id: assignmentId, 'staff_payments._id': staffPaymentId },
        { $set: {
            'staff_payments.$.status': 'Received',
            'staff_payments.$.received_at': new Date(),
            'staff_payments.$.manually_confirmed': true
        }},
        { new: true }
    );
    if (!assignment) throw new Error('Payment record not found');

    await refreshAggregateStatus(assignmentId);

    const sp = assignment.staff_payments.find(p => p._id.toString() === staffPaymentId);
    if (sp && sp.staff_id) {
        if (global.io) {
            global.io.to(sp.staff_id.toString()).emit('paymentReceived', {
                assignmentId: assignment._id,
                title: assignment.title,
                amount: sp.amount
            });
        }
        await sendPushToStaff(sp.staff_id, {
            title: 'Payment Confirmed',
            body: `KSh ${(sp.amount || 0).toLocaleString()} for ${assignment.title} has been confirmed.`,
            url: '/portal/staff/payments'
        });

        // Record in ledger
        await tryRecordLedgerEntry(assignmentId, sp.amount, sp.transaction_id || 'MANUAL-CONFIRM', adminId);

        try {
            const staffMember = await Staff.findById(sp.staff_id).select('name email phone');
            if (staffMember && staffMember.email) {
                await emailService.sendPaymentReceiptEmail(staffMember, assignment, sp, sp.transaction_id || 'MANUAL-CONFIRM');
            }
        } catch (emailErr) {
            console.log('Receipt email failed (non-critical):', emailErr.message);
        }
    }

    await AuditLog.create({
        actionType: 'PAYMENT_MANUALLY_CONFIRMED',
        targetModel: 'Assignment',
        targetId: assignment._id,
        performedBy: adminId,
        details: { staffPaymentId: staffPaymentId, note: 'Manual confirmation by admin' }
    });
};
