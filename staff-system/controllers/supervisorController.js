const Staff = require('../models/Staff');
const EventTeam = require('../models/EventTeam');
const ReplacementRequest = require('../models/ReplacementRequest');
const EventTeamCommunication = require('../models/EventTeamCommunication');
const TeamActionsLog = require('../models/TeamActionsLog');
const PerformanceReview = require('../models/PerformanceReview');
const AuditLog = require('../models/AuditLog');

// Helper: Readiness label
const getReadinessLabel = (pct) => {
    if (pct === 0) return 'Waiting';
    if (pct < 50) return 'Incomplete';
    if (pct < 100) return 'Ready';
    return 'Fully Deployed';
};

// @desc    Get Supervisor Dashboard
// @route   GET /supervisor/dashboard
exports.getDashboard = async (req, res) => {
    try {
        const teams = await EventTeam.find({ supervisor_id: req.user._id })
            .populate('event_id', 'title date location status')
            .populate('member_ids', 'name role availability_status photo_url');

        res.render('supervisor/dashboard', {
            user: req.user,
            teams,
            getReadinessLabel
        });
    } catch (error) {
        console.error(error);
        res.redirect('/portal/auth/login');
    }
};

// @desc    Remove member from team (request)
// @route   POST /supervisor/teams/:teamId/remove-member
exports.removeMember = async (req, res) => {
    try {
        const { memberId, reason, suggestedReplacementId } = req.body;
        const team = await EventTeam.findById(req.params.teamId);

        if (!team || team.supervisor_id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        // Create replacement request for admin approval
        await ReplacementRequest.create({
            team_id: team._id,
            event_id: team.event_id,
            member_to_remove: memberId,
            suggested_replacement: suggestedReplacementId || null,
            submitted_by: req.user._id,
            reason
        });

        // Notify admin via socket
        if (global.io) {
            const memberInfo = await Staff.findById(memberId).select('name');
            global.io.to('Admin').emit('replacementRequest', {
                supervisor: req.user.name,
                member: memberInfo ? memberInfo.name : 'Unknown',
                reason,
                teamId: team._id
            });
        }

        await TeamActionsLog.create({
            team_id: team._id,
            action_type: 'REMOVAL_REQUESTED',
            performed_by: req.user._id,
            reason
        });

        await AuditLog.create({
            actionType: 'REMOVAL_REQUESTED', targetModel: 'EventTeam', targetId: team._id,
            performedBy: req.user._id,
            details: { memberId, reason }
        });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Suggest replacements for a team
// @route   GET /supervisor/teams/:teamId/suggest-replacements
exports.getSuggestedReplacements = async (req, res) => {
    try {
        const team = await EventTeam.findById(req.params.teamId);
        if (!team) return res.status(404).json({ success: false, error: 'Team not found' });

        const available = await Staff.find({
            role: 'Staff',
            availability_status: 'Available',
            status: { $ne: 'Suspended' },
            _id: { $nin: team.member_ids }
        }).select('name email role');

        res.json({ success: true, data: available });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Update team readiness
// @route   POST /supervisor/teams/:teamId/readiness
exports.updateReadiness = async (req, res) => {
    try {
        const team = await EventTeam.findById(req.params.teamId).populate('event_id');
        if (!team) return res.status(404).json({ success: false, error: 'Team not found' });

        // Recalculate based on confirmed members vs assigned
        const assignment = team.event_id;
        const assignedCount = assignment ? assignment.assigned_staff_ids.length : 1;
        const readiness = Math.min(100, Math.round((team.member_ids.length / assignedCount) * 100));

        team.team_readiness = readiness;
        await team.save();

        res.json({ success: true, readiness, label: getReadinessLabel(readiness) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Rate staff performance
// @route   POST /supervisor/rate-staff
exports.rateStaff = async (req, res) => {
    try {
        const { staff_id, assignment_id, rating, feedback } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5' });
        }

        const review = await PerformanceReview.create({
            staff_id,
            assignment_id,
            supervisor_id: req.user._id,
            rating,
            feedback: feedback || ''
        });

        await AuditLog.create({
            actionType: 'PERFORMANCE_REVIEW', targetModel: 'Staff', targetId: staff_id,
            performedBy: req.user._id,
            details: { rating, assignmentId: assignment_id }
        });

        res.json({ success: true, data: review });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Broadcast message to team (persist + socket)
// @route   POST /supervisor/teams/:teamId/communication
exports.broadcastMessage = async (req, res) => {
    try {
        const { message_type, message_content } = req.body;
        const team = await EventTeam.findById(req.params.teamId);

        if (!team || team.supervisor_id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const validTypes = ['announcement', 'shift_reminder', 'arrival_confirmation', 'location_update', 'task_instructions'];
        if (!validTypes.includes(message_type)) {
            return res.status(400).json({ success: false, error: 'Invalid message type' });
        }

        if (!message_content || !message_content.trim()) {
            return res.status(400).json({ success: false, error: 'Message content is required' });
        }

        // Persist to database
        const comm = await EventTeamCommunication.create({
            team_id: team._id,
            sender_id: req.user._id,
            message_type,
            message_content: message_content.trim()
        });

        // Emit via socket to all team members
        if (global.io) {
            // Notify each team member individually
            for (const memberId of team.member_ids) {
                global.io.to(memberId.toString()).emit('newTeamMessage', {
                    team_id: team._id,
                    type: message_type,
                    content: message_content,
                    sender: req.user.name,
                    timestamp: comm.timestamp
                });
            }
            // Also notify admin
            global.io.to('Admin').emit('teamBroadcast', {
                supervisor: req.user.name,
                team_id: team._id,
                type: message_type,
                content: message_content
            });
        }

        await TeamActionsLog.create({
            team_id: team._id,
            action_type: 'BROADCAST',
            performed_by: req.user._id,
            reason: `${message_type}: ${message_content.substring(0, 100)}`
        });

        res.json({ success: true, data: comm });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get team communication history
// @route   GET /supervisor/teams/:teamId/communications
exports.getTeamCommunications = async (req, res) => {
    try {
        const comms = await EventTeamCommunication.find({ team_id: req.params.teamId })
            .populate('sender_id', 'name role')
            .sort({ timestamp: -1 })
            .limit(30);

        res.json({ success: true, data: comms });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ════════════════════════════════════════════════════════════
// PAGE CONTROLLERS — Render full EJS views for each sidebar tab
// ════════════════════════════════════════════════════════════

// @desc    Supervisor Events Page
// @route   GET /portal/supervisor/events
exports.getEvents = async (req, res) => {
    try {
        const teams = await EventTeam.find({ supervisor_id: req.user._id })
            .populate('event_id', 'title date location start_time end_time pay_rate status payment_status vip_flag')
            .populate('member_ids', 'name role availability_status');
        res.render('supervisor/events', { user: req.user, teams, getReadinessLabel });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Team Management Page
// @route   GET /portal/supervisor/team-management
exports.getTeamManagement = async (req, res) => {
    try {
        const teams = await EventTeam.find({ supervisor_id: req.user._id })
            .populate('event_id', 'title date location status')
            .populate('member_ids', 'name role availability_status photo_url phone');
        const Attendance = require('../models/Attendance');
        // Build attendance map for each team member
        const allTeamMemberIds = teams.flatMap(t => t.member_ids.map(m => m._id));
        const recentAttendance = await Attendance.find({
            staff_id: { $in: allTeamMemberIds }
        }).populate('assignment_id', 'title').sort({ clock_in: -1 }).limit(100);
        res.render('supervisor/team-management', { user: req.user, teams, recentAttendance, getReadinessLabel });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Team Communications Page
// @route   GET /portal/supervisor/communications
exports.getCommunications = async (req, res) => {
    try {
        const teams = await EventTeam.find({ supervisor_id: req.user._id })
            .populate('event_id', 'title')
            .populate('member_ids', 'name');
        const teamIds = teams.map(t => t._id);
        const communications = await EventTeamCommunication.find({ team_id: { $in: teamIds } })
            .populate('sender_id', 'name role')
            .sort({ timestamp: -1 })
            .limit(50);
        res.render('supervisor/communications', { user: req.user, teams, communications });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Performance Ratings Page
// @route   GET /portal/supervisor/ratings
exports.getRatings = async (req, res) => {
    try {
        const Assignment = require('../models/Assignment');
        // Assignments where this supervisor led a team
        const myTeams = await EventTeam.find({ supervisor_id: req.user._id })
            .populate('event_id', 'title date')
            .populate('member_ids', 'name role');
        const myEventIds = myTeams.map(t => t.event_id).filter(Boolean);
        const ratingsGiven = await PerformanceReview.find({ supervisor_id: req.user._id })
            .populate('staff_id', 'name role')
            .populate('assignment_id', 'title date')
            .sort({ timestamp: -1 });
        const staffForRating = myTeams.flatMap(t => t.member_ids);
        const assignments = await Assignment.find({ _id: { $in: myEventIds.map(e => e._id || e) } })
            .select('_id title date');
        res.render('supervisor/ratings', {
            user: req.user, myTeams, ratingsGiven, staffForRating, assignments
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Supervisor Profile Page
// @route   GET /portal/supervisor/profile
exports.getProfile = async (req, res) => {
    try {
        const Staff = require('../models/Staff');
        const profile = await Staff.findById(req.user._id).select('-password');
        res.render('supervisor/profile', { user: req.user, profile });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
};

// @desc    Update Supervisor GPS Location
// @route   POST /portal/supervisor/location
exports.updateLocation = async (req, res) => {
    try {
        const { lat, lng } = req.body;
        if (!lat || !lng) return res.status(400).json({ success: false, error: 'Coordinates required' });
        const Staff = require('../models/Staff');
        await Staff.findByIdAndUpdate(req.user._id, {
            last_location: { lat: parseFloat(lat), lng: parseFloat(lng), updatedAt: new Date() }
        });
        // Notify connected clients that supervisor is live
        if (global.io) {
            global.io.to('Admin').emit('supervisorLocationUpdate', {
                supervisorId: req.user._id,
                supervisorName: req.user.name,
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                time: new Date()
            });
        }
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

