require('dotenv').config();

const { Worker } = require('bullmq');
const { connection } = require('./config/queues');

async function handleBookingJob(job) {
    if (job.name !== 'confirmed') {
        console.log('[bookingWorker] No handler for job:', job.name);
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
        console.error('[bookingWorker] syncToStaffPortal failed:', bookingId, err.message);
    }

    try {
        await sendConfirmationEmail(bookingId);
        stepResults.sendConfirmationEmail = true;
    } catch (err) {
        console.error('[bookingWorker] sendConfirmationEmail failed:', bookingId, err.message);
    }

    try {
        await sendStaffNotifications(bookingId);
        stepResults.sendStaffNotifications = true;
    } catch (err) {
        console.error('[bookingWorker] sendStaffNotifications failed:', bookingId, err.message);
    }

    return { bookingId, stepResults };
}

async function syncToStaffPortal(bookingId) {
    console.log('[bookingWorker] syncToStaffPortal placeholder:', bookingId);
}

async function sendConfirmationEmail(bookingId) {
    console.log('[bookingWorker] sendConfirmationEmail placeholder:', bookingId);
}

async function sendStaffNotifications(bookingId) {
    console.log('[bookingWorker] sendStaffNotifications placeholder:', bookingId);
}

async function handlePaymentJob(job) {
    if (job.name !== 'mpesa.callback') {
        console.log('[paymentWorker] No handler for job:', job.name);
        return { skipped: true, reason: 'unsupported_job', jobName: job.name };
    }

    const payload = job.data?.payload;
    if (!payload?.Result || !payload?.Result?.Occasion) {
        throw new Error('mpesa.callback job requires payload.Result.Occasion');
    }

    // Idempotency is enforced inside eventPaymentService.mpesaCallback.
    const eventPaymentService = require('./staff-system/financials/services/eventPaymentService');
    return eventPaymentService.mpesaCallback(payload);
}

async function handleNotificationJob(job) {
    if (job.name !== 'email') {
        console.log('[notificationWorker] No handler for job:', job.name);
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
        console.log('[bookingWorker] Processing job:', job.name, job.data);
        return handleBookingJob(job);
    },
    { connection }
);

const paymentWorker = new Worker(
    'paymentQueue',
    async (job) => {
        console.log('[paymentWorker] Processing job:', job.name, job.data);
        return handlePaymentJob(job);
    },
    { connection }
);

const notificationWorker = new Worker(
    'notificationQueue',
    async (job) => {
        console.log('[notificationWorker] Processing job:', job.name, job.data);
        return handleNotificationJob(job);
    },
    { connection }
);

const syncWorker = new Worker(
    'syncQueue',
    async (job) => {
        console.log('[syncWorker] Processing job:', job.name, job.data);
        return handleSyncJob(job);
    },
    { connection }
);

bookingWorker.on('failed', (job, err) => {
    console.error('[bookingWorker] Job failed:', job?.id, job?.name, err.message);
});

paymentWorker.on('failed', (job, err) => {
    console.error('[paymentWorker] Job failed:', job?.id, job?.name, err.message);
});

notificationWorker.on('failed', (job, err) => {
    console.error('[notificationWorker] Job failed:', job?.id, job?.name, err.message);
});

syncWorker.on('failed', (job, err) => {
    console.error('[syncWorker] Job failed:', job?.id, job?.name, err.message);
});

async function shutdown() {
    console.log('SIGTERM received. Closing workers...');
    await Promise.allSettled([
        bookingWorker.close(),
        paymentWorker.close(),
        notificationWorker.close(),
        syncWorker.close()
    ]);
    console.log('All workers closed. Exiting.');
    process.exit(0);
}

process.on('SIGTERM', shutdown);

console.log('All workers started');

module.exports = {
    bookingWorker,
    paymentWorker,
    notificationWorker,
    syncWorker
};
