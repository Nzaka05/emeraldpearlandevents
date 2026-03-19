const jwt = require('jsonwebtoken');
const Staff = require('../staff-models/Staff');

// Protect routes
exports.protect = async (req, res, next) => {
    let token;

    // Check cookies — use portal_token to isolate from admin panel
    if (req.cookies && req.cookies.portal_token) {
        token = req.cookies.portal_token;
    }

    // Make sure token exists
    if (!token) {
        return res.redirect('/portal/auth/login?error=Not authorized to access this route');
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');

        req.user = await Staff.findById(decoded.id);

        if (!req.user) {
            return res.redirect('/portal/auth/login?error=User no longer exists');
        }

        // Force password change check
        const isAuthRoute = req.originalUrl.includes('/portal/auth/');
        if (req.user.mustChangePassword && !isAuthRoute) {
            return res.redirect('/portal/auth/change-password');
        }

        // Make user available to all views
        res.locals.user = req.user;
        next();
    } catch (err) {
        return res.redirect('/portal/auth/login?error=Not authorized to access this route');
    }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.redirect('/portal/staff/dashboard?error=User role is not authorized to access this route');
        }
        next();
    };
};
