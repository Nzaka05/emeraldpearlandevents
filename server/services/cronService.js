const cron = require('node-cron');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');
const Staff = require('../models/Staff');
const { sendFollowUpEmail, sendEventReminderEmail, sendStaffEventReminder } = require('./emailService');

// ═══════════════════════════════════════════════════════════
// CRON JOBS FOR AUTOMATED EMAIL FOLLOW-UPS
// ═══════════════════════════════════════════════════════════

let cronJobs = {
    followUpJob: null,
    reminderJob: null,
    staffReminderJob: null,
    dualApprovalJob: null
};

/**
 * Initialize all cron jobs
 * This function should be called when the server starts
 */
const initializeCronJobs = () => {
    console.log('[CRON] Initializing scheduled tasks...');

    // ───────────────────────────────────────────────────────────
    // JOB 1: Send follow-up emails 24 hours after booking
    // ───────────────────────────────────────────────────────────
    cronJobs.followUpJob = cron.schedule('0 * * * *', async () => {
        console.log(`[CRON] Running follow-up email job at ${new Date().toISOString()}`);

        try {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const bookingsNeedingFollowUp = await Booking.find({
                status: 'new',
                createdAt: { $lt: oneDayAgo },
                followUpEmailSentAt: null
            }).populate('customerId');

            const results = await Promise.allSettled(
                bookingsNeedingFollowUp.map(async (booking) => {
                    const customer = booking.customerId;
                    await sendFollowUpEmail(booking, customer);
                    booking.followUpEmailSentAt = new Date();
                    await booking.save();
                    console.log(`[CRON] Follow-up email sent for booking ${booking.bookingReference}`);
                })
            );
            const failed = results.filter(r => r.status === 'rejected');
            if (failed.length) {
                failed.forEach(f => console.error('[CRON] Follow-up email failed:', f.reason?.message));
            }

            if (bookingsNeedingFollowUp.length === 0) {
                console.log('[CRON] No bookings requiring follow-up emails');
            }
        } catch (error) {
            console.error('[CRON] Error in follow-up job:', error);
        }
    });

    // ───────────────────────────────────────────────────────────
    // JOB 2: Send event reminders to clients 48 hours before event
    // ───────────────────────────────────────────────────────────
    cronJobs.reminderJob = cron.schedule('*/30 * * * *', async () => {
        console.log(`[CRON] Running event reminder job at ${new Date().toISOString()}`);

        try {
            const now = new Date();
            const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
            const in47Hours = new Date(now.getTime() + 47 * 60 * 60 * 1000);

            const bookingsNeedingReminder = await Booking.find({
                status: { $in: ['contacted', 'confirmed'] },
                eventDate: { $gte: in47Hours, $lte: in48Hours },
                reminderEmailSentAt: null
            }).populate('customerId');

            const results = await Promise.allSettled(
                bookingsNeedingReminder.map(async (booking) => {
                    const customer = booking.customerId;
                    await sendEventReminderEmail(booking, customer);
                    booking.reminderEmailSentAt = new Date();
                    await booking.save();
                    console.log(`[CRON] Event reminder sent for booking ${booking.bookingReference}`);
                })
            );
            const failed = results.filter(r => r.status === 'rejected');
            if (failed.length) {
                failed.forEach(f => console.error('[CRON] Reminder email failed:', f.reason?.message));
            }

            if (bookingsNeedingReminder.length === 0) {
                console.log('[CRON] No bookings requiring event reminders');
            }
        } catch (error) {
            console.error('[CRON] Error in reminder job:', error);
        }
    });

    // ───────────────────────────────────────────────────────────
    // JOB 3: Send 48-hour pre-event alerts to assigned staff
    // Runs every 30 minutes — checks for events in 47–48hr window
    // with assigned staff that haven't been notified yet
    // ───────────────────────────────────────────────────────────
    cronJobs.staffReminderJob = cron.schedule('*/30 * * * *', async () => {
        console.log(`[CRON] Running staff 48-hr alert job at ${new Date().toISOString()}`);

        try {
            const now = new Date();
            const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
            const in47Hours = new Date(now.getTime() + 47 * 60 * 60 * 1000);

            // Find confirmed bookings in the 48-hr window with assigned staff, not yet notified
            const bookings = await Booking.find({
                status: { $in: ['confirmed'] },
                eventDate: { $gte: in47Hours, $lte: in48Hours },
                staffNotified48hr: { $ne: true },
                $or: [
                    { assignedStaff: { $exists: true, $not: { $size: 0 } } },
                    { supervisor: { $exists: true, $ne: null } }
                ]
            }).populate('customerId').populate('assignedStaff').populate('supervisor');

            await Promise.allSettled(
                bookings.map(async (booking) => {
                    const customer = booking.customerId;
                    const notified = [];

                    // Notify supervisor first
                    if (booking.supervisor && booking.supervisor.email) {
                        try {
                            await sendStaffEventReminder(booking.supervisor, booking, customer, 'Supervisor');
                            notified.push(booking.supervisor.name);
                            console.log(`[CRON] 48-hr alert sent to supervisor ${booking.supervisor.name}`);
                        } catch (err) {
                            console.error(`[CRON] Failed to email supervisor ${booking.supervisor.name}:`, err.message);
                        }
                    }

                    // Notify team members concurrently (skip supervisor if already notified)
                    const teamMembers = (booking.assignedStaff || []).filter(staff => {
                        if (!staff.email) return false;
                        if (booking.supervisor && staff._id.toString() === booking.supervisor._id.toString()) return false;
                        return true;
                    });

                    const teamResults = await Promise.allSettled(
                        teamMembers.map(async (staff) => {
                            await sendStaffEventReminder(staff, booking, customer, 'Team Member');
                            notified.push(staff.name);
                            console.log(`[CRON] 48-hr alert sent to ${staff.name}`);
                        })
                    );
                    teamResults
                        .filter(r => r.status === 'rejected')
                        .forEach(f => console.error('[CRON] Staff reminder email failed:', f.reason?.message));

                    // Mark as notified so we don't send again
                    booking.staffNotified48hr = true;
                    await booking.save();
                    console.log(`[CRON] Staff 48-hr alerts done for booking ${booking._id} — notified: ${notified.join(', ') || 'none'}`);
                })
            );

            if (bookings.length === 0) {
                console.log('[CRON] No staff 48-hr alerts needed');
            }
        } catch (error) {
            console.error('[CRON] Error in staff reminder job:', error);
        }
    });

    // ───────────────────────────────────────────────────────────
    // JOB 4: Dual Approval Expiration Check
    // Runs every 5 minutes to expire pending dual approvals > 30mins
    // ───────────────────────────────────────────────────────────
    cronJobs.dualApprovalJob = cron.schedule('*/5 * * * *', async () => {
        console.log(`[CRON] Running dual approval expiration check at ${new Date().toISOString()}`);
        try {
            const EmergencyFundAudit = require('../models/EmergencyFundAudit');
            const now = new Date();
            
            const expiredAudits = await EmergencyFundAudit.find({
                dual_approval_required: true,
                dual_approval_completed: false,
                approval_status: 'pending',
                dual_approval_expires_at: { $lt: now }
            });

            const results = await Promise.allSettled(expiredAudits.map(async (audit) => {
                try {
                    audit.approval_status = 'expired';
                    audit.failure_reason = 'Dual approval window expired after 30 minutes';
                    await audit.save();

                    const AuditLog = require('../models/AuditLog');
                    await AuditLog.create({
                        actionType: 'dual_approval_expired',
                        targetModel: 'Staff',
                        targetId: audit.admin_id,
                        performedBy: audit.admin_id,
                        details: { audit_id: audit._id, event_id: audit.event_id, amount: audit.amount }
                    }).catch(err => console.error(err));

                    if (global.io) {
                        global.io.to('Admin').emit('cmd:dual_approval_expired', {
                            audit_id: audit._id,
                            event_id: audit.event_id,
                            amount: audit.amount,
                            timestamp: new Date().toISOString()
                        });

                        if (audit.first_admin_id) {
                            global.io.to(`Staff:${audit.first_admin_id}`).emit('cmd:your_approval_expired', {
                                audit_id: audit._id,
                                event_id: audit.event_id,
                                message: 'Your emergency fund request expired due to lack of secondary approval within 30 minutes.'
                            });
                        }
                    }
                    console.log(`[CRON] Expired pending dual approval ${audit._id}`);
                } catch (auditErr) {
                    console.error(`[CRON] Failed to expire dual approval ${audit?._id}:`, auditErr);
                    throw auditErr;
                }
            }));
            const failed = results.filter(r => r.status === 'rejected').length;
            const succeeded = results.length - failed;
            console.log(`[CRON] Dual approval expiration summary: succeeded=${succeeded}, failed=${failed}`);
        } catch (error) {
            console.error('[CRON] Error in dual approval expiration job:', error);
        }
    });

    console.log('[CRON] Cron jobs initialized successfully');
};

/**
 * Stop all cron jobs
 */
const stopCronJobs = () => {
    console.log('[CRON] Stopping all scheduled tasks...');

    if (cronJobs.followUpJob) { cronJobs.followUpJob.stop(); console.log('[CRON] Follow-up job stopped'); }
    if (cronJobs.reminderJob) { cronJobs.reminderJob.stop(); console.log('[CRON] Reminder job stopped'); }
    if (cronJobs.staffReminderJob) { cronJobs.staffReminderJob.stop(); console.log('[CRON] Staff reminder job stopped'); }
    if (cronJobs.dualApprovalJob) { cronJobs.dualApprovalJob.stop(); console.log('[CRON] Dual approval check stopped'); }
};

module.exports = {
    initializeCronJobs,
    stopCronJobs,
    cronJobs
};



