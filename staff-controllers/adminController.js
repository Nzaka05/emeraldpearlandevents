const Staff = require('../staff-models/Staff');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Assignment = require('../staff-models/Assignment');
const ReplacementRequest = require('../staff-models/ReplacementRequest');
const EventTeam = require('../staff-models/EventTeam');
const Attendance = require('../staff-models/Attendance');
const TeamActionsLog = require('../staff-models/TeamActionsLog');
const AuditLog = require('../staff-models/AuditLog');
const PerformanceReview = require('../staff-models/PerformanceReview');
const webpush = require('web-push');
const emailService = require('../staff-services/emailService');
const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');
const {
    validateStaffCreation,
    validateStaffUpdate,
    validateAssignmentCreation,
    validatePasswordChange
} = require('../staff-middleware/validation');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_EMAIL || 'mailto:admin@emeraldevents.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

// Helper: Send push to staff
const sendPushToStaff = async (staffList, title, body) => {
    for (const staff of staffList) {
        if (staff.pushSubscription) {
            try {
                await webpush.sendNotification(staff.pushSubscription, JSON.stringify({ title, body }));
            } catch (err) {
                console.error('Push error for', staff.name, ':', err.message);
            }
        }
    }
};

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
        const totalStaff = await Staff.countDocuments();
        const availableStaff = await Staff.countDocuments({ availability_status: 'Available' });
        const busyStaff = await Staff.countDocuments({ availability_status: 'Busy' });
        const activeAssignments = await Assignment.countDocuments({ status: 'Active' });

        const allAssignments = await Assignment.find().sort({ createdAt: -1 })
            .populate('assigned_staff_ids', 'name')
            .populate('accepted_staff_ids', 'name');

        const pendingReplacements = await ReplacementRequest.find({ status: 'Pending' })
            .populate('team_id')
            .populate('event_id', 'title')
            .populate('member_to_remove', 'name')
            .populate('suggested_replacement', 'name')
            .populate('submitted_by', 'name');

        res.render('admin/dashboard', {
            user: req.user,
            assignments: allAssignments,
            pendingReplacements,
            getReadinessLabel,
            metrics: { totalStaff, availableStaff, busyStaff, activeAssignments }
        });
    } catch (error) {
        console.error(error);
        res.redirect('/?error=Server error');
    }
};

// @desc    Get all staff (for list panel)
// @route   GET /admin/staff
exports.getAllStaff = async (req, res) => {
    try {
        const staff = await Staff.find().select('-password').sort({ createdAt: -1 });
        res.json({ success: true, data: staff });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Add new staff
// @route   POST /admin/staff
exports.addStaff = async (req, res) => {
    try {
        const { name, email, role, shift_start, shift_end, phone, department, skills } = req.body;

        let user = await Staff.findOne({ email });
        if (user) {
            return res.status(400).json({ success: false, error: 'Email already exists' });
        }

        // Generate random password
        const plainPassword = crypto.randomBytes(5).toString('hex');
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(plainPassword, salt);

        // Generate secure login token
        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

        // Handle photo if uploaded via multer
        let photo_url = null;
        if (req.file) {
            photo_url = '/uploads/staff/' + req.file.filename;
        }

        // Parse skills
        let parsedSkills = [];
        if (skills) {
            parsedSkills = typeof skills === 'string' ? skills.split(',').map(s => s.trim()).filter(Boolean) : skills;
        }

        user = await Staff.create({
            name,
            email,
            password: hashedPassword,
            role: role || 'Staff',
            shift_start,
            shift_end,
            phone: phone || '',
            department: department || '',
            skills: parsedSkills,
            photo_url,
            mustChangePassword: true,
            secureLoginToken: hashedToken,
            secureLoginExpire: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
        });

        // Build secure login URL
        const baseUrl = process.env.STAFF_APP_URL || 'http://localhost:3001';
        const loginUrl = `${baseUrl}/auth/secure-login/${rawToken}`;

        // Send welcome email
        await emailService.sendStaffWelcomeEmail(user, plainPassword, loginUrl);

        // Log creation
        await AuditLog.create({
            actionType: 'ACCOUNT_CREATED', targetModel: 'Staff', targetId: user._id,
            performedBy: req.user._id,
            details: { name, email, role }
        });

        // Emit metric update
        await emitMetricUpdate();

        res.status(201).json({
            success: true,
            data: { _id: user._id, name: user.name, email: user.email, role: user.role },
            message: `Account created. Welcome email sent to ${user.email}.`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Edit Staff
// @route   PUT /admin/staff/:id
exports.editStaff = async (req, res) => {
    try {
        const { name, email, role, phone, department, skills, shift_start, shift_end } = req.body;
        const staffBefore = await Staff.findById(req.params.id).select('-password');
        if (!staffBefore) return res.status(404).json({ success: false, error: 'Staff not found' });

        const updateData = { name, email, role, phone, department, shift_start, shift_end };

        // Parse skills
        if (skills) {
            updateData.skills = typeof skills === 'string' ? skills.split(',').map(s => s.trim()).filter(Boolean) : skills;
        }

        // Handle photo upload
        if (req.file) {
            updateData.photo_url = '/uploads/staff/' + req.file.filename;
        }

        const updated = await Staff.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        // Push real-time update to staff
        if (global.io) {
            global.io.to(req.params.id).emit('profileUpdated', updated);

            // Also notify other connected clients of the same user about changes
            global.io.to(updated._id.toString()).emit('syncProfileUpdate', updated);
        }

        await AuditLog.create({
            actionType: 'ACCOUNT_UPDATED', targetModel: 'Staff', targetId: updated._id,
            performedBy: req.user._id,
            details: { before: { name: staffBefore.name, email: staffBefore.email, role: staffBefore.role }, after: { name: updated.name, email: updated.email, role: updated.role } }
        });

        await emitMetricUpdate();

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Delete Staff
// @route   DELETE /admin/staff/:id
exports.deleteStaff = async (req, res) => {
    try {
        const staff = await Staff.findById(req.params.id);
        if (!staff) return res.status(404).json({ success: false, error: 'Staff not found' });
        if (staff.role === 'Admin') return res.status(403).json({ success: false, error: 'Cannot delete admin accounts' });

        await Staff.findByIdAndDelete(req.params.id);

        await AuditLog.create({
            actionType: 'ACCOUNT_DELETED', targetModel: 'Staff', targetId: staff._id,
            performedBy: req.user._id,
            details: { name: staff.name, email: staff.email }
        });

        await emitMetricUpdate();

        res.json({ success: true, message: 'Staff deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Toggle Suspend/Activate Staff
// @route   PUT /admin/staff/:id/suspend
exports.toggleSuspend = async (req, res) => {
    try {
        const staff = await Staff.findById(req.params.id);
        if (!staff) return res.status(404).json({ success: false, error: 'Staff not found' });
        if (staff.role === 'Admin') return res.status(403).json({ success: false, error: 'Cannot suspend admin accounts' });

        staff.status = staff.status === 'Suspended' ? 'Active' : 'Suspended';
        await staff.save();

        await AuditLog.create({
            actionType: staff.status === 'Suspended' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_ACTIVATED',
            targetModel: 'Staff', targetId: staff._id,
            performedBy: req.user._id,
            details: { name: staff.name, newStatus: staff.status }
        });

        if (global.io) {
            global.io.to(staff._id.toString()).emit('accountStatusChanged', { status: staff.status });
        }

        await emitMetricUpdate();

        res.json({ success: true, status: staff.status });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Admin manually reset staff password
// @route   POST /admin/staff/:id/reset-password
exports.adminResetPassword = async (req, res) => {
    try {
        const staff = await Staff.findById(req.params.id);
        if (!staff) return res.status(404).json({ success: false, error: 'Staff not found' });

        const newPlainPassword = crypto.randomBytes(5).toString('hex');
        const salt = await bcrypt.genSalt(10);
        staff.password = await bcrypt.hash(newPlainPassword, salt);
        staff.mustChangePassword = true;
        await staff.save();

        // Send email notification
        await emailService.sendAdminPasswordResetNotification(staff, newPlainPassword);

        await AuditLog.create({
            actionType: 'PASSWORD_RESET', targetModel: 'Staff', targetId: staff._id,
            performedBy: req.user._id,
            details: { reason: 'Admin Manual Reset' }
        });

        res.json({ success: true, message: `Password reset email sent to ${staff.email}. Staff will be forced to change on next login.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
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
        res.json({ success: true, data: logs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
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
        res.json({ success: true, data: reviews });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Create Assignment
// @route   POST /admin/assignments
exports.createAssignment = async (req, res) => {
    try {
        const {
            title, description, location, date, start_time, end_time,
            pay_rate, vip_flag, special_instructions, dress_code, assign_to_role, specific_staff_ids
        } = req.body;

        let assignedIds = [];

        if (assign_to_role) {
            const staffByRole = await Staff.find({ role: assign_to_role }).select('_id');
            assignedIds = staffByRole.map(s => s._id);
        } else if (specific_staff_ids && specific_staff_ids.length > 0) {
            assignedIds = specific_staff_ids;
        } else {
            const allStaff = await Staff.find({ role: { $ne: 'Admin' } }).select('_id');
            assignedIds = allStaff.map(s => s._id);
        }

        const assignment = await Assignment.create({
            title, description, location, date, start_time, end_time,
            pay_rate,
            vip_flag: vip_flag === 'true' || vip_flag === true,
            special_instructions,
            dress_code: dress_code || '',
            assigned_staff_ids: assignedIds,
            createdByAdmin: req.user.id
        });

        // Socket notification
        if (global.io) {
            global.io.emit('newAssignment', { title: assignment.title, vip: assignment.vip_flag });
        }

        // Push + email notifications to assigned staff
        const populatedStaff = await Staff.find({ _id: { $in: assignedIds } });
        await sendPushToStaff(populatedStaff, 'New Shift Assigned!',
            `You have been assigned to ${assignment.title} on ${new Date(assignment.date).toLocaleDateString()}.`);

        // Send email to each assigned staff
        for (const staff of populatedStaff) {
            await emailService.sendAssignmentNotification(staff, assignment);
        }

        await AuditLog.create({
            actionType: 'ASSIGNMENT_CREATED', targetModel: 'Assignment', targetId: assignment._id,
            performedBy: req.user._id,
            details: { title, staffCount: assignedIds.length }
        });

        res.status(201).json({ success: true, data: assignment });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Update Assignment
// @route   PUT /admin/assignments/:id
exports.updateAssignment = async (req, res) => {
    try {
        const { title, description, location, date, start_time, end_time, pay_rate, vip_flag, special_instructions, dress_code } = req.body;

        const assignment = await Assignment.findById(req.params.id);
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });

        // Update fields
        if (title) assignment.title = title;
        if (description) assignment.description = description;
        if (location) assignment.location = location;
        if (date) assignment.date = date;
        if (start_time) assignment.start_time = start_time;
        if (end_time) assignment.end_time = end_time;
        if (pay_rate) assignment.pay_rate = pay_rate;
        if (typeof vip_flag !== 'undefined') assignment.vip_flag = vip_flag === 'true' || vip_flag === true;
        if (typeof special_instructions !== 'undefined') assignment.special_instructions = special_instructions;
        if (typeof dress_code !== 'undefined') assignment.dress_code = dress_code;

        await assignment.save();

        // Notify accepted staff
        const acceptedStaff = await Staff.find({ _id: { $in: assignment.accepted_staff_ids } });
        if (global.io) {
            for (const staff of acceptedStaff) {
                global.io.to(staff._id.toString()).emit('assignmentUpdated', {
                    assignmentId: assignment._id,
                    title: assignment.title,
                    message: `Assignment "${assignment.title}" has been updated. Please review the changes.`
                });
            }
        }

        await sendPushToStaff(acceptedStaff, 'Assignment Updated',
            `"${assignment.title}" details have been changed. Check your dashboard.`);

        for (const staff of acceptedStaff) {
            await emailService.sendAssignmentUpdateNotification(staff, assignment);
        }

        await AuditLog.create({
            actionType: 'ASSIGNMENT_UPDATED', targetModel: 'Assignment', targetId: assignment._id,
            performedBy: req.user._id,
            details: { title: assignment.title }
        });

        res.json({ success: true, data: assignment });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Update Assignment Payment Status
// @route   PUT /admin/assignments/:id/payment
exports.updatePaymentStatus = async (req, res) => {
    try {
        const { payment_status } = req.body;

        if (!['Pending', 'Sent', 'Received', 'Disputed'].includes(payment_status)) {
            return res.status(400).json({ success: false, error: 'Invalid payment status' });
        }

        const assignment = await Assignment.findByIdAndUpdate(
            req.params.id,
            { payment_status },
            { new: true, runValidators: true }
        );

        if (!assignment) {
            return res.status(404).json({ success: false, error: 'Assignment not found' });
        }

        // When payment is marked as Sent, notify all accepted staff
        if (payment_status === 'Sent') {
            const acceptedStaff = await Staff.find({ _id: { $in: assignment.accepted_staff_ids } });

            for (const staff of acceptedStaff) {
                // Socket notification
                if (global.io) {
                    global.io.to(staff._id.toString()).emit('paymentSent', {
                        assignmentId: assignment._id,
                        title: assignment.title,
                        pay_rate: assignment.pay_rate
                    });
                }
                // Email notification
                await emailService.sendPaymentSentNotification(staff, assignment);
            }

            await sendPushToStaff(acceptedStaff, 'Payment Sent!',
                `Payment for "${assignment.title}" ($${assignment.pay_rate}) has been sent. Please confirm receipt.`);

            await AuditLog.create({
                actionType: 'PAYMENT_SENT', targetModel: 'Assignment', targetId: assignment._id,
                performedBy: req.user._id,
                details: { title: assignment.title, staffCount: acceptedStaff.length }
            });
        }

        res.status(200).json({ success: true, data: assignment });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
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

        res.json({
            success: true,
            data: assignments,
            pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Export Event Report (PDF or CSV)
// @route   GET /admin/assignments/:id/report/export
exports.exportReport = async (req, res) => {
    try {
        const format = req.query.format || 'csv';
        const report = await buildEventReport(req.params.id);

        if (!report) {
            return res.status(404).json({ success: false, error: 'Assignment not found' });
        }

        const safeName = report.event_title.replace(/[^a-zA-Z0-9]/g, '_');
        const dateStr = new Date(report.date).toISOString().split('T')[0];

        if (format === 'csv') {
            const rows = report.attendances.map(a => ({
                'Staff': a.staff,
                'Clock In': a.clock_in ? new Date(a.clock_in).toLocaleString() : 'N/A',
                'Clock Out': a.clock_out ? new Date(a.clock_out).toLocaleString() : 'N/A',
                'Hours': a.total_hours || 0,
                'Status': a.status || 'N/A',
                'Event': report.event_title,
                'Date': dateStr,
                'Location': report.location,
                'Pay Rate': report.pay_rate,
                'Payment Status': report.payment_status,
                'Payment Confirmed At': report.payment_confirmed_at ? new Date(report.payment_confirmed_at).toISOString().split('T')[0] : 'N/A',
                'Supervisor': report.supervisor
            }));

            if (rows.length === 0) {
                rows.push({
                    'Staff': 'No attendance records',
                    'Clock In': '', 'Clock Out': '', 'Hours': '',
                    'Status': '', 'Event': report.event_title,
                    'Date': dateStr, 'Location': report.location,
                    'Pay Rate': report.pay_rate, 'Supervisor': report.supervisor
                });
            }

            const parser = new Parser();
            const csv = parser.parse(rows);

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="event-report-${safeName}-${dateStr}.csv"`);
            return res.send(csv);
        }

        if (format === 'pdf') {
            const doc = new PDFDocument({ size: 'A4', margin: 40 });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="event-report-${safeName}-${dateStr}.pdf"`);
            doc.pipe(res);

            // Header
            doc.rect(0, 0, 595, 80).fill('#0D2B1F');
            doc.fontSize(22).fillColor('#C9A84C').text('EMERALD PEARLAND EVENTS', 40, 20);
            doc.fontSize(11).fillColor('#a0c0a8').text('Event Completion Report', 40, 48);

            doc.moveDown(3);
            doc.fillColor('#333');

            // Event details
            doc.fontSize(14).fillColor('#0D2B1F').text('Event Details', 40);
            doc.moveDown(0.5);
            doc.fontSize(10).fillColor('#333');
            doc.text(`Event: ${report.event_title}`, 40);
            doc.text(`Date: ${dateStr}`);
            doc.text(`Location: ${report.location}`);
            doc.text(`Pay Rate: $${report.pay_rate}`);
            doc.text(`Status: ${report.status}`);
            doc.text(`Payment: ${report.payment_status}`);
            doc.text(`Payment Confirmed At: ${report.payment_confirmed_at ? new Date(report.payment_confirmed_at).toLocaleDateString() : 'N/A'}`);
            doc.text(`Supervisor: ${report.supervisor}`);
            doc.text(`Readiness: ${report.team_readiness}% (${getReadinessLabel(report.team_readiness)})`);
            doc.text(`Staff Assigned/Accepted: ${report.total_assigned} / ${report.total_accepted}`);
            if (report.dress_code) doc.text(`Dress Code: ${report.dress_code}`);

            doc.moveDown(1);

            // Attendance table
            doc.fontSize(14).fillColor('#0D2B1F').text('Attendance Records', 40);
            doc.moveDown(0.5);
            doc.fontSize(9).fillColor('#333');

            if (report.attendances.length > 0) {
                // Table header
                const tableTop = doc.y;
                doc.rect(40, tableTop, 515, 18).fill('#f0f0f0');
                doc.fillColor('#333');
                doc.text('Staff', 45, tableTop + 4, { width: 120 });
                doc.text('Clock In', 170, tableTop + 4, { width: 100 });
                doc.text('Clock Out', 275, tableTop + 4, { width: 100 });
                doc.text('Hours', 380, tableTop + 4, { width: 60 });
                doc.text('Status', 445, tableTop + 4, { width: 100 });

                let y = tableTop + 22;
                report.attendances.forEach(a => {
                    if (y > 750) { doc.addPage(); y = 40; }
                    doc.text(a.staff, 45, y, { width: 120 });
                    doc.text(a.clock_in ? new Date(a.clock_in).toLocaleTimeString() : 'N/A', 170, y, { width: 100 });
                    doc.text(a.clock_out ? new Date(a.clock_out).toLocaleTimeString() : 'N/A', 275, y, { width: 100 });
                    doc.text(String(a.total_hours || 0), 380, y, { width: 60 });
                    doc.text(a.status || 'N/A', 445, y, { width: 100 });
                    y += 18;
                });
            } else {
                doc.text('No attendance records found.', 40);
            }

            doc.moveDown(2);

            // Actions log
            if (report.actions_log.length > 0) {
                doc.fontSize(14).fillColor('#0D2B1F').text('Action Log', 40);
                doc.moveDown(0.5);
                doc.fontSize(9).fillColor('#333');
                report.actions_log.forEach(l => {
                    if (doc.y > 750) doc.addPage();
                    doc.text(`${new Date(l.time).toLocaleString()} - ${l.by}: ${l.action} - ${l.reason || ''}`, 40);
                });
            }

            // Footer
            doc.moveDown(2);
            doc.fontSize(8).fillColor('#999').text('Generated by Emerald Pearland Events Staff System', 40, doc.y, { align: 'center' });

            doc.end();
            return;
        }

        res.status(400).json({ success: false, error: 'Invalid format. Use ?format=pdf or ?format=csv' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Export Payment Logs (CSV)
// @route   GET /admin/export/payments
exports.exportPayments = async (req, res) => {
    try {
        const assignments = await Assignment.find()
            .populate('accepted_staff_ids', 'name email')
            .sort({ date: -1 });

        const rows = [];
        for (const a of assignments) {
            for (const staff of (a.accepted_staff_ids || [])) {
                const attendance = await Attendance.findOne({ staff_id: staff._id, assignment_id: a._id });
                rows.push({
                    'Staff Name': staff.name,
                    'Staff Email': staff.email,
                    'Assignment': a.title,
                    'Date': new Date(a.date).toISOString().split('T')[0],
                    'Location': a.location,
                    'Pay Rate': a.pay_rate,
                    'Payment Status': a.payment_status,
                    'Payment Confirmed At': a.payment_confirmed_at ? new Date(a.payment_confirmed_at).toISOString().split('T')[0] : 'N/A',
                    'Hours Worked': attendance ? attendance.total_hours : 0,
                    'Attendance Status': attendance ? attendance.status : 'No Record'
                });
            }
        }

        if (rows.length === 0) {
            rows.push({ 'Staff Name': 'No records', 'Staff Email': '', 'Assignment': '', 'Date': '', 'Location': '', 'Pay Rate': '', 'Payment Status': '', 'Hours Worked': '', 'Attendance Status': '' });
        }

        const parser = new Parser();
        const csv = parser.parse(rows);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="payment-logs-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csv);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Approve Replacement Request
// @route   POST /admin/replacements/:id/approve
exports.approveReplacement = async (req, res) => {
    try {
        const request = await ReplacementRequest.findById(req.params.id)
            .populate('team_id')
            .populate('event_id');

        if (!request || request.status !== 'Pending') {
            return res.status(404).json({ success: false, error: 'Request not found or already processed' });
        }

        const team = request.team_id;
        const assignment = request.event_id;

        // Process removal
        team.member_ids = team.member_ids.filter(id => id.toString() !== request.member_to_remove.toString());
        assignment.assigned_staff_ids = assignment.assigned_staff_ids.filter(id => id.toString() !== request.member_to_remove.toString());
        assignment.accepted_staff_ids = assignment.accepted_staff_ids.filter(id => id.toString() !== request.member_to_remove.toString());

        // Notify removed member
        if (global.io) {
            global.io.to(request.member_to_remove.toString()).emit('removedFromTeam', {
                assignmentTitle: assignment.title,
                message: `You have been removed from the team for "${assignment.title}".`
            });
        }

        // Process addition
        if (request.suggested_replacement) {
            if (!team.member_ids.includes(request.suggested_replacement)) {
                team.member_ids.push(request.suggested_replacement);
            }
            if (!assignment.assigned_staff_ids.includes(request.suggested_replacement)) {
                assignment.assigned_staff_ids.push(request.suggested_replacement);
                assignment.accepted_staff_ids.push(request.suggested_replacement);
            }

            if (global.io) {
                global.io.emit('newAssignment', { title: assignment.title, vip: assignment.vip_flag });
            }
        }

        await team.save();
        await assignment.save();

        request.status = 'Approved';
        await request.save();

        await AuditLog.create({
            actionType: 'REPLACEMENT_APPROVED', targetModel: 'EventTeam', targetId: team._id,
            performedBy: req.user._id,
            details: { removed: request.member_to_remove, added: request.suggested_replacement, assignment: assignment.title }
        });

        res.json({ success: true, message: 'Replacement Request Approved' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Reject Replacement Request
// @route   POST /admin/replacements/:id/reject
exports.rejectReplacement = async (req, res) => {
    try {
        const request = await ReplacementRequest.findById(req.params.id);
        if (!request || request.status !== 'Pending') {
            return res.status(404).json({ success: false, error: 'Request not found or already processed' });
        }

        request.status = 'Rejected';
        await request.save();

        res.json({ success: true, message: 'Replacement Request Rejected' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Event Completion Report (JSON)
// @route   GET /admin/assignments/:id/report
exports.getEventReport = async (req, res) => {
    try {
        const report = await buildEventReport(req.params.id);
        if (!report) {
            return res.status(404).json({ success: false, error: 'Assignment not found' });
        }
        res.json({ success: true, data: report });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
