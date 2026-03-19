/**
 * Emerald Pearl Events - Event Assignment Service
 * Handles business logic for Event/Assignment creation, updates, deletion, and staffing.
 */

const Assignment = require('../models/Assignment');
const EventTeam = require('../models/EventTeam');
const Staff = require('../models/Staff');
const AuditLog = require('../models/AuditLog');
const emailService = require('./emailService');
const ledgerService = require('../financials/services/ledgerService');
const webpush = require('web-push');

async function sendPushToStaff(staffIds, payload) {
    try {
        const ids = Array.isArray(staffIds) ? staffIds : [staffIds];
        const staffList = await Staff.find({ _id: { $in: ids }, pushSubscription: { $exists: true, $ne: null } }).select('pushSubscription name');
        for (const s of staffList) {
            try {
                await webpush.sendNotification(s.pushSubscription, JSON.stringify(payload));
            } catch (e) {
                if (e.statusCode === 410 || e.statusCode === 404) {
                    await Staff.findByIdAndUpdate(s._id, { $unset: { pushSubscription: '' } });
                }
            }
        }
    } catch (err) {
        console.log('Push notification error:', err.message);
    }
}

exports.createAssignment = async (admin_id, data) => {
    const {
        title, description, location, date, start_time, end_time,
        pay_rate, vip_flag, special_instructions, dress_code, assign_to_role, specific_staff_ids,
        gps_lat, gps_lng, required_staff_count, client_name, client_email, clientPaymentAmount
    } = data;

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
        createdByAdmin: admin_id,
        gps_location: (gps_lat && gps_lng) ? { lat: parseFloat(gps_lat), lng: parseFloat(gps_lng) } : undefined,
        required_staff_count: parseInt(required_staff_count) || 1,
        client_name: client_name || '',
        client_email: client_email || '',
        clientPaymentAmount: clientPaymentAmount || 0
    });

    try {
        await ledgerService.initializeEventLedger(assignment._id, null, assignment.clientPaymentAmount || 0);
    } catch (err) {
        console.error('Event Ledger init err:', err.message);
    }

    if (global.io) {
        global.io.emit('newAssignment', { title: assignment.title, vip: assignment.vip_flag });
    }

    const allStaff = await Staff.find({ role: 'Staff', status: 'Active' }).select('_id');
    await sendPushToStaff(allStaff.map(s => s._id), {
        title: assignment.vip_flag ? '⭐ New VIP Event Available!' : '📅 New Event Available!',
        body: `${assignment.title} on ${new Date(assignment.date).toLocaleDateString('en-KE')} - Apply now!`,
        url: '/portal/staff/assignments'
    });

    const populatedStaff = await Staff.find({ _id: { $in: assignedIds } });
    await sendPushToStaff(assignedIds, {
        title: 'New Shift Assigned!',
        body: `You have been assigned to ${assignment.title} on ${new Date(assignment.date).toLocaleDateString()}.`
    });

    for (const staff of populatedStaff) {
        await emailService.sendAssignmentNotification(staff, assignment);
    }

    await AuditLog.create({
        actionType: 'ASSIGNMENT_CREATED', targetModel: 'Assignment', targetId: assignment._id,
        performedBy: admin_id,
        details: { title, staffCount: assignedIds.length }
    });

    // ── Lifecycle: new assignment always starts at PLANNED ────────────────────
    // lifecycle_state is already defaulted to 'PLANNED' in the schema.
    // This log entry confirms intent explicitly.
    try {
        const eventLifecycleService = require('./eventLifecycleService');
        await AuditLog.create({
            actionType:  'LIFECYCLE_TRANSITION',
            targetModel: 'Assignment',
            targetId:    assignment._id,
            performedBy: admin_id,
            details:     { from: null, to: 'PLANNED', reason: 'New assignment created', title }
        });
    } catch (_) { /* non-fatal */ }

    return assignment;
};

exports.updateAssignment = async (admin_id, assignment_id, updateData) => {
    const { title, description, location, date, start_time, end_time, pay_rate, vip_flag, special_instructions, dress_code, status, gps_lat, gps_lng, required_staff_count, client_name, client_email } = updateData;

    const assignment = await Assignment.findById(assignment_id);
    if (!assignment) throw new Error('Assignment not found');

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
    if (status) assignment.status = status;
    if (typeof client_name !== 'undefined') assignment.client_name = client_name;
    if (typeof client_email !== 'undefined') assignment.client_email = client_email;
    if (gps_lat && gps_lng) {
        assignment.gps_location = { lat: parseFloat(gps_lat), lng: parseFloat(gps_lng) };
    }
    if (required_staff_count) {
        assignment.required_staff_count = parseInt(required_staff_count);
    }

    await assignment.save();

    // Auto-disband check handled internally by controller/workflow or team service, 
    // but we can extract the sync and notifications here
    if (status === 'Completed') {
        if (assignment.booking_ref) {
            try {
                const axios = require('axios');
                const axiosRetry = require('axios-retry').default || require('axios-retry');
                axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });
                await axios.post(
                    `${process.env.MAIN_PORTAL_URL || 'http://localhost:3000'}/internal/sync-event-complete`,
                    { booking_ref: assignment.booking_ref, status: 'Completed' },
                    { headers: { 'x-sync-secret': process.env.JWT_SECRET || 'fallback_secret_key' } }
                );
            } catch(syncErr) { console.log('Port 3000 sync skipped:', syncErr.message); }
        }

        const team = await EventTeam.findOne({ event_id: assignment._id, status: { $ne: 'Disbanded' } });
        if (team) {
            const allPaymentsDone = assignment.staff_payments.length === 0 ||
                assignment.staff_payments.every(p => ['Sent', 'Received', 'Disbursed'].includes(p.status));
            if (global.io) {
                global.io.to(admin_id.toString()).emit('disbandPrompt', {
                    teamId: team._id,
                    eventTitle: assignment.title,
                    allPaymentsDone,
                    message: allPaymentsDone
                        ? `Event "${assignment.title}" is complete and all payments are done. Disband the team?`
                        : `Event "${assignment.title}" is complete but some payments are pending. Disband the team anyway?`
                });
            }
            team.status = 'Completed';
            await team.save();
        }
        
        // Survey Creation
        try {
            const { createSurveysForAssignment } = require('../controllers/surveyController');
            await createSurveysForAssignment(assignment);
            if (global.io) {
                global.io.to(admin_id.toString()).emit('surveysCreated', {
                    eventTitle: assignment.title,
                    message: `Post-event surveys auto-sent for ${assignment.title}`
                });
            }
        } catch(surveyErr) { console.log('Survey creation skipped:', surveyErr.message); }

        // Thank you email to client
        if (assignment.client_email) {
            try {
                const assignmentForEmail = assignment.toObject ? assignment.toObject() : {...assignment._doc, ...assignment};
                assignmentForEmail.staffCount = assignment.accepted_staff_ids?.length || 0;
                await emailService.sendClientThankYouEmail(
                    assignment.client_email,
                    assignment.client_name || 'Valued Client',
                    assignmentForEmail
                );
            } catch(tyErr) { console.log('Thank you email skip:', tyErr.message); }
        }

        // ETR / Completion Receipt
        setTimeout(async () => {
            try {
                const ClientInvoice = require('../models/ClientInvoice');
                const existingInvoice = await ClientInvoice.findOne({ eventId: assignment._id }).lean();
                if (existingInvoice) {
                    // Generate ETR number if not set
                    if (!existingInvoice.etrNumber) {
                        const etrCount = await ClientInvoice.countDocuments({ etrNumber: { $exists: true, $ne: '' } });
                        const etrNumber = 'EPE-ETR-' + new Date().getFullYear() + '-' + String(etrCount + 1).padStart(4, '0');
                        await ClientInvoice.findByIdAndUpdate(existingInvoice._id, { 
                            etrNumber, 
                            etrIssuedAt: new Date(),
                            invoiceStatus: 'Paid'
                        });
                        existingInvoice.etrNumber = etrNumber;
                    }
                    await emailService.sendEventCompletionReceipt(
                        assignment.client_email,
                        assignment.client_name || 'Valued Client',
                        assignment,
                        existingInvoice
                    );
                }
            } catch(etrErr) { console.log('ETR skip:', etrErr.message); }
        }, 3000);
    }

    const acceptedStaff = await Staff.find({ _id: { $in: assignment.accepted_staff_ids } });
    if (global.io) {
        for (const staff of acceptedStaff) {
            global.io.to(staff._id.toString()).emit('assignmentUpdated', {
                assignmentId: assignment._id,
                title: assignment.title,
                message: `Assignment "${assignment.title}" updated. Please review.`
            });
        }
    }

    await sendPushToStaff(assignment.accepted_staff_ids, {
        title: 'Assignment Updated',
        body: `"${assignment.title}" details have been changed. Check your dashboard.`
    });

    for (const staff of acceptedStaff) {
        await emailService.sendAssignmentUpdateNotification(staff, assignment);
    }

    await AuditLog.create({
        actionType: 'ASSIGNMENT_UPDATED', targetModel: 'Assignment', targetId: assignment._id,
        performedBy: admin_id,
        details: { title: assignment.title }
    });

    return assignment;
};

exports.deleteAssignment = async (admin_id, assignment_id) => {
    const assignment = await Assignment.findById(assignment_id);
    if (!assignment) throw new Error('Assignment not found');
    
    await Assignment.findByIdAndDelete(assignment_id);
    await EventTeam.findOneAndDelete({ event_id: assignment_id });
    
    await AuditLog.create({
        actionType: 'ASSIGNMENT_DELETED', targetModel: 'Assignment', targetId: assignment_id,
        performedBy: admin_id,
        details: { title: assignment.title }
    });
    return true;
};

exports.assignStaffToEvent = async (assignment_id, staff_ids) => {
    const assignment = await Assignment.findByIdAndUpdate(
        assignment_id,
        { $set: { assigned_staff_ids: staff_ids } },
        { new: true }
    ).populate('assigned_staff_ids', 'name email role');
    if (!assignment) throw new Error('Event not found');
    return assignment;
};

exports.toggleApplications = async (assignment_id) => {
    const assignment = await Assignment.findById(assignment_id);
    if (!assignment) throw new Error('Assignment not found');
    assignment.open_for_applications = !assignment.open_for_applications;
    await assignment.save();
    return assignment.open_for_applications;
};

exports.handleApplicant = async (assignment_id, staffId, action) => {
    const assignment = await Assignment.findById(assignment_id);
    if (!assignment) throw new Error('Assignment not found');

    assignment.applicant_ids = (assignment.applicant_ids || []).filter(
        id => id.toString() !== staffId
    );

    if (action === 'approve') {
        if (assignment.accepted_staff_ids.length >= assignment.required_staff_count) {
            throw new Error('Event is already fully staffed');
        }
        if (!assignment.assigned_staff_ids.map(id => id.toString()).includes(staffId)) {
            assignment.assigned_staff_ids.push(staffId);
        }
        if (!assignment.accepted_staff_ids.map(id => id.toString()).includes(staffId)) {
            assignment.accepted_staff_ids.push(staffId);
        }
        const alreadyInPayments = assignment.staff_payments.some(p => p.staff_id.toString() === staffId);
        if (!alreadyInPayments) {
            const staff = await Staff.findById(staffId).select('name');
            if (staff) {
                assignment.staff_payments.push({
                    staff_id: staffId,
                    staff_name: staff.name,
                    amount: assignment.pay_rate,
                    status: 'Pending'
                });
            }
        }
    }

    await assignment.save();

    // ── Lifecycle hooks on approval ────────────────────────────────────────────
    if (action === 'approve') {
        try {
            const eventLifecycleService = require('./eventLifecycleService');
            // PLANNED → STAFFING when first staff accepts
            await eventLifecycleService.onStaffAccepted(assignment._id, staffId);
            // STAFFING → READY when required count filled
            await eventLifecycleService.onStaffingFilled(assignment._id, staffId);
        } catch (_) { /* lifecycle is advisory — never break the approval flow */ }
    }

    const notifTitle = action === 'approve' ? '✅ Application Approved!' : '❌ Application Rejected';
    const notifBody = action === 'approve'
        ? `You've been accepted for ${assignment.title} on ${new Date(assignment.date).toLocaleDateString('en-KE')}.`
        : `Your application for ${assignment.title} was not accepted this time.`;
        
    await sendPushToStaff(staffId, { title: notifTitle, body: notifBody, url: '/portal/staff/assignments' });

    if (global.io) {
        global.io.to(staffId).emit('applicationResult', {
            assignmentId: assignment._id,
            assignmentTitle: assignment.title,
            result: action === 'approve' ? 'approved' : 'rejected'
        });
    }

    return assignment;
};
