const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');
const AdminNotification = require('../models/AdminNotification');
const Gallery = require('../models/Gallery');
const { initializeEmailService, sendBusinessBookingNotification, sendClientBookingConfirmation, sendFollowUpEmail } = require('../services/emailService');
const { sendPushNotificationToAdmins } = require('../services/notificationService');
const { normalizePhone, normalizeEmail } = require('../utils/normalization');

// ── INITIALIZE EMAIL TRANSPORTER ──
initializeEmailService();

// ── STAFF SYSTEM WEBHOOK SYNC HELPER ──
const http = require('http');
const https = require('https');
function sendSyncWebhook(endpoint, payload) {
    const urlStr = `${process.env.STAFF_PORTAL_URL}/internal/${endpoint}`;
    if (!process.env.STAFF_PORTAL_URL) return;
    try {
        const url = new URL(urlStr);
        const data = JSON.stringify(payload);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Secret': process.env.JWT_SECRET || 'fallback_secret_key',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        const req = (url.protocol === 'https:' ? https : http).request(options);
        req.on('error', (e) => console.error(`[Webhook] Failed to sync ${endpoint}:`, e.message));
        req.write(data);
        req.end();
    } catch (e) {
        console.error(`[Webhook] Config error for ${endpoint}:`, e.message);
    }
}

const router = express.Router();

const EVENT_TYPE_ENUM = Booking.schema.path('eventType').enumValues;
const BUDGET_RANGE_ENUM = Booking.schema.path('budgetRange').enumValues;
const NEED_USHERS_ENUM = Booking.schema.path('needUshers').enumValues;

const EVENT_TYPE_ALIASES = {
    wedding: 'Wedding',
    'wedding reception': 'Wedding',
    anniversary: 'Anniversary',
    birthday: 'Birthday Party',
    'birthday party': 'Birthday Party',
    'house party': 'Family & House Party',
    'family party': 'Family & House Party',
    'family & house party': 'Family & House Party',
    'traditional ceremony': 'Traditional Ceremony',
    memorial: 'Memorial Service',
    'memorial service': 'Memorial Service',
    corporate: 'Corporate Event',
    'corporate event': 'Corporate Event',
    conference: 'Corporate Event',
    'brand ambassador event': 'Brand Ambassador Event',
    'product launch': 'Product Launch',
    celebration: 'Private Celebration',
    'private celebration': 'Private Celebration',
    'luxury decor': 'Luxury Decor & Styling',
    'luxury decor & styling': 'Luxury Decor & Styling',
    other: 'Other'
};

const BUDGET_RANGE_ALIASES = {
    low: 'Under KES 50,000',
    medium: 'KES 100,000 – 250,000',
    mid: 'KES 100,000 – 250,000',
    high: 'KES 250,000 – 500,000',
    '$1000-$5000': 'KES 100,000 – 250,000',
    '$5000-$10000': 'KES 250,000 – 500,000',
    '$10,000-$15,000': 'KES 500,000+',
    '$10000-$15000': 'KES 500,000+',
    '$5000-$7000': 'KES 500,000+',
    '$5000 - $7000': 'KES 500,000+',
    '5000-7000': 'KES 500,000+',
    '$10,000 - $15,000': 'KES 500,000+',
    'under 50000': 'Under KES 50,000',
    '50k-100k': 'KES 50,000 – 100,000',
    '100k-250k': 'KES 100,000 – 250,000',
    '250k-500k': 'KES 250,000 – 500,000',
    '500k+': 'KES 500,000+',
    unsure: 'Not Sure Yet',
    'not sure': 'Not Sure Yet',
    'not sure yet': 'Not Sure Yet'
};

const NEED_USHERS_ALIASES = {
    yes: 'Yes',
    no: 'No',
    'not specified': 'Not specified',
    unspecified: 'Not specified'
};

// ═══════════════════════════════════════════════════════════
// RATE LIMITING FOR SPAM PROTECTION
// ═══════════════════════════════════════════════════════════
const bookingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // 10 requests per 15 minutes
    message: 'Too many booking requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false
});

// ═══════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════

const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const validatePhone = (phone) => {
    // Accepts E.164 international numbers and common local digit-only formats.
    const normalized = String(phone).replace(/[\s()-]/g, '');
    const phoneRegex = /^\+?[1-9]\d{9,14}$/;
    return phoneRegex.test(normalized);
};

// Sanitize input to prevent XSS
const sanitizeInput = (str) => {
    if (typeof str !== 'string') return str;
    return str.trim().replace(/[<>]/g, '');
};

const canonicalizeEnum = (value, enumValues, aliases) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return trimmed;

    const directMatch = enumValues.find(item => item.toLowerCase() === trimmed.toLowerCase());
    if (directMatch) return directMatch;

    const aliasMatch = aliases[trimmed.toLowerCase()];
    return aliasMatch || trimmed;
};

const canonicalizeEnumOrDefault = (value, enumValues, aliases, fallbackValue) => {
    const canonical = canonicalizeEnum(value, enumValues, aliases);
    if (typeof canonical !== 'string') return fallbackValue;
    return enumValues.includes(canonical) ? canonical : fallbackValue;
};

const bookingValidationRules = [
    body('fullName')
        .exists({ checkFalsy: true }).withMessage('Full Name is required')
        .bail()
        .isString().withMessage('Full Name must be a string')
        .bail()
        .isLength({ min: 2 }).withMessage('Full Name must be at least 2 characters'),
    body('phone')
        .exists({ checkFalsy: true }).withMessage('phone is required')
        .bail()
        .custom(value => validatePhone(String(value))).withMessage('Phone number format is invalid'),
    body('email')
        .exists({ checkFalsy: true }).withMessage('Email is required')
        .bail()
        .isEmail().withMessage('Email address is invalid'),
    body('eventType')
        .exists({ checkFalsy: true }).withMessage('Event Type is required')
        .bail()
        .customSanitizer(value => canonicalizeEnumOrDefault(value, EVENT_TYPE_ENUM, EVENT_TYPE_ALIASES, 'Other'))
        .custom(value => EVENT_TYPE_ENUM.includes(value)).withMessage(`Event Type must be one of: ${EVENT_TYPE_ENUM.join(', ')}`),
    body('eventDate')
        .exists({ checkFalsy: true }).withMessage('eventDate is required')
        .bail()
        .isISO8601().withMessage('Event Date must be a valid date')
        .bail()
        .custom(value => {
            const eventDate = new Date(value);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return eventDate >= today;
        }).withMessage('Event Date must be in the future'),
    body('eventDuration')
        .exists({ checkFalsy: true }).withMessage('Event Duration is required')
        .bail()
        .isString().withMessage('Event Duration must be a string'),
    body('location')
        .exists({ checkFalsy: true }).withMessage('Event Location is required')
        .bail()
        .isString().withMessage('Event Location must be a string')
        .bail()
        .isLength({ min: 2 }).withMessage('Event Location must be at least 2 characters'),
    body('guestCount')
        .exists({ checkFalsy: true }).withMessage('Number of Guests is required')
        .bail()
        .isInt({ min: 1 }).withMessage('Number of Guests must be at least 1'),
    body('budgetRange')
        .exists({ checkFalsy: true }).withMessage('Estimated Investment is required')
        .bail()
        .customSanitizer(value => canonicalizeEnumOrDefault(value, BUDGET_RANGE_ENUM, BUDGET_RANGE_ALIASES, 'Not Sure Yet'))
        .custom(value => BUDGET_RANGE_ENUM.includes(value)).withMessage(`Budget Range must be one of: ${BUDGET_RANGE_ENUM.join(', ')}`),
    body('needUshers')
        .optional({ values: 'falsy' })
        .customSanitizer(value => canonicalizeEnum(value, NEED_USHERS_ENUM, NEED_USHERS_ALIASES))
        .custom(value => NEED_USHERS_ENUM.includes(value)).withMessage(`needUshers must be one of: ${NEED_USHERS_ENUM.join(', ')}`),
    body('usherCount')
        .optional({ values: 'falsy' })
        .isInt({ min: 1 }).withMessage('usherCount must be at least 1 when provided')
];

const handleBookingValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const rawErrors = errors.array();
        const fieldErrors = rawErrors.reduce((acc, err) => {
            const field = err.path || 'general';
            if (!acc[field]) acc[field] = [];
            acc[field].push(err.msg);
            return acc;
        }, {});

        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: rawErrors.map(err => err.msg),
            fieldErrors
        });
    }
    return next();
};

// Generate dynamic WhatsApp message
const generateWhatsAppMessage = (booking, customer) => {
    const eventDate = new Date(booking.eventDate).toLocaleDateString();
    const ushersInfo = booking.needUshers === 'Yes' ? `Yes (${booking.usherCount} ushers)` : (booking.needUshers || 'Not specified');
    const message = `Hi Emerald Pearland Events, I have a booking reference ${booking.bookingReference}. My event is ${booking.eventType} on ${eventDate} at ${booking.location} with ${booking.guests} guests. Ushers required: ${ushersInfo}.`;
    return message;
};

// ═══════════════════════════════════════════════════════════
// PUBLIC GALLERY ENDPOINT
// ═══════════════════════════════════════════════════════════
router.get('/gallery', async (req, res) => {
    try {
        const items = await Gallery.find().sort({ order: 1, uploadedAt: -1 });
        res.json({ success: true, gallery: items });
    } catch (error) {
        console.error('Error fetching public gallery:', error);
        res.status(500).json({ success: false, message: 'Error fetching gallery' });
    }
});

// ═══════════════════════════════════════════════════════════
// MAIN BOOKING ENDPOINT
// ═══════════════════════════════════════════════════════════

router.post('/book-event', bookingLimiter, bookingValidationRules, handleBookingValidationErrors, async (req, res) => {
    try {
        // Extract and sanitize data
        const rawData = req.body || {};
        const normalizedNeedUshers = canonicalizeEnum(rawData.needUshers, NEED_USHERS_ENUM, NEED_USHERS_ALIASES) || 'Not specified';
        const data = {
            fullName: sanitizeInput(rawData.fullName),
            phone: normalizePhone(sanitizeInput(rawData.phone)),
            email: normalizeEmail(sanitizeInput(rawData.email)),
            eventType: canonicalizeEnumOrDefault(sanitizeInput(rawData.eventType), EVENT_TYPE_ENUM, EVENT_TYPE_ALIASES, 'Other'),
            eventDate: rawData.eventDate,
            eventDuration: sanitizeInput(rawData.eventDuration),
            location: sanitizeInput(rawData.location),
            guestCount: parseInt(rawData.guestCount),
            budgetRange: canonicalizeEnumOrDefault(sanitizeInput(rawData.budgetRange), BUDGET_RANGE_ENUM, BUDGET_RANGE_ALIASES, 'Not Sure Yet'),
            needUshers: normalizedNeedUshers,
            usherCount: normalizedNeedUshers === 'Yes' && rawData.usherCount ? parseInt(rawData.usherCount) : null,
            specialRequests: sanitizeInput(rawData.specialRequests)
        };

        // ───────────────────────────────────────────────────────────
        // STEP 2: CHECK FOR EXISTING CUSTOMER / CREATE NEW
        // Searches by normalized email AND phone (including 01/07 variants)
        // ───────────────────────────────────────────────────────────
        let customer = await Customer.findOne({
            $or: [
                { email: data.email },
                { phone: data.phone }
            ]
        });

        // Fallback: try original (unnormalized) phone in case DB has legacy data
        if (!customer && rawData.phone) {
            const rawPhone = sanitizeInput(rawData.phone);
            customer = await Customer.findOne({ phone: rawPhone });
        }

        if (customer) {
            // Existing customer - mark as returning, update contact info
            if (!customer.tags.includes('returning')) {
                customer.tags = ['returning'];
            }
            customer.lastContactDate = new Date();
            customer.totalBookings += 1;
            // Sync normalized values so future lookups match
            if (customer.email !== data.email) customer.email = data.email;
            if (customer.phone !== data.phone) customer.phone = data.phone;
            console.log(`[BOOKING] Matched existing customer: ${customer.name} (${customer.email})`);
        } else {
            // New customer - create record with normalized phone/email
            customer = new Customer({
                name: data.fullName,
                email: data.email,
                phone: data.phone,
                tags: ['new'],
                totalBookings: 1,
                firstContactDate: new Date()
            });
            console.log(`[BOOKING] Created new customer: ${data.fullName} (${data.email}, ${data.phone})`);
        }

        await customer.save();

        // ───────────────────────────────────────────────────────────
        // STEP 3: CREATE BOOKING RECORD
        // ───────────────────────────────────────────────────────────
        const booking = new Booking({
            customerId: customer._id,
            eventType: data.eventType,
            eventDate: new Date(data.eventDate),
            eventDuration: data.eventDuration,
            location: data.location,
            guests: data.guestCount,
            budgetRange: data.budgetRange,
            needUshers: data.needUshers,
            usherCount: data.usherCount,
            notes: data.specialRequests,
            status: 'new',
            selectedServices: []
        });

        await booking.save();

        // ───────────────────────────────────────────────────────────
        // STEP 3.5: SYNC WITH STAFF SYSTEM
        // ───────────────────────────────────────────────────────────
        sendSyncWebhook('sync-booking', {
            title: data.eventType,
            description: data.specialRequests,
            location: data.location,
            date: data.eventDate,
            start_time: '08:00', // Default, assumes staff check UI
            end_time: '17:00',
            pay_rate: 1000,
            required_staff_count: 1, // AI engine will auto-adjust this
            booking_ref: booking.bookingReference,
            client_name: customer.name,
            client_email: customer.email,
            clientPaymentAmount: 0,
            usherCount: data.usherCount
        });

        // ───────────────────────────────────────────────────────────
        // STEP 3.6: CREATE ADMIN NOTIFICATION
        // ───────────────────────────────────────────────────────────
        const notificationMessage = `New booking request from ${data.fullName} for a ${data.eventType}.`;
        const notification = new AdminNotification({
            type: 'new_booking',
            message: notificationMessage,
            bookingRef: booking._id,
            icon: 'book',
            action: `/admin/bookings`
        });
        await notification.save();

        // Send Push Notification immediately to any subscribed admin devices
        sendPushNotificationToAdmins({
            title: 'New Booking Received!',
            body: notificationMessage,
            icon: '/images/logo 2.png',
            url: `/admin/bookings?highlight=${booking._id}`
        });

        // ───────────────────────────────────────────────────────────
        // STEP 4: SEND EMAILS (admin + client in parallel, independent)
        // Neither email failing will block the other or the response.
        // ───────────────────────────────────────────────────────────
        const emailPromises = [];

        // Email 1: To business admin
        emailPromises.push(
            sendBusinessBookingNotification(booking, customer)
                .then(() => console.log(`[BOOKING] ✅ Admin notification sent for ${booking.bookingReference}`))
                .catch(err => console.error(`[BOOKING] ❌ Admin notification FAILED for ${booking.bookingReference}:`, err.message))
        );

        // Email 2: To client — immediate thank-you
        emailPromises.push(
            sendClientBookingConfirmation(booking, customer)
                .then(async () => {
                    console.log(`[BOOKING] ✅ Client confirmation sent for ${booking.bookingReference}`);
                    try {
                        booking.emailSentAt = new Date();
                        await booking.save();
                    } catch (saveErr) {
                        console.error('[BOOKING] Failed to update emailSentAt:', saveErr.message);
                    }
                })
                .catch(err => console.error(`[BOOKING] ❌ Client confirmation FAILED for ${booking.bookingReference}:`, err.message))
        );

        // Wait for both emails to settle (success or fail), but don't block the response
        // We use Promise.allSettled so neither rejection kills the other
        await Promise.allSettled(emailPromises);

        // Email 3: Delayed follow-up to client (~5 minutes later)
        const bookingSnapshot = { ...booking.toObject() };
        const customerSnapshot = { ...customer.toObject() };
        setTimeout(async () => {
            try {
                await sendFollowUpEmail(bookingSnapshot, customerSnapshot);
                console.log(`[BOOKING] ✅ Follow-up email sent for ${bookingSnapshot.bookingReference}`);
            } catch (followUpError) {
                console.error(`[BOOKING] ❌ Follow-up email FAILED for ${bookingSnapshot.bookingReference}:`, followUpError.message);
            }
        }, 5 * 60 * 1000);

        // ───────────────────────────────────────────────────────────
        // STEP 5: GENERATE WHATSAPP LINK
        // ───────────────────────────────────────────────────────────
        const whatsappMessage = generateWhatsAppMessage(booking, customer);
        const encodedMessage = encodeURIComponent(whatsappMessage);
        const whatsappUrl = `https://wa.me/254722446937?text=${encodedMessage}`;

        // ───────────────────────────────────────────────────────────
        // STEP 6: RETURN SUCCESS RESPONSE
        // ───────────────────────────────────────────────────────────
        res.status(200).json({
            success: true,
            message: 'Booking received',
            whatsappUrl: whatsappUrl,
            whatsappLink: whatsappUrl,
            bookingId: booking._id,
            bookingReference: booking.bookingReference,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[BOOKING] Error processing booking:', error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: Object.values(error.errors).map(err => err.message)
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error processing booking',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ═══════════════════════════════════════════════════════════
// GET BOOKING DETAILS (for admin dashboard - optional)
// ═══════════════════════════════════════════════════════════
router.get('/booking/:bookingId', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.bookingId)
            .populate('customerId', 'name email phone');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        res.json({
            success: true,
            booking: booking
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error retrieving booking'
        });
    }
});

// ═══════════════════════════════════════════════════════════
// UPDATE BOOKING STATUS (for admin use)
// ═══════════════════════════════════════════════════════════
router.patch('/booking/:bookingId/status', async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['new', 'contacted', 'confirmed', 'completed', 'cancelled'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const booking = await Booking.findByIdAndUpdate(
            req.params.bookingId,
            { status: status, updatedAt: new Date() },
            { new: true }
        );

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        res.json({
            success: true,
            message: 'Booking status updated',
            booking: booking
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating booking'
        });
    }
});

module.exports = router;
