require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
// require('../scripts/checkEnv'); // disabled for standalone deployment // Halt dynamically before server boots if environment is mismatched

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

// ── Remaining admin.js routes not yet split (live, planner, invoice, survey) ──
const adminLegacyRoutes = require('./routes/admin');
const Staff = require('./models/Staff');
const AuditLog = require('./models/AuditLog');
const { protect, authorize } = require('./middleware/auth');
const emailService = require('./services/emailService');
emailService.initializeEmailService();

const app = express();
app.set('trust proxy', 1);
app.set('trust proxy', 1);
const server = http.createServer(app);

// Connect to MongoDB
const mongoUri = process.env.MONGO_URI || process.env.MONGO_URI ||
    'mongodb+srv://admin:Galaxyimpact.@cluster0.wa8samz.mongodb.net/emerald?retryWrites=true&w=majority';

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
app.use(cors());
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
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined'));
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

// Rate limiting
const limiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 mins
    max: 1000, // Increased for subagent testing
    message: { success: false, error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

// Stricter rate limiting for authentication endpoints
const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per window
    message: { success: false, error: 'Too many authentication attempts, please try again later' }
});

// Apply rate limiting to /portal/auth routes
app.use('/portal/auth/', limiter);
app.use('/portal/auth/login', authLimiter);
app.use('/portal/auth/forgot-password', authLimiter);
app.use('/portal/auth/reset-password', authLimiter);

// Booking sync receiver from port 3000
app.post('/internal/sync-booking', async (req, res) => {
  try {
    const syncSecret = process.env.JWT_SECRET || 'fallback_secret_key';
    if (req.headers['x-internal-secret'] !== syncSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
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
  app.post('/internal/sync-event-complete', async (req, res) => {
    try {
      const syncSecret = process.env.JWT_SECRET || 'fallback_secret_key';
      if (req.headers['x-internal-secret'] !== syncSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
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
app.post('/internal/sync-staff', async (req, res) => {
  const syncSecret = process.env.JWT_SECRET || 'fallback_secret_key';
  const authHeader = req.headers['x-internal-secret'];
  
  if (authHeader !== syncSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
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
app.post('/internal/sync-payment', async (req, res) => {
    try {
        const syncSecret = process.env.JWT_SECRET || 'fallback_secret_key';
        if (req.headers['x-internal-secret'] !== syncSecret) return res.status(401).json({ error: 'Unauthorized' });
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
app.post('/internal/sync-pricing', async (req, res) => {
    try {
        const syncSecret = process.env.JWT_SECRET || 'fallback_secret_key';
        if (req.headers['x-internal-secret'] !== syncSecret) return res.status(401).json({ error: 'Unauthorized' });
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

// ── Admin domain routes (split from monolithic admin.js) ──────────────────────
app.use('/portal/admin-staff', adminDashboardRoutes);
app.use('/portal/admin-staff', adminStaffRoutes);
app.use('/portal/admin-staff', adminEventsRoutes);
app.use('/portal/admin-staff', adminFinanceRoutes);
app.use('/portal/admin-staff', adminReportsRoutes);

// ── Remaining routes (live command center, planners, invoices, surveys) ───────
// TODO: extract these into their own domain routers in a future refactor
app.use('/portal/admin-staff', adminLegacyRoutes);

app.use('/portal/staff', staffRoutes);
app.use('/portal/supervisor', supervisorRoutes);
app.use('/portal/supervisor/command-center', require('./routes/commandCenterRoutes'));
app.use('/portal/ai', require('./staff-routes/aiRoutes'));
app.use('/portal/finance', require('./financials/routes/financeRoutes'));
app.use('/', require('./routes/performanceRoutes'));

// SSO Login — accepts short-lived token from Main Admin (port 3000)
app.get('/staff-admin/sso-login', async (req, res) => {
    const { token } = req.query;
    const ssoSecret = process.env.SSO_JWT_SECRET || process.env.JWT_SECRET || 'fallback_secret_key';
    const loginRedirect = '/portal/auth/login?error=sso_failed';

    if (!token) return res.redirect(loginRedirect);

    let payload;
    try {
        payload = jwt.verify(token, ssoSecret);
    } catch (err) {
        console.warn('SSO token verification failed:', err.message);
        return res.redirect(loginRedirect);
    }

    if (payload.type !== 'staff-ops-sso' || !payload.email) return res.redirect(loginRedirect);
    if (!['Admin', 'Super Admin'].includes(payload.role)) return res.redirect(loginRedirect);

    try {
        const user = await Staff.findOne({
            email: payload.email,
            role: 'Admin'
        });

        if (!user) {
            console.warn('SSO: no matching admin found for email:', payload.email);
            return res.redirect(loginRedirect);
        }

        const sessionToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET || 'fallback_secret_key',
            { expiresIn: process.env.JWT_EXPIRE || '30d' }
        );

        res.cookie('portal_token', sessionToken, {
            expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            httpOnly: true
        });

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
  res.status(statusCode).json( { 
    message: 'Something went wrong',
    statusCode 
  });
});

module.exports = { app, server };
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Staff System running on port ${PORT}`);
    console.log(`✅ Phase 8 automation scheduler active`);
    console.log(`✅ Phase 12 live command center ready`);
    
    // Start Missing Staff recovery check & interval loop
    require('./jobs/missingStaffJob').startJob();
});




