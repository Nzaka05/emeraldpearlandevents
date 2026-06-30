const respond = require('../../utils/respond');
/**
 * liveController.js — Phase 12: Live Event Command Center
 * Handles real-time admin ↔ supervisor comms, emergency flags, live ops board
 */
const Assignment   = require('../models/Assignment');
const EventTeam    = require('../models/EventTeam');
const Attendance   = require('../models/Attendance');
const LiveMessage  = require('../models/LiveMessage');
const Staff        = require('../models/Staff');
const AuditLog     = require('../models/AuditLog');
const path         = require('path');
const fs           = require('fs');
const multer       = require('multer');

// ── Multer for live chat attachments ─────────────────────────────────────────
const liveChatUpload = multer({
    dest: path.join(__dirname, '../public/uploads/live-chat/'),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        const allowed = /image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime)/;
        cb(null, allowed.test(file.mimetype));
    }
});
exports.liveChatUpload = liveChatUpload;

// ── GET /admin/live — Render Command Center ───────────────────────────────────
exports.getLiveDashboard = async (req, res) => {
    try {
        // Active events today + ongoing
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

        const activeEvents = await Assignment.find({
            status: 'Active',
            date: { $gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } // last 3 days + future
        })
        .populate('supervisor_id', 'name photo_url last_location availability_status')
        .populate('accepted_staff_ids', 'name availability_status')
        .sort({ date: 1 })
        .lean();

        // Active teams with readiness
        const activeTeams = await EventTeam.find({ status: 'Active' })
            .populate('supervisor_id', 'name photo_url last_location phone')
            .populate('member_ids', 'name availability_status')
            .populate('event_id', 'title date location start_time end_time')
            .lean();

        // Recent live messages (last 24h)
        const liveMessages = await LiveMessage.find({
            timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
        .populate('sender_id', 'name photo_url role')
        .sort({ timestamp: 1 })
        .limit(100)
        .lean();

        // Unacknowledged emergencies
        const emergencies = await LiveMessage.find({ 
            is_emergency: true, 
            emergency_acked: false 
        }).populate('sender_id', 'name').lean();

        // Today's attendance summary
        const todayAttendance = await Attendance.find({
            date: { $gte: today, $lt: tomorrow }
        })
        .populate('staff_id', 'name photo_url')
        .sort({ clock_in: -1 })
        .lean();

        // Active supervisors (have a team and last_location)
        const activeSupervisors = await Staff.find({
            role: 'Supervisor',
            status: 'Active',
            'last_location.lat': { $exists: true }
        }).select('name photo_url last_location availability_status').lean();

        res.render('admin/live', {
            user: req.user,
            currentPage: 'live',
            activeEvents,
            activeTeams,
            liveMessages,
            emergencies,
            todayAttendance,
            activeSupervisors,
            title: 'Live Command Center'
        });

    } catch (err) {
        console.error('[liveController] getLiveDashboard error:', err);
        res.status(500).send('Command center unavailable: ' + err.message);
    }
};

// ── POST /admin/live/message — Admin sends message to supervisor ──────────────
exports.sendAdminMessage = async (req, res) => {
    try {
        const { content, recipient_id, assignment_id } = req.body;
        const attachment_url  = req.file ? `/uploads/live-chat/${req.file.filename}` : null;
        const attachment_type = req.file 
            ? (req.file.mimetype.startsWith('video') ? 'video' : 'image') 
            : null;

        if (!content && !attachment_url) {
            return respond(res, 400, { success: false, error: 'Empty message' });
        }

        const msg = await LiveMessage.create({
            sender_id:      req.user._id,
            sender_name:    req.user.name,
            sender_role:    'Admin',
            recipient_id:   recipient_id || null,
            assignment_id:  assignment_id || null,
            content:        content || '',
            attachment_url,
            attachment_type,
            is_emergency:   false
        });

        const populated = await LiveMessage.findById(msg._id)
            .populate('sender_id', 'name photo_url').lean();

        // Emit via Socket.io
        if (global.io) {
            const targetRoom = recipient_id ? `Supervisor_${recipient_id}` : 'Supervisors';
            global.io.to(targetRoom).emit('adminLiveMessage', populated);
            global.io.to('Admin').emit('adminLiveMessage', populated);
        }

        respond(res, 200, { success: true, message: populated });
    } catch (err) {
        console.error('[liveController] sendAdminMessage error:', err);
        respond(res, 500, { success: false, error: err.message });
    }
};

// ── POST /supervisor/emergency — Supervisor raises emergency flag ──────────────
exports.flagEmergency = async (req, res) => {
    try {
        const { content, assignment_id } = req.body;

        const msg = await LiveMessage.create({
            sender_id:    req.user._id,
            sender_name:  req.user.name,
            sender_role:  'Supervisor',
            content:      content || 'EMERGENCY — immediate attention required',
            assignment_id: assignment_id || null,
            is_emergency:  true
        });

        const populated = await LiveMessage.findById(msg._id)
            .populate('sender_id', 'name photo_url').lean();

        // Log audit
        await AuditLog.create({
            user_id:    req.user._id,
            user_name:  req.user.name,
            action:     'EMERGENCY_FLAG',
            details:    `Emergency flagged: ${content}`,
            ip_address: req.ip
        });

        // Broadcast to all admins
        if (global.io) {
            global.io.to('Admin').emit('emergencyFlag', populated);
            // Also to all supervisors so they're aware
            global.io.to('Supervisors').emit('adminLiveMessage', populated);
        }

        respond(res, 200, { success: true, message: populated });
    } catch (err) {
        console.error('[liveController] flagEmergency error:', err);
        respond(res, 500, { success: false, error: err.message });
    }
};

// ── POST /admin/live/emergency-ack/:id — Admin acknowledges emergency ─────────
exports.ackEmergency = async (req, res) => {
    try {
        const msg = await LiveMessage.findByIdAndUpdate(req.params.id, {
            emergency_acked:    true,
            emergency_acked_by: req.user._id
        }, { new: true }).lean();

        if (!msg) return respond(res, 404, { success: false, error: 'Not found' });

        if (global.io) {
            global.io.to('Admin').emit('emergencyAcknowledged', { id: msg._id, acked_by: req.user.name });
        }

        respond(res, 200, { success: true });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message });
    }
};

// ── POST /supervisor/live/message — Supervisor sends message to admin ─────────
exports.sendSupervisorMessage = async (req, res) => {
    try {
        const { content } = req.body;
        const attachment_url  = req.file ? `/uploads/live-chat/${req.file.filename}` : null;
        const attachment_type = req.file 
            ? (req.file.mimetype.startsWith('video') ? 'video' : 'image') 
            : null;

        if (!content && !attachment_url) {
            return respond(res, 400, { success: false, error: 'Empty message' });
        }

        const msg = await LiveMessage.create({
            sender_id:      req.user._id,
            sender_name:    req.user.name,
            sender_role:    'Supervisor',
            content:        content || '',
            attachment_url,
            attachment_type,
            is_emergency:   false
        });

        const populated = await LiveMessage.findById(msg._id)
            .populate('sender_id', 'name photo_url').lean();

        if (global.io) {
            global.io.to('Admin').emit('adminLiveMessage', populated);
            global.io.to(`Supervisor_${req.user._id}`).emit('adminLiveMessage', populated);
        }

        respond(res, 200, { success: true, message: populated });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message });
    }
};

// ── GET /admin/live/messages — Poll for new messages (fallback if socket lost) ─
exports.getRecentMessages = async (req, res) => {
    try {
        const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 60 * 60 * 1000);
        const messages = await LiveMessage.find({ timestamp: { $gte: since } })
            .populate('sender_id', 'name photo_url')
            .sort({ timestamp: 1 })
            .limit(50)
            .lean();
        respond(res, 200, { success: true, messages });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message });
    }
};
