const cron = require('node-cron');
const ClientInvoice = require('../models/ClientInvoice');
const ClientAccount = require('../models/ClientAccount');
const { sendOutstandingReminder } = require('../services/clientNotificationService');
const logger = require('../utils/logger');

/**
 * Initializes the scheduled job handling automated 7-day collection emails
 * for any unpaid ClientInvoices utilizing the new Client Notification framework.
 */
const startOutstandingBalanceJob = () => {
    // Run daily at 09:00 server time
    cron.schedule('0 9 * * *', async () => {
        logger.info('Analyzing outstanding client balances');

        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            // Find invoices created more than 7 days ago that remain unpaid
            const pendingInvoices = await ClientInvoice.find({
                createdAt: { $lt: sevenDaysAgo }
            }).populate('event_id');

            let reminderSentCounter = 0;

            for (const invoice of pendingInvoices) {
                const balance = invoice.totalAmount - (invoice.amountPaid || 0);
                
                if (balance > 0) {
                    try {
                        const eventName = invoice.event_id ? invoice.event_id.title : 'General Invoice';
                        const completionDate = invoice.event_id ? new Date(invoice.event_id.date).toLocaleDateString() : 'N/A';
                        
                        await sendOutstandingReminder(
                            invoice.client_id, 
                            eventName, 
                            completionDate, 
                            balance, 
                            invoice.invoiceNumber
                        );
                        
                        reminderSentCounter++;
                        logger.info({ invoiceNumber: invoice.invoiceNumber }, 'Outstanding reminder sent');
                    } catch (e) {
                        logger.error({ err: e, invoiceNumber: invoice.invoiceNumber }, 'Failed to send reminder');
                    }
                }
            }

            logger.info({ count: reminderSentCounter }, 'Balance tracking complete');
        } catch (err) {
            logger.error({ err }, 'Error escalating outstanding balances');
        }
    });

    logger.info('Outstanding Balance Reminders scheduled successfully');
};

module.exports = startOutstandingBalanceJob;
