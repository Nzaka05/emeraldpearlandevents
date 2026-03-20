/**
 * adminEventsController.js
 * Domain: Events, Assignments, Teams, Attendance
 * Pattern: Thin controller — delegates all business logic to eventAssignmentService / eventTeamService.
 */

const Assignment = require('../models/Assignment');

// ─────────────────────────────────────────────────────────────
// @desc   Events (Assignments) Page (EJS)
// @route  GET /portal/admin-staff/events
// ─────────────────────────────────────────────────────────────
exports.getEventsPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getEventsPageData(req.query);
        res.render('admin/events', { user: req.user, ...data });
    } catch (error) {
        console.error('[adminEventsController] getEventsPage:', error);
        res.status(500).send('Server Error');
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Attendance Monitoring Page (EJS)
// @route  GET /portal/admin-staff/attendance
// ─────────────────────────────────────────────────────────────
exports.getAttendancePage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getAttendancePageData(req.query);
        res.render('admin/attendance', { user: req.user, ...data });
    } catch (error) {
        console.error('[adminEventsController] getAttendancePage:', error);
        res.status(500).send('Server Error');
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   All Event Teams Page (EJS)
// @route  GET /portal/admin-staff/event-teams
// ─────────────────────────────────────────────────────────────
exports.getAllTeams = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getAllTeamsData();
        res.render('admin/teams', { user: req.user, ...data });
    } catch (error) {
        console.error('[adminEventsController] getAllTeams:', error);
        res.status(500).send('Server Error');
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Create Team
// @route  POST /portal/admin-staff/event-teams
// ─────────────────────────────────────────────────────────────
exports.createTeam = async (req, res) => {
    try {
        const eventTeamService = require('../services/eventTeamService');
        const team = await eventTeamService.createTeam(req.body.event_id, req.body.supervisor_id, req.body.member_ids);
        res.status(201).json({ success: true, data: team });
    } catch (error) {
        console.error('[adminEventsController] createTeam:', error);
        if (error.message === 'A team already exists for this event!')
            return res.status(400).json({ success: false, error: error.message });
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Get team creation modal data
// @route  GET /portal/admin-staff/event-teams/create-data
// ─────────────────────────────────────────────────────────────
exports.getTeamCreateData = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getTeamCreateData();
        res.json({ success: true, ...data });
    } catch (error) {
        console.error('[adminEventsController] getTeamCreateData:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Create Assignment
// @route  POST /portal/admin-staff/assignments
// ─────────────────────────────────────────────────────────────
exports.createAssignment = async (req, res) => {
    try {
        const eventAssignmentService = require('../services/eventAssignmentService');
        await eventAssignmentService.createAssignment(req.user.id, req.body);
        res.redirect('/portal/admin-staff/events');
    } catch (error) {
        console.error('[adminEventsController] createAssignment:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Update Assignment
// @route  PUT /portal/admin-staff/assignments/:id
// ─────────────────────────────────────────────────────────────
exports.updateAssignment = async (req, res) => {
    try {
        const eventAssignmentService = require('../services/eventAssignmentService');
        const assignment = await eventAssignmentService.updateAssignment(req.user._id, req.params.id, req.body);
        if (req.headers['content-type']?.includes('application/json')) {
            res.json({ success: true, data: assignment });
        } else {
            req.flash('success', 'Event updated successfully');
            res.redirect('/portal/admin-staff/events');
        }
    } catch (error) {
        console.error('[adminEventsController] updateAssignment:', error);
        if (error.message === 'Assignment not found')
            return res.status(404).json({ success: false, error: 'Assignment not found' });
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Delete Assignment
// @route  DELETE /portal/admin-staff/assignments/:id
// ─────────────────────────────────────────────────────────────
exports.deleteAssignment = async (req, res) => {
    try {
        const eventAssignmentService = require('../services/eventAssignmentService');
        await eventAssignmentService.deleteAssignment(req.user._id, req.params.id);
        res.json({ success: true, message: 'Event deleted successfully' });
    } catch (error) {
        console.error('[adminEventsController] deleteAssignment:', error);
        if (error.message === 'Assignment not found')
            return res.status(404).json({ success: false, error: 'Assignment not found' });
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Get Single Assignment (JSON, for modal refresh)
// @route  GET /portal/admin-staff/assignments/:id
// ─────────────────────────────────────────────────────────────
exports.getSingleAssignment = async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.id)
            .populate('accepted_staff_ids', 'name email phone')
            .populate('applicant_ids', 'name email');
        if (!assignment) return res.status(404).json({ success: false });
        res.json({ success: true, data: assignment.toObject() });
    } catch (err) {
        console.error('[adminEventsController] getSingleAssignment:', err);
        res.status(500).json({ success: false });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Get Event Completion Report (JSON)
// @route  GET /portal/admin-staff/assignments/:id/report
// ─────────────────────────────────────────────────────────────
exports.getEventReport = async (req, res) => {
    try {
        const eventAssignmentService = require('../services/eventAssignmentService');
        const report = await eventAssignmentService.buildEventReport(req.params.id);
        if (!report) return res.status(404).json({ success: false, error: 'Assignment not found' });

        const assignment = await Assignment.findById(req.params.id)
            .populate('assigned_staff_ids', 'name role status availability_status photo_url')
            .populate('accepted_staff_ids', 'name role status photo_url')
            .populate('declined_staff_ids', 'name role status photo_url')
            .populate('applicant_ids', 'name email role specific_role photo_url');

        res.json({ success: true, data: { ...report, assignment } });
    } catch (error) {
        console.error('[adminEventsController] getEventReport:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Handle applicant (approve / reject)
// @route  POST /portal/admin-staff/assignments/:id/applicants/:staffId
// ─────────────────────────────────────────────────────────────
exports.handleApplicant = async (req, res) => {
    try {
        const eventAssignmentService = require('../services/eventAssignmentService');
        await eventAssignmentService.handleApplicant(req.params.id, req.params.staffId, req.body.action);
        res.json({ success: true, action: req.body.action });
    } catch (err) {
        console.error('[adminEventsController] handleApplicant:', err);
        res.status(500).json({ success: false, error: err.message || 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Assign Event Supervisor (to team)
// @route  PUT /portal/admin-staff/assignments/:id/supervisor
// ─────────────────────────────────────────────────────────────
exports.assignEventSupervisor = async (req, res) => {
    try {
        const eventTeamService = require('../services/eventTeamService');
        const result = await eventTeamService.assignEventSupervisor(req.user._id, req.user.name, req.params.id, req.body.supervisor_id);
        res.json({ success: true, assignment: result.assignment, team: result.team });
    } catch (err) {
        console.error('[adminEventsController] assignEventSupervisor:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Assign Staff to Event
// @route  PUT /portal/admin-staff/assignments/:id/assign-staff
// ─────────────────────────────────────────────────────────────
exports.assignStaffToEvent = async (req, res) => {
    try {
        const eventAssignmentService = require('../services/eventAssignmentService');
        const assignment = await eventAssignmentService.assignStaffToEvent(req.params.id, req.body.staff_ids);
        res.json({ success: true, assignment });
    } catch (err) {
        console.error('[adminEventsController] assignStaffToEvent:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Toggle applications open/closed
// @route  PUT /portal/admin-staff/assignments/:id/toggle-applications
// ─────────────────────────────────────────────────────────────
exports.toggleApplications = async (req, res) => {
    try {
        const eventAssignmentService = require('../services/eventAssignmentService');
        const open = await eventAssignmentService.toggleApplications(req.params.id);
        res.json({ success: true, open });
    } catch (err) {
        console.error('[adminEventsController] toggleApplications:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Approve replacement request
// @route  POST /portal/admin-staff/replacements/:id/approve
// ─────────────────────────────────────────────────────────────
exports.approveReplacement = async (req, res) => {
    try {
        const eventTeamService = require('../services/eventTeamService');
        await eventTeamService.approveReplacement(req.user._id, req.params.id);
        res.json({ success: true, message: 'Replacement Request Approved' });
    } catch (error) {
        console.error('[adminEventsController] approveReplacement:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Reject replacement request
// @route  POST /portal/admin-staff/replacements/:id/reject
// ─────────────────────────────────────────────────────────────
exports.rejectReplacement = async (req, res) => {
    try {
        const eventTeamService = require('../services/eventTeamService');
        await eventTeamService.rejectReplacement(req.params.id);
        res.json({ success: true, message: 'Replacement Request Rejected' });
    } catch (error) {
        console.error('[adminEventsController] rejectReplacement:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Check if team can be disbanded
// @route  GET /portal/admin-staff/event-teams/:teamId/disband-check
// ─────────────────────────────────────────────────────────────
exports.checkDisbandEligibility = async (req, res) => {
    try {
        const eventTeamService = require('../services/eventTeamService');
        const result = await eventTeamService.checkDisbandEligibility(req.params.teamId);
        if (!result.canDisband)
            return res.json({ success: true, canDisband: false, reason: result.reason });
        res.json({ success: true, canDisband: true });
    } catch (err) {
        console.error('[adminEventsController] checkDisbandEligibility:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Disband a team
// @route  POST /portal/admin-staff/event-teams/:teamId/disband
// ─────────────────────────────────────────────────────────────
exports.disbandTeam = async (req, res) => {
    try {
        const eventTeamService = require('../services/eventTeamService');
        await eventTeamService.disbandTeam(req.params.teamId);
        res.json({ success: true, message: 'Team disbanded successfully.' });
    } catch (err) {
        console.error('[adminEventsController] disbandTeam:', err);
        if (err.message?.includes('Cannot disband team'))
            return res.status(400).json({ success: false, message: err.message });
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ═══════════════════════════════════════════════════════════════
// AI EVENT OPERATIONS BRAIN
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// @desc   AI Event Prediction
// @route  GET /portal/admin-staff/events/:id/prediction
// ─────────────────────────────────────────────────────────────
exports.getEventPrediction = async (req, res) => {
    try {
        const { generatePrediction } = require('../services/eventPredictionService');
        const EventPredictionSnapshot = require('../models/EventPredictionSnapshot');

        const prediction = await generatePrediction(req.params.id);

        // Save snapshot
        await EventPredictionSnapshot.create({
            assignmentId: req.params.id,
            ...prediction,
            generatedBy: req.user._id,
            generatedAt: new Date()
        });

        res.json({ success: true, prediction });
    } catch (error) {
        console.error('[adminEventsController] getEventPrediction:', error);
        if (error.message === 'Assignment not found')
            return res.status(404).json({ success: false, error: 'Assignment not found' });
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

// ═══════════════════════════════════════════════════════════════
// EMERGENCY FUNDS SECURITY LAYER
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// @desc   Create biometric verification session
// @route  POST /portal/admin-staff/auth/biometric-verify
// ─────────────────────────────────────────────────────────────
exports.verifyBiometric = async (req, res) => {
    // This legacy endpoint is deprecated. Real biometric verification uses WebAuthn.
    return res.status(410).json({
        success: false,
        error: 'This endpoint is deprecated. Use /portal/admin-staff/webauthn/authenticate/options and /verify for cryptographic biometric verification.',
        migration: 'webauthn'
    });
};

// ─────────────────────────────────────────────────────────────
// @desc   Request OTP for emergency fund authorization
// @route  POST /portal/admin-staff/emergency-funds/request-otp
// ─────────────────────────────────────────────────────────────
exports.requestEmergencyOtp = async (req, res) => {
    try {
        const { requestOtp } = require('../services/emergencyFundService');
        const { event_id, device_id } = req.body;

        if (!event_id || !device_id) {
            return res.status(400).json({ success: false, error: 'event_id and device_id are required' });
        }

        const result = await requestOtp(req.user._id, event_id, device_id, req.user.email);
        res.json(result);
    } catch (error) {
        console.error('[adminEventsController] requestEmergencyOtp:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Send emergency fund payout
// @route  POST /portal/admin-staff/emergency-funds/send
// ─────────────────────────────────────────────────────────────
exports.sendEmergencyFund = async (req, res) => {
    try {
        const { processEmergencyFund } = require('../services/emergencyFundService');
        const {
            event_id, amount, phone, reason, reason_category,
            lat, lng, device_id, otp_code
        } = req.body;

        if (!event_id || !amount || !phone) {
            return res.status(400).json({ success: false, error: 'event_id, amount, and phone are required' });
        }

        const result = await processEmergencyFund({
            adminId: req.user._id,
            eventId: event_id,
            amount: Number(amount),
            phone,
            reason: reason || '',
            reasonCategory: reason_category || 'other',
            adminLat: lat != null ? Number(lat) : null,
            adminLng: lng != null ? Number(lng) : null,
            deviceId: device_id || '',
            ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
            otpCode: otp_code || null
        });

        res.status(result.statusCode || (result.success ? 200 : 400)).json(result);
    } catch (error) {
        console.error('[adminEventsController] sendEmergencyFund:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Unlock payout lock on an event
// @route  POST /portal/admin-staff/emergency-funds/unlock-payout
// ─────────────────────────────────────────────────────────────
exports.unlockPayout = async (req, res) => {
    try {
        const { unlockPayout } = require('../services/emergencyFundService');
        const { event_id, reason } = req.body;

        if (!event_id) {
            return res.status(400).json({ success: false, error: 'event_id is required' });
        }
        if (!reason) {
            return res.status(400).json({ success: false, error: 'reason is required for unlock' });
        }

        const result = await unlockPayout(event_id, req.user._id, reason);
        res.status(result.statusCode || (result.success ? 200 : 400)).json(result);
    } catch (error) {
        console.error('[adminEventsController] unlockPayout:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ═══════════════════════════════════════════════════════════════
// ETR (Event Transaction Report) — REAL IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════

exports.getETRs = async (req, res) => {
  try {
    const ClientETR = require('../models/ClientETR');
    const Assignment = require('../models/Assignment');
    const etrs = await ClientETR.find().populate('event_id', 'title client_name').sort({ createdAt: -1 }).lean();
    const completedAssignments = await Assignment.find({ status: 'Completed' }).sort({ updatedAt: -1 }).lean();
    res.render('admin/etr-list', { user: req.user, etrs, completedAssignments, _page: 'etr' });
  } catch (err) {
    console.error('[ETR] getETRs:', err.message);
    res.render('admin/etr-list', { user: req.user, etrs: [], completedAssignments: [], _page: 'etr' });
  }
};

exports.getSingleETR = async (req, res) => {
  try {
    const ClientETR = require('../models/ClientETR');
    const etr = await ClientETR.findOne({ event_id: req.params.eventId }).sort({ version: -1 }).populate('event_id').lean();
    if (!etr) return res.status(404).json({ success: false, error: 'ETR not found for this event' });
    res.render('admin/etr-view', { user: req.user, etr, _page: 'etr' });
  } catch (err) {
    console.error('[ETR] getSingleETR:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.generateETR = async (req, res) => {
  try {
    const ClientETR = require('../models/ClientETR');
    const Assignment = require('../models/Assignment');
    const Attendance = require('../models/Attendance');

    const eventId = req.params.eventId;
    const assignment = await Assignment.findById(eventId).lean();
    if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });

    // Check for existing ETR
    const prevEtr = await ClientETR.findOne({ event_id: eventId }).sort({ version: -1 });
    const newVersion = prevEtr ? prevEtr.version + 1 : 1;

    // Gather attendance data
    const attendanceCount = await Attendance.countDocuments({ assignment_id: eventId });

    // Try to gather financial data (graceful if models don't exist)
    let staffCost = 0, logisticsCost = 0, equipmentCost = 0, otherExpenses = 0, emergencyFundsUsed = 0;
    let totalQuoted = 0, totalPaid = 0;

    try {
      const StaffPayroll = require('../models/StaffPayroll');
      const payrolls = await StaffPayroll.find({ event_id: eventId }).lean();
      staffCost = payrolls.reduce((sum, pr) => sum + (pr.net_pay || 0), 0);
    } catch (e) { /* StaffPayroll not available */ }

    try {
      const ExpenseReceipt = require('../models/ExpenseReceipt');
      const expenses = await ExpenseReceipt.find({ event_id: eventId }).lean();
      expenses.forEach(e => {
        const cat = (e.category || '').toLowerCase();
        if (e.paid_from_emergency_fund) emergencyFundsUsed += e.amount || 0;
        else if (cat.includes('logistic') || cat.includes('transport')) logisticsCost += e.amount || 0;
        else if (cat.includes('equipment') || cat.includes('gear')) equipmentCost += e.amount || 0;
        else otherExpenses += e.amount || 0;
      });
    } catch (e) { /* ExpenseReceipt not available */ }

    try {
      const ClientInvoice = require('../models/ClientInvoice');
      const invoices = await ClientInvoice.find({ eventId }).lean();
      totalQuoted = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
      totalPaid = invoices.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0);
    } catch (e) { /* ClientInvoice not available */ }

    const totalCost = staffCost + logisticsCost + equipmentCost + otherExpenses + emergencyFundsUsed;
    const outstandingBalance = totalQuoted - totalPaid;
    let paymentStatus = 'OUTSTANDING';
    if (totalQuoted > 0) {
      if (totalPaid >= totalQuoted) paymentStatus = 'PAID';
      else if (totalPaid > 0) paymentStatus = 'PARTIAL';
    }

    let deliveryStatus = 'Fully Delivered';
    if (attendanceCount < (assignment.required_staff_count || 1)) {
      deliveryStatus = 'Partially Delivered';
    }

    // Generate ETR number
    const totalEtrs = await ClientETR.countDocuments();
    const etrSeq = String(totalEtrs + 1).padStart(5, '0');
    const etrNumber = `ETR-${new Date().getFullYear()}-${etrSeq}`;

    const summary = {
      etrNumber,
      eventName: assignment.title,
      eventDate: assignment.date,
      venue: assignment.location,
      clientName: assignment.client_name || 'N/A',
      eventDuration: `${assignment.start_time || ''} - ${assignment.end_time || ''}`,
      staffDeployed: attendanceCount,
      financialSummary: { totalQuoted, totalPaid, outstandingBalance, paymentStatus },
      costBreakdown: { staffCost, logisticsCost, equipmentCost, emergencyFundsUsed, otherExpenses, totalCost },
      serviceDelivery: {
        plannedStartTime: assignment.start_time,
        plannedEndTime: assignment.end_time,
        deliveryStatus
      },
      generatedAt: new Date().toISOString(),
      etrVersion: newVersion
    };

    const newEtr = await ClientETR.create({
      event_id: eventId,
      client_id: assignment.client_id || null,
      version: newVersion,
      generated_by: req.user._id,
      summary,
      delivery_status: 'pending'
    });

    res.json({ success: true, message: 'ETR Generated', data: { etrNumber, id: newEtr._id } });
  } catch (err) {
    console.error('[ETR] generateETR:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.resendETR = async (req, res) => {
  try {
    const ClientETR = require('../models/ClientETR');
    const etr = await ClientETR.findOne({ event_id: req.params.eventId }).sort({ version: -1 });
    if (!etr) return res.status(404).json({ success: false, error: 'No ETR found. Generate one first.' });
    etr.delivery_status = 'sent';
    etr.sent_at = new Date();
    await etr.save();
    res.json({ success: true, message: 'ETR marked as sent' });
  } catch (err) {
    console.error('[ETR] resendETR:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.downloadETR = async (req, res) => {
  try {
    const ClientETR = require('../models/ClientETR');
    const etr = await ClientETR.findOne({ event_id: req.params.eventId }).sort({ version: -1 }).lean();
    if (!etr) return res.status(404).json({ success: false, error: 'No ETR found' });
    if (etr.pdf_url) return res.redirect(etr.pdf_url);
    res.json({ success: true, message: 'No PDF available — ETR data only', data: etr.summary });
  } catch (err) {
    console.error('[ETR] downloadETR:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════
// WEBAUTHN BIOMETRIC ENDPOINTS
// ═══════════════════════════════════════════════════════════════

const webAuthnService = require('../services/webAuthnService');
const AdminWebAuthnCredential = require('../models/AdminWebAuthnCredential');
const AuditLog = require('../models/AuditLog');
const EmergencyFundAudit = require('../models/EmergencyFundAudit');

// Helper: log WebAuthn events to AuditLog
async function logWebAuthnEvent(type, adminId, details, req) {
    try {
        await AuditLog.create({
            actionType: type,
            targetModel: 'Staff',
            targetId: adminId,
            performedBy: adminId,
            details: {
                ...details,
                user_agent: req ? (req.headers['user-agent'] || '') : '',
                device_name: details.device_name || 'Unknown'
            },
            ipAddress: req ? (req.ip || req.headers['x-forwarded-for'] || '') : ''
        });
    } catch (e) {
        console.error('[WebAuthn Audit]', e.message);
    }
}

// POST /portal/admin-staff/webauthn/register/options
exports.webauthnRegisterOptions = async (req, res) => {
    try {
        const options = await webAuthnService.generateRegistrationOptions(req.user._id);
        res.json({ success: true, options });
    } catch (error) {
        console.error('[WebAuthn] registerOptions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// POST /portal/admin-staff/webauthn/register/verify
exports.webauthnRegisterVerify = async (req, res) => {
    try {
        const { registrationResponse, device_name } = req.body;
        if (!registrationResponse) {
            return res.status(400).json({ success: false, error: 'registrationResponse is required' });
        }

        const result = await webAuthnService.verifyRegistration(req.user._id, registrationResponse, device_name || 'Unnamed Device');

        if (result.success) {
            await logWebAuthnEvent('webauthn_registration_success', req.user._id, { device_name: device_name || 'Unnamed Device' }, req);
            return res.json({ success: true, message: 'Biometric device registered successfully' });
        }

        await logWebAuthnEvent('webauthn_registration_failure', req.user._id, { reason: result.message }, req);
        return res.status(400).json({ success: false, error: result.message });
    } catch (error) {
        await logWebAuthnEvent('webauthn_registration_failure', req.user._id, { reason: error.message }, req);
        console.error('[WebAuthn] registerVerify:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// POST /portal/admin-staff/webauthn/authenticate/options
exports.webauthnAuthOptions = async (req, res) => {
    try {
        const options = await webAuthnService.generateAuthenticationOptions(req.user._id);
        res.json({ success: true, options });
    } catch (error) {
        console.error('[WebAuthn] authOptions:', error);
        res.status(400).json({ success: false, error: error.message });
    }
};

// POST /portal/admin-staff/webauthn/authenticate/verify
exports.webauthnAuthVerify = async (req, res) => {
    try {
        const { authenticationResponse } = req.body;
        if (!authenticationResponse) {
            return res.status(400).json({ success: false, error: 'authenticationResponse is required' });
        }

        const result = await webAuthnService.verifyAuthentication(req.user._id, authenticationResponse);

        if (result.success) {
            // Create a real BiometricSession ONLY after cryptographic verification
            const BiometricSession = require('../models/BiometricSession');
            const session = await BiometricSession.create({
                admin_id: req.user._id,
                device_id: authenticationResponse.id || 'webauthn',
                verified_at: new Date(),
                expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
                ip_address: req.ip || req.headers['x-forwarded-for'] || '',
                user_agent: req.headers['user-agent'] || '',
                verification_method: 'webauthn'
            });

            await logWebAuthnEvent('webauthn_authentication_success', req.user._id, { credential_id: authenticationResponse.id }, req);
            return res.json({ success: true, message: 'Biometric authentication verified', expiresAt: session.expiresAt });
        }

        await logWebAuthnEvent('webauthn_authentication_failure', req.user._id, { reason: result.message }, req);
        return res.status(403).json({ success: false, error: result.message });
    } catch (error) {
        await logWebAuthnEvent('webauthn_authentication_failure', req.user._id, { reason: error.message }, req);
        console.error('[WebAuthn] authVerify:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET /portal/admin-staff/webauthn/credentials
exports.webauthnGetCredentials = async (req, res) => {
    try {
        const credentials = await AdminWebAuthnCredential.find({ admin_id: req.user._id })
            .select('credential_id device_name registered_at last_used')
            .sort({ registered_at: -1 });
        res.json({ success: true, data: { credentials, hasCredentials: credentials.length > 0 } });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// DELETE /portal/admin-staff/webauthn/credentials/:credentialId
exports.webauthnDeleteCredential = async (req, res) => {
    try {
        const result = await AdminWebAuthnCredential.findOneAndDelete({
            _id: req.params.credentialId,
            admin_id: req.user._id
        });
        if (!result) {
            return res.status(404).json({ success: false, error: 'Credential not found' });
        }
        await logWebAuthnEvent('webauthn_credential_removed', req.user._id, { device_name: result.device_name }, req);
        res.json({ success: true, message: 'Device removed' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ═══════════════════════════════════════════════════════════════
// DUAL APPROVAL ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// GET /portal/admin-staff/emergency-funds/pending-approvals
exports.getPendingApprovals = async (req, res) => {
    try {
        const Staff = require('../models/Staff');
        const approvals = await EmergencyFundAudit.find({
            dual_approval_required: true,
            dual_approval_completed: false,
            approval_status: 'pending',
            first_admin_id: { $ne: req.user._id }
        }).populate('event_id', 'title date location').sort({ timestamp: -1 });

        const enriched = [];
        for (const a of approvals) {
            const firstAdmin = await Staff.findById(a.first_admin_id).select('name').lean();
            enriched.push({
                audit_id: a._id,
                event_id: a.event_id?._id,
                event_name: a.event_id?.title || 'Unknown Event',
                amount: a.amount,
                first_admin_name: firstAdmin?.name || 'Unknown',
                first_admin_lat: a.first_admin_lat,
                first_admin_lng: a.first_admin_lng,
                reason: a.reason,
                reason_category: a.reason_category,
                requested_at: a.timestamp,
                expires_at: a.dual_approval_expires_at,
                elapsed_ms: Date.now() - new Date(a.timestamp).getTime()
            });
        }

        res.json({ success: true, data: enriched });
    } catch (error) {
        console.error('[DualApproval] getPending:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// POST /portal/admin-staff/emergency-funds/approve
exports.approveDualApproval = async (req, res) => {
    try {
        const { audit_id, lat, lng } = req.body;
        if (!audit_id) return res.status(400).json({ success: false, error: 'audit_id required' });

        const audit = await EmergencyFundAudit.findById(audit_id);
        if (!audit) return res.status(404).json({ success: false, error: 'Approval record not found' });

        if (!audit.dual_approval_required) {
            return res.status(400).json({ success: false, error: 'This record does not require dual approval' });
        }
        if (audit.dual_approval_completed) {
            return res.status(400).json({ success: false, error: 'Dual approval already completed' });
        }
        if (audit.approval_status === 'expired') {
            return res.status(400).json({ success: false, error: 'Approval window has expired' });
        }
        if (audit.dual_approval_expires_at && new Date() > new Date(audit.dual_approval_expires_at)) {
            audit.approval_status = 'expired';
            audit.failure_reason = 'Dual approval window expired';
            await audit.save();
            return res.status(400).json({ success: false, error: 'Approval window has expired' });
        }

        // CRITICAL: first admin cannot approve their own request
        if (audit.first_admin_id?.toString() === req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'You cannot approve your own emergency fund request' });
        }

        // Second admin must have a valid WebAuthn BiometricSession
        const BiometricSession = require('../models/BiometricSession');
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const bioSession = await BiometricSession.findOne({
            admin_id: req.user._id,
            verified_at: { $gte: fiveMinAgo },
            verification_method: 'webauthn'
        });
        if (!bioSession) {
            return res.status(403).json({ success: false, error: 'WebAuthn biometric verification required before approving. Please authenticate first.' });
        }

        audit.second_admin_id = req.user._id;
        audit.second_admin_verified_at = new Date();
        audit.second_admin_lat = lat != null ? Number(lat) : null;
        audit.second_admin_lng = lng != null ? Number(lng) : null;
        audit.dual_approval_completed = true;
        audit.approval_status = 'approved';
        audit.approval_type = 'second_admin';
        await audit.save();

        await logWebAuthnEvent('dual_approval_approved', req.user._id, { audit_id: audit._id, event_id: audit.event_id }, req);

        if (global.io) {
            const Staff = require('../models/Staff');
            const secondAdmin = await Staff.findById(req.user._id).select('name').lean();
            global.io.to('Admin').emit('cmd:dual_approval_approved', {
                audit_id: audit._id,
                event_id: audit.event_id,
                amount: audit.amount,
                approved_by: secondAdmin?.name || 'Unknown',
                timestamp: new Date().toISOString()
            });
            // Notify first admin specifically
            global.io.to(`Staff:${audit.first_admin_id}`).emit('cmd:your_approval_approved', {
                audit_id: audit._id,
                event_id: audit.event_id,
                message: 'Your emergency fund request has been approved'
            });
        }

        // Trigger the actual payout now that Dual Approval is secured
        const { executePayout } = require('../services/emergencyFundService');
        const Assignment = require('../models/Assignment');
        const assignment = await Assignment.findById(audit.event_id);
        const payoutResult = await executePayout(audit, assignment, req.user._id);

        res.json({ success: true, message: 'Dual approval completed — payout triggered', payoutResult });
    } catch (error) {
        console.error('[DualApproval] approve:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// POST /portal/admin-staff/emergency-funds/reject
exports.rejectDualApproval = async (req, res) => {
    try {
        const { audit_id, reason } = req.body;
        if (!audit_id) return res.status(400).json({ success: false, error: 'audit_id required' });
        if (!reason) return res.status(400).json({ success: false, error: 'reason required' });

        const audit = await EmergencyFundAudit.findById(audit_id);
        if (!audit) return res.status(404).json({ success: false, error: 'Approval record not found' });

        if (audit.first_admin_id?.toString() === req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'You cannot reject your own request' });
        }

        audit.approval_status = 'rejected';
        audit.failure_reason = reason;
        audit.second_admin_id = req.user._id;
        audit.second_admin_verified_at = new Date();
        await audit.save();

        await logWebAuthnEvent('dual_approval_rejected', req.user._id, { audit_id: audit._id, event_id: audit.event_id, reason }, req);

        if (global.io) {
            const Staff = require('../models/Staff');
            const rejector = await Staff.findById(req.user._id).select('name').lean();
            global.io.to('Admin').emit('cmd:dual_approval_rejected', {
                audit_id: audit._id,
                event_id: audit.event_id,
                amount: audit.amount,
                rejected_by: rejector?.name || 'Unknown',
                reason,
                timestamp: new Date().toISOString()
            });
            // Notify first admin specifically
            global.io.to(`Staff:${audit.first_admin_id}`).emit('cmd:your_approval_rejected', {
                audit_id: audit._id,
                event_id: audit.event_id,
                reason,
                message: `Your emergency fund request was rejected: ${reason}`
            });
        }

        res.json({ success: true, message: 'Request rejected' });
    } catch (error) {
        console.error('[DualApproval] reject:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ═══════════════════════════════════════════════════════════════
// DEVICE MANAGEMENT PAGE
// ═══════════════════════════════════════════════════════════════

// GET /portal/admin-staff/security/devices
exports.getDeviceManagementPage = async (req, res) => {
    try {
        const credentials = await AdminWebAuthnCredential.find({ admin_id: req.user._id })
            .select('credential_id device_name registered_at last_used')
            .sort({ registered_at: -1 }).lean();
        res.render('portal/admin-staff/security/devices', {
            title: 'Device Management',
            user: req.user,
            credentials,
            csrfToken: req.csrfToken ? req.csrfToken() : ''
        });
    } catch (error) {
        console.error('[Security] devices page:', error);
        res.status(500).send('Error loading device management');
    }
};




