const express = require('express');
const { login, logout, refresh, changePassword, forgotPassword, resetPassword, secureLogin, staffForgotPassword, getPortalChoice, getProfileJson } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { validateLogin, validatePasswordChange, sanitizeRequestBody } = require('../middleware/validation');

const router = express.Router();

// Disable the global layout for all auth pages globally to prevent double-rendering
router.use((req, res, next) => {
    res.locals.layout = false;
    next();
});

router.get('/login', (req, res) => {
    res.render('auth/login', { error: req.query.error, message: req.query.message });
});

router.post('/login', sanitizeRequestBody, validateLogin, login);
router.get('/logout', logout);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.get('/portal-choice', protect, getPortalChoice);
router.get('/me', protect, getProfileJson);

// Secure one-time login link (unprotected - user not yet authenticated)
router.get('/secure-login/:token', secureLogin);

router.get('/forgot-password', (req, res) => {
    res.render('auth/forgot-password', { error: null, message: null });
});
router.post('/forgot-password', sanitizeRequestBody, forgotPassword);

// Staff self-service forgot password
router.post('/staff-forgot-password', sanitizeRequestBody, staffForgotPassword);

router.get('/reset-password/:token', (req, res) => {
    res.render('auth/reset-password', { error: null, token: req.params.token });
});
router.post('/reset-password/:token', sanitizeRequestBody, resetPassword);

router.get('/change-password', protect, (req, res) => {
    res.render('auth/change-password', { error: null, user: req.user });
});

router.post('/change-password', protect, validatePasswordChange, changePassword);

module.exports = router;
