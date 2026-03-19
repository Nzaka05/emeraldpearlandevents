const Staff = require('../staff-models/Staff');
const Assignment = require('../staff-models/Assignment');
const Attendance = require('../staff-models/Attendance');
const EventTeam = require('../staff-models/EventTeam');
const EventTeamCommunication = require('../staff-models/EventTeamCommunication');
const AuditLog = require('../staff-models/AuditLog');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const emailService = require('../staff-services/emailService');
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

        res.render('staff/dashboard', {
            user: req.user,
            pendingAssignments,
            acceptedAssignments
        });
    } catch (error) {
        console.error(error);
        res.redirect('/portal/auth/login');
    }
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

        if (response === 'accept') {
            if (!assignment.accepted_staff_ids.includes(req.user._id)) {
                assignment.accepted_staff_ids.push(req.user._id);
            }

            // Auto-create or update Event Team
            let team = await EventTeam.findOne({ event_id: assignment._id });
            if (!team) {
                const supervisor = await Staff.findOne({ role: 'Supervisor' });
                team = await EventTeam.create({
                    event_id: assignment._id,
                    supervisor_id: supervisor ? supervisor._id : req.user._id,
                    member_ids: [req.user._id],
                    status: 'Active'
                });
            } else {
                if (!team.member_ids.includes(req.user._id)) {
                    team.member_ids.push(req.user._id);
                }
                // Update readiness
                team.team_readiness = Math.round((team.member_ids.length / assignment.assigned_staff_ids.length) * 100);
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

// @desc    Confirm payment receipt
// @route   POST /staff/assignments/:id/payment/confirm
exports.confirmPayment = async (req, res) => {
    try {
        const assignment = await Assignment.findById(req.params.id);
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });

        if (assignment.payment_status !== 'Sent') {
            return res.status(400).json({ success: false, error: 'Payment has not been marked as sent yet' });
        }

        assignment.payment_status = 'Received';
        assignment.payment_confirmed_at = new Date();
        await assignment.save();

        if (global.io) {
            global.io.to('Admin').emit('paymentConfirmed', {
                staff: req.user.name,
                assignment: assignment.title,
                pay_rate: assignment.pay_rate,
                time: new Date()
            });
        }

        await AuditLog.create({
            actionType: 'PAYMENT_CONFIRMED', targetModel: 'Assignment', targetId: assignment._id,
            performedBy: req.user._id,
            details: { title: assignment.title, amount: assignment.pay_rate }
        });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Dispute payment
// @route   POST /staff/assignments/:id/payment/dispute
exports.disputePayment = async (req, res) => {
    try {
        const { reason } = req.body;
        const assignment = await Assignment.findById(req.params.id);
        if (!assignment) return res.status(404).json({ success: false, error: 'Assignment not found' });

        assignment.payment_status = 'Disputed';
        assignment.payment_disputed_reason = reason || 'No reason provided';
        await assignment.save();

        if (global.io) {
            global.io.to('Admin').emit('paymentDisputed', {
                staff: req.user.name,
                assignment: assignment.title,
                pay_rate: assignment.pay_rate,
                reason: reason || 'No reason provided',
                time: new Date()
            });
        }

        await AuditLog.create({
            actionType: 'PAYMENT_DISPUTED', targetModel: 'Assignment', targetId: assignment._id,
            performedBy: req.user._id,
            details: { title: assignment.title, reason: reason || 'No reason provided' }
        });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
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

// @desc    Upload staff profile photo
// @route   POST /staff/profile/photo
exports.uploadProfilePhoto = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No photo uploaded' });
        }
        const photoUrl = `/uploads/staff/${req.file.filename}`;
        await Staff.findByIdAndUpdate(req.user._id, { photo_url: photoUrl });
        res.json({ success: true, photo_url: photoUrl });
    } catch(err) {
        console.error('Photo upload error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};