const Assignment = require('../../models/Assignment');
const Staff = require('../../models/Staff');
const AuditLog = require('../../models/AuditLog');
const emailService = require('../../services/emailService');
const { sendPushToStaff } = require('../../services/pushService');
const mpesaService = require('../../services/mpesaService');

// @desc    Update Assignment Payment Status
exports.updatePaymentStatus = async (adminId, assignmentId, payment_status, staff_payment_id, transaction_id) => {
    if (!['Pending', 'Sent', 'Received', 'Disputed'].includes(payment_status)) {
        throw new Error('Invalid payment status');
    }

    let assignment;
    if (staff_payment_id) {
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

    return assignment;
};

// @desc    Initiate M-Pesa B2C payment to staff member
exports.initiateStaffPayment = async (adminId, assignmentId, body) => {
    const { staff_payment_id, amount, payment_method } = body;
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new Error('Assignment not found');

    let phone, staffName, spEntry;
    if (staff_payment_id) {
        spEntry = assignment.staff_payments.find(p => p._id.toString() === staff_payment_id);
        if (!spEntry) throw new Error('Staff payment record not found');
        phone = spEntry.phone;
        staffName = spEntry.staff_name;
    }

    // Cash Payment
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
        const updatedAssignment = await Assignment.findById(assignmentId);
        const total = updatedAssignment.staff_payments.length;
        const paid = updatedAssignment.staff_payments.filter(p => ['Received','Disbursed'].includes(p.status)).length;
        const newStatus = paid === total && total > 0 ? 'Received' : paid > 0 ? 'Partial' : 'Pending';
        await Assignment.findByIdAndUpdate(assignmentId, { payment_status: newStatus });

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

        await AuditLog.create({
            actionType: 'CASH_PAYMENT_MADE', targetModel: 'Assignment', targetId: assignment._id,
            performedBy: adminId,
            details: { staffName, amount: amount || spEntry?.amount, method: 'Cash', ref: cashRef }
        });
        
        return { message: `Cash payment of KSh ${amount || spEntry?.amount} recorded for ${staffName}. Receipt sent.` };
    }

    // M-Pesa B2C
    if (!phone) throw new Error('No phone number on record for this staff member. Update their profile first.');

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
            { $set: { 'staff_payments.$.status': 'Sent', 'staff_payments.$.sent_at': new Date() } }
        );
        await AuditLog.create({
            actionType: 'PAYMENT_INITIATED', targetModel: 'Assignment', targetId: assignment._id,
            performedBy: adminId,
            details: { staffName, amount: amount || assignment.pay_rate, phone }
        });
        return { message: `Payment of KSh ${amount || assignment.pay_rate} initiated to ${staffName} (${phone})` };
    } else {
        throw new Error(result.ResponseDescription || 'M-Pesa request failed');
    }
};

// @desc    M-Pesa B2C callback (called by Safaricom)
exports.mpesaCallback = async (resultBody) => {
    const result = resultBody?.Result;
    if (!result) return;

    const { ResultCode, ResultDesc, TransactionID, Occasion } = result;
    if (!Occasion) return;

    const [assignmentId, staffPaymentId] = Occasion.split('|');

    if (Number(ResultCode) === 0) {
        const assignment = await Assignment.findOneAndUpdate(
            { _id: assignmentId, 'staff_payments._id': staffPaymentId },
            { $set: {
                'staff_payments.$.status': 'Received',
                'staff_payments.$.transaction_id': TransactionID,
                'staff_payments.$.received_at': new Date()
            } },
            { new: true }
        );

        if (assignment) {
            const total = assignment.staff_payments.length;
            const paid = assignment.staff_payments.filter(p =>
                p.status === 'Received' || p.status === 'Disbursed'
            ).length;
            const newStatus = paid === total && total > 0 ? 'Received' : paid > 0 ? 'Partial' : 'Pending';
            await Assignment.findByIdAndUpdate(assignmentId, { payment_status: newStatus });

            const sp = assignment.staff_payments.find(p => p._id.toString() === staffPaymentId);
            if (sp) {
                let staffMember = await Staff.findById(sp.staff_id).select('name email phone');
                if (!staffMember && sp.staff_name) staffMember = await Staff.findOne({ name: sp.staff_name }).select('name email phone');
                
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
    } else {
        await Assignment.findOneAndUpdate(
            { _id: assignmentId, 'staff_payments._id': staffPaymentId },
            { $set: { 'staff_payments.$.status': 'Pending' } }
        );
        console.error('M-Pesa B2C failed:', ResultDesc);
    }
};

// @desc Manually mark payment received
exports.markPaymentReceived = async (adminId, assignmentId, staffPaymentId) => {
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

    const total = assignment.staff_payments.length;
    const paid  = assignment.staff_payments.filter(p => ['Received', 'Disbursed'].includes(p.status)).length;
    const newStatus = paid === total && total > 0 ? 'Received' : paid > 0 ? 'Partial' : 'Pending';
    await Assignment.findByIdAndUpdate(assignmentId, { payment_status: newStatus });

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
