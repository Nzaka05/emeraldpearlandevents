const webpush = require('web-push');
const Admin = require('../models/Admin');
require('dotenv').config();

// Set VAPID details gracefully so the server doesn't crash if env vars are not set
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:emeraldpearlandevents@gmail.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
} else {
    console.warn('⚠️ Web Push VAPID keys are missing! Push notifications will be disabled.');
}

async function sendPushNotificationToAdmins(payload) {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.warn('⚠️ Push notifications skipped: VAPID keys not configured in .env');
        return;
    }

    try {
        // Find admins that have at least one pushSubscription
        const admins = await Admin.find({
            isActive: true,
            pushSubscriptions: { $exists: true, $not: { $size: 0 } }
        });

        if (admins.length === 0) {
            console.log('ℹ️ No admin push subscriptions found. Skipping push notification.');
            return;
        }

        const pushPayload = JSON.stringify(payload);

        let successCount = 0;
        let failCount = 0;

        for (const admin of admins) {
            // Arrays to hold valid subs and filter out expired/failed ones
            const validSubscriptions = [];
            let subscriptionsChanged = false;

            for (const subscription of admin.pushSubscriptions) {
                try {
                    await webpush.sendNotification(subscription, pushPayload);
                    validSubscriptions.push(subscription);
                    successCount++;
                } catch (error) {
                    if (error.statusCode === 404 || error.statusCode === 410) {
                        // The subscription has expired or is no longer valid
                        console.log(`🧹 Removing expired subscription for admin ${admin.email}`);
                        subscriptionsChanged = true;
                    } else {
                        console.error('❌ Error sending push notification:', error);
                        // Still keep it if it's a temporary network error
                        validSubscriptions.push(subscription);
                        failCount++;
                    }
                }
            }

            // Update admin if old subscriptions were purged
            if (subscriptionsChanged) {
                admin.pushSubscriptions = validSubscriptions;
                await admin.save();
            }
        }

        console.log(`✅ Push Notifications completed. Success: ${successCount}, Failures: ${failCount}`);

    } catch (error) {
        console.error('❌ Failed to process push notifications:', error);
    }
}

module.exports = { sendPushNotificationToAdmins };
