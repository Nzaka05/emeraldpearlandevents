const Staff = require('../staff-models/Staff');
const AuditLog = require('../staff-models/AuditLog');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const emailService = require('../staff-services/emailService');

// Send token in cookie
const sendTokenResponse = (user, statusCode, res) => {
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'fallback_secret_key', {
        expiresIn: process.env.JWT_EXPIRE || '30d'
    });

    const options = {
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        httpOnly: true
    };

    // Use portal_token name to isolate from admin panel cookies
    res.status(statusCode).cookie('portal_token', token, options);
};

// @desc    Login user
// @route   POST /auth/login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('auth/login', { error: 'Please provide an email and password' });
        }

        const user = await Staff.findOne({ email }).select('+password');
        if (!user) {
            return res.render('auth/login', { error: 'Invalid credentials' });
        }

        if (user.status === 'Suspended') {
            await AuditLog.create({
                actionType: 'LOGIN_FAILED', targetModel: 'Staff', targetId: user._id, performedBy: user._id,
                details: { reason: 'Account Suspended', email }, ipAddress: req.ip
            });
            return res.render('auth/login', { error: 'Account suspended. Contact Administrator.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            await AuditLog.create({
                actionType: 'LOGIN_FAILED', targetModel: 'Staff', targetId: user._id, performedBy: user._id,
                details: { reason: 'Invalid Password', email }, ipAddress: req.ip
            });
            return res.render('auth/login', { error: 'Invalid credentials' });
        }

        await AuditLog.create({
            actionType: 'LOGIN_SUCCESS', targetModel: 'Staff', targetId: user._id, performedBy: user._id,
            details: { email }, ipAddress: req.ip
        });

        sendTokenResponse(user, 200, res);

        if (user.mustChangePassword) {
            return res.redirect('/portal/auth/change-password');
        }

        if (user.role === 'Admin') res.redirect('/portal/admin-staff/dashboard');
        else if (user.role === 'Supervisor') res.redirect('/portal/supervisor/dashboard');
        else res.redirect('/portal/staff/dashboard');

    } catch (error) {
        console.error(error);
        res.render('auth/login', { error: 'Server Error' });
    }
};

// @desc    Change Password
// @route   POST /auth/change-password
exports.changePassword = async (req, res) => {
    try {
        const { password, confirm_password } = req.body;

        if (password !== confirm_password) {
            return res.render('auth/change-password', { error: 'Passwords do not match' });
        }

        if (password.length < 8) {
            return res.render('auth/change-password', { error: 'Password must be at least 8 characters' });
        }

        const user = await Staff.findById(req.user.id);
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        user.mustChangePassword = false;
        await user.save();

        await AuditLog.create({
            actionType: 'PASSWORD_CHANGED', targetModel: 'Staff', targetId: user._id, performedBy: user._id,
            details: { reason: 'User changed password' }, ipAddress: req.ip
        });

        if (user.role === 'Admin') res.redirect('/portal/admin-staff/dashboard');
        else if (user.role === 'Supervisor') res.redirect('/portal/supervisor/dashboard');
        else res.redirect('/portal/staff/dashboard');

    } catch (error) {
        console.error(error);
        res.render('auth/change-password', { error: 'Server Error' });
    }
};

// @desc    Logout user
// @route   GET /auth/logout
exports.logout = (req, res) => {
    res.cookie('portal_token', 'none', {
        expires: new Date(Date.now() + 10 * 1000),
        httpOnly: true
    });
    res.redirect('/portal/auth/login');
};

// @desc    Forgot Password
// @route   POST /auth/forgot-password
exports.forgotPassword = async (req, res) => {
    try {
        const user = await Staff.findOne({ email: req.body.email });
        if (!user || user.status === 'Suspended') {
            return res.render('auth/forgot-password', {
                error: null,
                message: 'If an account exists with that email, a reset link has been sent.'
            });
        }

        const resetToken = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save({ validateBeforeSave: false });

        const baseUrl = process.env.STAFF_APP_URL || `${req.protocol}://${req.get('host')}`;
        const resetUrl = `${baseUrl}/portal/auth/reset-password/${resetToken}`;

        await emailService.sendPasswordResetEmail(user, resetUrl);

        await AuditLog.create({
            actionType: 'PASSWORD_RESET_REQUESTED', targetModel: 'Staff', targetId: user._id, performedBy: user._id,
            details: { email: user.email }, ipAddress: req.ip
        });

        res.render('auth/forgot-password', {
            error: null,
            message: 'If an account exists with that email, a password reset link has been sent.'
        });
    } catch (error) {
        console.error(error);
        res.render('auth/forgot-password', { error: 'Could not process request. Please try again.', message: null });
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
            return res.render('auth/reset-password', { error: 'Invalid or expired reset link. Please request a new one.', token: req.params.token });
        }

        const { password } = req.body;
        if (!password || password.length < 8) {
            return res.render('auth/reset-password', { error: 'Password must be at least 8 characters', token: req.params.token });
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

        res.render('auth/login', { error: null, message: 'Password reset successful! You can now log in with your new password.' });
    } catch (error) {
        console.error(error);
        res.render('auth/reset-password', { error: 'Server Error. Please try again.', token: req.params.token });
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
            return res.render('auth/forgot-password', {
                error: null,
                message: 'If an account exists with that email, a reset link has been sent.'
            });
        }

        const resetToken = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save({ validateBeforeSave: false });

        const baseUrl = process.env.STAFF_APP_URL || `${req.protocol}://${req.get('host')}`;
        const resetUrl = `${baseUrl}/portal/auth/reset-password/${resetToken}`;

        await emailService.sendPasswordResetEmail(user, resetUrl);

        await AuditLog.create({
            actionType: 'PASSWORD_RESET_REQUESTED', targetModel: 'Staff', targetId: user._id, performedBy: user._id,
            details: { email: user.email }, ipAddress: req.ip
        });

        res.render('auth/forgot-password', {
            error: null,
            message: 'If an account exists with that email, a password reset link has been sent.'
        });
    } catch (error) {
        console.error(error);
        res.render('auth/forgot-password', { error: 'Could not process request. Please try again.', message: null });
    }
};
