require('dotenv').config();

const { Worker } = require('bullmq');
const { connection } = require('./config/queues');
const logger = require('./server/utils/logger');
const { normalizeMpesaCallback } = require('./utils/mpesaCallbackNormalizer');

async function handleBookingJob(job) {
    if (job.name !== 'confirmed') {
        logger.warn({ jobId: job.id, jobName: job.name, queueName: 'bookingQueue' }, 'No handler for job');
        return { skipped: true, reason: 'unsupported_job', jobName: job.name };
    }

    const { bookingId } = job.data || {};
    if (!bookingId) {
        throw new Error('confirmed job requires bookingId');
    }

    const stepResults = {
        syncToStaffPortal: false,
        sendConfirmationEmail: false,
        sendStaffNotifications: false
    };

    try {
        await syncToStaffPortal(bookingId);
        stepResults.syncToStaffPortal = true;
    } catch (err) {
        logger.error({ err, bookingId, jobId: job.id, jobName: job.name, queueName: 'bookingQueue' }, 'syncToStaffPortal failed');
    }

    try {
        await sendConfirmationEmail(bookingId);
        stepResults.sendConfirmationEmail = true;
    } catch (err) {
        logger.error({ err, bookingId, jobId: job.id, jobName: job.name, queueName: 'bookingQueue' }, 'sendConfirmationEmail failed');
    }

    try {
        await sendStaffNotifications(bookingId);
        stepResults.sendStaffNotifications = true;
    } catch (err) {
        logger.error({ err, bookingId, jobId: job.id, jobName: job.name, queueName: 'bookingQueue' }, 'sendStaffNotifications failed');
    }

    return { bookingId, stepResults };
}

async function syncToStaffPortal(bookingId) {
    logger.info({ bookingId }, 'syncToStaffPortal placeholder');
}

async function sendConfirmationEmail(bookingId) {
    logger.info({ bookingId }, 'sendConfirmationEmail placeholder');
}

async function sendStaffNotifications(bookingId) {
    logger.info({ bookingId }, 'sendStaffNotifications placeholder');
}

async function handlePaymentJob(job) {
    if (job.name !== 'mpesa.callback') {
        logger.warn({ jobId: job.id, jobName: job.name, queueName: 'paymentQueue' }, 'No handler for job');
        return { skipped: true, reason: 'unsupported_job', jobName: job.name };
    }

    const payload = job.data?.payload;
    const normalized = normalizeMpesaCallback(payload);
    const isProcessableB2C = normalized?.flow === 'b2c' && Boolean(normalized.identifiers?.occasion);
    if (!isProcessableB2C) {
        throw new Error('mpesa.callback job requires a valid B2C callback payload with Occasion');
    }

    // Idempotency is enforced inside eventPaymentService.mpesaCallback.
    const eventPaymentService = require('./staff-system/financials/services/eventPaymentService');
    return eventPaymentService.mpesaCallback(payload);
}

async function handleNotificationJob(job) {
    if (job.name !== 'email') {
        logger.warn({ jobId: job.id, jobName: job.name, queueName: 'notificationQueue' }, 'No handler for job');
        return { skipped: true, reason: 'unsupported_job', jobName: job.name };
    }

    const { type, payload } = job.data || {};
    const emailService = require('./staff-system/services/emailService');

    switch (type) {
        case 'password.reset': {
            if (!payload?.staff?.email || !payload?.resetUrl) {
                throw new Error('password.reset payload requires staff and resetUrl');
            }
            await emailService.sendPasswordResetEmail(payload.staff, payload.resetUrl);
            return { dispatched: true, type };
        }

        case 'payment.receipt': {
            if (!payload?.staffId || !payload?.assignmentId || !payload?.staffPaymentId) {
                throw new Error('payment.receipt payload requires staffId, assignmentId, and staffPaymentId');
            }
            const Staff = require('./staff-system/models/Staff');
            const Assignment = require('./staff-system/models/Assignment');

            const [staff, assignment] = await Promise.all([
                Staff.findById(payload.staffId).select('name email').lean(),
                Assignment.findById(payload.assignmentId).lean()
            ]);

            if (!staff || !assignment) {
                throw new Error('payment.receipt missing staff or assignment');
            }

            const staffPayment = (assignment.staff_payments || []).find(
                p => p._id?.toString() === payload.staffPaymentId
            );
            if (!staffPayment) {
                throw new Error('payment.receipt missing staff payment entry');
            }

            await emailService.sendPaymentReceiptEmail(
                staff,
                assignment,
                staffPayment,
                payload.transactionId || staffPayment.transaction_id || 'NO-TX'
            );
            return { dispatched: true, type };
        }

        case 'client.invoice': {
            if (!payload?.clientEmail || !payload?.invoice || !payload?.assignment) {
                throw new Error('client.invoice payload requires clientEmail, invoice, and assignment');
            }
            await emailService.sendClientInvoiceEmail(
                payload.clientEmail,
                payload.clientName || 'Client',
                payload.invoice,
                payload.assignment
            );
            return { dispatched: true, type };
        }

        case 'server.payment.proforma_email': {
            if (!payload?.to || !payload?.subject || !payload?.htmlBody) {
                throw new Error('server.payment.proforma_email payload requires to, subject, and htmlBody');
            }
            const serverEmailService = require('./server/services/emailService');
            await serverEmailService.sendEmail({
                to: payload.to,
                subject: payload.subject,
                htmlContent: payload.htmlBody
            });
            return { dispatched: true, type };
        }

        case 'server.booking.appreciation': {
            if (!payload?.bookingId || !payload?.customerId) {
                throw new Error('server.booking.appreciation payload requires bookingId and customerId');
            }
            const Booking = require('./server/models/Booking');
            const booking = await Booking.findById(payload.bookingId).populate('customerId').lean();
            if (!booking || !booking.customerId) {
                throw new Error('server.booking.appreciation missing booking/customer');
            }
            const serverEmailService = require('./server/services/emailService');
            await serverEmailService.sendClientAppreciationEmail(booking, booking.customerId);
            return { dispatched: true, type };
        }

        case 'server.staff.feedback_request': {
            if (!payload?.bookingId || !payload?.staffEmail || !payload?.staffName) {
                throw new Error('server.staff.feedback_request payload requires bookingId, staffEmail, and staffName');
            }
            const Booking = require('./server/models/Booking');
            const booking = await Booking.findById(payload.bookingId).lean();
            if (!booking) {
                throw new Error('server.staff.feedback_request missing booking');
            }
            const serverEmailService = require('./server/services/emailService');
            await serverEmailService.sendStaffFeedbackRequestEmail(
                payload.staffEmail,
                payload.staffName,
                booking,
                payload.customMessage || ''
            );
            return { dispatched: true, type };
        }

        case 'generic.email': {
            if (!payload?.to || !payload?.subject || !payload?.htmlContent) {
                throw new Error('generic.email payload requires to, subject, and htmlContent');
            }
            const htmlContent = payload.templateTitle && emailService.brandedWrapper
                ? emailService.brandedWrapper(payload.templateTitle, payload.htmlContent)
                : payload.htmlContent;
            await emailService.sendEmail({
                to: payload.to,
                subject: payload.subject,
                htmlContent,
                attachments: payload.attachments
            });
            return { dispatched: true, type };
        }

        default:
            throw new Error(`Unsupported email job type: ${type}`);
    }
}

async function handleSyncJob(job) {
    // Placeholder: wire reconciliation/sync logic in next phase.
    return { queued: true, queue: 'syncQueue', jobId: job.id };
}

const bookingWorker = new Worker(
    'bookingQueue',
    async (job) => {
        logger.info({ jobId: job.id, jobName: job.name, queueName: 'bookingQueue' }, 'Job started');
        return handleBookingJob(job);
    },
    { connection }
);

const paymentWorker = new Worker(
    'paymentQueue',
    async (job) => {
        logger.info({ jobId: job.id, jobName: job.name, queueName: 'paymentQueue' }, 'Job started');
        return handlePaymentJob(job);
    },
    { connection }
);

const notificationWorker = new Worker(
    'notificationQueue',
    async (job) => {
        logger.info({ jobId: job.id, jobName: job.name, queueName: 'notificationQueue' }, 'Job started');
        return handleNotificationJob(job);
    },
    { connection }
);

const syncWorker = new Worker(
    'syncQueue',
    async (job) => {
        logger.info({ jobId: job.id, jobName: job.name, queueName: 'syncQueue' }, 'Job started');
        return handleSyncJob(job);
    },
    { connection }
);

bookingWorker.on('completed', (job) => {
    logger.info({ jobId: job?.id, jobName: job?.name, queueName: 'bookingQueue' }, 'Job completed');
});

paymentWorker.on('completed', (job) => {
    logger.info({ jobId: job?.id, jobName: job?.name, queueName: 'paymentQueue' }, 'Job completed');
});

notificationWorker.on('completed', (job) => {
    logger.info({ jobId: job?.id, jobName: job?.name, queueName: 'notificationQueue' }, 'Job completed');
});

syncWorker.on('completed', (job) => {
    logger.info({ jobId: job?.id, jobName: job?.name, queueName: 'syncQueue' }, 'Job completed');
});

bookingWorker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, jobName: job?.name, queueName: 'bookingQueue' }, 'Job failed');
});

paymentWorker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, jobName: job?.name, queueName: 'paymentQueue' }, 'Job failed');
});

notificationWorker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, jobName: job?.name, queueName: 'notificationQueue' }, 'Job failed');
});

syncWorker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, jobName: job?.name, queueName: 'syncQueue' }, 'Job failed');
});

async function shutdown() {
    logger.warn('SIGTERM received. Closing workers...');
    await Promise.allSettled([
        bookingWorker.close(),
        paymentWorker.close(),
        notificationWorker.close(),
        syncWorker.close()
    ]);
    logger.info('All workers closed. Exiting.');
    process.exit(0);
}

process.on('SIGTERM', shutdown);

logger.info('All workers started');

module.exports = {
    bookingWorker,
    paymentWorker,
    notificationWorker,
    syncWorker
};
