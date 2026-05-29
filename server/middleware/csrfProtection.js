const csrf = require('csurf');

// Cookie-based CSRF — works with httpOnly auth cookies
const csrfProtection = csrf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    }
});

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
