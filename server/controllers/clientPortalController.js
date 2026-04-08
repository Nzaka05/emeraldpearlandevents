/*
const respond = require('../../utils/respond');
CLIENT PORTAL <-> STAFF SYSTEM DATA CONTRACTS

1) Event Health Response (GET /internal/client-portal/event-health/:eventId)
{
    success: boolean,
    data: {
        eventId: string,
        title: string,
        status: string,
        progress: string,
        risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
    }
}

2) Client Invoices Response (GET /internal/client-portal/invoices)
{
    success: boolean,
    data: {
        invoices: Array<{
            _id: string,
            ref: string,
            description: string,
            date: string | Date,
            totalAmount: number,
            amountPaid: number,
            outstanding: number,
            status: string,
            createdAt: string | Date
        }>
    }
}

3) Single Invoice Response (GET /internal/client-portal/invoices/:invoiceId)
{
    success: boolean,
    data: {
        invoice: object
    }
}
*/

const clientAuthService = require('../services/clientAuthService');
const ClientSession = require('../models/ClientSession');
const staffSystemGateway = require('../services/staffSystemGateway');

// ── BOOKING STATUS → TIMELINE STAGE MAP ──────────────────────────────────────
// Booking.status values:  new | contacted | confirmed | completed | cancelled
// Dashboard timeline keys: PLANNED | STAFFING | READY | LIVE | COMPLETED | FINANCE_SETTLED
const BOOKING_STATUS_TO_STAGE = {
    'new':       'PLANNED',
    'contacted': 'STAFFING',
    'confirmed': 'READY',
    'completed': 'COMPLETED',
    'cancelled': 'CANCELLED',
};

// Helper: map a Booking document to a dashboard event object
function bookingToEvent(b) {
    const stage = BOOKING_STATUS_TO_STAGE[b.status] || 'PLANNED';
    const total = b.estimatedTotal || 0;
    const paid  = b.amountPaid    || 0;
    return {
        _id:          b._id,
        title:        b.eventType || 'Private Event',
        date:         b.eventDate,
        location:     b.location,
        status:       stage,
        bookingRef:   b.bookingReference,
        estimatedTotal: total,
        amountPaid:   paid,
        outstanding:  Math.max(0, total - paid),
        // Keep raw booking status for display fallback
        rawStatus:    b.status,
    };
}

// --- EJS VIEW CONTROLLERS ---

exports.renderLogin = (req, res) => {
    res.render('client/login', { layout: false, csrfToken: req.csrfToken ? req.csrfToken() : '' });
};

exports.renderSignup = (req, res) => {
    res.render('client/signup', { layout: false, csrfToken: req.csrfToken ? req.csrfToken() : '' });
};

exports.renderDashboard = (req, res) => {
    res.render('client/dashboard', { layout: false, csrfToken: req.csrfToken ? req.csrfToken() : '', client: req.client });
};

exports.renderEventDetail = (req, res) => {
    res.render('client/eventDetail', { layout: false, csrfToken: req.csrfToken ? req.csrfToken() : '', client: req.client, eventId: req.params.eventId });
};

exports.renderInvoices = (req, res) => {
    res.render('client/invoices', { layout: false, csrfToken: req.csrfToken ? req.csrfToken() : '', client: req.client });
};

exports.renderEtrView = (req, res) => {
    res.render('client/etrView', { layout: false, csrfToken: req.csrfToken ? req.csrfToken() : '', client: req.client, eventId: req.params.eventId });
};

exports.renderSessions = (req, res) => {
    res.render('client/sessions', { layout: false, csrfToken: req.csrfToken ? req.csrfToken() : '', client: req.client });
};

exports.renderPasswordResetRequest = (req, res) => {
    res.render('client/passwordResetRequest', { layout: false, csrfToken: req.csrfToken ? req.csrfToken() : '' });
};

exports.renderPasswordResetConfirm = (req, res) => {
    res.render('client/passwordResetConfirm', { layout: false, csrfToken: req.csrfToken ? req.csrfToken() : '', token: req.query.token });
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

        respond(res, 200, { success: true, data: result, timestamp: new Date() });
    } catch (e) {
        if (e.message.startsWith('423:')) {
            return respond(res, 423, { success: false, data: { message: e.message.substring(4) }, timestamp: new Date() });
        }
        if (e.message.startsWith('403:')) {
            return respond(res, 403, { success: false, data: { message: e.message.substring(4) }, timestamp: new Date() });
        }
        respond(res, 401, { success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiRegister = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        if (!name || !email || !phone || !password) {
            return respond(res, 400, { success: false, data: { message: 'All fields are required' } });
        }

        const result = await clientAuthService.registerNewClient(name, email, phone, password, req.ip, req.headers['user-agent']);
        
        const loginResult = await clientAuthService.loginClient(email, password, req.ip, req.headers['user-agent']);
        
        res.cookie('client_token', loginResult.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 15 * 60 * 1000
        });

        respond(res, 200, { success: true, data: { ...result, ...loginResult }, timestamp: new Date() });
    } catch (e) {
        respond(res, 400, { success: false, data: { message: e.message }, timestamp: new Date() });
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

        res.redirect('/client/dashboard?sso=true&ref=' + req.user.refreshToken);
    } catch (e) {
        res.redirect('/client/login?error=' + encodeURIComponent(e.message));
    }
};

exports.apiLogout = async (req, res) => {
    try {
        res.clearCookie('client_token');
        if (req.body.sessionId) {
            await clientAuthService.logoutClient(req.client.client_id, req.body.sessionId);
        }
        respond(res, 200, { success: true, data: { message: 'Logged out' }, timestamp: new Date() });
    } catch (e) {
        respond(res, 500, { success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiLogoutAllDevices = async (req, res) => {
    try {
        const count = await clientAuthService.logoutAllDevices(req.client.client_id);
        res.clearCookie('client_token');
        respond(res, 200, { success: true, data: { revoked: count }, timestamp: new Date() });
    } catch (e) {
        respond(res, 500, { success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiRefreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return respond(res, 400, { success: false, data: { message: 'Refresh token required' }, timestamp: new Date() });
        
        const newAccessToken = await clientAuthService.refreshToken(refreshToken, req.ip, req.headers['user-agent']);
        
        res.cookie('client_token', newAccessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 15 * 60 * 1000
        });

        respond(res, 200, { success: true, data: { accessToken: newAccessToken }, timestamp: new Date() });
    } catch (e) {
        respond(res, 401, { success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

// ── DASHBOARD API ─────────────────────────────────────────────────────────────
// FIX: Was querying Assignment (staff-system model) — client bookings live in
//      the Booking collection keyed by customerId = ClientAccount.client_id.
//      Also pulls PricingSettings.paymentMethods so admin rate changes reflect
//      immediately in the client portal without a redeploy.
// ─────────────────────────────────────────────────────────────────────────────
exports.apiGetDashboard = async (req, res) => {
    try {
        const Booking         = require('../models/Booking');
        const PricingSettings = require('../models/PricingSettings');

        // ── 1. Load all bookings for this customer ────────────────────────────
        // ClientAccount.client_id references Customer._id, which is the same
        // ObjectId stored in Booking.customerId.
        const rawBookings = await Booking.find({ customerId: req.client.client_id })
            .select('eventType eventDate location status estimatedTotal amountPaid bookingReference')
            .lean();

        const events = rawBookings.map(bookingToEvent);

        // ── 2. Counts ─────────────────────────────────────────────────────────
        const now     = new Date();
        const active  = events.filter(e => e.status === 'LIVE').length;
        const upcoming = events.filter(e =>
            ['PLANNED', 'STAFFING', 'READY'].includes(e.status) && new Date(e.date) > now
        ).length;
        const completed = events.filter(e =>
            ['COMPLETED', 'FINANCE_SETTLED'].includes(e.status)
        ).length;

        // ── 3. Payment totals ─────────────────────────────────────────────────
        const totalInvoiced    = events.reduce((s, e) => s + e.estimatedTotal, 0);
        const totalPaid        = events.reduce((s, e) => s + e.amountPaid,     0);
        const outstandingBalance = Math.max(0, totalInvoiced - totalPaid);

        // ── 4. Next upcoming event for countdown ──────────────────────────────
        const futureEvents = events
            .filter(e => e.date && new Date(e.date) >= now && e.status !== 'CANCELLED')
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        const nextEvent = futureEvents[0] || null;

        // ── 5. Recent events (latest 5, sorted desc by date) ─────────────────
        const recentEvents = [...events]
            .filter(e => e.status !== 'CANCELLED')
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);

        // ── 6. Payment methods from PricingSettings (live from admin) ─────────
        let paymentMethods = [];
        try {
            const pricing = await PricingSettings.findOne().select('paymentMethods').lean();
            if (pricing && pricing.paymentMethods) {
                paymentMethods = pricing.paymentMethods.filter(m => m.isActive);
            }
        } catch (pmErr) {
            console.warn('[Dashboard] Could not load paymentMethods:', pmErr.message);
        }

        respond(res, 200, {
            success: true,
            data: {
                active,
                upcoming,
                completed,
                totalInvoiced,
                totalPaid,
                outstandingBalance,
                nextEvent,
                recentEvents,
                paymentMethods,   // ← admin-configured, always fresh
            },
            timestamp: new Date()
        });

    } catch (e) {
        console.error('[apiGetDashboard]', e);
        respond(res, 500, { success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

// ── EVENTS API ────────────────────────────────────────────────────────────────
// Also fixed to query Booking instead of Assignment.
// ─────────────────────────────────────────────────────────────────────────────
exports.apiGetEvents = async (req, res) => {
    try {
        const Booking = require('../models/Booking');
        const rawBookings = await Booking.find({ customerId: req.client.client_id })
            .select('eventType eventDate location status estimatedTotal amountPaid bookingReference')
            .lean();
        const events = rawBookings.map(bookingToEvent);
        respond(res, 200, { success: true, data: { events }, timestamp: new Date() });
    } catch (e) {
        respond(res, 500, { success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiGetEventDetail = async (req, res) => {
    try {
        const Booking = require('../models/Booking');
        // enforceDataOwnership middleware has already verified ownership
        const booking = await Booking.findOne({
            _id: req.params.eventId,
            customerId: req.client.client_id
        }).lean();
        if (!booking) return respond(res, 404, { success: false, data: { message: 'Not found' }, timestamp: new Date() });
        respond(res, 200, { success: true, data: { event: bookingToEvent(booking) }, timestamp: new Date() });
    } catch (e) {
        respond(res, 500, { success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiGetInvoices = async (req, res) => {
    try {
        // Primary path: query staff system through internal API boundary.
        try {
            const remote = await staffSystemGateway.getClientInvoices(req.client.client_id.toString());
            if (remote && remote.success && remote.data && Array.isArray(remote.data.invoices)) {
                return respond(res, 200, { success: true, data: { invoices: remote.data.invoices }, timestamp: new Date() });
            }
        } catch (remoteErr) {
            console.warn('[apiGetInvoices] staff-system unavailable, using booking fallback:', remoteErr.message);
        }

        // Fallback: synthesise invoice-like objects from Bookings
        const Booking = require('../models/Booking');
        const rawBookings = await Booking.find({ customerId: req.client.client_id })
            .select('eventType eventDate estimatedTotal amountPaid bookingReference status createdAt')
            .lean();

        const invoices = rawBookings.map(b => ({
            _id:          b._id,
            ref:          b.bookingReference,
            description:  b.eventType,
            date:         b.eventDate,
            totalAmount:  b.estimatedTotal || 0,
            amountPaid:   b.amountPaid     || 0,
            outstanding:  Math.max(0, (b.estimatedTotal || 0) - (b.amountPaid || 0)),
            status:       b.amountPaid >= b.estimatedTotal && b.estimatedTotal > 0 ? 'paid' : 'partial',
            createdAt:    b.createdAt,
        }));

        respond(res, 200, { success: true, data: { invoices }, timestamp: new Date() });
    } catch (e) {
        respond(res, 500, { success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiGetInvoiceDetail = async (req, res) => {
    try {
        // Primary path: query staff system through internal API boundary.
        try {
            const remote = await staffSystemGateway.getClientInvoiceById(
                req.client.client_id.toString(),
                req.params.invoiceId
            );
            if (remote && remote.success && remote.data && remote.data.invoice) {
                return respond(res, 200, { success: true, data: { invoice: remote.data.invoice }, timestamp: new Date() });
            }
        } catch (remoteErr) {
            console.warn('[apiGetInvoiceDetail] staff-system unavailable, using booking fallback:', remoteErr.message);
        }

        // Fallback to Booking
        const Booking = require('../models/Booking');
        const booking = await Booking.findOne({ _id: req.params.invoiceId, customerId: req.client.client_id }).lean();
        if (!booking) return respond(res, 404, { success: false, data: { message: 'Not found' }, timestamp: new Date() });
        respond(res, 200, { success: true, data: { invoice: booking }, timestamp: new Date() });
    } catch (e) {
        respond(res, 500, { success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiGetEtr = async (req, res) => {
    respond(res, 200, { success: true, data: { message: 'ETR Data' }, timestamp: new Date() });
};

exports.apiGetEventHealth = async (req, res) => {
    try {
        if (!/^[a-f\d]{24}$/i.test(req.params.eventId)) {
            return respond(res, 400, { success: false, error: 'Invalid ID' });
        }

        const remote = await staffSystemGateway.getEventHealth(
            req.params.eventId,
            req.client.client_id.toString()
        );

        if (!remote || !remote.success || !remote.data) {
            return respond(res, 503, { success: false, error: 'Event health service unavailable' });
        }

        return respond(res, 200, { success: true, data: remote.data });
    } catch (e) {
        const status = e.response && e.response.status ? e.response.status : 503;
        const message = e.response && e.response.data && e.response.data.error
            ? e.response.data.error
            : 'Event health service unavailable';

        if (status >= 400 && status < 500) {
            return respond(res, status, { success: false, error: message });
        }

        console.error('[Client] event-health error:', e.message);
        return respond(res, 503, { success: false, error: 'Event health service unavailable' });
    }
};

exports.apiGetSessions = async (req, res) => {
    try {
        const sessions = await ClientSession.find({ client_id: req.client.client_id, is_active: true }).select('-refresh_token_hash');
        respond(res, 200, { success: true, data: { sessions }, timestamp: new Date() });
    } catch (e) {
        respond(res, 500, { success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiDeleteSession = async (req, res) => {
    try {
        await clientAuthService.logoutClient(req.client.client_id, req.params.sessionId);
        respond(res, 200, { success: true, data: { message: 'Session revoked' }, timestamp: new Date() });
    } catch (e) {
        respond(res, 500, { success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiPasswordResetRequest = async (req, res) => {
    try {
        await clientAuthService.requestPasswordReset(req.body.email, req.ip);
        respond(res, 200, { success: true, data: { message: 'If email exists, reset link sent' }, timestamp: new Date() });
    } catch (e) {
        respond(res, 500, { success: false, data: { message: e.message }, timestamp: new Date() });
    }
};

exports.apiPasswordResetConfirm = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        await clientAuthService.resetPassword(token, newPassword);
        respond(res, 200, { success: true, data: { message: 'Password reset successful' }, timestamp: new Date() });
    } catch (e) {
        respond(res, 400, { success: false, data: { message: e.message }, timestamp: new Date() });
    }
};
