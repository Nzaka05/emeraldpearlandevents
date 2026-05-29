const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const verifyAdminJWT = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        const bearerToken = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.slice(7).trim()
            : null;

        // Get token from httpOnly cookie first, fallback to Authorization bearer token
        const token = req.cookies.adminToken || req.cookies.portal_token || bearerToken;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No authentication token. Please log in.'
            });
        }

        // Verify token — no fallback secret, checkEnv.js guarantees JWT_SECRET is set
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired. Please log in again.'
            });
        }
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

const verifyAdminPage = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        const bearerToken = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.slice(7).trim()
            : null;

        const token = req.cookies.adminToken || req.cookies.portal_token || bearerToken;
        if (!token) {
            return res.redirect('/admin/login');
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        return res.redirect('/admin/login');
    }
};

const generateAdminToken = (adminId, email, role) => {
    return jwt.sign(
        { adminId, email, role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
};

module.exports = { verifyAdminJWT, verifyAdminPage, generateAdminToken };
