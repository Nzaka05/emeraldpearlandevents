const jwt = require('jsonwebtoken');
const Staff = require('../models/Staff');
const STAFF_COOKIE = 'staff_portal_token';
const LEGACY_COOKIE = 'portal_token';

function verifyWithStaffSecrets(token) {
    const secret = process.env.STAFF_JWT_SECRET;

    if (!secret) {
        throw new Error('JWT secret not configured');
    }

    return jwt.verify(token, secret);
}

// Helper: detect API/JSON request vs browser request
function isApiRequest(req) {
    return (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) ||
           (req.headers['authorization'] && req.headers['authorization'].startsWith('Bearer')) ||
           (req.headers['accept'] && req.headers['accept'].includes('application/json'));
}

// Helper: send a 401 response (API or redirect)
function sendUnauthorized(req, res, code, message) {
    if (isApiRequest(req)) {
        return res.status(401).json({
            success: false,
            error: { code, message, statusCode: 401 },
            timestamp: new Date().toISOString()
        });
    }
    return res.redirect(`/portal/auth/login?error=${encodeURIComponent(message)}`);
}

// Protect routes
exports.protect = async (req, res, next) => {
    let token;

    // Check headers for Bearer token (API / Mobile)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    // Fallback to cookies (Browser / Portal)
    else if (req.cookies && req.cookies[STAFF_COOKIE]) {
        token = req.cookies[STAFF_COOKIE];
    }
    // Legacy fallback cookie
    else if (req.cookies && req.cookies[LEGACY_COOKIE]) {
        token = req.cookies[LEGACY_COOKIE];
    }

    // Make sure token exists
    if (!token) {
        return sendUnauthorized(req, res, 'NOT_AUTHENTICATED', 'Not authorized to access this route');
    }

    try {
        // Verify token with either staff-specific or legacy secret
        const decoded = verifyWithStaffSecrets(token);

        req.user = await Staff.findById(decoded.id);

        if (!req.user) {
            return sendUnauthorized(req, res, 'USER_NOT_FOUND', 'User no longer exists');
        }

        // ── SECURITY FIX: Block suspended / inactive accounts ────────────────
        // This kills zombie sessions: even if the JWT is cryptographically
        // valid, a suspended user is immediately locked out.
        if (req.user.status !== 'Active') {
            // Clear the cookie so the browser stops sending it
            res.clearCookie(STAFF_COOKIE, { httpOnly: true, path: '/' });
            res.clearCookie(LEGACY_COOKIE, { httpOnly: true, path: '/' });
            return sendUnauthorized(req, res, 'ACCOUNT_SUSPENDED', 'Account suspended. Contact administrator.');
        }

        // ── SECURITY FIX: Token version invalidation ─────────────────────────
        // If the token was issued before the user's tokenVersion was bumped
        // (e.g. via logout-all-sessions or password change), reject it.
        // decoded.tv is undefined for legacy tokens — those are treated as
        // version 0 and will be rejected once the user's tokenVersion > 0.
        const tokenVer = decoded.tv ?? 0;
        const userVer = req.user.tokenVersion ?? 0;
        if (tokenVer < userVer) {
            res.clearCookie(STAFF_COOKIE, { httpOnly: true, path: '/' });
            res.clearCookie(LEGACY_COOKIE, { httpOnly: true, path: '/' });
            return sendUnauthorized(req, res, 'TOKEN_REVOKED', 'Session invalidated. Please log in again.');
        }

        // Force password change check
        const isAuthRoute = req.originalUrl.includes('/portal/auth/');
        if (req.user.mustChangePassword && !isAuthRoute) {
            if (isApiRequest(req)) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'You must change your password before proceeding', statusCode: 403 },
                    timestamp: new Date().toISOString()
                });
            }
            return res.redirect('/portal/auth/change-password');
        }

        // Make user available to all views
        res.locals.user = req.user;
        next();
    } catch (err) {
        return sendUnauthorized(req, res, 'INVALID_TOKEN', 'Not authorized to access this route');
    }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            if (isApiRequest(req)) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'ROLE_NOT_AUTHORIZED', message: `User role '${req.user.role}' is not authorized`, statusCode: 403 },
                    timestamp: new Date().toISOString()
                });
            }
            return res.redirect('/portal/staff/dashboard?error=User role is not authorized to access this route');
        }
        next();
    };
};
