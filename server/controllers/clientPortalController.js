const clientAuthService = require('../services/clientAuthService');
const ClientSession = require('../models/ClientSession');

// staff-models loaded lazily — not available in all deployments
let Assignment = null;
let ClientInvoice = null;
try { Assignment = require('../../staff-models/Assignment'); } catch(e) { console.warn('[ClientPortalController] Assignment model unavailable'); }
try { ClientInvoice = require('../../staff-system/models/ClientInvoice'); } catch(e) { console.warn('[ClientPortalController] ClientInvoice model unavailable'); }

// --- EJS VIEW CONTROLLERS ---

exports.renderLogin = (req, res) => {
    res.render('client/login', { csrfToken: req.csrfToken ? req.csrfToken() : '' });
};

exports.renderSignup = (req, res) => {
    res.render('client/signup', { csrfToken: req.csrfToken ? req.csrfToken() : '' });
};

exports.renderDashboard = (req, res) => {
    res.render('client/dashboard', { csrfToken: req.csrfToken ? req.csrfToken() : '', client: req.client });
};

exports.renderEventDetail = (req, res) => {
    res.render('client/eventDetail', { csrfToken: req.csrfToken ? req.csrfToken() : '', client: req.client, eventId: req.params.eventId });
};

exports.renderInvoices = (req, res) => {
    res.render('client/invoices', { csrfToken: req.csrfToken ? req.csrfToken() : '', client: req.client });
};

exports.renderEtrView = (req, res) => {
    res.render('client/etrView', { csrfToken: req.csrfToken ? req.csrfToken() : '', client: req.client, eventId: req.params.eventId });
};

exports.renderSessions = (req, res) => {
    res.render('client/sessions', { csrfToken: req.csrfToken ? req.csrfToken() : '', client: req.client });
};

exports.renderPasswordResetRequest = (req, res) => {
    res.render('client/passwordResetRequest', { csrfToken: req.csrfToken ? req.csrfToken() : '' });
};

exports.renderPasswordResetConfirm = (req, res) => {
    res.render('client/passwordResetConfirm', { csrfToken: req.csrfToken ? req.csrfToken() : '', token: req.query.token });
};

exports.handleLogoutView = (req, res) => {
    res.clearCookie('client_token');
    res.redirect('/client/login');
};

// --- API CONTROLLERS ---

exports.apiLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await clientAuthService.loginClient(email, password, req.ip, req.headers['user-agent']);
        
        res.cookie('client_token', result.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 15 * 60 * 1000
        });

        res.json({ success: true, data: result, timestamp: new Date() });
    } catch (e) {
        if (e.message.startsWith('423:')) {
            return res.status(423).json({ success: false, data: { message: e.message.substring(4) }, timestamp: new Date() });
        }
        if (e.message.startsWith('403:')) {
            return res.status(403).json({ success: false, data: { message: e.message.substring(4) }, timestamp: new Date() });
        }
        res.status(401).json({ success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiRegister = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        if (!name || !email || !phone || !password) {
            return res.status(400).json({ success: false, data: { message: 'All fields are required' } });
        }

        const result = await clientAuthService.registerNewClient(name, email, phone, password, req.ip, req.headers['user-agent']);
        
        // Auto-login after registration?
        const loginResult = await clientAuthService.loginClient(email, password, req.ip, req.headers['user-agent']);
        
        res.cookie('client_token', loginResult.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 15 * 60 * 1000
        });

        res.json({ success: true, data: { ...result, ...loginResult }, timestamp: new Date() });
    } catch (e) {
        res.status(400).json({ success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.googleAuthCallback = async (req, res) => {
    try {
        if (!req.user) throw new Error('Authentication failed');
        
        res.cookie('client_token', req.user.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 15 * 60 * 1000
        });

        // Store refresh token in localStorage via a temporary landing page or just redirect if using only cookies
        // But the previous implementation used localStorage for refresh token.
        // For SSO, we might need a bridge page or just set a refresh cookie too.
        // Let's redirect to dashboard and let the frontend handle it if needed.
        res.redirect('/client/dashboard?sso=true&ref=' + req.user.refreshToken);
    } catch (e) {
        res.redirect('/client/login?error=' + encodeURIComponent(e.message));
    }
};

exports.apiLogout = async (req, res) => {
    try {
        // Find session by refresh token? No, we don't have session id directly in JWT.
        // The prompt says logoutClient(clientId, sessionId). We'll assume the client is ending all or we can fetch current session id if tracking it.
        // Since JWT doesn't have sessionId, we will just clear cookie and optionally revoke if passed.
        res.clearCookie('client_token');
        if (req.body.sessionId) {
            await clientAuthService.logoutClient(req.client.client_id, req.body.sessionId);
        }
        res.json({ success: true, data: { message: 'Logged out' }, timestamp: new Date() });
    } catch (e) {
        res.status(500).json({ success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiLogoutAllDevices = async (req, res) => {
    try {
        const count = await clientAuthService.logoutAllDevices(req.client.client_id);
        res.clearCookie('client_token');
        res.json({ success: true, data: { revoked: count }, timestamp: new Date() });
    } catch (e) {
        res.status(500).json({ success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiRefreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ success: false, data: { message: 'Refresh token required' }, timestamp: new Date() });
        
        const newAccessToken = await clientAuthService.refreshToken(refreshToken, req.ip, req.headers['user-agent']);
        
        res.cookie('client_token', newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 15 * 60 * 1000
        });

        res.json({ success: true, data: { accessToken: newAccessToken }, timestamp: new Date() });
    } catch (e) {
        res.status(401).json({ success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiGetDashboard = async (req, res) => {
    try {
        const events = await Assignment.find({ client_id: req.client.client_id }).sort({ date: -1 });
        const invoices = await ClientInvoice.find({ client_id: req.client.client_id });
        
        const active = events.filter(e => e.status === 'LIVE').length;
        const upcoming = events.filter(e => ['PLANNED', 'STAFFING', 'READY'].includes(e.status)).length;
        const completed = events.filter(e => ['COMPLETED', 'FINANCE_SETTLED'].includes(e.status)).length;
        
        const outstanding = invoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0);

        res.json({
            success: true,
            data: { active, upcoming, completed, outstandingBalance: outstanding, recentEvents: events.slice(0, 5) },
            timestamp: new Date()
        });
    } catch (e) {
        res.status(500).json({ success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiGetEvents = async (req, res) => {
    try {
        const events = await Assignment.find({ client_id: req.client.client_id }).sort({ date: -1 });
        res.json({ success: true, data: { events }, timestamp: new Date() });
    } catch (e) {
        res.status(500).json({ success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiGetEventDetail = async (req, res) => {
    try {
        // Data ownership already verified by middleware
        const event = await Assignment.findById(req.params.eventId);
        if (!event) return res.status(404).json({ success: false, data: { message: 'Not found' }, timestamp: new Date() });
        res.json({ success: true, data: { event }, timestamp: new Date() });
    } catch (e) {
        res.status(500).json({ success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiGetInvoices = async (req, res) => {
    try {
        const invoices = await ClientInvoice.find({ client_id: req.client.client_id }).sort({ createdAt: -1 });
        res.json({ success: true, data: { invoices }, timestamp: new Date() });
    } catch (e) {
        res.status(500).json({ success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiGetInvoiceDetail = async (req, res) => {
    try {
        const invoice = await ClientInvoice.findById(req.params.invoiceId);
        if (!invoice) return res.status(404).json({ success: false, data: { message: 'Not found' }, timestamp: new Date() });
        res.json({ success: true, data: { invoice }, timestamp: new Date() });
    } catch (e) {
        res.status(500).json({ success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiGetEtr = async (req, res) => {
    res.json({ success: true, data: { message: 'ETR Data' }, timestamp: new Date() });
};

exports.apiGetSessions = async (req, res) => {
    try {
        const sessions = await ClientSession.find({ client_id: req.client.client_id, is_active: true }).select('-refresh_token_hash');
        res.json({ success: true, data: { sessions }, timestamp: new Date() });
    } catch (e) {
        res.status(500).json({ success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiDeleteSession = async (req, res) => {
    try {
        await clientAuthService.logoutClient(req.client.client_id, req.params.sessionId);
        res.json({ success: true, data: { message: 'Session revoked' }, timestamp: new Date() });
    } catch (e) {
        res.status(500).json({ success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiPasswordResetRequest = async (req, res) => {
    try {
        await clientAuthService.requestPasswordReset(req.body.email, req.ip);
        res.json({ success: true, data: { message: 'If email exists, reset link sent' }, timestamp: new Date() });
    } catch (e) {
        res.status(500).json({ success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiPasswordResetConfirm = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        await clientAuthService.resetPassword(token, newPassword);
        res.json({ success: true, data: { message: 'Password reset successful' }, timestamp: new Date() });
    } catch (e) {
        res.status(400).json({ success: false, data: { message: e.message }, timestamp: new Date() });
    }
};
