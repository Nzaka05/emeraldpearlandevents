const Staff = require('../models/Staff');
const AuditLog = require('../models/AuditLog');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const emailService = require('../services/emailService');
const staffAuthSecret = process.env.STAFF_JWT_SECRET || process.env.JWT_SECRET;

// Send token in cookie
const sendTokenResponse = (user, statusCode, res) => {
    const token = jwt.sign({ id: user._id }, staffAuthSecret, {
        expiresIn: process.env.JWT_EXPIRE
    });

    const options = {
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        httpOnly: true
    };

    // Use portal_token name to isolate from admin panel cookies
    res.status(statusCode).cookie('portal_token', token, options);
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
                return res.status(400).json({
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
                return res.status(401).json({
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
                return res.status(403).json({
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
                return res.status(401).json({
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
                return res.status(200).json({ success: true, mustChangePassword: true, redirect: '/portal/auth/change-password' });
            }
            return res.redirect('/portal/auth/change-password');
        }

        if (isApi) {
            return res.status(200).json({ success: true, user: { id: user._id, email: user.email, name: user.name, role: user.role } });
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
            return res.status(500).json({
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
    res.clearCookie('portal_token', { httpOnly: true });
    
    // Check if JSON request
    const isApiRequest = req.headers['content-type'] === 'application/json' || req.headers['authorization'];
    if (isApiRequest || req.method === 'POST') {
        return res.json({ success: true, data: { message: "Logged out successfully" } });
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
        } else if (req.cookies.portal_token) {
            token = req.cookies.portal_token;
        }

        if (!token) return res.status(401).json({ success: false, error: 'Not authorized' });

        const decoded = jwt.verify(token, staffAuthSecret, { ignoreExpiration: true });
        
        const Staff = require('../models/Staff');
        const user = await Staff.findById(decoded.id);
        if (!user || user.status === 'Suspended') {
             return res.status(401).json({ success: false, error: 'User unavailable' });
        }

        const newToken = jwt.sign(
            { id: user._id, role: user.role, mustChangePassword: user.mustChangePassword },
            staffAuthSecret,
            { expiresIn: '8h' }
        );

        res.cookie('portal_token', newToken, {
            expires: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        });

        res.json({ success: true, token: newToken });
    } catch (err) {
        console.error('Refresh token error:', err);
        res.status(401).json({ success: false, error: 'Invalid token' });
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

        await emailService.sendPasswordResetEmail(user, resetUrl);

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

        await emailService.sendPasswordResetEmail(user, resetUrl);

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
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        res.status(200).json({ success: true, user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
