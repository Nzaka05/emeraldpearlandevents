/**
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
        if (!telemetry) return res.status(404).json({ success: false, error: 'Ledger not found' });
        res.json({ success: true, data: telemetry });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
        res.status(201).json({ success: true, data: request });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.approveEmergencyFund = async (req, res) => {
    try {
        const request = await expenseService.approveEmergencyFunds(req.params.id, req.user._id);
        res.json({ success: true, data: request });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.generatePayroll = async (req, res) => {
    try {
        const { event_id, attendanceRecords, assignments } = req.body;
        const payroll = await payrollService.generateEventPayroll(event_id, attendanceRecords, assignments);
        res.status(201).json({ success: true, data: payroll });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
};

exports.executePayout = async (req, res) => {
    try {
        const payout = await payrollService.payStaffMember(req.params.id, req.user._id);
        res.json({ success: true, data: payout });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
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
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({
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
        res.json({ success: true, data: list });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
