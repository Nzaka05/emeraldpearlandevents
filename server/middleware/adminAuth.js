const jwt = require('jsonwebtoken');

const verifyAdminJWT = (req, res, next) => {
    try {
        // Get token from httpOnly cookie
        const token = req.cookies.adminToken;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No authentication token. Please log in.'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'emerald-admin-secret-key-luxury');
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
        const token = req.cookies.adminToken;
        if (!token) {
            return res.redirect('/admin/login');
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'emerald-admin-secret-key-luxury');
        req.admin = decoded;
        next();
    } catch (error) {
        return res.redirect('/admin/login');
    }
};

const generateAdminToken = (adminId, email) => {
    return jwt.sign(
        { adminId, email },
        process.env.JWT_SECRET || 'emerald-admin-secret-key-luxury',
        { expiresIn: '24h' }
    );
};

module.exports = { verifyAdminJWT, verifyAdminPage, generateAdminToken };
