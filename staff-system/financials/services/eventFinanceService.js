/**
 * Emerald Pearl Events - Event Finance Orchestrator
 *
 * Coordinates closing events, summarizing data, and generating snapshots.
 */

const EventLedger = require('../../models/EventLedger');
const EventFinancialSnapshot = require('../../models/EventFinancialSnapshot');
const payrollService = require('./payrollService');

/**
 * Closes the event finances safely.
 * Calculates final snapshot, generates payroll.
 */
exports.closeEvent = async (event_id, admin_id, attendanceRecords, assignments) => {
    const ledger = await EventLedger.findOne({ eventId: event_id });
    if (!ledger) {
        throw new Error('No ledger found for this event.');
    }

    if (ledger.status === 'Closed') {
        throw new Error('Event finances are already closed.');
    }

    // 1. Generate Staff Payroll (sets up Pending payouts)
    // We pass attendanceRecords and assignments from the caller to avoid circular controller deps.
    await payrollService.generateEventPayroll(event_id, attendanceRecords, assignments);

    // 2. We don't deduct pending payroll from ledger balance until it's PAID,
    // but we can generate a snapshot of the final situation.

    const snapshot = await EventFinancialSnapshot.create({
        eventId: event_id,
        eventName: 'Event Name Template', // Passed or looked up
        eventDate: new Date(), 
        clientName: 'Client Name Template', 
        clientPayment: ledger.totals.budget,
        staffPayrollTotal: ledger.totals.payroll, // Only reflects paid so far, projected handled dynamically
        operationalExpenses: ledger.totals.expenses,
        incidentExpenses: ledger.totals.emergency_funds_used,
        staffCount: attendanceRecords.length,
        isFinal: true,
        notes: `System generated closure snapshot.`,
        createdBy: admin_id
    });

    // 3. Mark Ledger Closed
    ledger.status = 'Closed';
    await ledger.save();

    return snapshot;
};
