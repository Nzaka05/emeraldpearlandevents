const respond = require('../../utils/respond');
const Staff = require('../models/Staff');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Assignment = require('../models/Assignment');
const ReplacementRequest = require('../models/ReplacementRequest');
const EventTeam = require('../models/EventTeam');
const Attendance = require('../models/Attendance');
const TeamActionsLog = require('../models/TeamActionsLog');
const AuditLog = require('../models/AuditLog');
const PerformanceReview = require('../models/PerformanceReview');
const webpush = require('web-push');
const emailService = require('../services/emailService');
const { notificationQueue } = require('../../config/queues');
const mpesaService = require('../services/mpesaService');
const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');
const {
    validateStaffCreation,
    validateStaffUpdate,
    validateAssignmentCreation,
    validatePasswordChange
} = require('../middleware/validation');

// Web Push setup
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_EMAIL || 'mailto:admin@emeraldevents.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

// Helper: send push notification to one or many staff by ID
async function sendPushToStaff(staffIds, payload) {
    try {
        const ids = Array.isArray(staffIds) ? staffIds : [staffIds];
        const staffList = await Staff.find({ _id: { $in: ids }, pushSubscription: { $exists: true, $ne: null } }).select('pushSubscription name');
        for (const s of staffList) {
            try {
                await webpush.sendNotification(s.pushSubscription, JSON.stringify(payload));
            } catch (e) {
                if (e.statusCode === 410 || e.statusCode === 404) {
                    // Subscription expired, clean it up
                    await Staff.findByIdAndUpdate(s._id, { $unset: { pushSubscription: '' } });
                }
            }
        }
    } catch (err) {
        console.log('Push notification error:', err.message);
    }
}

// Helper: Emit metric update to admin dashboard
const emitMetricUpdate = async () => {
    if (!global.io) return;
    try {
        const totalStaff = await Staff.countDocuments();
        const availableStaff = await Staff.countDocuments({ availability_status: 'Available' });
        const busyStaff = await Staff.countDocuments({ availability_status: 'Busy' });
        const activeAssignments = await Assignment.countDocuments({ status: 'Active' });
        global.io.to('Admin').emit('metricUpdate', { totalStaff, availableStaff, busyStaff, activeAssignments });
    } catch (err) {
        console.error('Metric update error:', err.message);
    }
};

// Helper: Build event report data (shared between view and export)
const buildEventReport = async (assignmentId) => {
    const assignment = await Assignment.findById(assignmentId)
        .populate('assigned_staff_ids', 'name email role')
        .populate('accepted_staff_ids', 'name email role');

    if (!assignment) return null;

    const team = await EventTeam.findOne({ event_id: assignment._id })
        .populate('supervisor_id', 'name')
        .populate('member_ids', 'name');

    const attendances = await Attendance.find({ assignment_id: assignment._id })
        .populate('staff_id', 'name');

    let logs = [];
    if (team) {
        logs = await TeamActionsLog.find({ team_id: team._id })
            .populate('performed_by', 'name')
            .sort({ timestamp: -1 });
    }

    return {
        event_title: assignment.title,
        date: assignment.date,
        location: assignment.location,
        pay_rate: assignment.pay_rate,
        dress_code: assignment.dress_code,
        status: assignment.status,
        payment_status: assignment.payment_status,
        total_assigned: assignment.assigned_staff_ids.length,
        total_accepted: assignment.accepted_staff_ids.length,
        assigned_staff: assignment.assigned_staff_ids,
        accepted_staff: assignment.accepted_staff_ids,
        supervisor: team ? (team.supervisor_id ? team.supervisor_id.name : 'None') : 'No Team Formed',
        team_readiness: team ? team.team_readiness : 0,
        attendances: attendances.map(a => ({
            staff: a.staff_id ? a.staff_id.name : 'Unknown',
            clock_in: a.clock_in,
            clock_out: a.clock_out,
            total_hours: a.total_hours,
            status: a.status
        })),
        actions_log: logs.map(l => ({
            action: l.action_type,
            by: l.performed_by ? l.performed_by.name : 'System',
            reason: l.reason,
            time: l.timestamp
        }))
    };
};

// Helper: Readiness label
const getReadinessLabel = (pct) => {
    if (pct === 0) return 'Waiting';
    if (pct < 50) return 'Incomplete';
    if (pct < 100) return 'Ready';
    return 'Fully Deployed';
};

// @desc    Get Admin Dashboard
// @route   GET /admin/dashboard
exports.getDashboard = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getDashboardData();
        res.render('admin/dashboard', { user: req.user, ...data, getReadinessLabel: getReadinessLabel });
    } catch (error) {
        console.error(error);
        res.redirect('/?error=Server error');
    }
};

// @desc    Get All Teams (Groups)
// @route   GET /admin/teams
exports.getAllTeams = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getAllTeamsData();
        res.render('admin/teams', { user: req.user, ...data });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Create a Team (Group)
// @route   POST /admin/teams
exports.createTeam = async (req, res) => {
    try {
        const eventTeamService = require('../services/eventTeamService');
        const team = await eventTeamService.createTeam(req.body.event_id, req.body.supervisor_id, req.body.member_ids);
        respond(res, 201, { success: true, data: team });
    } catch (error) {
        console.error(error);
        if (error.message === 'A team already exists for this event!') return respond(res, 400, { success: false, error: 'A team already exists for this event!' });
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Get API data for Team creation modal
// @route   GET /admin/teams/create-data
exports.getTeamCreateData = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getTeamCreateData();
        respond(res, 200, { success: true, ...data });
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server error' });
    }
};

// @desc    Get all staff (for list panel)
// @route   GET /admin/staff
exports.getAllStaff = async (req, res) => {
    try {
        const staff = await Staff.find().select('-password').sort({ createdAt: -1 });
        respond(res, 200, { success: true, data: staff });
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Add new staff
// @route   POST /admin/staff
exports.addStaff = async (req, res) => {
    try {
        const staffManagementService = require('../services/staffManagementService');
        
        // Handle photo if uploaded 
        let photo_url = null;
        if (req.file) {
            photo_url = '/uploads/staff/' + req.file.filename;
        }

        const staffData = { ...req.body, photo_url };
        
        const user = await staffManagementService.createStaffAccount(req.user._id, staffData);

        // Emit metric update
        const { emitMetricUpdate } = require('../services/socketService');
        await emitMetricUpdate();

        respond(res, 201, {
            success: true,
            data: { _id: user._id, name: user.name, email: user.email, role: user.role },
            message: `Account created. Welcome email sent to ${user.email}.`
        });

    } catch (error) {
        console.error(error);
        if (error.message === 'A staff member with this email already exists') {
            return respond(res, 400, { success: false, error: error.message });
        }
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Edit Staff
// @route   PUT /admin/staff/:id
exports.editStaff = async (req, res) => {
    try {
        const staffManagementService = require('../services/staffManagementService');
        
        let photo_url = null;
        if (req.file) {
            photo_url = '/uploads/staff/' + req.file.filename;
        }

        const updated = await staffManagementService.updateStaffAccount(req.user._id, req.params.id, req.body, photo_url);

        // Push real-time update to staff
        if (global.io) {
            global.io.to(req.params.id).emit('profileUpdated', updated);
            global.io.to(updated._id.toString()).emit('syncProfileUpdate', updated);
        }

        const { emitMetricUpdate } = require('../services/socketService');
        await emitMetricUpdate();

        if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
            respond(res, 200, { success: true, data: updated });
        } else {
            req.flash('success', 'Staff member updated successfully');
            res.redirect('/portal/admin-staff/staff');
        }
    } catch (error) {
        console.error(error);
        if (error.message === 'Staff not found') return respond(res, 404, { success: false, error: 'Staff not found' });
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Delete Staff
// @route   DELETE /admin/staff/:id
exports.deleteStaff = async (req, res) => {
    try {
        const staff = await Staff.findById(req.params.id);
        if (!staff) return respond(res, 404, { success: false, error: 'Staff not found' });
        if (staff.role === 'Admin') return respond(res, 403, { success: false, error: 'Cannot delete admin accounts' });

        const staffId = staff._id;

        // Remove from all assignment arrays and payment records
        await Assignment.updateMany(
            {},
            {
                $pull: {
                    assigned_staff_ids: staffId,
                    accepted_staff_ids: staffId,
                    declined_staff_ids: staffId,
                    applicant_ids: staffId,
                    staff_payments: { staff_id: staffId }
                }
            }
        );

        // Remove from event teams as member
        await EventTeam.updateMany(
            { member_ids: staffId },
            { $pull: { member_ids: staffId } }
        );

        // If they were a team supervisor, clear that too
        await EventTeam.updateMany(
            { supervisor_id: staffId },
            { $unset: { supervisor_id: '' } }
        );

        // Remove as supervisor from other staff
        await Staff.updateMany(
            { supervisor_id: staffId },
            { $unset: { supervisor_id: '' } }
        );

        // Finally delete
        await Staff.findByIdAndDelete(staffId);

        await AuditLog.create({
            actionType: 'ACCOUNT_DELETED', targetModel: 'Staff', targetId: staff._id,
            performedBy: req.user._id,
            details: { name: staff.name, email: staff.email }
        });

        await emitMetricUpdate();

        respond(res, 200, { success: true, message: 'Staff deleted successfully' });
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Toggle Suspend/Activate Staff
// @route   PUT /admin/staff/:id/suspend
exports.toggleSuspend = async (req, res) => {
    try {
        const staffManagementService = require('../services/staffManagementService');
        const staff = await staffManagementService.toggleStaffSuspension(req.user._id, req.params.id);

        if (global.io) {
            global.io.to(staff._id.toString()).emit('accountStatusChanged', { status: staff.status });
        }

        const { emitMetricUpdate } = require('../services/socketService');
        await emitMetricUpdate();

        respond(res, 200, { success: true, status: staff.status });
    } catch (error) {
        console.error(error);
        if (error.message === 'Staff not found') return respond(res, 404, { success: false, error: 'Staff not found' });
        if (error.message === 'Cannot suspend admin accounts') return respond(res, 403, { success: false, error: 'Cannot suspend admin accounts' });
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Admin manually reset staff password
// @route   POST /admin/staff/:id/reset-password
exports.adminResetPassword = async (req, res) => {
    try {
        const staff = await Staff.findById(req.params.id);
        if (!staff) return respond(res, 404, { success: false, error: 'Staff not found' });

        const newPlainPassword = crypto.randomBytes(5).toString('hex');
        const salt = await bcrypt.genSalt(10);
        staff.password = await bcrypt.hash(newPlainPassword, salt);
        staff.mustChangePassword = true;
        await staff.save();

        await notificationQueue.add('email', {
            type: 'staff.admin.password_reset',
            payload: {
                staffId: staff._id.toString(),
                plainPassword: newPlainPassword
            }
        });

        await AuditLog.create({
            actionType: 'PASSWORD_RESET', targetModel: 'Staff', targetId: staff._id,
            performedBy: req.user._id,
            details: { reason: 'Admin Manual Reset' }
        });

        respond(res, 200, { success: true, message: `Password reset email sent to ${staff.email}. Staff will be forced to change on next login.` });
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Get Audit Logs
// @route   GET /admin/audit-logs
exports.getAuditLogs = async (req, res) => {
    try {
        const logs = await AuditLog.find()
            .populate('performedBy', 'name role')
            .sort({ timestamp: -1 })
            .limit(100);
        respond(res, 200, { success: true, data: logs });
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Get Staff Performance History
// @route   GET /admin/staff/:id/performance
exports.getStaffPerformance = async (req, res) => {
    try {
        const reviews = await PerformanceReview.find({ staff_id: req.params.id })
            .populate('supervisor_id', 'name')
            .populate('assignment_id', 'title date')
            .sort({ timestamp: -1 });
        respond(res, 200, { success: true, data: reviews });
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Create Assignment
// @route   POST /admin/assignments
exports.createAssignment = async (req, res) => {
    try {
        const eventAssignmentService = require('../services/eventAssignmentService');
        await eventAssignmentService.createAssignment(req.user.id, req.body);
        
        res.redirect('/portal/admin-staff/events');
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Update Assignment
// @route   PUT /admin/assignments/:id
exports.updateAssignment = async (req, res) => {
    try {
        const eventAssignmentService = require('../services/eventAssignmentService');
        const assignment = await eventAssignmentService.updateAssignment(req.user._id, req.params.id, req.body);
        
        if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
            respond(res, 200, { success: true, data: assignment });
        } else {
            req.flash('success', 'Event updated successfully');
            res.redirect('/portal/admin-staff/events');
        }
    } catch (error) {
        console.error(error);
        if (error.message === 'Assignment not found') return respond(res, 404, { success: false, error: 'Assignment not found' });
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Delete Assignment
// @route   DELETE /admin/assignments/:id
exports.deleteAssignment = async (req, res) => {
    try {
        const eventAssignmentService = require('../services/eventAssignmentService');
        await eventAssignmentService.deleteAssignment(req.user._id, req.params.id);
        respond(res, 200, { success: true, message: 'Event deleted successfully' });
    } catch (error) {
        console.error(error);
        if (error.message === 'Assignment not found') return respond(res, 404, { success: false, error: 'Assignment not found' });
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Update Assignment Payment Status
// @route   PUT /admin/assignments/:id/payment
exports.updatePaymentStatus = async (req, res) => {
    try {
        const eventPaymentService = require('../financials/services/eventPaymentService');
        const assignment = await eventPaymentService.updatePaymentStatus(
            req.user._id, req.params.id, req.body.payment_status, req.body.staff_payment_id, req.body.transaction_id
        );
        respond(res, 200, { success: true, data: assignment });
    } catch (error) {
        console.error(error);
        if (error.message === 'Invalid payment status' || error.message === 'Assignment not found') return respond(res, 400, { success: false, error: error.message });
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Approve or reject a staff applicant
// @route   POST /portal/admin-staff/assignments/:id/applicants/:staffId
exports.handleApplicant = async (req, res) => {
    try {
        const eventAssignmentService = require('../services/eventAssignmentService');
        await eventAssignmentService.handleApplicant(req.params.id, req.params.staffId, req.body.action);
        respond(res, 200, { success: true, action: req.body.action });
    } catch (err) {
        console.error(err);
        respond(res, 500, { success: false, error: err.message || 'Server Error' });
    }
};

// @desc    Generate payment receipt PDF
// @route   GET /portal/admin-staff/payments/:assignmentId/receipt/:staffId
exports.generatePaymentReceipt = async (req, res) => {
    try {
        const pdfReportService = require('../services/pdfReportService');
        await pdfReportService.generatePaymentReceipt(req.params.assignmentId, req.params.staffId, res);
    } catch (err) {
        console.error(err);
        respond(res, 500, { success: false, error: 'Failed to generate receipt' });
    }
};

// @desc    Get single assignment (live modal refresh)
// @route   GET /portal/admin-staff/assignments/:id
exports.getSingleAssignment = async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.id)
            .populate('accepted_staff_ids', 'name email phone')
            .populate('applicant_ids', 'name email');
        if (!assignment) return respond(res, 404, { success: false });
        respond(res, 200, { success: true, data: assignment.toObject() });
    } catch (err) {
        respond(res, 500, { success: false });
    }
};

// @desc    Get All Payments (paginated, filterable)
// @route   GET /admin/payments
exports.getAllPayments = async (req, res) => {
    try {
        const { payment_status, start_date, end_date, staff_id, page = 1 } = req.query;
        const limit = 20;
        const skip = (parseInt(page) - 1) * limit;

        const filter = {};
        if (payment_status) filter.payment_status = payment_status;
        if (start_date || end_date) {
            filter.date = {};
            if (start_date) filter.date.$gte = new Date(start_date);
            if (end_date) filter.date.$lte = new Date(end_date);
        }
        if (staff_id) filter.accepted_staff_ids = staff_id;

        const total = await Assignment.countDocuments(filter);
        const assignments = await Assignment.find(filter)
            .populate('accepted_staff_ids', 'name email')
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit);

        respond(res, 200, {
            success: true,
            data: assignments,
            pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total }
        });
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Export Event Report (PDF or CSV)
// @route   GET /admin/assignments/:id/report/export
exports.exportReport = async (req, res) => {
    try {
        const pdfReportService = require('../services/pdfReportService');
        await pdfReportService.exportReport(req.params.id, req.query.format || 'csv', res);
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Export Payment Logs (CSV)
// @route   GET /admin/export/payments
exports.exportPayments = async (req, res) => {
    try {
        const pdfReportService = require('../services/pdfReportService');
        await pdfReportService.exportPayments(res);
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Approve Replacement Request
// @route   POST /admin/replacements/:id/approve
exports.approveReplacement = async (req, res) => {
    try {
        const eventTeamService = require('../services/eventTeamService');
        await eventTeamService.approveReplacement(req.user._id, req.params.id);
        respond(res, 200, { success: true, message: 'Replacement Request Approved' });
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Reject Replacement Request
// @route   POST /admin/replacements/:id/reject
exports.rejectReplacement = async (req, res) => {
    try {
        const eventTeamService = require('../services/eventTeamService');
        await eventTeamService.rejectReplacement(req.params.id);
        respond(res, 200, { success: true, message: 'Replacement Request Rejected' });
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Get Event Completion Report (JSON)
// @route   GET /admin/assignments/:id/report
exports.getEventReport = async (req, res) => {
    try {
        const Assignment = require('../models/Assignment');
        const assignment = await Assignment.findById(req.params.id)
            .populate('assigned_staff_ids', 'name role status availability_status photo_url')
            .populate('accepted_staff_ids', 'name role status photo_url')
            .populate('declined_staff_ids', 'name role status photo_url')
            .populate('applicant_ids', 'name email role specific_role photo_url');
        
        if (!assignment) {
            return respond(res, 404, { success: false, error: 'Assignment not found' });
        }
        
        const report = await buildEventReport(req.params.id);
        if (!report) {
            return respond(res, 404, { success: false, error: 'Assignment not found' });
        }
        respond(res, 200, { success: true, data: { ...report, assignment } });
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// ════════════════════════════════════════════════════════════
// PAGE CONTROLLERS — Render full EJS views for each sidebar tab
// ════════════════════════════════════════════════════════════

// @desc    Staff Management Page
// @route   GET /portal/admin-staff/staff-management
exports.getStaffManagementPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getStaffManagementPageData(req.query);
        res.render('admin/staff-management', { user: req.user, ...data });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};


// @desc    Events / Assignments Page
// @route   GET /portal/admin-staff/events
exports.getEventsPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getEventsPageData(req.query);
        res.render('admin/events', { user: req.user, ...data });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};


// @desc    Attendance Monitoring Page
// @route   GET /portal/admin-staff/attendance
exports.getAttendancePage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getAttendancePageData(req.query);
        res.render('admin/attendance', { user: req.user, ...data });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};


// @desc    Payments Management Page
// @route   GET /portal/admin-staff/payments-page
exports.getPaymentsPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getPaymentsPageData(req.query);
        res.render('admin/payments', { user: req.user, ...data });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};


// @desc    Reports Page
// @route   GET /portal/admin-staff/reports
exports.getReportsPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getReportsPageData();
        res.render('admin/reports', { user: req.user, ...data });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Audit Logs Page
// @route   GET /portal/admin-staff/audit-logs-page
exports.getAuditLogsPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getAuditLogsPageData(req.query);
        res.render('admin/audit-logs', { user: req.user, ...data });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Security Page
// @route   GET /portal/admin-staff/security
exports.getSecurityPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getSecurityPageData();
        res.render('admin/security', { user: req.user, ...data });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Update GPS Location (Admin/Supervisor)
// @route   POST /portal/admin-staff/location
exports.updateAdminLocation = async (req, res) => {
    try {
        const staffManagementService = require('../services/staffManagementService');
        await staffManagementService.updateAdminLocation(req.user._id, req.body.lat, req.body.lng);
        respond(res, 200, { success: true });
    } catch (error) {
        console.error(error);
        if (error.message === 'Coordinates required') return respond(res, 400, { success: false, error: error.message });
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

exports.assignSupervisor = async (req, res) => {
    try {
        const staffManagementService = require('../services/staffManagementService');
        const updated = await staffManagementService.assignSupervisor(req.user._id, req.params.id, req.body.supervisorId);
        respond(res, 200, { success: true, data: updated });
    } catch(error) {
        console.error(error);
        if (error.message === 'Supervisor not found' || error.message === 'Staff not found') return respond(res, 404, { success: false, error: error.message });
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Assign Supervisor to Event/Assignment
// @route   PUT /portal/admin-staff/assignments/:id/supervisor
exports.assignEventSupervisor = async (req, res) => {
    try {
        const eventTeamService = require('../services/eventTeamService');
        const result = await eventTeamService.assignEventSupervisor(req.user._id, req.user.name, req.params.id, req.body.supervisor_id);
        respond(res, 200, { success: true, assignment: result.assignment, team: result.team });
    } catch (err) {
        console.error(err);
        respond(res, 500, { success: false, message: err.message });
    }
};

// @desc    Assign Staff to Event/Assignment
// @route   PUT /portal/admin-staff/assignments/:id/assign-staff
exports.assignStaffToEvent = async (req, res) => {
  try {
    const eventAssignmentService = require('../services/eventAssignmentService');
    const assignment = await eventAssignmentService.assignStaffToEvent(req.params.id, req.body.staff_ids);
    respond(res, 200, { success: true, assignment });
  } catch (err) {
    respond(res, 500, { success: false, message: err.message });
  }
};

// @desc    Toggle applications open/closed for an assignment
// @route   PUT /admin/assignments/:id/toggle-applications
exports.toggleApplications = async (req, res) => {
    try {
        const eventAssignmentService = require('../services/eventAssignmentService');
        const open = await eventAssignmentService.toggleApplications(req.params.id);
        respond(res, 200, { success: true, open });
    } catch(err) {
        respond(res, 500, { success: false, message: err.message });
    }
};

// @desc    Initiate M-Pesa B2C payment to staff member
// @route   POST /portal/admin-staff/assignments/:id/pay-staff
exports.initiateStaffPayment = async (req, res) => {
    try {
        const eventPaymentService = require('../financials/services/eventPaymentService');
        const result = await eventPaymentService.initiateStaffPayment(req.user._id, req.params.id, req.body);
        respond(res, 200, { success: true, message: result.message });
    } catch (error) {
        console.error('M-Pesa B2C error:', error?.response?.data || error.message);
        respond(res, 500, { success: false, error: error?.response?.data?.errorMessage || error.message || 'Payment initiation failed' });
    }
};

// @desc    M-Pesa B2C callback (called by Safaricom)
// @route   POST /portal/admin-staff/mpesa/callback
exports.mpesaCallback = async (req, res) => {
    try {
        const queueMode = (process.env.QUEUE_MODE || 'inline').toLowerCase();
        const payload = {
            ...req.body,
            idempotencyKey: req.headers['x-idempotency-key'] || req.body?.idempotencyKey
        };
        const result = payload?.Result;

        if (!result || typeof result !== 'object' || !result.Occasion) {
            console.warn('M-Pesa callback invalid payload ignored');
            return respond(res, 200, { success: true, ignored: true });
        }

        if (queueMode === 'async') {
            const { paymentQueue } = require('../../config/queues');
            await paymentQueue.add('mpesa.callback', { payload });
        } else {
            const eventPaymentService = require('../financials/services/eventPaymentService');
            await eventPaymentService.mpesaCallback(payload);
        }
        respond(res, 200, { success: true });
    } catch (error) {
        console.error('M-Pesa callback error:', error.message);
        respond(res, 200, { success: true }); // Always 200 to Safaricom
    }
};

// @desc    M-Pesa B2C timeout
// @route   POST /portal/admin-staff/mpesa/timeout
exports.mpesaTimeout = async (req, res) => {
    console.warn('M-Pesa B2C timeout:', req.body);
    respond(res, 200, { success: true });
};

exports.checkDisbandEligibility = async (req, res) => {
    try {
        const eventTeamService = require('../services/eventTeamService');
        const result = await eventTeamService.checkDisbandEligibility(req.params.teamId);
        
        if (!result.canDisband) {
            return respond(res, 200, { success: true, canDisband: false, reason: result.reason });
        }

        respond(res, 200, { success: true, canDisband: true });
    } catch (err) {
        console.error('checkDisbandEligibility error:', err);
        respond(res, 500, { success: false, message: 'Server error' });
    }
};

exports.disbandTeam = async (req, res) => {
    try {
        const eventTeamService = require('../services/eventTeamService');
        await eventTeamService.disbandTeam(req.params.teamId);
        respond(res, 200, { success: true, message: 'Team disbanded successfully.' });
    } catch (err) {
        console.error('disbandTeam error:', err);
        if (err.message && err.message.includes('Cannot disband team')) return respond(res, 400, { success: false, message: err.message });
        respond(res, 500, { success: false, message: 'Server error' });
    }
};

// ════════════════════════════════════════════════════════════════════════════
// PHASE 10 — Performance Leaderboard
// ════════════════════════════════════════════════════════════════════════════
exports.getLeaderboardPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getLeaderboardPageData();
        res.render('admin/leaderboard', {
            user: req.user,
            currentPage: 'leaderboard',
            title: 'Performance Leaderboard',
            ...data
        });
    } catch (err) {
        console.error('[adminController] getLeaderboardPage error:', err);
        res.status(500).send('Error loading leaderboard: ' + err.message);
    }
};

// ════════════════════════════════════════════════════════════════════════════
// PHASE 4 — Staff Category Settings
// ════════════════════════════════════════════════════════════════════════════
exports.getCategorySettingsPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getCategorySettingsPageData();
        res.render('admin/category-settings', {
            user: req.user,
            currentPage: 'categories',
            title: 'Staff Category Settings',
            ...data
        });
    } catch (err) {
        console.error('[adminController] getCategorySettingsPage error:', err);
        res.status(500).send('Error loading category settings: ' + err.message);
    }
};

exports.updateCategorySettings = async (req, res) => {
    try {
        const staffManagementService = require('../services/staffManagementService');
        const updated = await staffManagementService.updateCategorySettings(req.user, req.body, req.ip);
        respond(res, 200, { success: true, setting: updated });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message });
    }
};

exports.getStaffCard = async (req, res) => {
    try {
        const staffManagementService = require('../services/staffManagementService');
        const cardData = await staffManagementService.getStaffCard(req.params.id);
        respond(res, 200, { success: true, staff: cardData });
    } catch (err) {
        if (err.message === 'Staff not found') return respond(res, 404, { success: false, error: err.message });
        respond(res, 500, { success: false, error: err.message });
    }
};

// @desc    Manually mark a staff payment as Received
// @route   POST /portal/admin-staff/assignments/:id/payments/:spid/mark-received
exports.markPaymentReceived = async (req, res) => {
    try {
        const eventPaymentService = require('../financials/services/eventPaymentService');
        await eventPaymentService.markPaymentReceived(req.user._id, req.params.id, req.params.spid);
        respond(res, 200, { success: true });
    } catch (error) {
        console.error(error);
        if (error.message === 'Payment record not found') return respond(res, 404, { success: false, error: error.message });
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};