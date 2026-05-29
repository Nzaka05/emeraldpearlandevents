const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { initializeTransaction, verifyTransaction } = require('../services/paystackService');
const Booking = require('../models/Booking');
const { sendReceiptEmail } = require('../services/emailService');
const jwt = require('jsonwebtoken');

// ─────────────────────────────────────────────────────────────
// Auth middleware — identical to stripeRoutes (client cookie + admin bearer)
// ─────────────────────────────────────────────────────────────
const protectPayment = async (req, res, next) => {
    try {
        let token;

        // Check Client token
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.cookies && req.cookies.client_token) {
            token = req.cookies.client_token;
        }

        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.CLIENT_JWT_SECRET);
                req.user = { _id: decoded.client_id, email: decoded.email, role: 'client' };
                return next();
            } catch (_) { /* fall through to admin */ }
        }

        // Check Admin token
        const adminToken = req.cookies?.adminToken || req.cookies?.portal_token ||
            (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : null);

        if (adminToken) {
            try {
                const decoded = jwt.verify(adminToken, process.env.JWT_SECRET);
                req.user = { _id: decoded.adminId, email: decoded.email, role: decoded.role || 'admin' };
                return next();
            } catch (_) { /* invalid */ }
        }

        return res.status(401).json({ message: 'Not authorized to access this route' });
    } catch (err) {
        return res.status(500).json({ message: 'Server authentication error' });
    }
};

// ─────────────────────────────────────────────────────────────
// Webhook — Paystack POSTs here with raw JSON body
// Must be registered BEFORE the global json body-parser
// ─────────────────────────────────────────────────────────────
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    // Validate HMAC signature
    const hash = crypto
        .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(req.body)
        .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
        console.error('[paystack/webhook] Signature mismatch');
        return res.sendStatus(400);
    }

    let event;
    try {
        event = JSON.parse(req.body.toString());
    } catch (err) {
        console.error('[paystack/webhook] Invalid JSON:', err.message);
        return res.sendStatus(400);
    }

    if (event.event === 'charge.success') {
        const data = event.data;
        const bookingId = data.metadata?.booking_id;

        if (!bookingId) {
            console.warn('[paystack/webhook] No booking_id in metadata');
            return res.sendStatus(200);
        }

        try {
            const booking = await Booking.findByIdAndUpdate(
                bookingId,
                {
                    isPaid: true,
                    paymentMethod: 'paystack',
                    status: 'confirmed',
                    paystackReference: data.reference,
                    paidAt: new Date(),
                    amountPaid: data.amount / 100
                },
                { new: true }
            ).populate('customerId');

            if (booking && booking.customerId) {
                try {
                    await sendReceiptEmail({
                        to: booking.customerId.email,
                        clientName: booking.customerId.name,
                        booking,
                        paymentMethod: 'Paystack',
                        currency: (data.currency || 'KES').toUpperCase(),
                        amountPaid: data.amount / 100
                    });
                    console.log(`[paystack/webhook] Receipt email sent to ${booking.customerId.email}`);
                } catch (emailErr) {
                    console.error('[paystack/webhook] Receipt email failed:', emailErr.message);
                }
            }
        } catch (dbErr) {
            console.error('[paystack/webhook] DB update error:', dbErr.message);
            return res.status(500).send('Database Error');
        }
    }

    res.sendStatus(200);
});

// ─────────────────────────────────────────────────────────────
// JSON body parsing for remaining routes
// ─────────────────────────────────────────────────────────────
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────────────────────
// Initialize — client starts a Paystack payment
// ─────────────────────────────────────────────────────────────
router.post('/initialize', protectPayment, async (req, res) => {
    try {
        const { bookingId, currency = 'KES' } = req.body;

        if (!/^[a-f\d]{24}$/i.test(bookingId)) {
            return res.status(400).json({ message: 'Invalid booking ID' });
        }

        const booking = await Booking.findById(bookingId).populate('customerId');
        if (!booking) return res.status(404).json({ message: 'Booking not found' });

        // Admin can pay any booking; client only their own
        if (req.user.role === 'client' &&
            booking.customerId._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;
        const callbackUrl = `${clientUrl}/api/payments/paystack/callback?bookingId=${booking._id}`;

        const data = await initializeTransaction({ booking, currency, callbackUrl });

        res.json({
            authorization_url: data.authorization_url,
            access_code: data.access_code,
            reference: data.reference
        });
    } catch (err) {
        console.error('[paystack/initialize] error:', err);
        res.status(500).json({ message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────
// Callback — Paystack redirects user here after payment
// Verifies the transaction and redirects to the event detail page
// ─────────────────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
    const { trxref, reference, bookingId } = req.query;
    const ref = reference || trxref;

    if (!ref || !bookingId) {
        return res.redirect('/client/dashboard');
    }

    try {
        const verification = await verifyTransaction(ref);

        if (verification.status === 'success') {
            // Update booking (idempotent — webhook may have already done this)
            await Booking.findByIdAndUpdate(
                bookingId,
                {
                    isPaid: true,
                    paymentMethod: 'paystack',
                    status: 'confirmed',
                    paystackReference: ref,
                    paidAt: new Date(),
                    amountPaid: verification.amount / 100
                }
            );
            return res.redirect(`/client/events/${bookingId}?payment=success`);
        } else {
            return res.redirect(`/client/events/${bookingId}?payment=cancelled`);
        }
    } catch (err) {
        console.error('[paystack/callback] verification error:', err.message);
        return res.redirect(`/client/events/${bookingId}?payment=cancelled`);
    }
});

module.exports = router;
