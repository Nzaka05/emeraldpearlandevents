const jwt = require('jsonwebtoken');

function createAdminToken(overrides = {}) {
    return jwt.sign(
        {
            adminId: overrides.adminId || '507f191e810c19729de860ea',
            email: overrides.email || 'admin@test.local',
            role: overrides.role || 'Admin'
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function createStaffToken(overrides = {}) {
    return jwt.sign(
        {
            staffId: overrides.staffId || '507f1f77bcf86cd799439011',
            email: overrides.email || 'staff@test.local',
            role: overrides.role || 'Staff'
        },
        process.env.STAFF_JWT_SECRET,
        { expiresIn: '24h' }
    );
}

module.exports = {
    createAdminToken,
    createStaffToken
};
