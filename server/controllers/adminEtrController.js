const respond = require('../../utils/respond');
const ClientETR = require('../models/ClientETR');
const Assignment = require('../../staff-system/models/Assignment');
const etrService = require('../services/etrService');

exports.listETRs = async (req, res) => {
    try {
        const etrs = await ClientETR.find()
            .populate('event_id', 'title date client_name')
            .sort({ generated_at: -1 })
            .lean();
        
        // Fetch all completed assignments to show "Not Generated" ones
        const completedAssignments = await Assignment.find({ lifecycle_state: { $in: ['COMPLETED', 'FINANCE_SETTLED'] } })
            .select('title date client_name')
            .sort({ date: -1 })
            .lean();
            
        // Render view/admin/etr-list.ejs or return JSON
        res.render('admin/etr-list', {
            user: req.user || req.admin,
            etrs,
            completedAssignments,
            title: 'Event Transaction Reports (ETR)',
            currentPage: 'etr'
        });
    } catch (err) {
        console.error('listETRs error:', err);
        res.status(500).send('Error loading ETRs: ' + err.message);
    }
};

exports.viewETR = async (req, res) => {
    try {
        const etr = await ClientETR.findOne({ event_id: req.params.eventId }).sort({ version: -1 });
        if (!etr) return res.status(404).send('ETR not found');
        
        res.render('admin/etr-view', {
            user: req.user || req.admin,
            etr,
            title: `View ETR: ${etr.summary.etrNumber}`,
            currentPage: 'etr'
        });
    } catch (err) {
        console.error('viewETR error:', err);
        res.status(500).send('Error viewing ETR: ' + err.message);
    }
};

exports.generateETRManually = async (req, res) => {
    try {
        const etr = await etrService.generateETR(req.params.eventId, (req.user || req.admin)._id);
        respond(res, 200, { success: true, etr });
    } catch (err) {
        console.error('generateETRManually error:', err);
        respond(res, 500, { success: false, error: err.message });
    }
};

exports.resendETR = async (req, res) => {
    try {
        const success = await etrService.resendETR(req.params.eventId, (req.user || req.admin)._id);
        if (success) {
            respond(res, 200, { success: true, message: 'ETR resent successfully' });
        } else {
            respond(res, 400, { success: false, error: 'Failed to send email' });
        }
    } catch (err) {
        console.error('resendETR error:', err);
        respond(res, 500, { success: false, error: err.message });
    }
};

exports.downloadETR = async (req, res) => {
    try {
        const etr = await ClientETR.findOne({ event_id: req.params.eventId }).sort({ version: -1 });
        if (!etr || !etr.pdf_url) return res.status(404).send('ETR PDF not found');
        
        // If it's a relative URL, send file directly. If Cloudinary, redirect.
        if (etr.pdf_url.startsWith('http')) {
            res.redirect(etr.pdf_url);
        } else {
            const path = require('path');
            const file = path.join(__dirname, '../../public', etr.pdf_url);
            res.download(file);
        }
    } catch (err) {
        console.error('downloadETR error:', err);
        res.status(500).send('Error downloading ETR: ' + err.message);
    }
};
