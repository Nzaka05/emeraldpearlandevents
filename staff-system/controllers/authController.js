const respond = require('../../utils/respond');
const Staff = require('../models/Staff');
const AuditLog = require('../models/AuditLog');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const emailService = require('../services/emailService');
const { notificationQueue } = require('../../config/queues');
const queueMode = (process.env.QUEUE_MODE || 'inline').toLowerCase();
const staffAuthSecret = process.env.STAFF_JWT_SECRET;
if (!staffAuthSecret) {
    throw new Error('FATAL: STAFF_JWT_SECRET is required. Do not fallback to generic JWT secret.');
}
const STAFF_COOKIE = 'staff_portal_token';
const LEGACY_COOKIE = 'portal_token';

// Send token in cookie
const sendTokenResponse = (user, statusCode, res) => {
    const token = jwt.sign(
        { id: user._id, tv: user.tokenVersion || 0 },
        staffAuthSecret,
        { expiresIn: process.env.JWT_EXPIRE || '30d' }
    );

    const options = {
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        httpOnly: true,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    };

    // Set dedicated staff cookie and a legacy cookie for transition compatibility
    res.status(statusCode).cookie(STAFF_COOKIE, token, options);
    res.cookie(LEGACY_COOKIE, token, options);
};

// Helper: detect API/JSON request
function isApiRequest(req) {
    return (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) ||
           (req.headers['authorization'] && req.headers['authorization'].startsWith('Bearer'));
}

// @desc    Login user
// @route   POST /auth/login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const isApi = isApiRequest(req);

        if (!email || !password) {
            if (isApi) {
                return respond(res, 400, {
                    success: false,
                    error: { code: 'MISSING_FIELDS', message: 'Please provide an email and password', statusCode: 400 },
                    timestamp: new Date().toISOString()
                });
            }
            return res.render('auth/login', { layout: false, error: 'Please provide an email and password' });
        }

        const user = await Staff.findOne({ email }).select('+password');
        if (!user) {
            if (isApi) {
                return respond(res, 401, {
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect', statusCode: 401 },
                    timestamp: new Date().toISOString()
                });
            }
            return res.render('auth/login', { layout: false, error: 'Invalid credentials' });
        }

        if (user.status === 'Suspended') {
            await AuditLog.create({
                actionType: 'LOGIN_FAILED', targetModel: 'Staff', targetId: user._id, performedBy: user._id,
                details: { reason: 'Account Suspended', email }, ipAddress: req.ip
            });
            if (isApi) {
                return respond(res, 403, {
                    success: false,
                    error: { code: 'ACCOUNT_SUSPENDED', message: 'Account suspended. Contact Administrator.', statusCode: 403 },
                    timestamp: new Date().toISOString()
                });
            }
            return res.render('auth/login', { layout: false, error: 'Account suspended. Contact Administrator.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            await AuditLog.create({
                actionType: 'LOGIN_FAILED', targetModel: 'Staff', targetId: user._id, performedBy: user._id,
                details: { reason: 'Invalid Password', email }, ipAddress: req.ip
            });
            if (isApi) {
                return respond(res, 401, {
                    success: false,
                    error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect', statusCode: 401 },
                    timestamp: new Date().toISOString()
                });
            }
            return res.render('auth/login', { layout: false, error: 'Invalid credentials' });
        }

        await AuditLog.create({
            actionType: 'LOGIN_SUCCESS', targetModel: 'Staff', targetId: user._id, performedBy: user._id,
            details: { email }, ipAddress: req.ip
        });

        sendTokenResponse(user, 200, res);

        if (user.mustChangePassword) {
            if (isApi) {
                return respond(res, 200, { success: true, mustChangePassword: true, redirect: '/portal/auth/change-password' });
            }
            return res.redirect('/portal/auth/change-password');
        }

        if (isApi) {
            return respond(res, 200, { success: true, user: { id: user._id, email: user.email, name: user.name, role: user.role } });
        }

        if (user.role === 'Admin') {
            return res.redirect('/portal/auth/portal-choice');
        } else if (user.role === 'Supervisor') {
            return res.redirect('/portal/supervisor/dashboard');
        } else {
            return res.redirect('/portal/staff/dashboard');
        }

    } catch (error) {
        console.error(error);
        if (isApiRequest(req)) {
            return respond(res, 500, {
                success: false,
                error: { code: 'SERVER_ERROR', message: 'An internal server error occurred', statusCode: 500 },
                timestamp: new Date().toISOString()
            });
        }
        res.render('auth/login', { layout: false, error: 'Server Error' });
    }
};

// @desc    Change Password
// @route   POST /auth/change-password
exports.changePassword = async (req, res) => {
    try {
        const { current_password, new_password, confirm_new_password } = req.body;

        const user = await Staff.findById(req.user.id).select('+password');

        // If mustChangePassword is false, verify current password
        if (!user.mustChangePassword) {
            if (!current_password) {
                return res.render('auth/change-password', { layout: false, error: 'Current password is required', user, csrfToken: req.csrfToken() });
            }
            const isMatch = await bcrypt.compare(current_password, user.password);
            if (!isMatch) {
                return res.render('auth/change-password', { layout: false, error: 'Current password is incorrect', user, csrfToken: req.csrfToken() });
            }
        }

        if (new_password !== confirm_new_password) {
            return res.render('auth/change-password', { layout: false, error: 'Passwords do not match', user, csrfToken: req.csrfToken() });
        }

        if (new_password.length < 8) {
            return res.render('auth/change-password', { layout: false, error: 'Password must be at least 8 characters', user, csrfToken: req.csrfToken() });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(new_password, salt);
        user.mustChangePassword = false;
        // Bump tokenVersion to invalidate ALL existing sessions (other devices/browsers)
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        await AuditLog.create({
            actionType: 'PASSWORD_CHANGED', targetModel: 'Staff', targetId: user._id, performedBy: user._id,
            details: { reason: 'User changed password' }, ipAddress: req.ip
        });

        res.redirect('/portal/auth/login?message=Password changed successfully! Please log in with your new password.');

    } catch (error) {
        console.error(error);
        res.render('auth/change-password', { layout: false, error: 'Server Error' });
    }
};

// @desc    Logout user
// @route   GET /auth/logout, POST /portal/auth/logout
exports.logout = (req, res) => {
    const clearOptions = { httpOnly: true, path: '/' };
    const legacyPaths = ['/', '/portal/auth', '/staff-admin'];

    res.clearCookie(STAFF_COOKIE, clearOptions);
    for (const p of legacyPaths) {
        res.clearCookie(LEGACY_COOKIE, { ...clearOptions, path: p });
    }
    
    // Check if JSON request
    const isApiRequest = req.headers['content-type'] === 'application/json' || req.headers['authorization'];
    if (isApiRequest || req.method === 'POST') {
        return respond(res, 200, { success: true, data: { message: "Logged out successfully" } });
    }
    
    res.redirect('/portal/auth/login');
};

// @desc    Refresh Staff token
// @route   POST /portal/auth/refresh
exports.refresh = async (req, res) => {
    try {
        const jwt = require('jsonwebtoken');
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.cookies[STAFF_COOKIE]) {
            token = req.cookies[STAFF_COOKIE];
        } else if (req.cookies[LEGACY_COOKIE]) {
            token = req.cookies[LEGACY_COOKIE];
        }

        if (!token) return respond(res, 401, { success: false, error: 'Not authorized' });

        const decoded = jwt.verify(token, staffAuthSecret, { ignoreExpiration: true });
        
        const Staff = require('../models/Staff');
        const user = await Staff.findById(decoded.id);
        if (!user || user.status === 'Suspended') {
             return respond(res, 401, { success: false, error: 'User unavailable' });
        }

        const newToken = jwt.sign(
            { id: user._id, tv: user.tokenVersion || 0 },
            staffAuthSecret,
            { expiresIn: '8h' }
        );

        const refreshOptions = {
            expires: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
            httpOnly: true,
            path: '/',
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
        };
        res.cookie(STAFF_COOKIE, newToken, refreshOptions);
        res.cookie(LEGACY_COOKIE, newToken, refreshOptions);

        respond(res, 200, { success: true, token: newToken });
    } catch (err) {
        console.error('Refresh token error:', err);
        respond(res, 401, { success: false, error: 'Invalid token' });
    }
};

// @desc    Forgot Password
// @route   POST /auth/forgot-password
exports.forgotPassword = async (req, res) => {
    try {
        const user = await Staff.findOne({ email: req.body.email });
        if (!user || user.status === 'Suspended') {
            return res.render('auth/forgot-password', { layout: false,
                error: null,
                message: 'If an account exists with that email, a reset link has been sent.'
            });
        }

        const resetToken = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save({ validateBeforeSave: false });

        const baseUrl = process.env.STAFF_APP_URL;
        const resetUrl = `${baseUrl}/portal/auth/reset-password/${resetToken}`;

        if (queueMode === 'async') {
            await notificationQueue.add('email', {
                type: 'password.reset',
                payload: {
                    staff: { _id: user._id.toString(), name: user.name, email: user.email },
                    resetUrl
                }
            });
        } else {
            await emailService.sendPasswordResetEmail(user, resetUrl);
        }

        await AuditLog.create({
            actionType: 'PASSWORD_RESET_REQUESTED', targetModel: 'Staff', targetId: user._id, performedBy: user._id,
            details: { email: user.email }, ipAddress: req.ip
        });

        res.render('auth/forgot-password', { layout: false,
            error: null,
            message: 'If an account exists with that email, a password reset link has been sent.'
        });
    } catch (error) {
        console.error(error);
        res.render('auth/forgot-password', { layout: false, error: 'Could not process request. Please try again.', message: null });
    }
};

// @desc    Reset Password
// @route   POST /auth/reset-password/:token
exports.resetPassword = async (req, res) => {
    try {
        const resetPasswordToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

        const user = await Staff.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.render('auth/reset-password', { layout: false, error: 'Invalid or expired reset link. Please request a new one.', token: req.params.token });
        }

        const { password } = req.body;
        if (!password || password.length < 8) {
            return res.render('auth/reset-password', { layout: false, error: 'Password must be at least 8 characters', token: req.params.token });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        user.mustChangePassword = false;
        await user.save();

        await AuditLog.create({
            actionType: 'PASSWORD_RESET', targetModel: 'Staff', targetId: user._id, performedBy: user._id,
            details: { reason: 'Self-Service Forgot Password' }, ipAddress: req.ip
        });

        res.render('auth/login', { layout: false, error: null, message: 'Password reset successful! You can now log in with your new password.' });
    } catch (error) {
        console.error(error);
        res.render('auth/reset-password', { layout: false, error: 'Server Error. Please try again.', token: req.params.token });
    }
};

// @desc    Secure Login via one-time token link
// @route   GET /auth/secure-login/:token
exports.secureLogin = async (req, res) => {
    try {
        const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

        const user = await Staff.findOne({
            secureLoginToken: hashedToken,
            secureLoginExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.redirect('/portal/auth/login?error=Login link has expired or has already been used.');
        }

        // Clear the token immediately (one-time use)
        user.secureLoginToken = undefined;
        user.secureLoginExpire = undefined;
        await user.save({ validateBeforeSave: false });

        await AuditLog.create({
            actionType: 'SECURE_LOGIN_USED', targetModel: 'Staff', targetId: user._id, performedBy: user._id,
            details: { email: user.email }, ipAddress: req.ip
        });

        sendTokenResponse(user, 200, res);
        return res.redirect('/portal/auth/change-password');

    } catch (error) {
        console.error(error);
        return res.redirect('/portal/auth/login?error=An error occurred. Please try logging in manually.');
    }
};

// @desc    Staff self-service password reset request
// @route   POST /auth/staff-forgot-password
exports.staffForgotPassword = async (req, res) => {
    try {
        const user = await Staff.findOne({ email: req.body.email });
        if (!user || user.status === 'Suspended') {
            return res.render('auth/forgot-password', { layout: false,
                error: null,
                message: 'If an account exists with that email, a reset link has been sent.'
            });
        }

        const resetToken = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save({ validateBeforeSave: false });

        const baseUrl = process.env.STAFF_APP_URL;
        const resetUrl = `${baseUrl}/portal/auth/reset-password/${resetToken}`;

        if (queueMode === 'async') {
            await notificationQueue.add('email', {
                type: 'password.reset',
                payload: {
                    staff: { _id: user._id.toString(), name: user.name, email: user.email },
                    resetUrl
                }
            });
        } else {
            await emailService.sendPasswordResetEmail(user, resetUrl);
        }

        await AuditLog.create({
            actionType: 'PASSWORD_RESET_REQUESTED', targetModel: 'Staff', targetId: user._id, performedBy: user._id,
            details: { email: user.email }, ipAddress: req.ip
        });

        res.render('auth/forgot-password', { layout: false,
            error: null,
            message: 'If an account exists with that email, a password reset link has been sent.'
        });
    } catch (error) {
        console.error(error);
        res.render('auth/forgot-password', { layout: false, error: 'Could not process request. Please try again.', message: null });
    }
};

// @desc    Portal choice page for Admin users
// @route   GET /portal/auth/portal-choice
exports.getPortalChoice = async (req, res) => {
    try {
        const Staff = require('../models/Staff');
        const user = await Staff.findById(req.user._id).select('-password').lean();
        res.render('auth/portal-choice', { layout: false, user });
    } catch (error) {
        console.error(error);
        res.redirect('/portal/auth/login');
    }
};
exports.getProfileJson = async (req, res) => {
    try {
        const user = await Staff.findById(req.user._id).select('-password');
        if (!user) return respond(res, 404, { success: false, error: 'User not found' });
        respond(res, 200, { success: true, user });
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// @desc    Logout all sessions — bumps tokenVersion to invalidate every JWT
// @route   POST /portal/auth/logout-all
exports.logoutAllSessions = async (req, res) => {
    try {
        const user = await Staff.findById(req.user._id);
        if (!user) return respond(res, 404, { success: false, error: 'User not found' });

        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save({ validateBeforeSave: false });

        await AuditLog.create({
            actionType: 'LOGOUT_ALL_SESSIONS',
            targetModel: 'Staff',
            targetId: user._id,
            performedBy: user._id,
            details: { newTokenVersion: user.tokenVersion },
            ipAddress: req.ip
        });

        // Clear the current session cookie
        res.clearCookie(STAFF_COOKIE, { httpOnly: true, path: '/' });
        res.clearCookie(LEGACY_COOKIE, { httpOnly: true, path: '/' });

        respond(res, 200, { success: true, data: { message: 'All sessions invalidated.' } });
    } catch (error) {
        console.error(error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

