/**
 * adminStaffController.js
 * Domain: Staff Management — CRUD, suspension, location, category settings
 * Pattern: Thin controller — delegates all business logic to staffManagementService.
 */

const Staff = require('../models/Staff');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Assignment = require('../models/Assignment');
const EventTeam = require('../models/EventTeam');
const AuditLog = require('../models/AuditLog');
const PerformanceReview = require('../models/PerformanceReview');
const emailService = require('../services/emailService');

// ─────────────────────────────────────────────────────────────
// @desc   Staff Management Page (EJS)
// @route  GET /portal/admin-staff/staff-management
// ─────────────────────────────────────────────────────────────
exports.getStaffManagementPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getStaffManagementPageData(req.query);
        res.render('admin/staff-management', { user: req.user, ...data });
    } catch (error) {
        console.error('[adminStaffController] getStaffManagementPage:', error);
        res.status(500).send('Server Error');
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Category Settings Page (EJS)
// @route  GET /portal/admin-staff/category-settings
// ─────────────────────────────────────────────────────────────
exports.getCategorySettingsPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getCategorySettingsPageData();
        res.render('admin/category-settings', {
            user: req.user,
            currentPage: 'categories',
            title: 'Staff Category Settings',
            ...data
        });
    } catch (err) {
        console.error('[adminStaffController] getCategorySettingsPage:', err);
        res.status(500).send('Error loading category settings: ' + err.message);
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Get all staff (JSON list)
// @route  GET /portal/admin-staff/staff
// ─────────────────────────────────────────────────────────────
exports.getAllStaff = async (req, res) => {
    try {
        const staff = await Staff.find().select('-password').sort({ createdAt: -1 });
        res.json({ success: true, data: staff });
    } catch (error) {
        console.error('[adminStaffController] getAllStaff:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Add new staff
// @route  POST /portal/admin-staff/staff
// ─────────────────────────────────────────────────────────────
exports.addStaff = async (req, res) => {
    try {
        const staffManagementService = require('../services/staffManagementService');
        let photo_url = null;
        if (req.file) photo_url = '/uploads/staff/' + req.file.filename;

        const user = await staffManagementService.createStaffAccount(req.user._id, { ...req.body, photo_url });

        const { emitMetricUpdate } = require('../services/socketService');
        await emitMetricUpdate();

        res.status(201).json({
            success: true,
            data: { _id: user._id, name: user.name, email: user.email, role: user.role },
            message: `Account created. Welcome email sent to ${user.email}.`
        });
    } catch (error) {
        console.error('[adminStaffController] addStaff:', error);
        if (error.message === 'A staff member with this email already exists')
            return res.status(400).json({ success: false, error: error.message });
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Edit staff member
// @route  PUT /portal/admin-staff/staff/:id
// ─────────────────────────────────────────────────────────────
exports.editStaff = async (req, res) => {
    try {
        const staffManagementService = require('../services/staffManagementService');
        let photo_url = null;
        if (req.file) photo_url = '/uploads/staff/' + req.file.filename;

        const updated = await staffManagementService.updateStaffAccount(req.user._id, req.params.id, req.body, photo_url);

        if (global.io) {
            global.io.to(req.params.id).emit('profileUpdated', updated);
            global.io.to(updated._id.toString()).emit('syncProfileUpdate', updated);
        }

        const { emitMetricUpdate } = require('../services/socketService');
        await emitMetricUpdate();

        if (req.headers['content-type']?.includes('application/json')) {
            res.json({ success: true, data: updated });
        } else {
            req.flash('success', 'Staff member updated successfully');
            res.redirect('/portal/admin-staff/staff');
        }
    } catch (error) {
        console.error('[adminStaffController] editStaff:', error);
        if (error.message === 'Staff not found')
            return res.status(404).json({ success: false, error: 'Staff not found' });
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Delete staff member
// @route  DELETE /portal/admin-staff/staff/:id
// ─────────────────────────────────────────────────────────────
exports.deleteStaff = async (req, res) => {
    try {
        const staff = await Staff.findById(req.params.id);
        if (!staff) return res.status(404).json({ success: false, error: 'Staff not found' });
        if (staff.role === 'Admin') return res.status(403).json({ success: false, error: 'Cannot delete admin accounts' });

        const staffId = staff._id;
        await Assignment.updateMany({}, {
            $pull: {
                assigned_staff_ids: staffId,
                accepted_staff_ids: staffId,
                declined_staff_ids: staffId,
                applicant_ids: staffId,
                staff_payments: { staff_id: staffId }
            }
        });
        await EventTeam.updateMany({ member_ids: staffId }, { $pull: { member_ids: staffId } });
        await EventTeam.updateMany({ supervisor_id: staffId }, { $unset: { supervisor_id: '' } });
        await Staff.updateMany({ supervisor_id: staffId }, { $unset: { supervisor_id: '' } });
        await Staff.findByIdAndDelete(staffId);
        await AuditLog.create({
            actionType: 'ACCOUNT_DELETED', targetModel: 'Staff', targetId: staffId,
            performedBy: req.user._id,
            details: { name: staff.name, email: staff.email }
        });

        const { emitMetricUpdate } = require('../services/socketService');
        await emitMetricUpdate();

        res.json({ success: true, message: 'Staff deleted successfully' });
    } catch (error) {
        console.error('[adminStaffController] deleteStaff:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Toggle Suspend / Activate staff
// @route  PUT /portal/admin-staff/staff/:id/suspend
// ─────────────────────────────────────────────────────────────
exports.toggleSuspend = async (req, res) => {
    try {
        const staffManagementService = require('../services/staffManagementService');
        const staff = await staffManagementService.toggleStaffSuspension(req.user._id, req.params.id);

        if (global.io) global.io.to(staff._id.toString()).emit('accountStatusChanged', { status: staff.status });

        const { emitMetricUpdate } = require('../services/socketService');
        await emitMetricUpdate();

        res.json({ success: true, status: staff.status });
    } catch (error) {
        console.error('[adminStaffController] toggleSuspend:', error);
        if (error.message === 'Staff not found')
            return res.status(404).json({ success: false, error: 'Staff not found' });
        if (error.message === 'Cannot suspend admin accounts')
            return res.status(403).json({ success: false, error: 'Cannot suspend admin accounts' });
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Admin manual password reset for staff
// @route  POST /portal/admin-staff/staff/:id/reset-password
// ─────────────────────────────────────────────────────────────
exports.adminResetPassword = async (req, res) => {
    try {
        const staff = await Staff.findById(req.params.id);
        if (!staff) return res.status(404).json({ success: false, error: 'Staff not found' });

        const newPlainPassword = crypto.randomBytes(5).toString('hex');
        const salt = await bcrypt.genSalt(10);
        staff.password = await bcrypt.hash(newPlainPassword, salt);
        staff.mustChangePassword = true;
        await staff.save();

        await emailService.sendAdminPasswordResetNotification(staff, newPlainPassword);
        await AuditLog.create({
            actionType: 'PASSWORD_RESET', targetModel: 'Staff', targetId: staff._id,
            performedBy: req.user._id,
            details: { reason: 'Admin Manual Reset' }
        });

        res.json({ success: true, message: `Password reset email sent to ${staff.email}. Staff will be forced to change on next login.` });
    } catch (error) {
        console.error('[adminStaffController] adminResetPassword:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Get staff performance reviews
// @route  GET /portal/admin-staff/staff/:id/performance
// ─────────────────────────────────────────────────────────────
exports.getStaffPerformance = async (req, res) => {
    try {
        const reviews = await PerformanceReview.find({ staff_id: req.params.id })
            .populate('supervisor_id', 'name')
            .populate('assignment_id', 'title date')
            .sort({ timestamp: -1 });
        res.json({ success: true, data: reviews });
    } catch (error) {
        console.error('[adminStaffController] getStaffPerformance:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Update admin/supervisor GPS location
// @route  POST /portal/admin-staff/location
// ─────────────────────────────────────────────────────────────
exports.updateAdminLocation = async (req, res) => {
    try {
        const staffManagementService = require('../services/staffManagementService');
        await staffManagementService.updateAdminLocation(req.user._id, req.body.lat, req.body.lng);
        res.json({ success: true });
    } catch (error) {
        console.error('[adminStaffController] updateAdminLocation:', error);
        if (error.message === 'Coordinates required')
            return res.status(400).json({ success: false, error: error.message });
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Assign a supervisor to a staff member
// @route  POST /portal/admin-staff/staff/:id/assign-supervisor
// ─────────────────────────────────────────────────────────────
exports.assignSupervisor = async (req, res) => {
    try {
        const staffManagementService = require('../services/staffManagementService');
        const updated = await staffManagementService.assignSupervisor(req.user._id, req.params.id, req.body.supervisorId);
        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('[adminStaffController] assignSupervisor:', error);
        if (error.message === 'Supervisor not found' || error.message === 'Staff not found')
            return res.status(404).json({ success: false, error: error.message });
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Update staff category settings
// @route  PUT /portal/admin-staff/category-settings
// ─────────────────────────────────────────────────────────────
exports.updateCategorySettings = async (req, res) => {
    try {
        const staffManagementService = require('../services/staffManagementService');
        const updated = await staffManagementService.updateCategorySettings(req.user, req.body, req.ip);
        res.json({ success: true, setting: updated });
    } catch (err) {
        console.error('[adminStaffController] updateCategorySettings:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Get staff profile card data
// @route  GET /portal/admin-staff/staff/:id/card
// ─────────────────────────────────────────────────────────────
exports.getStaffCard = async (req, res) => {
    try {
        const staffManagementService = require('../services/staffManagementService');
        const cardData = await staffManagementService.getStaffCard(req.params.id);
        res.json({ success: true, staff: cardData });
    } catch (err) {
        console.error('[adminStaffController] getStaffCard:', err);
        if (err.message === 'Staff not found')
            return res.status(404).json({ success: false, error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
};
