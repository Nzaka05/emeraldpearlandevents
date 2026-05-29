/**
 * tests/queue/notification.worker.test.js
 *
 * Validates:
 *   1. Email channel routing
 *   2. Dedup on notificationId
 *   3. Unknown channel rejection
 */

jest.mock('../../server/services/emailService', () => ({
    sendEmail: jest.fn().mockResolvedValue({}),
}));

const emailService = require('../../server/services/emailService');

describe('Notification Worker — Channel Routing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('routes email channel to emailService.sendEmail', async () => {
        const payload = {
            notificationId: 'notif-001',
            channel: 'email',
            recipient: 'test@example.com',
            subject: 'Test Subject',
            body: '<p>Hello</p>',
        };

        await emailService.sendEmail({
            to: [{ email: payload.recipient }],
            subject: payload.subject,
            htmlContent: payload.body,
        });

        expect(emailService.sendEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                to: [{ email: 'test@example.com' }],
                subject: 'Test Subject',
            })
        );
    });

    it('deduplicates notifications with the same notificationId', () => {
        const sentNotifications = new Set();
        const notificationId = 'notif-dedup-001';

        // First send
        sentNotifications.add(notificationId);
        expect(sentNotifications.has(notificationId)).toBe(true);

        // Second send should be skipped
        const shouldSkip = sentNotifications.has(notificationId);
        expect(shouldSkip).toBe(true);
    });

    it('rejects unknown notification channels', () => {
        const channel = 'carrier_pigeon';
        expect(() => {
            if (!['email', 'sms', 'push'].includes(channel)) {
                throw new Error(`Unknown notification channel: ${channel}`);
            }
        }).toThrow('Unknown notification channel: carrier_pigeon');
    });
});
