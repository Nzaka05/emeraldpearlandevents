require('dotenv').config();
require('./scripts/checkEnv'); // Halt dynamically before server boots if environment is mismatched

const express = require('express');
const http = require('http');
const path = require('path');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');
const csrf = require('csurf');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

// ── TWILIO CLIENT (optional – only used if credentials are set) ──
let twilioClient = null;
try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        const twilio = require('twilio');
        twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        console.log('✅ Twilio initialized');
    } else {
        console.warn('⚠️  Twilio credentials not set – WhatsApp SMS disabled');
    }
} catch (err) {
    console.warn('⚠️  Twilio package not installed – WhatsApp SMS disabled:', err.message);
}

// ── ANALYTICS MODEL ──
const Analytics = require('./server/models/Analytics');

// ── BOOKING ROUTER ──
const bookingRoutes = require('./server/routes/bookingRoutes');

// ── ADMIN ROUTER ──
const adminRoutes = require('./server/routes/adminRoutes');
const adminCommandCenterRoutes = require('./server/routes/adminCommandCenterRoutes');

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB connection error:', err.message));

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "res.cloudinary.com"],
      connectSrc: ["'self'", "wss:", "ws:"]
    }
  }
}));
app.use(compression());
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
}
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ── EJS SETUP FOR STAFF PORTAL ──
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');



// ── MIDDLEWARE ──
app.use(cookieParser());
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:4000',
        'http://localhost:4200',
        'http://localhost:5500',
        'http://localhost:5501',
        'http://localhost:8000',
        'http://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:4000',
        'http://127.0.0.1:4200',
        'http://127.0.0.1:5501',
        'http://127.0.0.1:8000',
        'http://127.0.0.1:8080',
        'https://emeraldpearlandevents.netlify.app',
        'https://emeraldpearlandevents.onrender.com',
        'null' // file:// protocol (opening HTML directly)
    ],
    credentials: true
}));

// serve admin static UI files so they load from the same origin as the API
// allow requests like /admin/bookings to resolve to bookings.html
app.use('/admin', express.static(path.join(__dirname, 'admin'), {
    extensions: ['html'],
    index: false
}));

app.get('/admin/bookings/new', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'new-booking.html'));
});

// fallback for any other /admin/* path that doesn't match a file
app.get('/admin/*', (req, res) => {
    // Completely ignore query parameters (like ?new=1) for route matching
    const urlWithoutQuery = req.url.split('?')[0];
    const page = urlWithoutQuery.replace('/admin/', '');

    // prevent directory traversal
    if (page.includes('..')) return res.status(400).send('Bad request');

    res.sendFile(path.join(__dirname, 'admin', page + '.html'), err => {
        if (err) res.status(404).send('Admin page not found');
    });
});

// redirect bare /admin to login
app.get('/admin', (req, res) => {
    res.redirect('/admin/login');
});

// ── PUBLIC HTML ROUTES ──
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/booking.html', (req, res) => res.sendFile(path.join(__dirname, 'booking.html')));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// ── RATE LIMITING (Prevent spam) ──
const bookingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // 15 requests per 15 minutes
    message: 'Too many booking requests. Please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter rate limiting for admin endpoints
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 requests per window
    message: { success: false, message: 'Too many admin requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// ── EMAIL CONFIGURATION ──
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

// ── VALIDATION FUNCTIONS ──
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePhone(phone) {
    // Accept numbers, +, -, (), and spaces
    const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
}

function validateBookingData(data) {
    const errors = [];

    if (!data.fullName || data.fullName.trim().length < 2) {
        errors.push('Full Name is required (min 2 characters)');
    }

    if (!data.phone || !validatePhone(data.phone)) {
        errors.push('Valid phone number is required');
    }

    if (!data.email || !validateEmail(data.email)) {
        errors.push('Valid email is required');
    }

    if (!data.eventType || data.eventType.trim() === '') {
        errors.push('Event Type is required');
    }

    if (!data.eventDate || new Date(data.eventDate) < new Date()) {
        errors.push('Event Date must be in the future');
    }

    if (!data.eventTime || data.eventTime.trim() === '') {
        errors.push('Event Time is required');
    }

    if (!data.location || data.location.trim().length < 3) {
        errors.push('Location is required');
    }

    if (!data.guestCount || parseInt(data.guestCount) < 1) {
        errors.push('Number of guests must be at least 1');
    }

    if (!data.budgetRange || data.budgetRange.trim() === '') {
        errors.push('Estimated Investment range is required');
    }

    return errors;
}

// ── FORMAT BOOKING DETAILS FOR EMAIL ──
function formatBookingEmail(data) {
    return `
    <html>
    <head>
        <style>
            body { font-family: 'Cormorant Garamond', serif; background: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #0a2f1c 0%, #2d8a5e 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
            .content { padding: 30px; }
            .section { margin-bottom: 25px; }
            .section-title { font-size: 14px; text-transform: uppercase; letter-spacing: 0.2em; color: #d4af37; font-weight: 600; margin-bottom: 12px; }
            .detail { margin: 10px 0; }
            .detail-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.15em; color: #888; }
            .detail-value { font-size: 16px; color: #333; margin-top: 4px; }
            .footer { background: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #eee; }
            .footer p { margin: 5px 0; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>✨ NEW EVENT BOOKING REQUEST ✨</h1>
                <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">Emerald Pearland Events Premium Booking</p>
            </div>
            <div class="content">
                <div class="section">
                    <div class="section-title">CLIENT INFORMATION</div>
                    <div class="detail">
                        <div class="detail-label">Full Name</div>
                        <div class="detail-value">${escapeHtml(data.fullName)}</div>
                    </div>
                    <div class="detail">
                        <div class="detail-label">Phone Number</div>
                        <div class="detail-value">${escapeHtml(data.phone)}</div>
                    </div>
                    <div class="detail">
                        <div class="detail-label">Email Address</div>
                        <div class="detail-value">${escapeHtml(data.email)}</div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">EVENT DETAILS</div>
                    <div class="detail">
                        <div class="detail-label">Event Type</div>
                        <div class="detail-value">${escapeHtml(data.eventType)}</div>
                    </div>
                    <div class="detail">
                        <div class="detail-label">Event Date</div>
                        <div class="detail-value">${new Date(data.eventDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    </div>
                    <div class="detail">
                        <div class="detail-label">Event Time</div>
                        <div class="detail-value">${escapeHtml(data.eventTime)}</div>
                    </div>
                    <div class="detail">
                        <div class="detail-label">Location</div>
                        <div class="detail-value">${escapeHtml(data.location)}</div>
                    </div>
                    <div class="detail">
                        <div class="detail-label">Number of Guests</div>
                        <div class="detail-value">${data.guestCount} guests</div>
                    </div>
                    <div class="detail">
                        <div class="detail-label">Estimated Investment</div>
                        <div class="detail-value">${escapeHtml(data.budgetRange)}</div>
                    </div>
                </div>

                ${data.specialRequests ? `
                <div class="section">
                    <div class="section-title">Special Requests & Notes</div>
                    <div class="detail">
                        <div class="detail-value" style="font-style: italic; padding: 15px; background: #f9f9f9; border-left: 3px solid #d4af37; border-radius: 4px;">
                            ${escapeHtml(data.specialRequests)}
                        </div>
                    </div>
                </div>
                ` : ''}

                <div class="section">
                    <div class="section-title">Booking Timestamp</div>
                    <div class="detail">
                        <div class="detail-value">${new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })}</div>
                    </div>
                </div>
            </div>
            <div class="footer">
                <p><strong>Next Step:</strong> Contact client via phone or email to confirm booking details</p>
                <p style="margin-top: 15px; font-size: 11px; color: #999;">
                    This is an automated booking notification from Emerald Pearland Events Premium Booking System
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
}

// ── FORMAT BOOKING CONFIRMATION EMAIL (Immediate - Reassuring) ──
function formatBookingConfirmationEmail(data) {
    return `
    <html>
    <head>
        <style>
            body { font-family: 'Cormorant Garamond', serif; background: linear-gradient(135deg, #f5f5f5 0%, #fafafa 100%); margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 14px; overflow: hidden; box-shadow: 0 12px 50px rgba(0,0,0,0.12); }
            .header { background: linear-gradient(135deg, #0a2f1c 0%, #2d8a5e 100%); color: white; padding: 40px 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 32px; font-weight: 300; letter-spacing: 0.05em; }
            .header p { margin: 12px 0 0 0; font-size: 15px; opacity: 0.95; font-weight: 300; }
            .content { padding: 40px 30px; }
            .greeting { font-size: 18px; color: #0a2f1c; margin-bottom: 25px; line-height: 1.6; }
            .greeting strong { font-weight: 600; }
            .confirmation-box { background: linear-gradient(135deg, #f0f8f4 0%, #e8f5f1 100%); padding: 25px; border-radius: 10px; border-left: 5px solid #d4af37; margin: 30px 0; }
            .confirmation-box h3 { margin: 0 0 15px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.2em; color: #0a2f1c; }
            .confirmation-box p { margin: 10px 0; font-size: 15px; color: #333; line-height: 1.6; }
            .icon { font-size: 28px; margin-bottom: 10px; }
            .next-steps { background: #fafafa; padding: 20px; border-radius: 8px; margin: 25px 0; }
            .next-steps h4 { margin: 0 0 12px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.15em; color: #666; font-weight: 600; }
            .next-steps p { margin: 8px 0; font-size: 14px; color: #555; }
            .whatsapp-section { background: linear-gradient(135deg, #25D366 0%, #1fb154 100%); color: white; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center; }
            .whatsapp-section p { margin: 0 0 10px 0; font-size: 14px; }
            .whatsapp-link { display: inline-block; background: rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 6px; text-decoration: none; color: white; font-weight: 600; font-size: 14px; }
            .closing { font-size: 15px; color: #333; margin-top: 30px; line-height: 1.6; }
            .footer { background: #f9f9f9; padding: 25px 30px; text-align: center; border-top: 1px solid #eee; }
            .footer p { margin: 5px 0; font-size: 12px; color: #888; }
            .signature { font-size: 14px; font-weight: 600; color: #0a2f1c; margin-top: 15px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>✨ Your Event Request Has Been Received</h1>
                <p>Emerald Pearland Events Concierge</p>
            </div>
            <div class="content">
                <div class="greeting">
                    Hello <strong>${escapeHtml(data.fullName)}</strong>,
                </div>

                <p style="font-size: 15px; color: #333; line-height: 1.6;">
                    Thank you for choosing <strong>Emerald Pearland Events</strong>. We're thrilled to have the opportunity to make your event extraordinary.
                </p>

                <div class="confirmation-box">
                    <div class="icon">✓</div>
                    <h3>Confirmation</h3>
                    <p>
                        Your event request has been successfully received and logged into our system. Our dedicated event concierge team is now reviewing your requirements to ensure we can deliver the exceptional experience you deserve.
                    </p>
                </div>

                <div class="next-steps">
                    <h4>What Happens Next?</h4>
                    <p>📞 <strong>24-Hour Contact:</strong> A member of our team will contact you within the next 24 hours to confirm availability and discuss your vision in detail.</p>
                    <p>💼 <strong>Personalized Proposal:</strong> We'll prepare a tailored proposal based on your specific requirements and investment range.</p>
                    <p>✨ <strong>Premium Planning:</strong> Together, we'll refine every detail to create an unforgettable experience.</p>
                </div>

                <div class="whatsapp-section">
                    <p style="font-size: 14px; margin: 0 0 12px 0;">If your request is time-sensitive, connect with us directly:</p>
                    <a href="https://wa.me/254722446937?text=Hi%20Emerald%20Pearland%20Events%2C%20I%20have%20a%20booking%20request%20and%20would%20like%20to%20discuss%20it." class="whatsapp-link">💬 Chat on WhatsApp</a>
                </div>

                <p style="font-size: 14px; color: #666; margin-top: 25px;">
                    A detailed summary of your event request will arrive shortly. This will include all the information you provided, so you can review and make any adjustments if needed.
                </p>

                <div class="closing">
                    We look forward to delivering an exceptional experience and exceeding your expectations.
                    <div class="signature">
                        Emerald Pearland Events<br>
                        <span style="color: #888; font-size: 12px; font-weight: 400;">Premium Event Management & Concierge</span>
                    </div>
                </div>
            </div>
            <div class="footer">
                <p><strong>Emerald Pearland Events</strong></p>
                <p>📱 WhatsApp: +254 722 446 937 | 📧 Email: ${process.env.EMAIL_USER}</p>
                <p style="margin-top: 12px; color: #aaa;">Making extraordinary moments unforgettable.</p>
            </div>
        </div>
    </body>
    </html>
    `;
}

// ── FORMAT CLIENT CONFIRMATION EMAIL ──
function formatClientConfirmationEmail(data) {
    return `
    <html>
    <head>
        <style>
            body { font-family: 'Cormorant Garamond', serif; background: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #0a2f1c 0%, #2d8a5e 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
            .content { padding: 30px; }
            .section { margin-bottom: 25px; }
            .section-title { font-size: 14px; text-transform: uppercase; letter-spacing: 0.2em; color: #d4af37; font-weight: 600; margin-bottom: 12px; }
            .detail { margin: 10px 0; }
            .detail-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.15em; color: #888; }
            .detail-value { font-size: 16px; color: #333; margin-top: 4px; }
            .footer { background: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #eee; }
            .footer p { margin: 5px 0; font-size: 12px; color: #666; }
            .highlight { background: #f0f8f4; padding: 15px; border-radius: 8px; border-left: 4px solid #d4af37; margin: 15px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📋 Event Summary</h1>
                <p style="margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">Your Complete Booking Details</p>
            </div>
            <div class="content">
                <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
                    Dear ${escapeHtml(data.fullName)},
                </p>

                <div class="highlight">
                    <p style="margin: 0; font-size: 14px; color: #0a2f1c;">
                        Below is a complete summary of your event request. If any details require adjustment, simply reply to this email or contact us directly via WhatsApp at +254 722 446 937.
                    </p>
                </div>

                <div class="section">
                    <div class="section-title">Booking Summary</div>
                    <div class="detail">
                        <div class="detail-label">Event Type</div>
                        <div class="detail-value">${escapeHtml(data.eventType)}</div>
                    </div>
                    <div class="detail">
                        <div class="detail-label">Event Date</div>
                        <div class="detail-value">${new Date(data.eventDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                    </div>
                        <div class="detail-label">Location</div>
                        <div class="detail-value">${escapeHtml(data.location)}</div>
                    </div>
                    <div class="detail">
                        <div class="detail-label">Number of Guests</div>
                        <div class="detail-value">${data.guestCount} guests</div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">Your Investment</div>
                    <div class="detail">
                        <div class="detail-value" style="font-style: italic; color: #2d8a5e; font-weight: 600;">
                            Estimated Range: ${escapeHtml(data.budgetRange)}
                        </div>
                    </div>
                    <p style="margin-top: 10px; font-size: 0.9rem; color: #666;">
                        Our team will tailor recommendations and staffing levels based on your selected investment range to deliver maximum value.
                    </p>
                </div>

                <div class="section">
                    <div class="section-title">What Happens Next?</div>
                    <p style="margin: 0 0 10px 0; color: #333;">✅ Your booking request has been received</p>
                    <p style="margin: 0 0 10px 0; color: #333;">📞 Our team will contact you within 24 hours</p>
                    <p style="margin: 0 0 10px 0; color: #333;">💼 We'll discuss pricing and available packages</p>
                    <p style="margin: 0; color: #333;">✨ Finalize your event details and confirm booking</p>
                </div>

                <div class="section">
                    <p style="margin: 0; font-size: 14px; color: #666;">
                        <strong>Contact Information:</strong><br>
                        📧 Email: emeraldpearlandevents@gmail.com<br>
                        📱 Phone: ${process.env.BUSINESS_WHATSAPP_NUMBER || '+254722446937'}
                    </p>
                </div>
            </div>
            <div class="footer">
                <p style="margin: 0 0 10px 0;"><strong>Emerald Pearland Events</strong></p>
                <p style="margin: 5px 0; font-size: 11px; color: #999;">
                    Premium Event Planning & Coordination
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
}

// ── FORMAT BOOKING FOR WHATSAPP ──
function generateWhatsAppMessage(data) {
    const message = `*🎉 EVENT BOOKING REQUEST*

*Client Details:*
Name: ${data.fullName}
Phone: ${data.phone}
Email: ${data.email}

*Event Specifications:*
Type: ${data.eventType}
Date: ${new Date(data.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
Time: ${data.eventTime}
Location: ${data.location}
Guests: ${data.guestCount}

${data.budgetRange ? `*Estimated Investment:*\n${data.budgetRange}\n` : ''}
${data.specialRequests ? `*Special Requests:*\n${data.specialRequests}\n` : ''}

*Sent from:* Emerald Pearland Events Booking System`;

    return encodeURIComponent(message);
}

// ── SEND WHATSAPP MESSAGE VIA TWILIO ──
async function sendWhatsAppMessage(phoneNumber, messageText) {
    try {
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
            console.warn('⚠️ Twilio not configured. WhatsApp message skipped.');
            return false;
        }

        // Decode the message first (since generateWhatsAppMessage returns encoded text)
        const decodedMessage = decodeURIComponent(messageText);

        await twilioClient.messages.create({
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: `whatsapp:${phoneNumber}`,
            body: decodedMessage
        });

        console.log(`✅ WhatsApp message sent to: ${phoneNumber}`);
        return true;
    } catch (error) {
        console.error('❌ WhatsApp sending failed:', error.message);
        return false;
    }
}

// ── SECURITY: Escape HTML to prevent injection ──
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ═══════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════

// ── HEALTH CHECK ──
app.get('/api/health', (req, res) => {
    res.json({ status: 'Server is running', timestamp: new Date() });
});

// ── BOOKING ROUTES (handles /api/book-event, saves to MongoDB) ──
app.use('/api', bookingRoutes);

// ── ADMIN ROUTES (handles /api/admin/login, /api/admin/change-password, etc) ──
app.use('/api/admin', adminLimiter, adminRoutes);
app.use('/admin/command-center', adminCommandCenterRoutes);

// ── CLIENT PORTAL ROUTES ──
const clientPortalRoutes = require('./server/routes/clientPortalRoutes');
app.use('/client', clientPortalRoutes);

// ── ANALYTICS TRACKING ENDPOINT ──
app.post('/api/analytics/event', async (req, res) => {
    try {
        const { eventType, parameter, timestamp } = req.body;

        // Validate eventType against the model's enum
        const validTypes = ['form_submission', 'whatsapp_click', 'service_selection', 'page_view', 'booking_confirmed', 'budget_selected'];
        if (!validTypes.includes(eventType)) {
            return res.status(200).json({ success: false, tracked: false, reason: 'invalid eventType' });
        }

        // Save to MongoDB
        const analyticsEvent = new Analytics({
            eventType,
            userAgent: req.get('user-agent') || null,
            ipAddress: req.ip || null,
            referrer: req.get('referer') || null
        });
        await analyticsEvent.save();

        console.log(`📊 Analytics saved: ${eventType}`, { parameter, timestamp });
        res.json({ success: true, tracked: true });
    } catch (error) {
        console.error('Analytics tracking error:', error);
        // Don't fail the user experience if analytics fails
        res.status(200).json({ success: false, tracked: false });
    }
});

// M-Pesa callbacks - BEFORE any CSRF or auth middleware
app.post('/portal/admin-staff/mpesa/callback', async (req, res) => {
    try {
        const svc = require('./staff-system/financials/services/eventPaymentService');
        await svc.mpesaCallback(req.body);
        res.json({ ResultCode: 0, ResultDesc: 'Success' });
    } catch (err) {
        console.error('[mpesa/callback]', err.message);
        res.json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
    }
});
app.post('/portal/admin-staff/mpesa/timeout', (req, res) => {
    console.warn('[mpesa/timeout]', req.body);
    res.json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
});
// ── STAFF PORTAL CSRF MIDDLEWARE ──
const portalCsrf = csrf({ cookie: { httpOnly: true, sameSite: 'strict' } });

// Add csrfToken + vapidPublicKey to all /portal responses
app.use('/portal', portalCsrf, (req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    res.locals.vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
    next();
});

// ── STAFF PORTAL ROUTES ──
const portalAuthRoutes = require('./staff-routes/auth');
const portalStaffRoutes = require('./staff-routes/staff');
const portalSupervisorRoutes = require('./staff-routes/supervisor');
const portalAdminStaffRoutes = require('./staff-routes/admin');

app.use('/portal/auth', portalCsrf, portalAuthRoutes);
app.use('/portal/staff', portalCsrf, portalStaffRoutes);
app.use('/portal/supervisor', portalCsrf, portalSupervisorRoutes);

// Public M-Pesa callbacks - no auth, no CSRF
app.post('/portal/admin-staff/mpesa/callback', async (req, res) => {
    try {
        const eventPaymentService = require('./staff-system/financials/services/eventPaymentService');
        await eventPaymentService.mpesaCallback(req.body);
        res.json({ ResultCode: 0, ResultDesc: 'Success' });
    } catch (err) {
        console.error('[mpesa/callback]', err.message);
        res.json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
    }
});
app.post('/portal/admin-staff/mpesa/timeout', (req, res) => {
    console.warn('[mpesa/timeout]', req.body);
    res.json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
});
app.use('/portal/admin-staff', portalCsrf, portalAdminStaffRoutes);

// Convenience redirects
app.get('/staff-login', (req, res) => res.redirect('/portal/auth/login'));
app.get('/portal', (req, res) => res.redirect('/portal/auth/login'));

// Staff portal uploads
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ── PORTAL CSRF ERROR HANDLER ──
app.use('/portal', (err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).render('auth/login', {
            error: 'Session expired. Please log in again.',
            message: null,
            csrfToken: ''
        });
    }
    next(err);
});

// ── ERROR HANDLING ──
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: process.env.PORT_ADMIN ? 'admin-portal' : 'staff-operations',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.statusCode || 500;
  const isApi = req.headers['content-type'] === 'application/json' ||
                req.headers['authorization'];
  if (isApi) {
    return res.status(statusCode).json({
      success: false,
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production'
          ? 'An error occurred'
          : err.message,
        statusCode
      },
      timestamp: new Date().toISOString()
    });
  }
  res.status(statusCode).render('error', { 
    message: 'Something went wrong',
    statusCode 
  });
});

server.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════════════════════╗
    ║  🎉 EMERALD PEARLAND EVENTS BOOKING SERVER 🎉         ║
    ║  Premium Event Management System                       ║
    ║  ────────────────────────────────────────────────      ║
    ║  Server running on: http://localhost:${PORT}            ║
    ║  Environment: ${process.env.NODE_ENV || 'development'}                           ║
    ║  Email Config: ${process.env.EMAIL_USER ? '✓ Configured' : '✗ Not configured'}                    ║
    ╚════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;

