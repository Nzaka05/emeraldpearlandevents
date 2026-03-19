/**
 * Role-based access control middleware.
 * Assumes req.user is already set by upstream auth middleware.
 * @param {...string} roles - Allowed roles (e.g. 'Admin', 'Supervisor', 'Staff')
 */
function requireRoles(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Not authenticated'
            });
        }

        const userRole = req.user.role;
        if (!userRole || !roles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions'
            });
        }

        next();
    };
}

module.exports = { requireRoles };
