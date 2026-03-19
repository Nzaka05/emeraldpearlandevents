/**
 * automationService.js — Phase 8: Push Notification Automation
 * Handles auto-close applications, scheduled reminders, thank-you messages
 */
const Assignment = require('../models/Assignment');
const Staff      = require('../models/Staff');
const webpush    = require('web-push');

// ── Configure VAPID from env ──────────────────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:' + (process.env.EMAIL_USER || 'admin@emeraldpearland.com'),
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

// ── Helper: Send push notification to a single staff ─────────────────────────
async function sendPushToStaff(staffId, payload) {
    try {
        const staff = await Staff.findById(staffId).select('pushSubscription name').lean();
        if (!staff?.pushSubscription) return;
        await webpush.sendNotification(staff.pushSubscription, JSON.stringify(payload));
    } catch (err) {
        if (err.statusCode !== 410) console.error(`[automationService] Push to ${staffId} failed:`, err.message);
    }
}

// ── Auto-close applications when required_staff_count is reached ──────────────
exports.autoCloseApplications = async (assignmentId) => {
    try {
        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) return;

        const accepted = assignment.accepted_staff_ids.length;
        const required = assignment.required_staff_count;

        if (accepted >= required && assignment.open_for_applications) {
            assignment.open_for_applications = false;
            await assignment.save();
            console.log(`[automationService] Applications auto-closed for: ${assignment.title} (${accepted}/${required})`);

            // Notify admin via socket
            if (global.io) {
                global.io.to('Admin').emit('adminAssignmentUpdate', {
                    type:         'AUTO_COMPLETED',
                    assignmentId: assignmentId,
                    title:        assignment.title,
                    message:      `Applications closed — ${required} staff confirmed.`
                });
            }
        }
    } catch (err) {
        console.error('[automationService] autoCloseApplications error:', err);
    }
};

// ── Send pre-event reminder notifications ─────────────────────────────────────
exports.sendEventReminder = async (assignmentId, hoursBeforeLabel = '24 hours') => {
    try {
        const assignment = await Assignment.findById(assignmentId)
            .populate('accepted_staff_ids', 'name pushSubscription')
            .lean();
        if (!assignment) return;

        const eventDate = new Date(assignment.date);
        const dateStr   = eventDate.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' });

        for (const staff of assignment.accepted_staff_ids) {
            if (staff.pushSubscription) {
                await sendPushToStaff(staff._id, {
                    title: `⏰ Reminder: ${assignment.title}`,
                    body:  `Your shift starts in ${hoursBeforeLabel}. Date: ${dateStr}, ${assignment.start_time}. Location: ${assignment.location}.`,
                    icon:  '/android-chrome-192x192.png',
                    badge: '/android-chrome-192x192.png',
                    tag:   `reminder-${assignmentId}`,
                    data:  { url: '/portal/staff/assignments' }
                });
            }
        }

        console.log(`[automationService] Sent ${hoursBeforeLabel} reminders for: ${assignment.title}`);
    } catch (err) {
        console.error('[automationService] sendEventReminder error:', err);
    }
};

// ── Send post-event thank-you notifications ───────────────────────────────────
exports.sendPostEventThankYou = async (assignmentId) => {
    try {
        const assignment = await Assignment.findById(assignmentId)
            .populate('accepted_staff_ids', 'name pushSubscription')
            .lean();
        if (!assignment) return;

        for (const staff of assignment.accepted_staff_ids) {
            if (staff.pushSubscription) {
                await sendPushToStaff(staff._id, {
                    title: `✅ Thank You, ${staff.name.split(' ')[0]}!`,
                    body:  `Great work at ${assignment.title}! Your payment will be processed soon. Check your payments tab.`,
                    icon:  '/android-chrome-192x192.png',
                    tag:   `thankyou-${assignmentId}`,
                    data:  { url: '/portal/staff/payments' }
                });
            }
        }

        console.log(`[automationService] Thank-you messages sent for: ${assignment.title}`);
    } catch (err) {
        console.error('[automationService] sendPostEventThankYou error:', err);
    }
};

// ── Broadcast new job posting to all available staff ─────────────────────────
exports.broadcastNewJob = async (assignment) => {
    try {
        const availableStaff = await Staff.find({
            status:              'Active',
            availability_status: 'Available',
            pushSubscription:    { $exists: true, $ne: null }
        }).select('pushSubscription').lean();

        const eventDate = new Date(assignment.date).toLocaleDateString('en-KE', {
            weekday: 'short', day: 'numeric', month: 'short'
        });

        let sent = 0;
        for (const staff of availableStaff) {
            try {
                await webpush.sendNotification(staff.pushSubscription, JSON.stringify({
                    title: `💼 New Job: ${assignment.title}`,
                    body:  `${eventDate} at ${assignment.location}. Rate: KSh ${assignment.pay_rate}/hr. Tap to apply!`,
                    icon:  '/android-chrome-192x192.png',
                    tag:   `job-${assignment._id}`,
                    data:  { url: '/portal/staff/assignments' }
                }));
                sent++;
            } catch(e) { /* skip failed */ }
        }

        console.log(`[automationService] New job broadcast to ${sent} staff for: ${assignment.title}`);
    } catch (err) {
        console.error('[automationService] broadcastNewJob error:', err);
    }
};

// ── Auto-suggest replacements when staff declines/cancels ────────────────────
exports.autoSuggestReplacement = async (assignmentId, removedStaffId) => {
    try {
        const assignment = await Assignment.findById(assignmentId).lean();
        if (!assignment) return;

        const category = assignment.required_category || null;
        const filter = {
            status:              'Active',
            availability_status: 'Available',
            _id: { $nin: [...(assignment.accepted_staff_ids || []), ...(assignment.declined_staff_ids || [])] }
        };
        if (category) filter.category = category;

        const candidates = await Staff.find(filter).select('name email pushSubscription').limit(5).lean();

        // Notify candidates  
        for (const candidate of candidates) {
            if (candidate.pushSubscription) {
                await sendPushToStaff(candidate._id, {
                    title: `🔔 Urgent: Replacement Needed — ${assignment.title}`,
                    body:  `A spot opened up. Apply now before it's filled!`,
                    icon:  '/android-chrome-192x192.png',
                    tag:   `replace-${assignmentId}`,
                    data:  { url: '/portal/staff/assignments' }
                });
            }
        }

        // Notify admin of suggestions
        if (global.io) {
            global.io.to('Admin').emit('adminAssignmentUpdate', {
                type:         'REPLACEMENT_SUGGESTED',
                assignmentId,
                candidates:   candidates.map(c => ({ _id: c._id, name: c.name }))
            });
        }

        console.log(`[automationService] Suggested ${candidates.length} replacements for: ${assignment.title}`);
        return candidates;
    } catch (err) {
        console.error('[automationService] autoSuggestReplacement error:', err);
        return [];
    }
};

// ── Cron-like check: called from server.js on an interval ────────────────────
exports.runScheduledChecks = async () => {
    try {
        const now = new Date();

        // Find events happening in the next 26h that haven't received 24h reminder
        const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const in26h = new Date(now.getTime() + 26 * 60 * 60 * 1000);

        const upcomingFor24h = await Assignment.find({
            status: 'Active',
            date:   { $gte: in24h, $lte: in26h },
            _reminder24h_sent: { $ne: true }
        }).select('_id title date').lean();

        for (const a of upcomingFor24h) {
            await exports.sendEventReminder(a._id, '24 hours');
            await Assignment.findByIdAndUpdate(a._id, { _reminder24h_sent: true });
        }

        // Events happening in 2-3h
        const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        const in3h = new Date(now.getTime() + 3 * 60 * 60 * 1000);

        const upcomingFor2h = await Assignment.find({
            status: 'Active',
            date:   { $gte: in2h, $lte: in3h },
            _reminder2h_sent: { $ne: true }
        }).select('_id title date').lean();

        for (const a of upcomingFor2h) {
            await exports.sendEventReminder(a._id, '2 hours');
            await Assignment.findByIdAndUpdate(a._id, { _reminder2h_sent: true });
        }

    } catch (err) {
        console.error('[automationService] runScheduledChecks error:', err);
    }
};
