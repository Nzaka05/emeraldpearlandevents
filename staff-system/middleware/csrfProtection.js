const csrf = require('csurf');

const csrfProtection = csrf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    },
    value: (req) => (
        req.body?._csrf ||
        req.headers['x-csrf-token'] ||
        req.headers['csrf-token'] ||
        req.headers['x-xsrf-token'] ||
        req.headers['xsrf-token'] ||
        req.query?._csrf
    )
});

const csrfErrorHandler = (err, req, res, next) => {
    if (err.code !== 'EBADCSRFTOKEN') return next(err);

    const wantsJson = req.xhr ||
        req.headers.accept?.includes('application/json') ||
        req.headers['content-type']?.includes('application/json');

    if (wantsJson) {
        return res.status(403).json({
            success: false,
            message: 'Invalid or missing CSRF token'
        });
    }

    return res.status(403).render('auth/login', {
        error: 'Session expired. Please log in again.',
        message: null,
        csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
};

module.exports = { csrfProtection, csrfErrorHandler };
