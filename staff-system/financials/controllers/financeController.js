/**
const respond = require('../../../utils/respond');
 * Emerald Pearl Events - Financial Controller
 *
 * Connects HTTP endpoints to the Service Layer strictly.
 * Contains no business logic.
 */

const ledgerService = require('../services/ledgerService');
const expenseService = require('../services/expenseService');
const payrollService = require('../services/payrollService');
const eventFinanceService = require('../services/eventFinanceService');

exports.getEventLedger = async (req, res) => {
    try {
        const telemetry = await ledgerService.getEventFinancialTelemetry(req.params.eventId);
        if (!telemetry) return respond(res, 404, { success: false, error: 'Ledger not found' });
        respond(res, 200, { success: true, data: telemetry });
    } catch (error) {
        respond(res, 500, { success: false, error: error.message });
    }
};

exports.requestEmergencyFund = async (req, res) => {
    try {
        const { event_id, amount, purpose, urgency_level } = req.body;
        const request = await expenseService.requestEmergencyFunds({
            event_id,
            supervisor_id: req.user._id,
            amount,
            purpose,
            urgency_level
        });
        respond(res, 201, { success: true, data: request });
    } catch (error) {
        respond(res, 400, { success: false, error: error.message });
    }
};

exports.approveEmergencyFund = async (req, res) => {
    try {
        const request = await expenseService.approveEmergencyFunds(req.params.id, req.user._id);
        respond(res, 200, { success: true, data: request });
    } catch (error) {
        respond(res, 400, { success: false, error: error.message });
    }
};

exports.generatePayroll = async (req, res) => {
    try {
        const { event_id, attendanceRecords, assignments } = req.body;
        const payroll = await payrollService.generateEventPayroll(event_id, attendanceRecords, assignments);
        respond(res, 201, { success: true, data: payroll });
    } catch (error) {
        respond(res, 400, { success: false, error: error.message });
    }
};

exports.executePayout = async (req, res) => {
    try {
        const payout = await payrollService.payStaffMember(req.params.id, req.user._id);
        respond(res, 200, { success: true, data: payout });
    } catch (error) {
        respond(res, 400, { success: false, error: error.message });
    }
};

exports.logExpense = async (req, res) => {
    try {
        const result = await expenseService.logOperationalExpense({
            event_id: req.body.event_id || req.body.eventId,
            staff_id: req.user._id,
            amount: req.body.amount || 0,
            description: req.body.description || 'General Expense',
            category: req.body.category || 'other'
        });
        respond(res, 200, { success: true, data: result });
    } catch (error) {
        respond(res, 500, {
            success: false,
            error: {
                code: "INTERNAL_ERROR",
                message: "An error occurred processing your request",
                statusCode: 500,
                details: error.message
            },
            timestamp: new Date()
        });
    }
};

exports.getPayrollList = async (req, res) => {
    try {
        const StaffPayroll = require('../../models/StaffPayroll');
        const list = await StaffPayroll.find().limit(50);
        respond(res, 200, { success: true, data: list });
    } catch (error) {
        respond(res, 500, { success: false, error: error.message });
    }
};
