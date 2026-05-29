// ═══════════════════════════════════════════════════════════
// PASSWORD CHANGE ROUTES — OTP-verified password change
// ═══════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const Admin = require('../models/Admin');
const Staff = require('../models/Staff');
const OTPVerification = require('../models/OTPVerification');
const { generateOTP, hashOTP, verifyOTP } = require('../utils/otpUtils');
const { sendOTPEmail, sendPasswordChangedEmail } = require('../services/emailService');
const { csrfProtection } = require('../middleware/csrfProtection');

// Unified Authentication Middleware for password change
const authenticateUser = async (req, res, next) => {
    try {
        let token = null;

        // Check Authorization header for Bearer token
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }

        // 1. Try Admin Auth (adminToken or portal_token)
        const adminToken = req.cookies.adminToken || req.cookies.portal_token || token;
        if (adminToken) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(adminToken, process.env.JWT_SECRET);
                const admin = await Admin.findById(decoded.adminId);
                if (admin && admin.isActive) {
                    req.authUser = admin;
                    req.userModel = 'Admin';
                    return next();
                }
            } catch (err) {
                // Ignore, try Staff next
            }
        }

        // 2. Try Staff Auth (staff_portal_token or portal_token)
        const staffToken = req.cookies.staff_portal_token || req.cookies.portal_token || token;
        if (staffToken) {
            try {
                const jwt = require('jsonwebtoken');
                const secret = process.env.STAFF_JWT_SECRET || process.env.JWT_SECRET;
                const decoded = jwt.verify(staffToken, secret);
                const staff = await Staff.findById(decoded.id);
                if (staff && staff.status === 'Active') {
                    req.authUser = staff;
                    req.userModel = 'Staff';
                    return next();
                }
            } catch (err) {
                // Ignore
            }
        }

        return res.status(401).json({
            success: false,
            message: 'Unauthorized. Please log in.'
        });
    } catch (error) {
        console.error('Password Change Auth Middleware Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// POST /request-otp
// Inputs: currentPassword, newPassword
router.post('/request-otp', authenticateUser, csrfProtection, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = req.authUser;
        const userModel = req.userModel;

        // Validation
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 8 characters long'
            });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({
                success: false,
                message: 'New password must be different from current password'
            });
        }

        // Verify current password
        let isMatch = false;
        if (userModel === 'Admin') {
            isMatch = await user.comparePassword(currentPassword);
        } else {
            isMatch = await bcrypt.compare(currentPassword, user.password);
        }

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Clean/invalidate any existing password change OTPs for this user
        await OTPVerification.deleteMany({
            userId: user._id,
            purpose: 'password_change'
        });

        // Generate and hash OTP
        const otp = generateOTP();
        const otpHash = await hashOTP(otp);

        // Store OTP with 10-minute expiry
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await OTPVerification.create({
            userId: user._id,
            userModel,
            otpHash,
            purpose: 'password_change',
            expiresAt,
            used: false
        });

        // Send OTP Email
        await sendOTPEmail({
            to: user.email,
            name: user.name,
            otp,
            role: userModel.toLowerCase()
        });

        return res.json({
            success: true,
            message: 'Verification code sent to your email.'
        });
    } catch (error) {
        console.error('Request OTP Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error sending verification code: ' + error.message
        });
    }
});

// POST /verify-and-change
// Inputs: currentPassword, newPassword, otp
router.post('/verify-and-change', authenticateUser, csrfProtection, async (req, res) => {
    try {
        const { currentPassword, newPassword, otp } = req.body;
        const user = req.authUser;
        const userModel = req.userModel;

        // Validation
        if (!currentPassword || !newPassword || !otp) {
            return res.status(400).json({
                success: false,
                message: 'All fields (current password, new password, and verification code) are required'
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 8 characters long'
            });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({
                success: false,
                message: 'New password must be different from current password'
            });
        }

        // Verify current password again
        let isMatch = false;
        if (userModel === 'Admin') {
            isMatch = await user.comparePassword(currentPassword);
        } else {
            isMatch = await bcrypt.compare(currentPassword, user.password);
        }

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Check OTP
        const verification = await OTPVerification.findOne({
            userId: user._id,
            purpose: 'password_change',
            expiresAt: { $gt: new Date() },
            used: false
        }).sort({ createdAt: -1 });

        if (!verification) {
            return res.status(400).json({
                success: false,
                message: 'Verification code expired or not found. Please request a new one.'
            });
        }

        // Verify hash
        const isOtpValid = await verifyOTP(otp, verification.otpHash);
        if (!isOtpValid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code'
            });
        }

        // Update password
        if (userModel === 'Admin') {
            user.passwordHash = newPassword;
        } else {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(newPassword, salt);
            user.mustChangePassword = false;
            user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate other active JWTs
        }

        await user.save();

        // Invalidate OTP
        verification.used = true;
        await verification.save();
        // Also delete it to clean up the DB
        await OTPVerification.findByIdAndDelete(verification._id);

        // Audit Log for Staff if applicable
        if (userModel === 'Staff') {
            try {
                const AuditLog = require('../models/AuditLog');
                await AuditLog.create({
                    actionType: 'OWN_PASSWORD_CHANGED',
                    targetModel: 'Staff',
                    targetId: user._id,
                    performedBy: user._id,
                    details: { reason: 'Staff changed own password via OTP' }
                });
            } catch (auditErr) {
                // Ignore audit logging error if not defined/imported
            }
        }

        // Send Confirmation Email
        await sendPasswordChangedEmail({
            to: user.email,
            name: user.name
        });

        return res.json({
            success: true,
            message: 'Password changed successfully.'
        });
    } catch (error) {
        console.error('Verify and Change Password Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error updating password: ' + error.message
        });
    }
});

module.exports = router;
