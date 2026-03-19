const ClientEmailLog = require('../models/ClientEmailLog');

exports.sendLockoutNotification = async (account) => {
    await ClientEmailLog.create({ 
        client_id: account.client_id, email_type: 'accountLocked', recipient_email: account.email, status: 'sent', sent_at: new Date()
    });
};

exports.sendPasswordResetEmail = async (account, rawToken) => {
    await ClientEmailLog.create({ 
        client_id: account.client_id, email_type: 'passwordReset', recipient_email: account.email, status: 'sent', sent_at: new Date()
    });
};

exports.sendPasswordChangedConfirmation = async (account) => {
    await ClientEmailLog.create({ 
        client_id: account.client_id, email_type: 'passwordChanged', recipient_email: account.email, status: 'sent', sent_at: new Date()
    });
};

exports.sendTeamReadyNotification = async (eventId) => {
    console.log(`[Notification] Team ready for Event ID ${eventId}`);
};

exports.sendEventStartedNotification = async (eventId) => {
    console.log(`[Notification] Event started for Event ID ${eventId}`);
};
