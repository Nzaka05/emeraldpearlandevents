/**
 * Emerald Pearl Events - Staff Management Service
 *
 * Extracts business logic for staff creation, updates, and suspensions from adminController.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Staff = require('../models/Staff');
const AuditLog = require('../models/AuditLog');
const emailService = require('./emailService');


exports.createStaffAccount = async (admin_id, staffData) => {
    const { name, email, role, specific_role, phone, department, skills, shift_start, shift_end, category } = staffData;
    
    // Check existing
    const existing = await Staff.findOne({ email });
    if (existing) {
        throw new Error('A staff member with this email already exists');
    }

    const plainPassword = crypto.randomBytes(6).toString('hex');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    const leadershipRoles = ['Director', 'Coordinator', 'IT Head'];
    const effectiveRole = (specific_role && leadershipRoles.some(r => specific_role.toLowerCase().includes(r.toLowerCase()))) ? 'Admin' : (role || 'Staff');

    let parsedSkills = [];
    if (skills) {
        parsedSkills = typeof skills === 'string' ? skills.split(',').map(s => s.trim()).filter(Boolean) : skills;
    }

    const user = await Staff.create({
        name,
        email,
        password: hashedPassword,
        role: effectiveRole,
        specific_role: specific_role || '',
        shift_start,
        shift_end,
        phone: phone || '',
        department: department || '',
        skills: parsedSkills,
        category: category || 'Usher',
        mustChangePassword: true,
        secureLoginToken: hashedToken,
        secureLoginExpire: Date.now() + 24 * 60 * 60 * 1000
    });

    const baseUrl = process.env.STAFF_APP_URL || 'http://localhost:3001';
    const loginUrl = `${baseUrl}/auth/secure-login/${rawToken}`;

    await emailService.sendStaffWelcomeEmail(user, plainPassword, loginUrl);

    await AuditLog.create({
        actionType: 'ACCOUNT_CREATED', targetModel: 'Staff', targetId: user._id,
        performedBy: admin_id,
        details: { name, email, role: effectiveRole }
    });

    // We can emit this metrics update from controller or a socket helper
    
    return user;
};

exports.updateStaffAccount = async (admin_id, staff_id, updateData, photo_url) => {
    const staffBefore = await Staff.findById(staff_id).select('-password');
    if (!staffBefore) throw new Error('Staff not found');

    const leadershipRoles = ['Director', 'Coordinator', 'IT Head'];
    if (updateData.specific_role && leadershipRoles.some(r => updateData.specific_role.toLowerCase().includes(r.toLowerCase()))) {
        updateData.role = 'Admin';
    }

    if (updateData.skills && typeof updateData.skills === 'string') {
        updateData.skills = updateData.skills.split(',').map(s => s.trim()).filter(Boolean);
    }
    
    if (photo_url) {
        updateData.photo_url = photo_url;
    }

    const updated = await Staff.findByIdAndUpdate(
        staff_id,
        updateData,
        { new: true, runValidators: true }
    ).select('-password');

    await AuditLog.create({
        actionType: 'ACCOUNT_UPDATED', targetModel: 'Staff', targetId: updated._id,
        performedBy: admin_id,
        details: { 
            before: { name: staffBefore.name, email: staffBefore.email, role: staffBefore.role }, 
            after: { name: updated.name, email: updated.email, role: updated.role } 
        }
    });

    return updated;
};

exports.toggleStaffSuspension = async (admin_id, staff_id) => {
    const staff = await Staff.findById(staff_id);
    if (!staff) throw new Error('Staff not found');
    if (staff.role === 'Admin') throw new Error('Cannot suspend admin accounts');

    staff.status = staff.status === 'Suspended' ? 'Active' : 'Suspended';
    await staff.save();

    await AuditLog.create({
        actionType: staff.status === 'Suspended' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_ACTIVATED',
        targetModel: 'Staff', targetId: staff._id,
        performedBy: admin_id,
        details: { name: staff.name, newStatus: staff.status }
    });

    return staff;
};

exports.updateAdminLocation = async (adminId, lat, lng) => {
    if (!lat || !lng) throw new Error('Coordinates required');
    await Staff.findByIdAndUpdate(adminId, {
        last_location: { lat: parseFloat(lat), lng: parseFloat(lng), updatedAt: new Date() }
    });
};

exports.assignSupervisor = async (adminId, staffId, supervisorId) => {
    const supervisor = await Staff.findOne({ 
        _id: supervisorId, 
        role: { $in: ['Supervisor', 'Admin'] } 
    });
    if (!supervisor) throw new Error('Supervisor not found');
    
    const updated = await Staff.findByIdAndUpdate(
        staffId,
        { $set: { supervisor_id: supervisorId } },
        { new: true }
    );
    if (!updated) throw new Error('Staff not found');
    
    await AuditLog.create({
        actionType: 'SUPERVISOR_ASSIGNED',
        targetModel: 'Staff',
        targetId: staffId,
        performedBy: adminId,
        details: { supervisorId, supervisorName: supervisor.name, staffName: updated.name }
    });
    return updated;
};

exports.updateCategorySettings = async (admin, categoryData, ipAddress) => {
    const StaffCategorySettings = require('../models/StaffCategorySettings');
    const { category, is_enabled, description, icon, color } = categoryData;
    const updated = await StaffCategorySettings.findOneAndUpdate(
        { category },
        { is_enabled: is_enabled === 'true' || is_enabled === true, description, icon, color, updatedAt: new Date() },
        { new: true, upsert: true }
    );

    await AuditLog.create({
        user_id: admin._id,
        user_name: admin.name,
        action: 'UPDATE_CATEGORY_SETTINGS',
        details: `Category "${category}" set to ${is_enabled ? 'enabled' : 'disabled'}`,
        ip_address: ipAddress
    });
    return updated;
};

exports.getStaffCard = async (staffId) => {
    const PerformanceReview = require('../models/PerformanceReview');
    const Assignment = require('../models/Assignment');

    const staff = await Staff.findById(staffId)
        .select('name email phone photo_url category role availability_status status last_location createdAt')
        .lean();
    if (!staff) throw new Error('Staff not found');

    const reviewCount = await PerformanceReview.countDocuments({ staff_id: staffId });
    const avgRating = await PerformanceReview.aggregate([
        { $match: { staff_id: require('mongoose').Types.ObjectId(staffId) } },
        { $group: { _id: null, avg: { $avg: '$rating' } } }
    ]);
    const eventCount = await Assignment.countDocuments({ accepted_staff_ids: staff._id });

    return {
        ...staff,
        avg_rating: avgRating[0]?.avg?.toFixed(1) || null,
        review_count: reviewCount,
        events_worked: eventCount
    };
};
const emitMetricUpdate = async () => { try { if (global.io) { const Staff = require('../models/Staff'); const s = await Staff.countDocuments(); global.io.to('Admin').emit('metricUpdate', { totalStaff: s }); } } catch(e) {} };
exports.emitMetricUpdate = emitMetricUpdate;
