/**
 * Emerald Pearl Events - Payroll Service
 *
 * Handles staff payroll generation, calculation, and payout flow.
 */

const StaffPayroll = require('../../models/StaffPayroll');
const ledgerService = require('./ledgerService');
const { calculateStaffHours, calculateProratedPay, roundToTwo } = require('../utils/calculationEngine');

/**
 * Generates pending payroll records for all staff when an event completes.
 */
exports.generateEventPayroll = async (event_id, attendanceRecords, assignments) => {
    const payrolls = [];

    for (const record of attendanceRecords) {
        const assignment = assignments.find(a => a._id.toString() === record.assignment_id.toString());
        if (!assignment) continue;

        // Base math
        const hoursWorked = calculateStaffHours(record.clock_in, record.clock_out);
        const baseRate = assignment.pay_rate || 0;
        
        // Advanced math: if late or missing hours, calculationEngine prorates.
        const totalPay = calculateProratedPay(hoursWorked, baseRate, 8); // Assuming 8 hour shift average

        const payroll = await StaffPayroll.create({
            staff_id: record.staff_id,
            event_id: event_id,
            hours_worked: hoursWorked,
            role: 'Staff', // Requires actual lookup in production
            pay_rate: baseRate,
            total_pay: totalPay,
            status: 'Pending'
        });

        payrolls.push(payroll);
    }

    return payrolls;
};

/**
 * Triggers payout for a specific staff member.
 */
exports.payStaffMember = async (payroll_id, admin_id) => {
    const payroll = await StaffPayroll.findById(payroll_id);
    if (!payroll || payroll.status === 'Paid') {
        throw new Error('Payroll record invalid or already paid');
    }

    // Connect to mpesaService B2C here in integration phase...
    
    payroll.status = 'Paid';
    payroll.paid_at = new Date();
    // Simulate transaction ref for now
    payroll.transaction_reference = `PAY-${Date.now()}`;
    await payroll.save();

    // Deduct from Event Ledger
    await ledgerService.recordTransaction({
        event_id: payroll.event_id,
        type: 'payroll',
        amount: payroll.total_pay,
        direction: 'out',
        description: `Staff Payroll Payout - ${payroll.staff_id}`,
        paymentMethod: 'MPesa B2C',
        createdBy: admin_id,
        referenceModel: 'StaffPayroll',
        referenceId: payroll._id
    });

    return payroll;
};
