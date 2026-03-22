/**
 * Emerald Pearl Events - Event Team Service
 * Handles business logic for Teams: Creation, Disbandment, Replacement Requests, Supervisor assignment
 */
const EventTeam = require('../models/EventTeam');
const Assignment = require('../models/Assignment');
const Staff = require('../models/Staff');
const AuditLog = require('../models/AuditLog');
const EventTeamCommunication = require('../models/EventTeamCommunication');
const ReplacementRequest = require('../models/ReplacementRequest');
const emailService = require('./emailService');
const AdminNotification = require('../models/AdminNotification');

exports.createTeam = async (event_id, supervisor_id, member_ids) => {
    let existingTeam = await EventTeam.findOne({ event_id });
    if (existingTeam) {
        throw new Error('A team already exists for this event!');
    }

    const team = await EventTeam.create({
        event_id,
        supervisor_id,
        member_ids: member_ids || [],
        status: 'Active',
        team_readiness: 0
    });
    return team;
};

exports.assignEventSupervisor = async (admin_id, admin_name, assignment_id, supervisor_id) => {
    const assignment = await Assignment.findByIdAndUpdate(
        assignment_id,
        { supervisor_id },
        { new: true }
    ).populate('supervisor_id', 'name email');
    
    if (!assignment) throw new Error('Event not found');

    let team = await EventTeam.findOne({ event_id: assignment._id });
    if (!team) {
        team = await EventTeam.create({
            event_id: assignment._id,
            supervisor_id,
            member_ids: assignment.accepted_staff_ids || [],
            status: 'Forming',
            team_readiness: 0
        });

        await EventTeamCommunication.create({
            team_id: team._id,
            sender_id: admin_id,
            sender_name: admin_name,
            message: `Team created for ${assignment.title}. Supervisor: ${assignment.supervisor_id?.name || 'TBA'}`,
            message_type: 'system'
        });

        if (global.io) {
            global.io.to(supervisor_id.toString()).emit('teamAssigned', {
                teamId: team._id,
                eventTitle: assignment.title,
                eventDate: assignment.date,
                message: `You have been assigned as supervisor for ${assignment.title}`
            });
        }

        try {
            const supervisor = await Staff.findById(supervisor_id).select('name email');
            if (supervisor?.email) {
                await emailService.sendEmail({
                    to: supervisor.email,
                    subject: `You've been assigned to ${assignment.title}`,
                    html: `<p>Hi ${supervisor.name},</p>
                           <p>You have been assigned as supervisor for <strong>${assignment.title}</strong>.</p>
                           <p>Please login to your portal to view your team details.</p>`
                });
            }
        } catch (emailErr) {
            console.log('Supervisor email skipped:', emailErr.message);
        }

        await AuditLog.create({
            actionType: 'TEAM_AUTO_CREATED',
            targetModel: 'EventTeam',
            targetId: team._id,
            performedBy: admin_id,
            details: { eventTitle: assignment.title, supervisor_id }
        });
    }

    return { assignment, team };
};

exports.approveReplacement = async (admin_id, request_id) => {
    const request = await ReplacementRequest.findById(request_id)
        .populate('team_id')
        .populate('event_id');

    if (!request || request.status !== 'Pending') {
        throw new Error('Request not found or already processed');
    }

    const team = request.team_id;
    const assignment = request.event_id;

    team.member_ids = team.member_ids.filter(id => id.toString() !== request.member_to_remove.toString());
    assignment.assigned_staff_ids = assignment.assigned_staff_ids.filter(id => id.toString() !== request.member_to_remove.toString());
    assignment.accepted_staff_ids = assignment.accepted_staff_ids.filter(id => id.toString() !== request.member_to_remove.toString());

    if (global.io) {
        global.io.to(request.member_to_remove.toString()).emit('removedFromTeam', {
            assignmentTitle: assignment.title,
            message: `You have been removed from the team for "${assignment.title}".`
        });
    }

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
        performedBy: admin_id,
        details: { removed: request.member_to_remove, added: request.suggested_replacement, assignment: assignment.title }
    });

    return true;
};

exports.rejectReplacement = async (request_id) => {
    const request = await ReplacementRequest.findById(request_id);
    if (!request || request.status !== 'Pending') throw new Error('Request not found or already processed');

    request.status = 'Rejected';
    await request.save();
    return true;
};

exports.checkDisbandEligibility = async (teamId) => {
    const team = await EventTeam.findById(teamId).populate('event_id');
    if (!team) throw new Error('Team not found');

    const event = await Assignment.findById(team.event_id);
    if (!event) throw new Error('Event not found');

    const unpaid = event.staff_payments.filter(
        p => p.status !== 'Received' && p.status !== 'Disbursed'
    );
    const canDisband = unpaid.length === 0;
    const unpaidNames = unpaid.map(p => p.staff_name || p.staff_id?.toString() || 'Unknown staff');
    const reason = canDisband ? '' : unpaid.length + ' staff member(s) still unpaid: ' + unpaidNames.join(', ');
    return { canDisband, reason, unpaidStaff: unpaidNames };
};

exports.disbandTeam = async (teamId) => {
    const team = await EventTeam.findById(teamId).populate('member_ids supervisor_id');
    if (!team) throw new Error('Team not found');

    const event = await Assignment.findById(team.event_id);
    if (!event) throw new Error('Event not found');

    // Payment check done in checkDisbandEligibility before reaching here

    team.status = 'Disbanded';
    team.disbandedAt = new Date();
    await team.save();

    await EventTeamCommunication.create({
        team_id: team._id,
        sender_id: team.supervisor_id?._id || team.member_ids?.[0]?._id,
        message_type: 'system',
        message_content: 'This team has been disbanded by Admin after payment completion.'
    });

    const allMembers = [...(team.member_ids || []), team.supervisor_id].filter(Boolean);

    for (const staff of allMembers) {
        await AdminNotification.create({
            recipient_type: 'Staff',
            recipient_id: staff._id,
            title: 'Team Disbanded',
            message: `Your team for event "${event.client_name || event.title || 'Event'}" has been disbanded.`,
            type: 'team',
        });

        if (staff.email) {
            await emailService.sendEmail({
                to: [{ email: staff.email, name: staff.name || 'Team Member' }],
                subject: 'Team Disbanded - Event Completed',
                htmlContent: `<p>Hello ${staff.name || 'Team Member'},</p>
                     <p>Your team for event <strong>${event.client_name || event.title || 'Event'}</strong> has now been officially disbanded.</p>`
            }).catch(e => console.warn('[Disband Email]', e.message));
        }
    }

    if (global.io) {
        global.io.to(`team_${team._id}`).emit('teamDisbanded', {
            teamId: team._id,
            disbandedAt: team.disbandedAt,
        });
    }

    return true;
};
