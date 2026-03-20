require('dotenv').config();
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
const { verifyAdminPage } = require('./server/middleware/adminAuth');
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
const STAFF_SYSTEM_BASE_URL = process.env.STAFF_SYSTEM_BASE_URL || 'http://localhost:3001';

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
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
            imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
            mediaSrc: ["'self'", "blob:"],
            connectSrc: ["'self'", "blob:", "https://api.cloudinary.com"],
        }
    }
}));

// CORS configuration
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
        'http://127.0.0.1:5500',
        'http://127.0.0.1:5501',
        'http://127.0.0.1:8000',
        'http://127.0.0.1:8080',
        'https://emeraldpearlandevents.netlify.app', // ✅ Netlify production
        'https://emeraldpearlandevents.onrender.com', // ✅ Render production
        'null' // file:// protocol (opening HTML directly)
    ],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true
}));

// Body parser
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

// Cookie parser
app.use(cookieParser());

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

// SSO Bridge — generates short-lived token for Staff Operations access
app.get('/admin/staff-operations-sso', verifyAdminPage, async (req, res) => {
    try {
        const ssoSecret = process.env.SSO_JWT_SECRET || process.env.JWT_SECRET || 'fallback_secret_key';
        const adminId = req.admin.adminId;
        const email = req.admin.email;

        const Admin = require('./server/models/Admin');
        const adminDoc = await Admin.findById(adminId).select('role').lean();
        const role = adminDoc?.role || 'admin';

        // Admin model uses: super_admin, admin, manager
        if (!['super_admin', 'admin'].includes(role)) {
            return res.status(403).send('Access denied');
        }

        // Map to Staff-style role for token (Staff only has 'Admin')
        const tokenRole = role === 'super_admin' ? 'Super Admin' : 'Admin';

        const ssoToken = jwt.sign(
            { sub: adminId.toString(), email, role: tokenRole, type: 'staff-ops-sso' },
            ssoSecret,
            { expiresIn: '2m' }
        );

        return res.redirect(
            `${STAFF_SYSTEM_BASE_URL}/staff-admin/sso-login?token=${encodeURIComponent(ssoToken)}`
        );
    } catch (err) {
        console.error('SSO generation error:', err.message);
        return res.redirect('/admin/login');
    }
});

// Staff profile sync receiver from port 3001
app.post('/internal/sync-staff-update', express.json(), async (req, res) => {
    try {
        const syncSecret = process.env.JWT_SECRET || 'fallback_secret_key';
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
// API ROUTES
// ═══════════════════════════════════════════════════════════

// Admin API (protected by JWT middleware)
app.use('/api/admin', adminRoutes);
// Main booking API
app.use('/api', bookingRoutes);

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
        const syncSecret = process.env.JWT_SECRET || 'fallback_secret_key';
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
