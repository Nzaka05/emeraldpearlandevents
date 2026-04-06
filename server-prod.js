require('./scripts/checkEnv');
require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

// Import routes and services
const bookingRoutes = require('./server/routes/bookingRoutes');
const adminRoutes = require('./server/routes/adminRoutes');
let clientPortalRoutes = null;
try {
    clientPortalRoutes = require('./server/routes/clientPortalRoutes');
} catch (e) {
    console.warn('[WARN] clientPortalRoutes failed to load:', e.message);
}
const { verifyAdminPage } = require('./server/middleware/adminAuth');
const passport = require('./server/config/passport'); // Register Google Strategy
const { initializeEmailService } = require('./server/services/emailService');
const { initializeCronJobs, stopCronJobs } = require('./server/services/cronService');
const Analytics = require('./server/models/Analytics');

// ═══════════════════════════════════════════════════════════
// INITIALIZE EXPRESS APP
// ═══════════════════════════════════════════════════════════
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const STAFF_SYSTEM_BASE_URL = process.env.STAFF_SYSTEM_BASE_URL || 'https://emerald-staff-system.onrender.com';

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE - SECURITY & PARSING
// ═══════════════════════════════════════════════════════════

// Production HTTP Request Logging
if (NODE_ENV !== 'test') {
    app.use(morgan('combined'));
}

// Data Compression (Gzip/Brotli)
app.use(compression());

// Prevent NoSQL Injection
app.use(mongoSanitize());

// Helmet for security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com", "https://www.googletagmanager.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
            imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://images.unsplash.com", "https://emeraldpearlandevents.netlify.app", "'unsafe-inline'"],
            mediaSrc: ["'self'", "blob:"],
            connectSrc: ["'self'", "blob:", "https://api.cloudinary.com", "https://res.cloudinary.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com", "https://emeraldpearlandevents.onrender.com"],
        }
    }
}));

// CORS — explicit allowlist from environment variable (never hardcode origins)
// Set ALLOWED_ORIGINS in Render env vars as comma-separated URLs:
//   https://emeraldpearlandevents.netlify.app,https://emeraldpearlandevents.onrender.com
const _allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || _allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin '${origin}' not permitted`));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true
}));

// Body parser
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Cookie parser
app.use(cookieParser());

// Initialize Passport
app.use(passport.initialize());

// General rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000,// 1000 requests per 15 minutes per IP
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// ═══════════════════════════════════════════════════════════
// MONGODB CONNECTION
// ═══════════════════════════════════════════════════════════

const connectDatabase = async () => {
    try {
        const mongoUri = process.env.MONGO_URI;

        if (!mongoUri) {
            throw new Error('MONGO_URI not defined in .env');
        }

        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('✅ MongoDB connected successfully');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        console.error('   Make sure MongoDB is running and MONGO_URI is correct in .env');
        process.exit(1);
    }
};

// ═══════════════════════════════════════════════════════════
// SERVE STATIC FILES & ADMIN PAGES
// ═══════════════════════════════════════════════════════════

// Static file caching options
const staticOptions = {
    maxAge: '1d', // Cache for 1 day
    etag: true
};

// Public files
app.use(express.static('public', staticOptions));
app.use('/images', express.static('images', staticOptions));

// Root static files
app.get('/', (req, res) => res.sendFile(require('path').join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(require('path').join(__dirname, 'index.html')));
app.get('/booking.html', (req, res) => res.sendFile(require('path').join(__dirname, 'booking.html')));

// Admin static assets (CSS, JS, Service Worker)
app.use('/admin/assets', express.static(require('path').join(__dirname, 'admin', 'assets'), staticOptions));
app.get('/admin/push-client.js', (req, res) => res.sendFile(require('path').join(__dirname, 'admin', 'push-client.js')));
app.get('/admin/sw.js', (req, res) => res.sendFile(require('path').join(__dirname, 'admin', 'sw.js')));
app.get('/admin/admin-profile.js', (req, res) => res.sendFile(require('path').join(__dirname, 'admin', 'admin-profile.js')));
app.get('/favicon.ico', (req, res) => res.sendFile(require('path').join(__dirname, 'public', 'favicon.ico')));

// Root redirect for admin
app.get('/admin', (req, res) => {
    res.redirect('/admin/login');
});

// Admin pages (must be served after routes to avoid conflicts)
// Admin login
app.get('/admin/login', (req, res) => {
    res.sendFile(__dirname + '/admin/login.html');
});

// Admin dashboard (protected)
app.get('/admin/dashboard', verifyAdminPage, (req, res) => {
    res.sendFile(__dirname + '/admin/dashboard.html');
});

// SSO nonce store — short-lived, single-use, server-side only
const ssoNonceStore = new Map();

// Clean up expired nonces every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [nonce, entry] of ssoNonceStore.entries()) {
        if (now > entry.expiresAt) ssoNonceStore.delete(nonce);
    }
}, 5 * 60 * 1000);

// SSO Bridge — stores token server-side, redirects with nonce only
app.get('/admin/staff-operations-sso', verifyAdminPage, async (req, res) => {
    try {
        const ssoSecret = process.env.SSO_JWT_SECRET || process.env.SYNC_SECRET || process.env.JWT_SECRET;
        const adminId = req.admin.adminId;
        const email = req.admin.email;

        const Admin = require('./server/models/Admin');
        const adminDoc = await Admin.findById(adminId).select('role').lean();
        const role = adminDoc?.role || 'admin';

        if (!['super_admin', 'admin'].includes(role)) {
            return res.status(403).send('Access denied');
        }

        const tokenRole = role === 'super_admin' ? 'Super Admin' : 'Admin';

        const ssoToken = jwt.sign(
            { sub: adminId.toString(), email, role: tokenRole, type: 'staff-ops-sso' },
            ssoSecret,
            { expiresIn: '2m' }
        );

        // Store token server-side — only nonce goes in the URL
        const nonce = require('crypto').randomBytes(32).toString('hex');
        ssoNonceStore.set(nonce, { token: ssoToken, expiresAt: Date.now() + 60_000 });

        return res.redirect(
            `${STAFF_SYSTEM_BASE_URL}/staff-admin/sso-handoff?nonce=${nonce}`
        );
    } catch (err) {
        console.error('SSO generation error:', err.message);
        return res.redirect('/admin/login');
    }
});

// SSO exchange endpoint — staff system POSTs nonce here to get the real token
app.post('/admin/sso-exchange', express.json(), (req, res) => {
    const { nonce } = req.body;
    if (!nonce) return res.status(400).json({ error: 'Nonce required' });

    const entry = ssoNonceStore.get(nonce);
    if (!entry || Date.now() > entry.expiresAt) {
        ssoNonceStore.delete(nonce);
        return res.status(401).json({ error: 'Invalid or expired nonce' });
    }

    // Single-use — delete immediately after exchange
    ssoNonceStore.delete(nonce);
    return res.json({ token: entry.token });
});

// Staff profile sync receiver from port 3001
app.post('/internal/sync-staff-update', express.json(), async (req, res) => {
    try {
        const syncSecret = process.env.SYNC_SECRET;
        if (req.headers['x-sync-secret'] !== syncSecret) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { email, name, phone } = req.body;
        const Staff = require('./server/models/Staff');
        const updated = await Staff.findOneAndUpdate(
            { email },
            { $set: { name, phone } },
            { new: true }
        );
        if (!updated) return res.status(404).json({ error: 'Staff not found' });
        console.log('Staff sync from port 3001:', email, '->', name, phone);
        res.json({ success: true });
    } catch (err) {
        console.error('Sync error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Admin bookings page
app.get('/admin/bookings/new', verifyAdminPage, (req, res) => {
    res.sendFile(__dirname + '/admin/new-booking.html');
});

app.get('/admin/bookings', verifyAdminPage, (req, res) => {
    res.sendFile(__dirname + '/admin/bookings.html');
});

// Admin clients page
app.get('/admin/clients', verifyAdminPage, (req, res) => {
    res.sendFile(__dirname + '/admin/clients.html');
});

// Admin edit client page
app.get('/admin/clients/:id/edit', verifyAdminPage, (req, res) => {
    res.sendFile(__dirname + '/admin/edit-client.html');
});

// Admin calendar page
app.get('/admin/calendar', verifyAdminPage, (req, res) => {
    res.sendFile(__dirname + '/admin/calendar.html');
});

// Admin analytics page
app.get('/admin/analytics', verifyAdminPage, (req, res) => {
    res.sendFile(__dirname + '/admin/analytics.html');
});

// Admin notifications page
app.get('/admin/notifications', verifyAdminPage, (req, res) => {
    res.sendFile(__dirname + '/admin/notifications.html');
});

// Admin gallery page
app.get('/admin/gallery', verifyAdminPage, (req, res) => {
    res.sendFile(__dirname + '/admin/gallery.html');
});

// Admin testimonials page
app.get('/admin/testimonials', verifyAdminPage, (req, res) => {
    res.sendFile(__dirname + '/admin/testimonials.html');
});

// Admin staff page
app.get('/admin/staff', verifyAdminPage, (req, res) => {
    res.sendFile(__dirname + '/admin/staff.html');
});

// Admin settings page
app.get('/admin/settings', verifyAdminPage, (req, res) => {
    res.sendFile(__dirname + '/admin/settings.html');
});
// Admin pricing & rates page
app.get('/admin/pricing', verifyAdminPage, (req, res) => {
    res.sendFile(__dirname + '/admin/pricing.html');
});

// Error pages
app.get('/admin/404', (req, res) => {
    res.sendFile(__dirname + '/admin/404.html');
});

app.get('/admin/500', (req, res) => {
    res.sendFile(__dirname + '/admin/500.html');
});

app.get('/admin/403', (req, res) => {
    res.sendFile(__dirname + '/admin/403.html');
});

// ═══════════════════════════════════════════════════════════
// VIEW ENGINE (for EJS client portal)
// ═══════════════════════════════════════════════════════════
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ═══════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════

// Admin API (protected by JWT middleware)
app.use('/api/admin', adminRoutes);
// Main booking API
app.use('/api', bookingRoutes);
// Client portal (EJS-rendered, session-based)
if (clientPortalRoutes) {
    app.use('/client', clientPortalRoutes);
    console.log('✅ Client portal routes loaded');
} else {
    console.warn('[WARN] Client portal unavailable - missing staff-models dependency');
}

// Health check
app.get('/api/health', (req, res) => {
    const mongooseState = mongoose.connection.readyState;
    const isConnected = mongooseState === 1;

    res.json({
        success: true,
        status: 'running',
        environment: NODE_ENV,
        mongodb: isConnected ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Public gallery endpoint (no auth required — client page reads this)
app.get('/api/gallery', async (req, res) => {
    try {
        const Gallery = require('./server/models/Gallery');
        const items = await Gallery.find().sort({ order: 1, uploadedAt: -1 });
        res.json({ success: true, gallery: items });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching gallery' });
    }
});
// Public testimonials endpoint (no auth required - client page reads this)
app.get('/api/testimonials', async (req, res) => {
    try {
        const Testimonial = require('./server/models/Testimonial');
        const items = await Testimonial.find({ displayOnWebsite: true, status: 'approved' }).sort({ createdAt: -1 });
        res.json({ success: true, testimonials: items });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching testimonials' });
    }
});

// ═══════════════════════════════════════════════════════════
// ANALYTICS TRACKING ENDPOINT
// ═══════════════════════════════════════════════════════════

app.post('/api/analytics/event', async (req, res) => {
    try {
        const { eventType, bookingId, timestamp } = req.body;

        if (!eventType) {
            return res.status(400).json({
                success: false,
                message: 'eventType is required'
            });
        }

        // Create analytics record
        const analyticsModel = require('./server/models/Analytics');
        const analyticsRecord = new analyticsModel({
            eventType: eventType,
            bookingId: bookingId || null,
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip,
            timestamp: timestamp || new Date()
        });

        await analyticsRecord.save();

        res.json({
            success: true,
            message: 'Event tracked',
            eventId: analyticsRecord._id
        });
    } catch (error) {
        console.error('[ANALYTICS] Error tracking event:', error);
        // Don't fail the request if analytics fail
        res.json({
            success: true,
            message: 'Event recorded'
        });
    }
});

// ═══════════════════════════════════════════════════════════
// API RATE LIMITING (STRICT)
// ═══════════════════════════════════════════════════════════

// Stricter limit for authentication/admin routes to prevent brute force
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 auth requests per window
    message: { success: false, message: 'Too many authentication attempts, please try again after 15 minutes' }
});

app.use('/api/admin/login', authLimiter);
app.use('/api/admin/forgot-password', authLimiter);

// ═══════════════════════════════════════════════════════════
// 404 HANDLER
// ═══════════════════════════════════════════════════════════

// Internal sync route � receives event completion from port 3001
app.post('/internal/sync-event-complete', async (req, res) => {
    try {
        const syncSecret = process.env.SYNC_SECRET;
        if (req.headers['x-sync-secret'] !== syncSecret) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { booking_ref, status } = req.body;
        if (!booking_ref) return res.json({ success: false, error: 'No booking_ref' });

        const Booking = require('./server/models/Booking');
        const booking = await Booking.findOne({ bookingReference: booking_ref });
        if (!booking) return res.json({ success: false, error: 'Booking not found' });

        booking.status = status === 'Completed' ? 'completed' : (status || 'completed');
        await booking.save();

        console.log('Event completion synced from port 3001:', booking_ref);
        res.json({ success: true, booking_ref });
    } catch(err) {
        console.error('Event sync error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.use((req, res) => {
    // If it's an API route that wasn't found, return JSON
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            message: 'API Endpoint not found',
            path: req.path
        });
    }
    // Otherwise serve the 404 HTML page for admin routes
    if (req.path.startsWith('/admin/')) {
        return res.status(404).sendFile(__dirname + '/admin/404.html');
    }
    // Very fallback
    res.status(404).send('Page not found');
});

// ═══════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLING MIDDLEWARE
// ═══════════════════════════════════════════════════════════

app.use((error, req, res, next) => {
    console.error('[SERVER ERROR]', error);

    const statusCode = error.status || 500;

    // Do not leak stack traces in production
    const isProd = NODE_ENV === 'production';
    const message = isProd && statusCode === 500 ? 'Internal Server Error' : error.message;

    res.status(statusCode).json({
        success: false,
        message: message || 'Server error',
        ...(!isProd && { stack: error.stack })
    });
});

// ═══════════════════════════════════════════════════════════
// SERVER STARTUP
// ═══════════════════════════════════════════════════════════

const startServer = async () => {
    try {
        // Initialize email service
        console.log('[EMAIL] Initializing email service...');
        initializeEmailService();
        console.log('✅ Email service initialized');

        // Connect to MongoDB
        console.log('[DATABASE] Connecting to MongoDB...');
        await connectDatabase();

        // Initialize cron jobs
        console.log('[CRON] Initializing automated tasks...');
        initializeCronJobs();
        console.log('✅ Cron jobs initialized');

        // Start listening
        app.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🎉 EMERALD PEARLAND EVENTS - BOOKING SYSTEM              ║
║                                                            ║
║   ✅ Server is running on port ${PORT}                     
║   ✅ Environment: ${NODE_ENV}                               
║   ✅ MongoDB: Connected                                     
║   ✅ Email Service: Ready                                   
║   ✅ Scheduled Tasks: Active                                
║                                                            ║
║   📍 API Base: http://localhost:${PORT}/api                
║   📍 Health Check: http://localhost:${PORT}/api/health     
║                                                            ║
╚════════════════════════════════════════════════════════════╝
            `);
        });

        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n[SHUTDOWN] Stopping server gracefully...');
            stopCronJobs();
            mongoose.connection.close();
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

// Start the server
startServer();

module.exports = app;
