const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createCheckoutSession } = require('../services/stripeService');
const Booking = require('../models/Booking');
const { sendReceiptEmail } = require('../services/emailService');
const jwt = require('jsonwebtoken');

// Auth middleware for payments supporting client cookie / bearer token and admin cookie / bearer token
const protectPayment = async (req, res, next) => {
  try {
    let token;
    
    // Check Client token first
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.client_token) {
      token = req.cookies.client_token;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.CLIENT_JWT_SECRET);
        req.user = {
          _id: decoded.client_id,
          email: decoded.email,
          role: 'client'
        };
        return next();
      } catch (err) {
        // Fall through to check admin auth
      }
    }

    // Check Admin token
    const adminToken = req.cookies.adminToken || req.cookies.portal_token || 
      (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : null);
      
    if (adminToken) {
      try {
        const decoded = jwt.verify(adminToken, process.env.JWT_SECRET);
        req.user = {
          _id: decoded.adminId,
          email: decoded.email,
          role: decoded.role || 'admin'
        };
        return next();
      } catch (err) {
        // Token invalid
      }
    }

    return res.status(401).json({ message: 'Not authorized to access this route' });
  } catch (err) {
    return res.status(500).json({ message: 'Server authentication error' });
  }
};

// Webhook endpoint (needs raw body parser)
// Registered BEFORE json body parser middleware on this router
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { bookingId } = session.metadata;

    try {
      const booking = await Booking.findByIdAndUpdate(
        bookingId,
        {
          isPaid: true,
          paymentMethod: 'stripe',
          status: 'confirmed',
          stripeSessionId: session.id,
          paidAt: new Date(),
          amountPaid: session.amount_total / 100
        },
        { new: true }
      ).populate('customerId');

      if (booking && booking.customerId) {
        try {
          await sendReceiptEmail({
            to: booking.customerId.email,
            clientName: booking.customerId.name,
            booking,
            paymentMethod: 'Stripe',
            currency: session.currency.toUpperCase(),
            amountPaid: session.amount_total / 100,
          });
          console.log(`[stripe/webhook] Receipt email sent successfully to ${booking.customerId.email}`);
        } catch (emailErr) {
          console.error('[stripe/webhook] Failed to send receipt email:', emailErr.message);
        }
      }
    } catch (dbErr) {
      console.error('[stripe/webhook] Database update error:', dbErr.message);
      return res.status(500).send(`Database Error: ${dbErr.message}`);
    }
  }

  res.json({ received: true });
});

// JSON body parsing for subsequent endpoints (since router is mounted before global body parser)
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// Client or admin initiates checkout
router.post('/create-checkout', protectPayment, async (req, res) => {
  try {
    const { bookingId, currency = 'kes' } = req.body;

    if (!/^[a-f\d]{24}$/i.test(bookingId)) {
      return res.status(400).json({ message: 'Invalid booking ID' });
    }

    const booking = await Booking.findById(bookingId).populate('customerId');

    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    // Admin can pay for any booking; client only their own
    if (req.user.role === 'client' && 
        booking.customerId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const clientUrl = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;

    const session = await createCheckoutSession({
      booking,
      currency,
      successUrl: `${clientUrl}/client/events/${bookingId}?payment=success`,
      cancelUrl: `${clientUrl}/client/events/${bookingId}?payment=cancelled`,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[stripe/create-checkout] error:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
