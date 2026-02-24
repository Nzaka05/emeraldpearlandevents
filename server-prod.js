require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');

// Import routes and services
const bookingRoutes = require('./server/routes/bookingRoutes');
const { initializeEmailService } = require('./server/services/emailService');
const { initializeCronJobs, stopCronJobs } = require('./server/services/cronService');
const Analytics = require('./server/models/Analytics');

// ═══════════════════════════════════════════════════════════
// INITIALIZE EXPRESS APP
// ═══════════════════════════════════════════════════════════
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE - SECURITY & PARSING
// ═══════════════════════════════════════════════════════════

// Helmet for security headers
app.use(helmet());

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
        'null' // file:// protocol (opening HTML directly)
    ],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true
}));

// Body parser
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

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
        const mongoUri = process.env.MONGODB_URI;

        if (!mongoUri) {
            throw new Error('MONGODB_URI not defined in .env');
        }

        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('✅ MongoDB connected successfully');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        console.error('   Make sure MongoDB is running and MONGODB_URI is correct in .env');
        process.exit(1);
    }
};

// ═══════════════════════════════════════════════════════════
// HEALTH CHECK ENDPOINT
// ═══════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════

app.use('/api', bookingRoutes);

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
// 404 HANDLER
// ═══════════════════════════════════════════════════════════

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.path
    });
});

// ═══════════════════════════════════════════════════════════
// ERROR HANDLING MIDDLEWARE
// ═══════════════════════════════════════════════════════════

app.use((error, req, res, next) => {
    console.error('[ERROR]', error);

    res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Server error',
        ...(NODE_ENV === 'development' && { error: error.stack })
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
