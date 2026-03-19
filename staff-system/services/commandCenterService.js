/**
 * commandCenterService.js
 * Core backend service for the Live Event Command Center
 */

const Assignment = require('../models/Assignment');
const EventTeam = require('../models/EventTeam');
const Attendance = require('../models/Attendance');
const Staff = require('../models/Staff');
const ExpenseReceipt = require('../models/ExpenseReceipt');
const EmergencyFundAudit = require('../models/EmergencyFundAudit');
const StaffMissingAlert = require('../models/StaffMissingAlert');

// Get high-level summary of all LIVE/READY events for Admin dashboard
exports.getActiveEventsSummary = async () => {
    const events = await Assignment.find({ lifecycle_state: { $in: ['LIVE', 'READY'] } })
        .select('title lifecycle_state location start_time end_time gps_location required_staff_count accepted_staff_ids')
        .lean();

    const result = [];
    for (const e of events) {
        const team = await EventTeam.findOne({ event_id: e._id }).select('supervisor_id geoAnchor').lean();
        const clockedInCount = await Attendance.countDocuments({
            assignment_id: e._id,
            status: { $in: ['Clocked In', 'On Time'] },
            clock_out: null
        });

        // Current missing alerts
        const activeAlerts = await StaffMissingAlert.countDocuments({
            event_id: e._id, resolved: false
        });

        const emergencies = await EmergencyFundAudit.countDocuments({
            event_id: e._id, payout_status: 'success'
        });

        const expenses = await ExpenseReceipt.countDocuments({
            eventId: e._id, status: 'Approved'
        });

        result.push({
            id: e._id,
            title: e.title,
            state: e.lifecycle_state,
            location: e.location,
            timeRange: `${e.start_time} - ${e.end_time}`,
            required_staff: e.required_staff_count || e.accepted_staff_ids?.length || 0,
            clocked_in: clockedInCount,
            supervisor_assigned: !!team?.supervisor_id,
            geo_anchor_set: !!team?.geoAnchor,
            active_alerts: activeAlerts,
            emergency_payouts: emergencies,
            expenses_logged: expenses
        });
    }
    return result;
};

// Get deep detail for a single event (used by both Admin and Supervisor)
exports.getEventDetail = async (assignmentId) => {
    const event = await Assignment.findById(assignmentId)
        .populate('accepted_staff_ids', 'name phone role')
        .lean();

    if (!event) throw new Error('Event not found');

    const team = await EventTeam.findOne({ event_id: assignmentId }).populate('supervisor_id', 'name phone role last_location').lean();
    
    // Attendance data
    const attendance = await Attendance.find({ assignment_id: assignmentId }).populate('staff_id', 'name phone').lean();
    
    // Expenses
    const expenses = await ExpenseReceipt.find({ eventId: assignmentId }).populate('submittedBy', 'name').lean();
    
    // Emergency Funds
    const emergencies = await EmergencyFundAudit.find({ event_id: assignmentId }).lean();
    
    // Missing Staff Alerts
    const alerts = await StaffMissingAlert.find({ event_id: assignmentId, resolved: false }).populate('staff_id', 'name phone').lean();
    
    return {
        event: {
            id: event._id,
            title: event.title,
            state: event.lifecycle_state,
            location: event.location,
            gps: event.gps_location,
            required_staff: event.required_staff_count || event.accepted_staff_ids?.length || 0,
            start_time: event.start_time,
            end_time: event.end_time
        },
        supervisor: team?.supervisor_id || null,
        geo_anchor: team?.geoAnchor || null,
        staffRoster: event.accepted_staff_ids.map(staff => {
            const currentAtt = attendance.find(a => String(a.staff_id?._id) === String(staff._id) && !a.clock_out);
            const alert = alerts.find(a => String(a.staff_id?._id) === String(staff._id));
            return {
                id: staff._id,
                name: staff.name,
                phone: staff.phone,
                role: staff.role,
                status: currentAtt ? 'Clocked In' : (alert ? 'Missing' : 'Pending'),
                clockInTime: currentAtt?.clock_in || null,
                minutesLate: alert?.minutes_late || 0
            };
        }),
        financials: {
            expenses,
            emergencies
        },
        alerts: alerts.map(a => ({
            id: a._id, staff_name: a.staff_id?.name, minutes_late: a.minutes_late, alert_time: a.alert_sent_at
        }))
    };
};

// Get aggregate metrics for the top bar
exports.getCommandCenterMetrics = async () => {
    const liveEvents = await Assignment.countDocuments({ lifecycle_state: 'LIVE' });
    const readyEvents = await Assignment.countDocuments({ lifecycle_state: 'READY' });
    
    // Active staff clocked in globally
    const activeStaff = await Attendance.countDocuments({ clock_out: null, status: { $in: ['Clocked In', 'On Time'] } });
    
    // Total emergency funds sent today
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const emergencyTotal = await EmergencyFundAudit.aggregate([
        { $match: { payout_status: 'success', timestamp: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const activeAlerts = await StaffMissingAlert.countDocuments({ resolved: false });

    // Fraud Summary
    const recentFraud = await EmergencyFundAudit.find({ 
        fraud_flags: { $not: { $size: 0 } }, 
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
    }).select('admin_id event_id fraud_flags timestamp event_lat event_lng').lean();

    return {
        live_events: liveEvents,
        ready_events: readyEvents,
        active_staff: activeStaff,
        emergency_funds_today: emergencyTotal.length > 0 ? emergencyTotal[0].total : 0,
        active_alerts: activeAlerts,
        fraud_summary: recentFraud
    };
};
