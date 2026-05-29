/*
CLIENT PORTAL ROUTING
Served from Node.js port 3000 under /client prefix.
Production: Point portal.emeraldpearlandevents.com to this server.
DNS: Add CNAME record for portal subdomain pointing to server IP or hosting domain.
Netlify marketing site at emeraldpearlandevents.netlify.app should have a
Client Login button linking to portal.emeraldpearlandevents.com/client/login.
No backend changes needed on Netlify. Marketing site remains fully static.
*/

console.trace('[DEBUG] clientPortalRoutes started loading');
const express = require('express');
const router = express.Router();
const csrf = require('csurf');
const rateLimit = require('express-rate-limit');
const { protectClient, enforceDataOwnership } = require('../middleware/clientAuthMiddleware');
const { loginLimiter, passwordResetLimiter, generalApiLimiter } = require('../middleware/clientRateLimiter');
const clientPortalController = require('../controllers/clientPortalController');
const passport = require('passport');

const aiRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: {
        success: false,
        message: 'Too many requests, please try again in a minute.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// CSRF Protection config
const csrfProtection = csrf({ cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' } });

// ── CSRF BYPASS FOR APIS ──
router.use((req, res, next) => {
    const isApiRoute = req.path.startsWith('/api') || 
                       req.headers['content-type'] === 'application/json' ||
                       req.headers['authorization'];
    
    if (isApiRoute) {
        res.locals.csrfToken = '';
        return next();
    }
    
    // Evaluate CSRF for browser form requests
    csrfProtection(req, res, next);
});

// ── MIDDLEWARE FALLBACK ──
router.use((req, res, next) => {
    if (!res.locals.csrfToken && req.csrfToken) {
        res.locals.csrfToken = req.csrfToken();
    }
    next();
});

// ── EJS VIEW ROUTES ──
router.get('/login', clientPortalController.renderLogin);
router.get('/signup', clientPortalController.renderSignup);
router.get('/logout', clientPortalController.handleLogoutView);
router.get('/password-reset/request', clientPortalController.renderPasswordResetRequest);
router.get('/password-reset/confirm', clientPortalController.renderPasswordResetConfirm);

// --- GOOGLE OAUTH ROUTES ---
router.get('/google-login', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google-login/callback', 
    passport.authenticate('google', { failureRedirect: '/api/v1/client/login?error=Google sign-in failed', session: false }),
    clientPortalController.googleAuthCallback
);

router.get('/dashboard', protectClient, clientPortalController.renderDashboard);
router.get('/events/:eventId', protectClient, enforceDataOwnership, clientPortalController.renderEventDetail);
router.get('/invoices', protectClient, clientPortalController.renderInvoices);
router.get('/invoices/:invoiceId', protectClient, enforceDataOwnership, clientPortalController.renderInvoices);
router.get('/invoices/:invoiceId/download', protectClient, enforceDataOwnership, (req, res) => res.send('PDF'));
router.get('/etr/:eventId', protectClient, enforceDataOwnership, clientPortalController.renderEtrView);
router.get('/etr/:eventId/download', protectClient, enforceDataOwnership, clientPortalController.apiDownloadEtr);
router.get('/sessions', protectClient, clientPortalController.renderSessions);

// ── API ROUTES ──
router.post('/api/login', loginLimiter, clientPortalController.apiLogin);
router.post('/api/signup', loginLimiter, clientPortalController.apiRegister);
router.post('/api/refresh-token', clientPortalController.apiRefreshToken);
router.post('/api/password-reset/request', passwordResetLimiter, clientPortalController.apiPasswordResetRequest);
router.post('/api/password-reset/confirm', passwordResetLimiter, clientPortalController.apiPasswordResetConfirm);

// Protected API Routes
router.use('/api', protectClient, generalApiLimiter);
router.post('/api/logout', clientPortalController.apiLogout);
router.post('/api/logout-all-devices', clientPortalController.apiLogoutAllDevices);
router.get('/api/dashboard', clientPortalController.apiGetDashboard);
router.get('/api/events', clientPortalController.apiGetEvents);
router.get('/api/events/:eventId', enforceDataOwnership, clientPortalController.apiGetEventDetail);
router.get('/api/invoices', clientPortalController.apiGetInvoices);
router.get('/api/invoices/:invoiceId', enforceDataOwnership, clientPortalController.apiGetInvoiceDetail);
router.get('/api/etr/:eventId', enforceDataOwnership, clientPortalController.apiGetEtr);
router.get('/api/sessions', clientPortalController.apiGetSessions);
router.delete('/api/sessions/:sessionId', clientPortalController.apiDeleteSession);

// ── Client Event Health (AI-powered, safe exposure only) ──
router.get('/api/event-health/:eventId', aiRateLimiter, enforceDataOwnership, clientPortalController.apiGetEventHealth);

// Error fallback for CSRF
router.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({ success: false, data: { message: 'Invalid CSRF token' }, timestamp: new Date() });
    }
    next(err);
});

module.exports = router;
