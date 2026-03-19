const jwt = require('jsonwebtoken');
const Staff = require('../models/Staff');

// Helper: detect API/JSON request vs browser request
function isApiRequest(req) {
    return (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) ||
           (req.headers['authorization'] && req.headers['authorization'].startsWith('Bearer')) ||
           (req.headers['accept'] && req.headers['accept'].includes('application/json'));
}

// Protect routes
exports.protect = async (req, res, next) => {
    let token;

    // Check headers for Bearer token (API / Mobile)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    // Fallback to cookies (Browser / Portal)
    else if (req.cookies && req.cookies.portal_token) {
        token = req.cookies.portal_token;
    }

    // Make sure token exists
    if (!token) {
        if (isApiRequest(req)) {
            return res.status(401).json({
                success: false,
                error: { code: 'NOT_AUTHENTICATED', message: 'Not authorized to access this route', statusCode: 401 },
                timestamp: new Date().toISOString()
            });
        }
        return res.redirect('/portal/auth/login?error=Not authorized to access this route');
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');

        req.user = await Staff.findById(decoded.id);

        if (!req.user) {
            if (isApiRequest(req)) {
                return res.status(401).json({
                    success: false,
                    error: { code: 'USER_NOT_FOUND', message: 'User no longer exists', statusCode: 401 },
                    timestamp: new Date().toISOString()
                });
            }
            return res.redirect('/portal/auth/login?error=User no longer exists');
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
        if (isApiRequest(req)) {
            return res.status(401).json({
                success: false,
                error: { code: 'INVALID_TOKEN', message: 'Not authorized to access this route', statusCode: 401 },
                timestamp: new Date().toISOString()
            });
        }
        return res.redirect('/portal/auth/login?error=Not authorized to access this route');
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
