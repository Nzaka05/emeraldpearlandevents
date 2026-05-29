require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('../scripts/checkEnv'); // Halt at startup if any required secret is missing

const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const methodOverride = require('method-override');
const compression = require('compression');
const morgan = require('morgan');
const { createServiceLogger } = require('../server/utils/logger');
const staffLogger = createServiceLogger('staff-system');

// Route files
const authRoutes       = require('./routes/auth');
const staffRoutes      = require('./routes/staff');
const supervisorRoutes = require('./routes/supervisor');

// ── Domain-split admin routers (replaces legacy routes/admin.js) ──────────────
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
const adminStaffRoutes     = require('./routes/adminStaffRoutes');
const adminEventsRoutes    = require('./routes/adminEventsRoutes');
const adminFinanceRoutes   = require('./routes/adminFinanceRoutes');
const adminReportsRoutes   = require('./routes/adminReportsRoutes');
const passwordChangeRoutes = require('../server/routes/passwordChangeRoutes');

const Staff = require('./models/Staff');
const AuditLog = require('./models/AuditLog');
const { protect, authorize } = require('./middleware/auth');
const { sanitizeRequestBody } = require('./middleware/validation');
const surveyController = require('./controllers/surveyController');
const emailService = require('./services/emailService');
emailService.initializeEmailService();
const adminFinanceController = require('./controllers/adminFinanceController');
const { startJob, stopJob } = require('./jobs/missingStaffJob');
const { verifySafaricomIP } = require('./middleware/webhookSecurity');
const { verifySyncAuth } = require('./middleware/syncAuth');
const { globalLimiter, authLimiter, webhookLimiter } = require('./middleware/rateLimiter');
const STAFF_COOKIE = 'staff_portal_token';
const LEGACY_COOKIE = 'portal_token';

// IP verification and sync auth now handled by centralized middleware:
// - staff-system/middleware/webhookSecurity.js  (verifySafaricomIP)
// - staff-system/middleware/syncAuth.js          (verifySyncAuth)
// - staff-system/middleware/rateLimiter.js       (globalLimiter, authLimiter, webhookLimiter)

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Connect to MongoDB
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    console.error('FATAL: MONGO_URI environment variable is not set');
    process.exit(1);
}

console.log('🔌 Connecting to MongoDB...');
mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    maxPoolSize: 10,
    retryWrites: true
})
    .then(() => console.log('✅ MongoDB Connected — Staff System ready'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err.message));

// Set view engine
const expressLayouts = require('express-ejs-layouts');
app.use((req, res, next) => { if (req.path.startsWith('/portal/auth')) { res.locals.layout = false; } next(); });
app.use(expressLayouts);
app.set('layout', 'layout'); // default layout file
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
// CORS — explicit allowlist from environment variable (never wildcard with credentials)
// Set ALLOWED_ORIGINS in Render env vars as comma-separated URLs:
//   https://yourbookingsite.netlify.app,https://admin.yourdomain.com
const _allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
// Always allow same-origin and self requests
const _selfUrl = process.env.STAFF_SYSTEM_BASE_URL || 'http://localhost:3001';
if (_selfUrl) {
    _allowedOrigins.push(_selfUrl);
    try {
        const url = new URL(_selfUrl);
        _allowedOrigins.push(url.origin);
    } catch (e) { /* ignore */ }
}

// Also allow common Render deployment patterns
_allowedOrigins.push(
    'https://emerald-staff-system.onrender.com',
    'http://localhost:3001',
    'http://127.0.0.1:3001'
);

// Log CORS config for debugging
console.log('[CORS] Allowed origins:', _allowedOrigins);

app.use(cors({
    origin: (origin, callback) => {
        // Allow if:
        // 1. no origin (same-origin requests from server-side or proxies)
        // 2. origin is 'null' (file:// requests)
        // 3. exact match in allowlist
        // 4. hostname matches any allowed origin hostname
        if (!origin || origin === 'null') return callback(null, true);
        
        // Check exact match first
        if (_allowedOrigins.includes(origin)) return callback(null, true);
        
        // Check by hostname (for deployed domains with different protocols/ports)
        try {
            const incomingUrl = new URL(origin);
            const incomingHostname = incomingUrl.hostname;
            
            for (const allowed of _allowedOrigins) {
                try {
                    const allowedUrl = new URL(allowed);
                    // Match by hostname (ignoring protocol and port)
                    if (allowedUrl.hostname === incomingHostname) {
                        return callback(null, true);
                    }
                } catch (e) { /* skip malformed URLs */ }
            }
        } catch (e) { 
            // If origin is not a valid URL, just reject it
            console.warn('[CORS] Invalid origin URL:', origin);
        }
        
        console.warn('[CORS] Rejected origin:', origin);
        callback(new Error(`CORS: origin '${origin}' not permitted`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['X-CSRF-Token']
}));
// Note: Skipping mongoSanitize for Express 5 compatibility - using manual sanitization in routes instead

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.tailwindcss.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "fonts.googleapis.com", "cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "fonts.gstatic.com", "cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "res.cloudinary.com", "blob:"],
      connectSrc: ["'self'", "wss:", "ws:", "https://api.cloudinary.com"]
    }
  }
}));
app.use(compression());
if (process.env.NODE_ENV !== 'test') {
    const requestLogger = require('../logger/requestLogger');
    app.use(requestLogger);
}
app.use(methodOverride(function(req, res) {
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    const method = req.body._method;
    delete req.body._method;
    return method;
  }
}));
app.use(methodOverride('_method'));

// CSRF only for staff portal routes — never applied to /admin
const portalCsrf = csrf({ cookie: { httpOnly: true, sameSite: 'lax' } });

// Add csrfToken + vapidPublicKey to res.locals for all /portal views
app.use((req, res, next) => {
  if (req.path.startsWith('/admin-staff/mpesa/')) return next();
  if (req.path.match(/^\/staff\/survey\//)) return next();
  
  const isApiRoute = req.path.startsWith('/api') || 
                     req.headers['content-type'] === 'application/json' ||
                     req.headers['authorization'];
  if (isApiRoute) return next();
  
  // Apply CSRF to all other requests (like form submissions and page loads)
  if (req.path.startsWith('/portal')) {
      portalCsrf(req, res, next);
  } else {
      next();
  }
});

app.use('/portal', (req, res, next) => {
  if (req.path.startsWith('/admin-staff/mpesa/')) return next();
  if (req.path.match(/^\/staff\/survey\//)) return next();
  
  const isApiRoute = req.path.startsWith('/api') || 
                     req.headers['content-type'] === 'application/json' ||
                     req.headers['authorization'];
  if (isApiRoute) return next();

  res.locals.csrfToken = req.csrfToken();
  res.locals.vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
  next();
});

// Fallback: ensure csrfToken is always available in views (empty string if CSRF was bypassed)
app.use('/portal', (req, res, next) => {
  if (!res.locals.csrfToken) {
    res.locals.csrfToken = '';
  }
  if (!res.locals.vapidPublicKey) {
    res.locals.vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
  }
  next();
});

// Rate limiting — using centralized tiered limiters from middleware/rateLimiter.js
app.use(globalLimiter);
app.use('/portal/auth/login', authLimiter);
app.use('/portal/auth/forgot-password', authLimiter);
app.use('/portal/auth/reset-password', authLimiter);
app.use('/portal/auth/staff-forgot-password', authLimiter);

// Booking sync receiver from port 3000
app.post('/internal/sync-booking', verifySyncAuth, async (req, res) => {
  try {
    const Assignment = require('./models/Assignment');
    const Staff = require('./models/Staff');
    const { title, description, location, date, start_time, end_time,
        pay_rate, required_staff_count, booking_ref, client_name, client_email, clientPaymentAmount, usherCount } = req.body;

    // Update if already synced (refresh client details)
    const existing = await Assignment.findOne({ booking_ref });
    if (existing) {
      if (client_name) existing.client_name = client_name;
      if (client_email) existing.client_email = client_email;
      if (clientPaymentAmount !== undefined) existing.clientPaymentAmount = clientPaymentAmount;
      if (usherCount !== undefined) existing.usherCount = usherCount;
      if (pay_rate) existing.pay_rate = pay_rate;
      await existing.save();
      return res.json({ success: true, message: 'Updated existing', id: existing._id });
    }

    // Find admin to set as creator
    const admin = await Staff.findOne({ role: 'Admin' }).select('_id');
    if (!admin) {
      return res.status(400).json({ error: 'No admin account found to assign creator' });
    }

    const assignment = await Assignment.create({
      title: title || 'New Event',
      description: description || '',
      location: location || 'TBD',
      date: new Date(date),
      start_time,
      end_time,
      pay_rate: pay_rate || 1000,
      required_staff_count: required_staff_count || 1,
      status: 'Active',
      open_for_applications: true,
      booking_ref,
      client_name,
      client_email,
      clientPaymentAmount: clientPaymentAmount || 0,
      usherCount: usherCount || 0,
      createdByAdmin: admin._id
    });

    // Initialize the Event Ledger
    const ledgerService = require('./financials/services/ledgerService');
    const estimatedBudget = clientPaymentAmount || 0; // if 0, then client hasn't paid yet, or it's unknown
    try {
      await ledgerService.initializeEventLedger(assignment._id, null, estimatedBudget);
      console.log('Event Ledger initialized for:', assignment.title);
    } catch (ledgerErr) {
      console.error('Event Ledger initialization error:', ledgerErr.message);
    }

    console.log('Assignment auto-created from booking:', assignment.title);

    // Send push notification to all available staff
    try {
      const webpush = require('web-push');
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        webpush.setVapidDetails(
          'mailto:emeraldpearlandevents@gmail.com',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );
        const staffWithSubs = await Staff.find({
          pushSubscription: { $exists: true, $ne: null },
          status: 'Active'
        });
        const payload = JSON.stringify({
          title: 'New Event Available!',
          body: `${title || 'New Event'} on ${new Date(date).toDateString()} at ${location || 'TBD'}`,
          url: '/portal/staff/assignments'
        });
        for (const s of staffWithSubs) {
          try {
            await webpush.sendNotification(s.pushSubscription, payload);
          } catch (e) {
            if (e.statusCode === 404 || e.statusCode === 410) {
              await Staff.findByIdAndUpdate(s._id, { $unset: { pushSubscription: 1 } });
            }
          }
        }
        console.log(`Push sent to ${staffWithSubs.length} staff for new assignment`);
      }
    } catch (pushErr) {
      console.error('Staff push notification error:', pushErr.message);
    }
    res.json({ success: true, assignment_id: assignment._id });
  } catch (err) {
    console.error('Booking sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

  // Event completion sync from port 3000
  app.post('/internal/sync-event-complete', verifySyncAuth, async (req, res) => {
    try {
      const { booking_ref, status } = req.body;
      if (!booking_ref) return res.json({ success: false, error: 'No booking_ref' });

      const Assignment = require('./models/Assignment');
      const assignment = await Assignment.findOne({ booking_ref });
      if (!assignment) return res.json({ success: false, error: 'Assignment not found' });

      assignment.status = status || 'Completed';
      await assignment.save();

      console.log('Event completion synced from port 3000:', assignment.title);
      res.json({ success: true, assignment_id: assignment._id });
    } catch(err) {
      console.error('Event sync error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

// Staff sync endpoint from port 3000
app.post('/internal/sync-staff', verifySyncAuth, async (req, res) => {
  
  const { action, staff } = req.body;
  // action: 'create', 'update', 'delete'
  // staff: { name, email, phone, photo }
  
  try {
    const Staff = require('./models/Staff');
    const bcrypt = require('bcryptjs');
    
    if (action === 'delete') {
      await Staff.findOneAndDelete({ email: staff.email });
      return res.json({ success: true });
    }
    
    const existing = await Staff.findOne({ email: staff.email });
    
    if (existing) {
      // Update basic info only - never touch role, password, status
      await Staff.findByIdAndUpdate(existing._id, {
        $set: {
          name: staff.name,
          phone: staff.phone || existing.phone,
          photo_url: staff.photo || existing.photo_url
        }
      });
    } else {
      // Create new staff account with temp password
      const tempPassword = await bcrypt.hash(staff.email, 10);
      await Staff.create({
        name: staff.name,
        email: staff.email,
        phone: staff.phone || '',
        photo_url: staff.photo || '',
        password: tempPassword,
        role: 'Staff',
        status: 'Active',
        mustChangePassword: true
      });
    }
    
    res.json({ success: true });
  } catch(err) {
    console.error('Sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Internal: Sync client payment amount to staff-system assignment ────────────
app.post('/internal/sync-payment', verifySyncAuth, async (req, res) => {
    try {
        const { booking_ref, clientPaymentAmount, paymentMethod, transactionId } = req.body;
        const Assignment = require('./models/Assignment');
        const assignment = await Assignment.findOne({ booking_ref });
        if (assignment) {
            if (clientPaymentAmount) assignment.clientPaymentAmount = clientPaymentAmount;
            await assignment.save();
            console.log(`Payment synced to assignment [${booking_ref}]: KSh ${clientPaymentAmount}`);
        } else {
            console.log(`sync-payment: no assignment found for booking_ref=${booking_ref}`);
        }
        res.json({ success: true });
    } catch(err) {
        console.error('sync-payment error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── Internal: Sync pricing settings from main portal ─────────────────────────
app.post('/internal/sync-pricing', verifySyncAuth, async (req, res) => {
    try {
        const PricingSettings = require('./models/PricingSettings');
        const { categories, vatRate, globalSupervisorRate, paymentMethods } = req.body;
        let pricing = await PricingSettings.findOne();
        if (!pricing) pricing = new PricingSettings();
        if (categories)            pricing.categories           = categories;
        if (vatRate)               pricing.vatRate              = vatRate;
        if (globalSupervisorRate)  pricing.globalSupervisorRate = globalSupervisorRate;
        if (paymentMethods)        pricing.paymentMethods       = paymentMethods;
        await pricing.save();
        console.log('Pricing synced from main portal');
        res.json({ success: true });
    } catch(err) {
        console.error('sync-pricing error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Mount Routes — all under /portal prefix (isolated from static admin panel)
app.use('/portal/auth', authRoutes);
app.use('/api/auth/password', passwordChangeRoutes);

// Public M-Pesa callbacks must be mounted before protected /portal/admin-staff routes.
app.post('/portal/admin-staff/mpesa/callback', webhookLimiter, verifySafaricomIP, adminFinanceController.mpesaCallback);
app.post('/portal/admin-staff/mpesa/timeout', webhookLimiter, adminFinanceController.mpesaTimeout);

// ── Admin domain routes (split from monolithic admin.js) ──────────────────────
app.use('/portal/admin-staff', adminDashboardRoutes);
app.use('/portal/admin-staff', adminStaffRoutes);
app.use('/portal/admin-staff', adminEventsRoutes);
app.use('/portal/admin-staff', adminFinanceRoutes);
app.use('/portal/admin-staff', adminReportsRoutes);

// Public: accessible via survey link token, no auth required
app.get('/portal/staff/survey/:token', surveyController.getSurveyPage);
app.post('/portal/staff/survey/:token/submit', sanitizeRequestBody, surveyController.submitSurvey);

app.use('/portal/staff', staffRoutes);
app.use('/portal/supervisor', supervisorRoutes);
app.use('/portal/supervisor/command-center', require('./routes/commandCenterRoutes'));
app.use('/portal/ai', require('./staff-routes/aiRoutes'));
app.use('/portal/finance', require('./financials/routes/financeRoutes'));
app.use('/', require('./routes/performanceRoutes'));

// SSO Handoff — receives nonce from Main Admin, exchanges it for the real token
app.get('/staff-admin/sso-handoff', async (req, res) => {
  const { nonce } = req.query;
  const loginRedirect = '/portal/auth/login?error=sso_failed';

  if (!nonce) return res.redirect(loginRedirect);

  let token;
  try {
    const fetch = require('node-fetch');
    const exchangeRes = await fetch(
      `${process.env.ADMIN_SERVER_URL}/admin/sso-exchange`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nonce })
      }
    );
    if (!exchangeRes.ok) {
      console.warn('SSO exchange failed: status', exchangeRes.status);
      return res.redirect(loginRedirect);
    }
    const data = await exchangeRes.json();
    token = data.token;
  } catch (err) {
    console.error('SSO exchange request error:', err.message);
    return res.redirect(loginRedirect);
  }

  const ssoSecret = process.env.SSO_JWT_SECRET;
  if (!ssoSecret) {
    console.error('FATAL: SSO_JWT_SECRET is required for SSO exchange.');
    return res.redirect(loginRedirect);
  }
  let payload;
  try {
    payload = jwt.verify(token, ssoSecret);
  } catch (err) {
    console.warn('SSO token verification failed:', err.message);
    return res.redirect(loginRedirect);
  }

  if (payload.type !== 'staff-ops-sso' || !payload.email) return res.redirect(loginRedirect);
  if (!['admin', 'super_admin'].includes(payload.role)) return res.redirect(loginRedirect);

  try {
    const user = await Staff.findOne({ email: payload.email, role: 'Admin' });

    if (!user) {
      console.warn('SSO: no matching admin found for email:', payload.email);
      return res.redirect(loginRedirect);
    }

    const staffAuthSecret = process.env.STAFF_JWT_SECRET;
    if (!staffAuthSecret) {
      console.error('FATAL: STAFF_JWT_SECRET is required.');
      return res.redirect(loginRedirect);
    }
    const sessionToken = jwt.sign(
      { id: user._id },
      staffAuthSecret,
      { expiresIn: process.env.JWT_EXPIRE || '30d' }
    );

    const cookieOptions = {
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      httpOnly: true,
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    };
    res.cookie(STAFF_COOKIE, sessionToken, cookieOptions);
    res.cookie(LEGACY_COOKIE, sessionToken, cookieOptions);

    await AuditLog.create({
      actionType: 'SSO_LOGIN',
      targetModel: 'Staff',
      targetId: user._id,
      performedBy: user._id,
      details: { source: 'MAIN_ADMIN', email: payload.email, role: payload.role },
      ipAddress: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      timestamp: new Date()
    });

    return res.redirect('/staff-admin/dashboard');
  } catch (err) {
    console.error('SSO login error:', err.message);
    return res.redirect(loginRedirect);
  }
});

// Staff Admin dashboard alias — protected, redirects to existing portal
app.get('/staff-admin/dashboard', protect, authorize('Admin', 'Super Admin'), (req, res) => {
    const role = req.user?.role;
    if (!['Admin', 'Super Admin'].includes(role)) {
        return res.redirect('/portal/auth/login?error=unauthorized');
    }
    return res.redirect('/portal/admin-staff/dashboard');
});

// CSRF error handler for portal
app.use('/portal', (err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).render('auth/login', {
            error: 'Session expired. Please log in again.',
            message: null,
            csrfToken: req.csrfToken ? req.csrfToken() : ''
        });
    }
    next(err);
});

// Convenience redirects so staff can find the portal easily
app.get('/staff-login', (req, res) => res.redirect('/portal/auth/login'));
app.get('/portal', (req, res) => res.redirect('/portal/auth/login'));
app.get('/', (req, res) => res.redirect('/portal/auth/login'));

// Setup Socket.io
require('./config/socket')(server);

// ── Phase 8: Automation Cron Scheduler ────────────────────────────────────────
// Runs every 30 minutes to check for event reminders and post-event tasks
const automation = require('./services/automationService');
const surveyHelper = require('./controllers/surveyController');

setInterval(async () => {
    try {
        await automation.runScheduledChecks();
    } catch (err) {
        console.error('[Automation Cron] Error:', err.message);
    }
}, 30 * 60 * 1000); // every 30 minutes

// ── Phase 11: Post-Event Survey Trigger ──────────────────────────────────────
// Hook into mongoose Assignment model to auto-create surveys on completion
(async () => {
    const Assignment = require('./models/Assignment');
    // Watch for status changes to 'Completed'
    try {
        const changeStream = Assignment.watch([
            { $match: { 'updateDescription.updatedFields.status': 'Completed' } }
        ]);
        changeStream.on('change', async (change) => {
            if (change.updateDescription?.updatedFields?.status === 'Completed') {
                const assignment = await Assignment.findById(change.documentKey._id)
                    .populate('accepted_staff_ids', 'name')
                    .lean();
                if (assignment) {
                    await surveyHelper.createSurveysForAssignment(assignment);
                    await automation.sendPostEventThankYou(assignment._id);
                    console.log(`[Server] Post-event tasks triggered for: ${assignment.title}`);
                }
            }
        });
        changeStream.on('error', (err) => {
            // Change streams require a replica set - safe to ignore in dev
            if (!err.message?.includes('ChangeStream')) {
                console.error('[Change Stream] Error:', err.message);
            }
        });
    } catch (err) {
        // Change streams not available in standalone MongoDB - not fatal
        console.log('[Server] Change streams not available (standalone MongoDB) — post-event tasks will use API triggers instead.');
    }
})();

app.use('/health', require('../server/routes/health.routes'));

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
  res.status(statusCode).json( { 
    message: 'Something went wrong',
    statusCode 
  });
});

module.exports = { app, server };
const PORT = process.env.PORT || process.env.PORT_STAFF || 3001;
if (!process.env.PORT && process.env.NODE_ENV === 'production') {
  console.warn('[WARN] process.env.PORT not set in production; falling back to PORT_STAFF/3001');
}
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  server.listen(PORT, () => {
    console.log(`Staff System running on port ${PORT}`);
    console.log(`✅ Phase 8 automation scheduler active`);
    console.log(`✅ Phase 12 live command center ready`);

    // Start Missing Staff recovery check & interval loop
    startJob();

    // Start Payment Recovery Service (every 10 minutes)
    const { runRecovery } = require('./financials/services/paymentRecoveryService');
    const RECOVERY_INTERVAL = 10 * 60 * 1000; // 10 minutes
    global._paymentRecoveryInterval = setInterval(() => {
      runRecovery().catch(err => console.error('[Recovery] Unhandled error:', err.message));
    }, RECOVERY_INTERVAL);
    console.log(`✅ Payment recovery service active (every ${RECOVERY_INTERVAL / 60000}min)`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Stopping staff server gracefully...');
  stopJob();
  if (global._paymentRecoveryInterval) clearInterval(global._paymentRecoveryInterval);
    server.close(() => {
        mongoose.connection.close();
        process.exit(0);
    });
});




