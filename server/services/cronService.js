const cron = require('node-cron');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');
const { sendFollowUpEmail, sendEventReminderEmail } = require('./emailService');

// ═══════════════════════════════════════════════════════════
// CRON JOBS FOR AUTOMATED EMAIL FOLLOW-UPS
// ═══════════════════════════════════════════════════════════

let cronJobs = {
    followUpJob: null,
    reminderJob: null
};

/**
 * Initialize all cron jobs
 * This function should be called when the server starts
 */
const initializeCronJobs = () => {
    console.log('[CRON] Initializing scheduled tasks...');

    // ───────────────────────────────────────────────────────────
    // JOB 1: Send follow-up emails 24 hours after booking
    // Runs every hour to check for bookings needing follow-up
    // ───────────────────────────────────────────────────────────
    cronJobs.followUpJob = cron.schedule('0 * * * *', async () => {
        console.log(`[CRON] Running follow-up email job at ${new Date().toISOString()}`);
        
        try {
            // Find bookings with status "new" and created > 24 hours ago
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            const bookingsNeedingFollowUp = await Booking.find({
                status: 'new',
                createdAt: { $lt: oneDayAgo },
                followUpEmailSentAt: null
            }).populate('customerId');

            for (const booking of bookingsNeedingFollowUp) {
                try {
                    const customer = booking.customerId;
                    await sendFollowUpEmail(booking, customer);
                    
                    // Mark follow-up as sent
                    booking.followUpEmailSentAt = new Date();
                    await booking.save();
                    
                    console.log(`[CRON] Follow-up email sent for booking ${booking.bookingReference}`);
                } catch (emailError) {
                    console.error(`[CRON] Failed to send follow-up for ${booking.bookingReference}:`, emailError.message);
                }
            }

            if (bookingsNeedingFollowUp.length === 0) {
                console.log('[CRON] No bookings requiring follow-up emails');
            }
        } catch (error) {
            console.error('[CRON] Error in follow-up job:', error);
        }
    });

    // ───────────────────────────────────────────────────────────
    // JOB 2: Send event reminders 48 hours before event
    // Runs every 30 minutes to check for upcoming events
    // ───────────────────────────────────────────────────────────
    cronJobs.reminderJob = cron.schedule('*/30 * * * *', async () => {
        console.log(`[CRON] Running event reminder job at ${new Date().toISOString()}`);
        
        try {
            // Calculate 48-hour window
            const now = new Date();
            const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
            const in47Hours = new Date(now.getTime() + 47 * 60 * 60 * 1000);
            
            const bookingsNeedingReminder = await Booking.find({
                status: { $in: ['contacted', 'confirmed'] },
                eventDate: {
                    $gte: in47Hours,
                    $lte: in48Hours
                },
                reminderEmailSentAt: null
            }).populate('customerId');

            for (const booking of bookingsNeedingReminder) {
                try {
                    const customer = booking.customerId;
                    await sendEventReminderEmail(booking, customer);
                    
                    // Mark reminder as sent
                    booking.reminderEmailSentAt = new Date();
                    await booking.save();
                    
                    console.log(`[CRON] Event reminder sent for booking ${booking.bookingReference}`);
                } catch (emailError) {
                    console.error(`[CRON] Failed to send reminder for ${booking.bookingReference}:`, emailError.message);
                }
            }

            if (bookingsNeedingReminder.length === 0) {
                console.log('[CRON] No bookings requiring event reminders');
            }
        } catch (error) {
            console.error('[CRON] Error in reminder job:', error);
        }
    });

    console.log('[CRON] Cron jobs initialized successfully');
};

/**
 * Stop all cron jobs
 */
const stopCronJobs = () => {
    console.log('[CRON] Stopping all scheduled tasks...');
    
    if (cronJobs.followUpJob) {
        cronJobs.followUpJob.stop();
        console.log('[CRON] Follow-up job stopped');
    }
    
    if (cronJobs.reminderJob) {
        cronJobs.reminderJob.stop();
        console.log('[CRON] Reminder job stopped');
    }
};

module.exports = {
    initializeCronJobs,
    stopCronJobs,
    cronJobs
};
