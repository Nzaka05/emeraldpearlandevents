/**
 * Emerald Pearl Events - Expense Service
 *
 * Handles recording of operational expenses and emergency funds.
 */

const ExpenseReceipt = require('../../models/ExpenseReceipt');
const ledgerService = require('./ledgerService');
const { roundToTwo } = require('../utils/calculationEngine');

/**
 * Logs a standard operational expense (e.g., equipment, transport)
 */
exports.logOperationalExpense = async ({ event_id, staff_id, amount, description, category, receipt_url }) => {
    const cleanAmount = roundToTwo(amount);
    
    // Create receipt record
    const receipt = await ExpenseReceipt.create({
        eventId: event_id,
        submittedBy: staff_id,
        amount: cleanAmount,
        description,
        category: category || 'Operational',
        receiptUrl: receipt_url,
        status: 'Approved', // Operational expenses from supervisors might be auto-approved or require review
        type: 'Operational',
        date: new Date()
    });

    // Hit the double-entry ledger
    await ledgerService.recordTransaction({
        event_id,
        type: 'expense',
        amount: cleanAmount,
        direction: 'out',
        description: `Operational Expense: ${description}`,
        createdBy: staff_id,
        referenceModel: 'ExpenseReceipt',
        referenceId: receipt._id
    });

    if (global.io) {
        global.io.to('Admin').emit('cmd:expense_logged', {
            event_id, amount: cleanAmount, category: category || 'Operational', logged_by: staff_id, timestamp: new Date()
        });
    }

    return receipt;
};

/**
 * Requests emergency funds (Pending admin approval)
 */
exports.requestEmergencyFunds = async ({ event_id, supervisor_id, amount, purpose, urgency_level }) => {
    const cleanAmount = roundToTwo(amount);

    const request = await ExpenseReceipt.create({
        eventId: event_id,
        submittedBy: supervisor_id,
        amount: cleanAmount,
        description: purpose,
        category: 'Emergency',
        urgencyLevel: urgency_level,
        status: 'Pending',
        type: 'Emergency',
        date: new Date()
    });

    // Notify Admin (Socket/Push)
    if (global.io) {
        global.io.to('Admin').emit('emergencyFundRequest', {
            eventId: event_id,
            requestId: request._id,
            amount: cleanAmount,
            purpose,
            urgencyLevel: urgency_level
        });
    }

    return request;
};

/**
 * Admin approves emergency fund, triggering ledger transaction
 */
exports.approveEmergencyFunds = async (request_id, admin_id) => {
    const request = await ExpenseReceipt.findById(request_id);
    if (!request || request.status !== 'Pending') {
        throw new Error('Invalid or already processed emergency request');
    }

    request.status = 'Approved';
    request.approvedBy = admin_id;
    request.approvedAt = new Date();
    await request.save();

    // Trigger Daraja B2C payment ideally here.
    // For now, record the transaction in the ledger.
    await ledgerService.recordTransaction({
        event_id: request.eventId,
        type: 'emergency_fund',
        amount: request.amount,
        direction: 'out',
        description: `Emergency Fund Approved: ${request.description}`,
        createdBy: admin_id,
        paymentMethod: 'MPesa B2C',
        referenceModel: 'ExpenseReceipt',
        referenceId: request._id
    });

    if (global.io) {
        // Emit to Supervisor room only
        const payload = { event_id: request.eventId, amount: request.amount, timestamp: new Date() };
        global.io.to(`Supervisor:${request.eventId}`).emit('cmd:emergency_fund_approved', payload);

        try {
            const SupervisorNotification = require('../../../models/SupervisorNotification');
            await SupervisorNotification.create({
                event_id: request.eventId, supervisor_id: request.submittedBy,
                type: 'emergency_fund_approved', title: 'Emergency Fund Approved',
                message: `Your request for KES ${request.amount} has been approved.`, payload
            });
        } catch(e) { console.error(e) }
    }

    return request;
};
