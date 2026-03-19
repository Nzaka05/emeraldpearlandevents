const express = require('express');
const { login, logout, changePassword, forgotPassword, resetPassword, secureLogin, staffForgotPassword } = require('../staff-controllers/authController');
const { protect } = require('../staff-middleware/auth');
const { validateLogin, validatePasswordChange, sanitizeRequestBody } = require('../staff-middleware/validation');

const router = express.Router();

router.get('/login', (req, res) => {
    res.render('auth/login', { error: req.query.error, message: req.query.message });
});

router.post('/login', sanitizeRequestBody, validateLogin, login);
router.get('/logout', logout);

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
    res.render('auth/change-password', { error: null });
});

router.post('/change-password', protect, validatePasswordChange, changePassword);

module.exports = router;
