const csrf = require('csurf');

const csurfInstance = csrf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    },
    value: (req) => {
        return req.body?._csrf || 
               req.headers['x-csrf-token'] || 
               req.headers['csrf-token'] ||
               req.headers['x-xsrf-token'] ||
               req.headers['xsrf-token'] ||
               req.query?._csrf;
    }
});

const csrfProtection = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const hasBearer = authHeader && authHeader.startsWith('Bearer ');
    const hasAdminCookie = req.cookies && req.cookies.adminToken;
    const hasClientCookie = req.cookies && req.cookies.client_token;

    if (hasBearer && !hasAdminCookie && !hasClientCookie) {
        // Skip CSRF validation for non-cookie CLI/script consumers
        return next();
    }

    return csurfInstance(req, res, next);
};

// Middleware to expose token to frontend via response header
const attachCsrfToken = (req, res, next) => {
    res.setHeader('X-CSRF-Token', req.csrfToken());
    next();
};

// Error handler for CSRF failures
const csrfErrorHandler = (err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
            success: false,
            message: 'Invalid or missing CSRF token'
        });
    }
    next(err);
};

module.exports = { csrfProtection, attachCsrfToken, csrfErrorHandler };
