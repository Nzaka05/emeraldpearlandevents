const express = require('express');
const rateLimit = require('express-rate-limit');
const Booking = require('../models/Booking');
const Customer = require('../models/Customer');
const AdminNotification = require('../models/AdminNotification');
const Gallery = require('../models/Gallery');
const { initializeEmailService, sendBusinessBookingNotification, sendClientBookingConfirmation, sendFollowUpEmail } = require('../services/emailService');

// ── INITIALIZE EMAIL TRANSPORTER ──
initializeEmailService();

const router = express.Router();

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
    // Accepts international format: +254722446937 or 0722446937 or 722446937
    const phoneRegex = /^(\+?254|0)?[1-9]\d{8,}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
};

const validateBookingData = (data) => {
    const errors = [];

    if (!data.fullName || data.fullName.trim().length < 2) {
        errors.push('Full Name must be at least 2 characters');
    }

    if (!validatePhone(data.phone)) {
        errors.push('Phone number format is invalid');
    }

    if (!validateEmail(data.email)) {
        errors.push('Email address is invalid');
    }

    if (!data.eventType || data.eventType.trim() === '') {
        errors.push('Event Type is required');
    }

    if (!data.eventDate) {
        errors.push('Event Date is required');
    } else {
        const eventDate = new Date(data.eventDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (eventDate < today) {
            errors.push('Event Date must be in the future');
        }
    }

    if (!data.eventDuration || data.eventDuration.trim() === '') {
        errors.push('Event Duration is required');
    }

    if (!data.location || data.location.trim().length < 2) {
        errors.push('Event Location must be at least 2 characters');
    }

    if (!data.guestCount || parseInt(data.guestCount) < 1) {
        errors.push('Number of Guests must be at least 1');
    }

    if (!data.budgetRange || data.budgetRange.trim() === '') {
        errors.push('Estimated Investment is required');
    }

    return errors;
};

// Sanitize input to prevent XSS
const sanitizeInput = (str) => {
    if (typeof str !== 'string') return str;
    return str.trim().replace(/[<>]/g, '');
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

router.post('/book-event', bookingLimiter, async (req, res) => {
    try {
        // Extract and sanitize data
        const rawData = req.body;
        const data = {
            fullName: sanitizeInput(rawData.fullName),
            phone: sanitizeInput(rawData.phone),
            email: sanitizeInput(rawData.email),
            eventType: sanitizeInput(rawData.eventType),
            eventDate: rawData.eventDate,
            eventDuration: sanitizeInput(rawData.eventDuration),
            location: sanitizeInput(rawData.location),
            guestCount: parseInt(rawData.guestCount),
            budgetRange: sanitizeInput(rawData.budgetRange),
            needUshers: sanitizeInput(rawData.needUshers),
            usherCount: rawData.needUshers === 'Yes' ? parseInt(rawData.usherCount) : null,
            specialRequests: sanitizeInput(rawData.specialRequests)
        };

        // ───────────────────────────────────────────────────────────
        // STEP 1: VALIDATE INPUT
        // ───────────────────────────────────────────────────────────
        const validationErrors = validateBookingData(data);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validationErrors
            });
        }

        // ───────────────────────────────────────────────────────────
        // STEP 2: CHECK FOR EXISTING CUSTOMER / CREATE NEW
        // ───────────────────────────────────────────────────────────
        let customer = await Customer.findOne({
            $or: [
                { email: data.email },
                { phone: data.phone }
            ]
        });

        if (customer) {
            // Existing customer - mark as returning
            if (!customer.tags.includes('returning')) {
                customer.tags = ['returning'];
            }
            customer.lastContactDate = new Date();
            customer.totalBookings += 1;
        } else {
            // New customer - create record
            customer = new Customer({
                name: data.fullName,
                email: data.email,
                phone: data.phone,
                tags: ['new'],
                totalBookings: 1,
                firstContactDate: new Date()
            });
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
        // STEP 3.5: CREATE ADMIN NOTIFICATION
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

        // ───────────────────────────────────────────────────────────
        // STEP 4: SEND EMAILS
        // ───────────────────────────────────────────────────────────
        try {
            // Email 1: To business
            await sendBusinessBookingNotification(booking, customer);
            console.log(`[BOOKING] Business notification sent for ${booking.bookingReference}`);
        } catch (emailError) {
            console.error('[BOOKING] Failed to send business notification:', emailError.message);
            // Don't fail the booking if email fails
        }

        try {
            // Email 2: To client — immediate thank-you
            await sendClientBookingConfirmation(booking, customer);
            console.log(`[BOOKING] Client confirmation sent for ${booking.bookingReference}`);
            booking.emailSentAt = new Date();
            await booking.save();

            // Email 3: Delayed follow-up to client (~90 seconds later)
            const bookingSnapshot = { ...booking.toObject() };
            const customerSnapshot = { ...customer.toObject() };
            setTimeout(async () => {
                try {
                    await sendFollowUpEmail(bookingSnapshot, customerSnapshot);
                    console.log(`[BOOKING] Follow-up email sent for ${bookingSnapshot.bookingReference}`);
                } catch (followUpError) {
                    console.error('[BOOKING] Failed to send follow-up email:', followUpError.message);
                }
            }, 5 * 60 * 1000); // 5 minutes
        } catch (emailError) {
            console.error('[BOOKING] Failed to send client confirmation:', emailError.message);
        }

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
            message: 'Booking request received successfully',
            whatsappUrl: whatsappUrl,
            bookingId: booking._id,
            bookingReference: booking.bookingReference,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[BOOKING] Error processing booking:', error);
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
