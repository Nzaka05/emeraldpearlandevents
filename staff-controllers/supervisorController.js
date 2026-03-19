const Staff = require('../staff-models/Staff');
const EventTeam = require('../staff-models/EventTeam');
const ReplacementRequest = require('../staff-models/ReplacementRequest');
const EventTeamCommunication = require('../staff-models/EventTeamCommunication');
const TeamActionsLog = require('../staff-models/TeamActionsLog');
const PerformanceReview = require('../staff-models/PerformanceReview');
const AuditLog = require('../staff-models/AuditLog');

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
