/**
const respond = require('../../utils/respond');
 * adminDashboardController.js
 * Domain: Dashboard, Analytics, Audit Logs, Leaderboard, Security
 * Pattern: Thin controller — delegates all data work to adminViewService.
 */

const AuditLog = require('../models/AuditLog');

// ─────────────────────────────────────────────────────────────
// Helpers (shared, loaded once)
// ─────────────────────────────────────────────────────────────
const getReadinessLabel = (pct) => {
    if (pct === 0) return 'Waiting';
    if (pct < 50) return 'Incomplete';
    if (pct < 100) return 'Ready';
    return 'Fully Deployed';
};

// ─────────────────────────────────────────────────────────────
// @desc   Admin Dashboard
// @route  GET /portal/admin-staff/dashboard
// ─────────────────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getDashboardData();
        const metrics = data.stats || {};
        const assignments = data.allAssignments || [];
        res.render('admin/dashboard', { user: req.user, ...data, metrics, assignments, getReadinessLabel });
    } catch (error) {
        console.error('[adminDashboardController] getDashboard:', error);
        res.redirect('/?error=Server error');
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Audit Logs Page (EJS)
// @route  GET /portal/admin-staff/audit-logs-page
// ─────────────────────────────────────────────────────────────
exports.getAuditLogsPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getAuditLogsPageData(req.query);
        res.render('admin/audit-logs', { user: req.user, ...data });
    } catch (error) {
        console.error('[adminDashboardController] getAuditLogsPage:', error);
        res.status(500).send('Server Error');
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Audit Logs JSON API
// @route  GET /portal/admin-staff/audit-logs
// ─────────────────────────────────────────────────────────────
exports.getAuditLogs = async (req, res) => {
    try {
        const logs = await AuditLog.find()
            .populate('performedBy', 'name role')
            .sort({ timestamp: -1 })
            .limit(100);
        respond(res, 200, { success: true, data: logs });
    } catch (error) {
        console.error('[adminDashboardController] getAuditLogs:', error);
        respond(res, 500, { success: false, error: 'Server Error' });
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Security Page (EJS)
// @route  GET /portal/admin-staff/security
// ─────────────────────────────────────────────────────────────
exports.getSecurityPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getSecurityPageData();
        res.render('admin/security', { user: req.user, ...data });
    } catch (error) {
        console.error('[adminDashboardController] getSecurityPage:', error);
        res.status(500).send('Server Error');
    }
};

// ─────────────────────────────────────────────────────────────
// @desc   Performance Leaderboard Page (EJS)
// @route  GET /portal/admin-staff/leaderboard
// ─────────────────────────────────────────────────────────────
exports.getLeaderboardPage = async (req, res) => {
    try {
        const adminViewService = require('../services/adminViewService');
        const data = await adminViewService.getLeaderboardPageData();
        res.render('admin/leaderboard', {
            user: req.user,
            currentPage: 'leaderboard',
            title: 'Performance Leaderboard',
            ...data
        });
    } catch (err) {
        console.error('[adminDashboardController] getLeaderboardPage:', err);
        res.status(500).send('Error loading leaderboard: ' + err.message);
    }
};
