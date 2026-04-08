/**
const respond = require('../../utils/respond');
 * adminCommandCenterController.js
 * Controller for the Main Admin Live Event Command Center (Port 3000)
 */
const commandCenterService = require('../../staff-system/services/commandCenterService');
const mongoose = require('mongoose');

exports.renderCommandCenter = async (req, res) => {
    try {
        const metrics = await commandCenterService.getCommandCenterMetrics();
        const activeEvents = await commandCenterService.getActiveEventsSummary();
        
        // Pass JSON state to EJS for client-side hydration
        res.render('admin/commandCenter', {
            liveMetrics: metrics,
            activeEvents,
            csrfToken: req.csrfToken ? req.csrfToken() : '',
            pageTitle: 'Live Command Center'
        });
    } catch (err) {
        console.error('[CommandCenter] Render error:', err);
        res.status(500).send('Error loading Command Center');
    }
};

exports.getMetrics = async (req, res) => {
    try {
        const metrics = await commandCenterService.getCommandCenterMetrics();
        respond(res, 200, { success: true, data: metrics, timestamp: new Date() });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message });
    }
};

exports.getActiveEvents = async (req, res) => {
    try {
        const events = await commandCenterService.getActiveEventsSummary();
        respond(res, 200, { success: true, data: events, timestamp: new Date() });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message });
    }
};

exports.getEventDetail = async (req, res) => {
    try {
        const detail = await commandCenterService.getEventDetail(req.params.id);
        respond(res, 200, { success: true, data: detail, timestamp: new Date() });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message });
    }
};
