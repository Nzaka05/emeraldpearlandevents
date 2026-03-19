const Staff = require('../models/Staff');
const Assignment = require('../models/Assignment');
const Attendance = require('../models/Attendance');
const EventTeam = require('../models/EventTeam');
const EventTeamCommunication = require('../models/EventTeamCommunication');
const AuditLog = require('../models/AuditLog');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const emailService = require('../services/emailService');
const webpush = require('web-push');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_EMAIL || 'mailto:admin@emeraldevents.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

// @desc    Get Staff Dashboard
// @route   GET /staff/dashboard
exports.getDashboard = async (req, res) => {
    try {
        const pendingAssignments = await Assignment.find({
            assigned_staff_ids: req.user._id,
            accepted_staff_ids: { $ne: req.user._id },
            declined_staff_ids: { $ne: req.user._id },
            status: 'Active'
        }).sort({ date: 1 });

        const acceptedAssignments = await Assignment.find({
            accepted_staff_ids: req.user._id,
            status: 'Active'
        }).sort({ date: 1 });

        const openEvents = await Assignment.find({
            open_for_applications: true,
            status: 'Active',
            assigned_staff_ids: { $ne: req.user._id },
            accepted_staff_ids: { $ne: req.user._id },
            applicant_ids: { $ne: req.user._id }
        }).sort({ date: 1 });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const activeClockIn = await Attendance.findOne({
            staff_id: req.user._id,
            date: { $gte: today },
            clock_in: { $exists: true },
            clock_out: { $exists: false }
        });
        const onShift = !!activeClockIn;

        // Calculate earnings from all assignments
        const allAssignments = await Assignment.find({
            'staff_payments.staff_id': req.user._id
        });
        let totalEarnings = 0;
        let receivedEarnings = 0;
        allAssignments.forEach(a => {
            const p = a.staff_payments.find(p => p.staff_id.toString() === req.user._id.toString());
            if (p) {
                totalEarnings += p.amount || 0;
                if (p.status === 'Received') receivedEarnings += p.amount || 0;
            }
        });

        res.render('staff/dashboard', {
            user: req.user,
            pendingAssignments,
            acceptedAssignments,
            onShift,
            openEvents,
            totalEarnings,
            receivedEarnings,
            forceStaffLayout: true
        });
    } catch (error) {
        console.error(error);
        res.redirect('/portal/auth/login');
    }
};

// @desc    Get Staff Settings
// @route   GET /staff/settings, /supervisor/settings, /admin-staff/settings
exports.getSettings = (req, res) => {
    res.render('staff/settings', {
        user: req.user,
        csrfToken: req.csrfToken()
    });
};

// @desc    Update staff availability
// @route   POST /staff/availability
exports.updateAvailability = async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['Available', 'Busy', 'Not Available', 'On Leave'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const user = await Staff.findByIdAndUpdate(
            req.user._id,
            { availability_status: status },
            { new: true }
        );

        // Emit metric update to admin dashboard
        if (global.io) {
            const availableCount = await Staff.countDocuments({ availability_status: 'Available' });
            const busyCount = await Staff.countDocuments({ availability_status: 'Busy' });
            global.io.to('Admin').emit('metricUpdate', { availableStaff: availableCount, busyStaff: busyCount });
        }

        res.json({ success: true, status: user.availability_status });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Respond to assignment (accept/decline)
// @route   POST /staff/assignments/:id/response
exports.respondToAssignment = async (req, res) => {
    try {
        const { response } = req.body;
        const assignment = await Assignment.findById(req.params.id);

        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });

        if (response === 'apply') {
            if (!assignment.applicant_ids) assignment.applicant_ids = [];
            if (!assignment.applicant_ids.map(id => id.toString()).includes(req.user._id.toString())) {
                assignment.applicant_ids.push(req.user._id);
                await assignment.save();
            }
            return res.json({ success: true, message: 'Application submitted' });
        }

        if (response === 'accept') {
            if (!assignment.accepted_staff_ids.includes(req.user._id)) {
                assignment.accepted_staff_ids.push(req.user._id);
                // Remove from applicant_ids if they applied
                assignment.applicant_ids = (assignment.applicant_ids || []).filter(
                    id => id.toString() !== req.user._id.toString()
                );
                // Auto-add to staff_payments
                const alreadyInPayments = assignment.staff_payments.some(p => p.staff_id.toString() === req.user._id.toString());
                if (!alreadyInPayments) {
                    assignment.staff_payments.push({
                        staff_id: req.user._id,
                        staff_name: req.user.name,
                        amount: assignment.pay_rate,
                        status: 'Pending',
                        phone: req.user.phone || ''
                    });
                }
            }

            // Auto-create or update Event Team
            let team = await EventTeam.findOne({ event_id: assignment._id });
            if (!team) {
                // Use assignment supervisor if set, otherwise find any supervisor/admin
                const supervisorId = assignment.supervisor_id ||
                    (await Staff.findOne({ role: { $in: ['Supervisor', 'Admin'] } }).select('_id'))?._id;
                team = await EventTeam.create({
                    event_id: assignment._id,
                    supervisor_id: supervisorId,
                    member_ids: [req.user._id],
                    status: 'Active',
                    team_readiness: 0
                });
            } else {
                const alreadyMember = team.member_ids.map(id => id.toString()).includes(req.user._id.toString());
                if (!alreadyMember) {
                    team.member_ids.push(req.user._id);
                }
                // Recalculate readiness
                const totalRequired = assignment.required_staff_count || assignment.assigned_staff_ids.length || 1;
                team.team_readiness = Math.min(100, Math.round((team.member_ids.length / totalRequired) * 100));
                await team.save();
            }

            if (global.io) {
                global.io.to('Admin').emit('assignmentResponse', {
                    staff: req.user.name,
                    assignment: assignment.title,
                    response: 'accepted'
                });
            }

        } else if (response === 'decline') {
            if (!assignment.declined_staff_ids.includes(req.user._id)) {
                assignment.declined_staff_ids.push(req.user._id);
            }

            // Smart staffing: check if staffing is insufficient
            const acceptedCount = assignment.accepted_staff_ids.length;
            const assignedCount = assignment.assigned_staff_ids.length;
            const threshold = Math.ceil(assignedCount * 0.6);

            if (acceptedCount < threshold && global.io) {
                // Find available replacements
                const replacements = await Staff.find({
                    role: 'Staff',
                    availability_status: 'Available',
                    status: { $ne: 'Suspended' },
                    _id: { $nin: assignment.assigned_staff_ids }
                }).select('name email role').limit(5);

                global.io.to('Admin').emit('staffingAlert', {
                    assignmentId: assignment._id,
                    assignmentTitle: assignment.title,
                    acceptedCount,
                    assignedCount,
                    declinedBy: req.user.name,
                    suggestedReplacements: replacements.map(r => ({ _id: r._id, name: r.name, email: r.email }))
                });
            }

            if (global.io) {
                global.io.to('Admin').emit('assignmentResponse', {
                    staff: req.user.name,
                    assignment: assignment.title,
                    response: 'declined'
                });
            }
        }

        await assignment.save();

        await AuditLog.create({
            actionType: response === 'accept' ? 'ASSIGNMENT_ACCEPTED' : 'ASSIGNMENT_DECLINED',
            targetModel: 'Assignment', targetId: assignment._id,
            performedBy: req.user._id,
            details: { assignmentTitle: assignment.title }
        });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Clock In/Out with geolocation and selfie
// @route   POST /staff/attendance
exports.clockInOut = async (req, res) => {
    try {
        const { action, assignment_id, lat, lng, selfie_base64 } = req.body;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (action === 'in') {
            let existing = await Attendance.findOne({
                staff_id: req.user._id,
                assignment_id,
                date: { $gte: today }
            });

            if (existing && existing.clock_in) {
                return res.json({ success: false, error: 'Already clocked in for this assignment today' });
            }

            const assignment = await Assignment.findById(assignment_id);
            let status = 'On Time';

            // Late detection
            if (assignment && assignment.start_time) {
                const [h, m] = assignment.start_time.split(':').map(Number);
                const startTime = new Date();
                startTime.setHours(h, m, 0, 0);
                if (new Date() > new Date(startTime.getTime() + 15 * 60000)) {
                    status = 'Late';
                }
            }

            const attendance = await Attendance.create({
                staff_id: req.user._id,
                assignment_id,
                date: new Date(),
                clock_in: new Date(),
                clock_in_location: (lat && lng) ? { lat: parseFloat(lat), lng: parseFloat(lng) } : undefined,
                selfie_url: selfie_base64 || null,
                status
            });

            if (global.io) {
                global.io.to('Admin').emit('staffAttendance', {
                    staff: req.user.name,
                    action: 'clocked in',
                    assignment: assignment ? assignment.title : 'Unknown',
                    status,
                    time: new Date()
                });
                global.io.emit('teamAttendanceUpdate', { assignment_id });
            }

            return res.json({ success: true, data: attendance });
        }

        if (action === 'out') {
            const attendance = await Attendance.findOne({
                staff_id: req.user._id,
                assignment_id,
                date: { $gte: today },
                clock_out: { $exists: false }
            });

            if (!attendance) {
                return res.json({ success: false, error: 'No active clock-in found for today' });
            }

            attendance.clock_out = new Date();
            attendance.clock_out_location = (lat && lng) ? { lat: parseFloat(lat), lng: parseFloat(lng) } : undefined;

            const diffMs = attendance.clock_out - attendance.clock_in;
            attendance.total_hours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;

            await attendance.save();

            if (global.io) {
                const assignment = await Assignment.findById(assignment_id);
                global.io.to('Admin').emit('staffAttendance', {
                    staff: req.user.name,
                    action: 'clocked out',
                    assignment: assignment ? assignment.title : 'Unknown',
                    hours: attendance.total_hours,
                    time: new Date()
                });
            }

            return res.json({ success: true, data: attendance });
        }

        res.status(400).json({ success: false, error: 'Invalid action' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Attendance History
// @route   GET /staff/attendance-history
exports.getAttendanceHistory = async (req, res) => {
    try {
        const records = await Attendance.find({ staff_id: req.user._id })
            .populate('assignment_id', 'title location')
            .sort({ date: -1 })
            .limit(50);

        res.json({ success: true, data: records });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Staff Notifications (derived from existing data)
// @route   GET /staff/notifications
exports.getNotifications = async (req, res) => {
    try {
        const notifications = [];

        // 1. Team communications for teams user belongs to
        const teams = await EventTeam.find({ member_ids: req.user._id }).select('_id');
        const teamIds = teams.map(t => t._id);

        if (teamIds.length > 0) {
            const comms = await EventTeamCommunication.find({ team_id: { $in: teamIds } })
                .populate('sender_id', 'name')
                .sort({ timestamp: -1 })
                .limit(10);

            comms.forEach(c => {
                notifications.push({
                    id: c._id,
                    type: c.message_type,
                    icon: c.message_type === 'announcement' ? 'fa-bullhorn' :
                        c.message_type === 'shift_reminder' ? 'fa-clock' :
                            c.message_type === 'location_update' ? 'fa-location-dot' : 'fa-bell',
                    message: `${c.sender_id ? c.sender_id.name : 'System'}: ${c.message_content}`,
                    timestamp: c.timestamp
                });
            });
        }

        // 2. Assignments awaiting payment confirmation
        const paymentActions = await Assignment.find({
            accepted_staff_ids: req.user._id,
            payment_status: 'Sent'
        }).select('title pay_rate');

        // 3. Include profile update notifications if any recent changes were made by admin
        if (req.user.updatedAt && new Date() - new Date(req.user.updatedAt) < 60000) { // Within last minute
            notifications.push({
                id: 'profile_updated',
                type: 'profile_sync',
                icon: 'fa-sync-alt',
                message: 'Your profile has been updated by an administrator.',
                timestamp: req.user.updatedAt
            });
        }

        paymentActions.forEach(a => {
            notifications.push({
                id: a._id,
                type: 'payment_action',
                icon: 'fa-sack-dollar',
                message: `Payment of $${a.pay_rate} sent for "${a.title}". Please confirm receipt.`,
                timestamp: new Date()
            });
        });

        // 3. Late attendance warnings (last 5)
        const lateRecords = await Attendance.find({ staff_id: req.user._id, status: 'Late' })
            .populate('assignment_id', 'title')
            .sort({ date: -1 })
            .limit(5);

        lateRecords.forEach(r => {
            notifications.push({
                id: r._id,
                type: 'late_warning',
                icon: 'fa-triangle-exclamation',
                message: `Late arrival for "${r.assignment_id ? r.assignment_id.title : 'Unknown'}" on ${new Date(r.date).toLocaleDateString()}.`,
                timestamp: r.date
            });
        });

        // Sort all by timestamp descending
        notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({ success: true, data: notifications.slice(0, 20) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Download own payment receipt PDF
// @route   GET /staff/payments/:assignmentId/receipt
exports.downloadPaymentReceipt = async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.assignmentId);
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });

        const payment = assignment.staff_payments.find(
            p => p.staff_id.toString() === req.user._id.toString()
        );
        if (!payment) return res.status(404).json({ success: false, error: 'Payment record not found' });

        const PDFDocument = require('pdfkit');
        const path = require('path');
        const fs = require('fs');
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="receipt-${assignment.title.replace(/\s+/g, '-')}-${req.user.name.replace(/\s+/g, '-')}.pdf"`);
        doc.pipe(res);

        const emeraldGreen = '#1a6b3c';
        const darkGray = '#2c2c2c';
        const lightGray = '#f5f5f5';
        const gold = '#d4af37';
        const logoUrl = 'https://i.ibb.co/xtBMgm1m/logo.png';

        // ── Header background bar ──
        doc.rect(0, 0, 612, 120).fill(emeraldGreen);

        // ── Header text ──
        doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
            .text('EMERALD PEARLAND EVENTS', 140, 35);
        doc.fontSize(10).fillColor('rgba(255,255,255,0.8)').font('Helvetica')
            .text('Official Payment Receipt', 140, 58);
        doc.fontSize(10).fillColor('rgba(255,255,255,0.8)')
            .text('emeraldpearlandevents@gmail.com', 140, 73);

        // Receipt number
        const receiptNo = `EP-${Date.now().toString().slice(-6)}`;
        doc.fontSize(9).fillColor('#bbbbbb')
            .text(`Receipt No: ${receiptNo}`, 400, 55, { align: 'right', width: 162 })
            .text(`Date: ${new Date().toLocaleDateString('en-KE')}`, 400, 70, { align: 'right', width: 162 });

        doc.moveDown(4);

        // Two column layout
        const col1 = 50;
        const col2 = 320;
        const rowStart = 145;

        // Event details box
        doc.rect(col1, rowStart, 240, 110).fill(lightGray).stroke('#e0e0e0');
        doc.fontSize(8).fillColor('#888').font('Helvetica-Bold')
            .text('EVENT DETAILS', col1 + 12, rowStart + 10);
        doc.fontSize(10).fillColor(darkGray).font('Helvetica-Bold')
            .text(assignment.title, col1 + 12, rowStart + 24, { width: 216 });
        doc.fontSize(9).fillColor('#555').font('Helvetica')
            .text(`Date: ${new Date(assignment.date).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`, col1 + 12, rowStart + 45, { width: 216 })
            .text(`Venue: ${assignment.location || 'N/A'}`, col1 + 12, rowStart + 62, { width: 216 });

        // Staff details box
        doc.rect(col2, rowStart, 242, 110).fill(lightGray).stroke('#e0e0e0');
        doc.fontSize(8).fillColor('#888').font('Helvetica-Bold')
            .text('STAFF DETAILS', col2 + 12, rowStart + 10);
        doc.fontSize(10).fillColor(darkGray).font('Helvetica-Bold')
            .text(req.user.name || payment.staff_name || 'N/A', col2 + 12, rowStart + 24);
        doc.fontSize(9).fillColor('#555').font('Helvetica')
            .text(`Phone: ${req.user.phone || payment.phone || 'N/A'}`, col2 + 12, rowStart + 45)
            .text(`Role: ${req.user.specific_role || req.user.role || 'Staff'}`, col2 + 12, rowStart + 62);

        // Payment amount highlight box
        doc.rect(col1, rowStart + 125, 512, 70).fill(emeraldGreen);
        doc.fontSize(11).fillColor('#d9d9d9').font('Helvetica')
            .text('AMOUNT PAID', col1 + 20, rowStart + 138);
        doc.fontSize(26).fillColor('#ffffff').font('Helvetica-Bold')
            .text(`KSh ${(payment.amount || 0).toLocaleString()}`, col1 + 20, rowStart + 153);
        // Status badge
        const statusColor = payment.status === 'Received' ? '#27ae60' : payment.status === 'Sent' ? '#2980b9' : '#f39c12';
        doc.rect(col2 + 100, rowStart + 138, 90, 22).fill(statusColor);
        doc.fontSize(9).fillColor('#fff').font('Helvetica-Bold')
            .text(payment.status.toUpperCase(), col2 + 100, rowStart + 144, { width: 90, align: 'center' });

        // Transaction details
        const txStart = rowStart + 215;
        doc.fontSize(8).fillColor('#888').font('Helvetica-Bold')
            .text('TRANSACTION DETAILS', col1, txStart);
        doc.moveTo(col1, txStart + 12).lineTo(562, txStart + 12).stroke('#e0e0e0');

        const txDetails = [
            ['Payment Method', 'M-Pesa B2C'],
            ['M-Pesa Reference', payment.mpesa_ref || payment.transaction_id || 'Pending'],
            ['Transaction Code', payment.mpesa_code || payment.receipt_number || '-'],
            ['Sent At', payment.sent_at ? new Date(payment.sent_at).toLocaleString('en-KE') : '-'],
            ['Received At', payment.received_at ? new Date(payment.received_at).toLocaleString('en-KE') : '-'],
            ['Receipt Number', receiptNo],
        ];

        txDetails.forEach(([label, value], i) => {
            const y = txStart + 20 + (i * 20);
            if (i % 2 === 0) doc.rect(col1, y - 3, 512, 20).fill('#fafafa');
            doc.fontSize(9).fillColor('#666').font('Helvetica').text(label, col1 + 8, y);
            doc.fontSize(9).fillColor(darkGray).font('Helvetica-Bold').text(value, 320, y);
        });

        // Footer
        const footerY = txStart + 160;
        doc.moveTo(col1, footerY).lineTo(562, footerY).stroke('#e0e0e0');
        doc.rect(0, footerY + 10, 612, 60).fill(lightGray);
        doc.fontSize(8).fillColor('#888').font('Helvetica')
            .text('This is an official payment receipt from Emerald Pearland Events.', col1, footerY + 22, { align: 'center', width: 512 })
            .text('For queries contact: emeraldpearlandevents@gmail.com', col1, footerY + 36, { align: 'center', width: 512 });
        doc.fontSize(7).fillColor(emeraldGreen).font('Helvetica-Bold')
            .text('EMERALD PEARLAND EVENTS (C) 2026', col1, footerY + 50, { align: 'center', width: 512 });

        doc.moveTo(col1, footerY).lineTo(562, footerY).stroke('#e0e0e0');

        // Try to add logo image to header
        try {
            const https = require('https');
            const getImageBuffer = (url) => new Promise((resolve, reject) => {
                https.get(url, (res) => {
                    const chunks = [];
                    res.on('data', chunk => chunks.push(chunk));
                    res.on('end', () => resolve(Buffer.concat(chunks)));
                    res.on('error', reject);
                }).on('error', reject);
            });
            const logoBuffer = await getImageBuffer('https://i.ibb.co/xtBMgm1m/logo.png');
            doc.image(logoBuffer, 40, 20, { width: 80, height: 80 });
        } catch(logoErr) {
            // Logo load failed - skip silently
        }
        doc.end();
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Failed to generate receipt' });
    }
};

// @desc    Get Payment History
// @route   GET /staff/payment-history
exports.getPaymentHistory = async (req, res) => {
    try {
        const assignments = await Assignment.find({
            accepted_staff_ids: req.user._id
        }).select('title date pay_rate payment_status location payment_confirmed_at').sort({ date: -1 });

        res.json({ success: true, data: assignments });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Subscribe to push notifications
// @route   POST /staff/push-subscribe
exports.subscribePush = async (req, res) => {
    try {
        const { subscription } = req.body;
        await Staff.findByIdAndUpdate(req.user._id, { pushSubscription: subscription });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Update own staff profile
// @route   PUT /staff/profile
exports.updateProfile = async (req, res) => {
    try {
        const { name, phone, skills } = req.body;

        const updateData = {};
        if (name) updateData.name = name;
        if (phone) updateData.phone = phone;

        // Parse skills
        if (skills) {
            updateData.skills = typeof skills === 'string' ? skills.split(',').map(s => s.trim()).filter(Boolean) : skills;
        }

        const updated = await Staff.findByIdAndUpdate(
            req.user._id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        // Notify admin about the change
        if (global.io) {
            global.io.to('Admin').emit('staffProfileUpdated', {
                staffId: updated._id,
                name: updated.name,
                changes: updateData
            });
        }

        // Sync changes back to port 3000
        try {
            const axios = require('axios');
            const axiosRetry = require('axios-retry').default || require('axios-retry');
            axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });
            await axios.post('http://localhost:3000/internal/sync-staff-update', {
                email: updated.email,
                name: updated.name,
                phone: updated.phone
            }, {
                headers: { 'x-sync-secret': process.env.JWT_SECRET || 'fallback_secret_key' }
            });
        } catch (syncErr) {
            console.log('Port 3000 sync skipped (may be offline):', syncErr.message);
        }

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Staff can change their own password
// @route   POST /staff/change-password
exports.changeOwnPassword = async (req, res) => {
    try {
        const { current_password, new_password, confirm_new_password } = req.body;

        if (new_password !== confirm_new_password) {
            return res.status(400).json({ success: false, error: 'New passwords do not match' });
        }

        if (new_password.length < 8) {
            return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
        }

        // Get the user with password
        const user = await Staff.findById(req.user._id).select('+password');

        // Check current password
        const isMatch = await bcrypt.compare(current_password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Current password is incorrect' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(new_password, salt);
        user.mustChangePassword = false; // Since they're changing it themselves

        await user.save();

        await AuditLog.create({
            actionType: 'OWN_PASSWORD_CHANGED',
            targetModel: 'Staff',
            targetId: user._id,
            performedBy: user._id,
            details: { reason: 'Staff changed own password' }
        });

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ════════════════════════════════════════════════════════════
// PAGE CONTROLLERS — Render full EJS views for each bottom nav tab
// ════════════════════════════════════════════════════════════

// @desc    My Assignments Page
// @route   GET /portal/staff/assignments
exports.getAssignmentsPage = async (req, res) => {
    try {
        const upcoming = await Assignment.find({
            $or: [
                { assigned_staff_ids: req.user._id },
                { applicant_ids: req.user._id }
            ],
            status: 'Active'
        }).sort({ date: 1 });

        const openEvents = await Assignment.find({
            open_for_applications: true,
            status: 'Active',
            assigned_staff_ids: { $ne: req.user._id },
            accepted_staff_ids: { $ne: req.user._id },
            applicant_ids: { $ne: req.user._id }
        }).sort({ date: 1 });

        const past = await Assignment.find({
            accepted_staff_ids: req.user._id,
            status: 'Completed'
        }).sort({ date: -1 }).limit(20);

        const myId = req.user._id.toString();
        const pending = upcoming.filter(a =>
            !a.accepted_staff_ids.map(id => id.toString()).includes(myId) &&
            !a.declined_staff_ids.map(id => id.toString()).includes(myId) &&
            !(a.applicant_ids || []).map(id => id.toString()).includes(myId)
        );
        const applied = upcoming.filter(a =>
            (a.applicant_ids || []).map(id => id.toString()).includes(myId) &&
            !a.accepted_staff_ids.map(id => id.toString()).includes(myId)
        );
        const accepted = upcoming.filter(a => a.accepted_staff_ids.map(id => id.toString()).includes(myId));
        const declined = upcoming.filter(a => a.declined_staff_ids.map(id => id.toString()).includes(myId));

        res.render('staff/assignments', { user: req.user, pending, applied, accepted, declined, past, openEvents, forceStaffLayout: true });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    My Team Page
// @route   GET /portal/staff/team
exports.getTeamPage = async (req, res) => {
    try {
        const team = await EventTeam.findOne({ member_ids: req.user._id })
            .populate('event_id', 'title date location')
            .populate('supervisor_id', 'name phone email photo_url')
            .populate('member_ids', 'name role availability_status photo_url');

        let communications = [];
        if (team) {
            communications = await EventTeamCommunication.find({ team_id: team._id })
                .populate('sender_id', 'name role photo_url')
                .sort({ timestamp: -1 })
                .limit(30);
        }

        res.render('staff/team', { user: req.user, team, communications, forceStaffLayout: true });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Send a team message
// @route   POST /portal/staff/team/message
exports.sendTeamMessage = async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, error: 'Message cannot be empty' });
        }

        // Find the team this staff member belongs to
        const team = await EventTeam.findOne({ member_ids: req.user._id });
        if (!team) {
            return res.status(404).json({ success: false, error: 'You are not in a team' });
        }

        const comm = await EventTeamCommunication.create({
            team_id: team._id,
            sender_id: req.user._id,
            sender_name: req.user.name,
            message_content: message.trim(),
            message_type: 'Chat',
            timestamp: new Date()
        });

        await comm.populate('sender_id', 'name role photo_url');

        // Emit to all team members via socket
        if (global.io) {
            global.io.to(`Team_${team._id}`).emit('newTeamMessage', {
                _id: comm._id,
                sender_name: req.user.name,
                sender_role: req.user.specific_role || req.user.role,
                photo_url: req.user.photo_url || null,
                message_content: message.trim(),
                message_type: 'Chat',
                timestamp: comm.timestamp
            });
        }

        res.json({ success: true, message: comm });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Send image/video in team chat
// @route   POST /portal/staff/team/message/upload
exports.sendTeamMediaMessage = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        const team = await EventTeam.findOne({ member_ids: req.user._id });
        if (!team) return res.status(404).json({ success: false, error: 'Not in a team' });

        const fileUrl = `/uploads/chat/${req.file.filename}`;
        const isVideo = /mp4|mov|webm/.test(req.file.originalname.toLowerCase());
        const messageContent = isVideo ? `[video]${fileUrl}` : `[image]${fileUrl}`;

        const comm = await EventTeamCommunication.create({
            team_id: team._id,
            sender_id: req.user._id,
            sender_name: req.user.name,
            message_content: messageContent,
            message_type: 'Chat',
            timestamp: new Date()
        });

        if (global.io) {
            global.io.to(`Team_${team._id}`).emit('newTeamMessage', {
                _id: comm._id,
                sender_name: req.user.name,
                sender_role: req.user.specific_role || req.user.role,
                message_content: messageContent,
                message_type: 'Chat',
                timestamp: comm.timestamp
            });
        }

        res.json({ success: true, url: fileUrl });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Attendance History Page
// @route   GET /portal/staff/attendance
exports.getAttendancePage = async (req, res) => {
    try {
        const records = await Attendance.find({ staff_id: req.user._id })
            .populate('assignment_id', 'title location date start_time')
            .sort({ date: -1 })
            .limit(50);

        const totalHours = records.reduce((acc, r) => acc + (r.total_hours || 0), 0);
        const lateCount = records.filter(r => r.status === 'Late').length;
        const onTimeCount = records.filter(r => r.status === 'On Time').length;

        // Find active assignment for clock-in
        const activeAssignment = await Assignment.findOne({
            accepted_staff_ids: req.user._id,
            status: 'Active',
            date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        });

        res.render('staff/attendance', {
            user: req.user, forceStaffLayout: true, records, activeAssignment,
            stats: {
                totalHours: Math.round(totalHours * 100) / 100,
                lateCount, onTimeCount, totalShifts: records.length
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Payments Page
// @route   GET /portal/staff/payments
exports.getPaymentsPage = async (req, res) => {
    try {
        const rawAssignments = await Assignment.find({
            accepted_staff_ids: req.user._id
        }).select('title date location pay_rate vip_flag start_time end_time payment_status payment_confirmed_at payment_disputed_reason staff_payments')
            .sort({ date: -1 });

        // Attach per-staff payment status to each assignment
        const assignments = rawAssignments.map(a => {
            const obj = a.toObject();
            const sp = (a.staff_payments || []).find(p => p.staff_id && p.staff_id.toString() === req.user._id.toString());
            obj.my_payment_status = sp ? sp.status : (a.payment_status === 'Pending' ? 'Pending' : 'Pending');
            obj.my_payment_id = sp ? sp._id : null;
            obj.my_txn = sp ? (sp.transaction_id || sp.mpesa_code || '') : '';
            obj.my_received_at = sp ? sp.received_at : null;
            return obj;
        });

        const stats = {
            pending: assignments.filter(a => a.my_payment_status === 'Pending').length,
            sent: assignments.filter(a => a.my_payment_status === 'Sent').length,
            received: assignments.filter(a => a.my_payment_status === 'Received').length,
            disputed: assignments.filter(a => a.my_payment_status === 'Disputed').length,
            total: assignments.filter(a => ['Received', 'Disbursed'].includes(a.my_payment_status)).reduce((acc, a) => acc + (a.pay_rate || 0), 0)
        };

        res.render('staff/payments', { user: req.user, assignments, stats, forceStaffLayout: true });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Staff Profile Page
// @route   GET /portal/staff/profile
exports.getProfilePage = async (req, res) => {
    try {
        const profile = await Staff.findById(req.user._id).select('-password');
        res.render('staff/profile', { user: req.user, profile, forceStaffLayout: true });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Update Staff GPS Location
// @route   POST /portal/staff/location
exports.updateLocation = async (req, res) => {
    try {
        const { lat, lng } = req.body;
        if (!lat || !lng) return res.status(400).json({ success: false, error: 'Coordinates required' });
        await Staff.findByIdAndUpdate(req.user._id, {
            last_location: { lat: parseFloat(lat), lng: parseFloat(lng), updatedAt: new Date() }
        });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Settings Page (shared - redirects to profile)
// @route   GET /portal/*/settings
exports.getSettings = async (req, res) => {
    try {
        const profile = await Staff.findById(req.user._id).select('-password');
        res.render('staff/profile', { user: req.user, profile, currentPage: 'settings', csrfToken: req.csrfToken() });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Notifications Page
// @route   GET /portal/staff/notifications
exports.getNotificationsPage = async (req, res) => {
    try {
        const notifications = [];

        const teams = await EventTeam.find({ member_ids: req.user._id }).select('_id');
        const teamIds = teams.map(t => t._id);
        if (teamIds.length > 0) {
            const comms = await EventTeamCommunication.find({ team_id: { $in: teamIds }, message_type: { $ne: 'Chat' } })
                .populate('sender_id', 'name')
                .sort({ timestamp: -1 })
                .limit(20);
            comms.forEach(c => notifications.push({
                id: c._id,
                type: c.message_type,
                icon: 'fa-bell',
                message: `${c.sender_id?.name || 'System'}: ${c.message_content}`,
                timestamp: c.timestamp,
                url: '/portal/staff/team'
            }));
        }

        const paymentActions = await Assignment.find({
            accepted_staff_ids: req.user._id,
            'staff_payments.staff_id': req.user._id,
            'staff_payments.status': 'Sent'
        }).select('title staff_payments date');

        paymentActions.forEach(a => {
            const p = a.staff_payments.find(p => p.staff_id.toString() === req.user._id.toString() && p.status === 'Sent');
            if (p) notifications.push({
                id: p._id,
                type: 'payment',
                icon: 'fa-money-bill-wave',
                message: `Payment of KSh ${(p.amount || 0).toLocaleString()} sent for ${a.title}. Confirm receipt.`,
                timestamp: p.sent_at || a.date,
                url: '/portal/staff/payments'
            });
        });

        notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.render('staff/notifications', { user: req.user, notifications, forceStaffLayout: true, currentPage: 'notifications' });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Staff confirms payment received
// @route   POST /portal/staff/assignments/:id/payment/confirm
exports.confirmPaymentReceipt = async (req, res) => {
    try {
        const assignment = await Assignment.findOne({
            _id: req.params.id,
            accepted_staff_ids: req.user._id
        });
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });

        const sp = assignment.staff_payments.find(p => p.staff_id.toString() === req.user._id.toString());
        if (!sp) return res.status(404).json({ success: false, error: 'Payment record not found' });
        if (sp.status === 'Received') return res.json({ success: true, message: 'Already confirmed' });

        sp.status = 'Received';
        sp.received_at = new Date();
        sp.staff_confirmed = true;
        await assignment.save();

        // Recalculate assignment payment_status
        const total = assignment.staff_payments.length;
        const paid = assignment.staff_payments.filter(p => ['Received', 'Disbursed'].includes(p.status)).length;
        const newStatus = paid === total && total > 0 ? 'Received' : paid > 0 ? 'Partial' : 'Pending';
        await Assignment.findByIdAndUpdate(req.params.id, { payment_status: newStatus });

        // Send receipt email
        try {
            const emailService = require('../services/emailService');
            await emailService.sendPaymentReceiptEmail(req.user, assignment, sp, sp.transaction_id || 'STAFF-CONFIRMED');
        } catch (e) { console.log('Receipt email error:', e.message); }

        // Push notification to admin
        if (global.io) {
            global.io.emit('paymentConfirmedByStaff', {
                staffName: req.user.name,
                eventTitle: assignment.title,
                amount: sp.amount
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Staff disputes payment
// @route   POST /portal/staff/assignments/:id/payment/dispute
exports.disputePayment = async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, error: 'Reason required' });

        const assignment = await Assignment.findOne({
            _id: req.params.id,
            accepted_staff_ids: req.user._id
        });
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });

        const sp = assignment.staff_payments.find(p => p.staff_id.toString() === req.user._id.toString());
        if (sp) {
            sp.status = 'Disputed';
            sp.dispute_reason = reason;
            await assignment.save();
        }

        await Assignment.findByIdAndUpdate(req.params.id, {
            payment_status: 'Disputed',
            payment_disputed_reason: reason
        });

        if (global.io) {
            global.io.emit('paymentDisputed', {
                staffName: req.user.name,
                eventTitle: assignment.title,
                reason
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Upload profile photo
// @route   POST /staff/profile/photo
exports.uploadProfilePhoto = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No photo uploaded' });
        }
        const photo_url = `/uploads/staff/${req.file.filename}`;
        await Staff.findByIdAndUpdate(req.user.id, { photo_url });
        res.json({ success: true, photo_url });
    } catch (err) {
        console.error('Photo upload error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

