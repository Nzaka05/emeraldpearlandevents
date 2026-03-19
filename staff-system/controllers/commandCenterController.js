/**
 * commandCenterController.js
 * Controller for the Supervisor Command Center (Port 3001)
 */
const commandCenterService = require('../services/commandCenterService');
const Assignment = require('../models/Assignment');

exports.renderSupervisorCommandCenter = async (req, res) => {
    try {
        // Supervisor can only see their assigned event.
        // Get their active LIVE or READY event.
        const activeEvent = await Assignment.findOne({
            lifecycle_state: { $in: ['LIVE', 'READY'] },
            $or: [
                { supervisor_id: req.user._id },
                { assigned_staff_ids: req.user._id }
            ]
        }).select('_id lifecycle_state').lean();

        let eventDetail = null;
        if (activeEvent) {
            eventDetail = await commandCenterService.getEventDetail(activeEvent._id);
            // Ensure they are actually the supervisor or assigned staff
            if (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin') {
                if (String(eventDetail.supervisor?._id) !== String(req.user._id) && !eventDetail.staffRoster.some(s => String(s.id) === String(req.user._id))) {
                    return res.status(403).send('Unauthorized to view this event command center');
                }
            }
        }

        res.render('staff/commandCenter', {
            eventInfo: eventDetail,
            csrfToken: req.csrfToken ? req.csrfToken() : '',
            pageTitle: 'Event Command Center',
            user: req.user
        });
    } catch (err) {
        console.error('[Supervisor CommandCenter] Render error:', err);
        res.status(500).send('Error loading Command Center');
    }
};

exports.getEventDetail = async (req, res) => {
    try {
        const detail = await commandCenterService.getEventDetail(req.params.id);
        
        // Authorization check: User must be supervisor or admin/superadmin or in the roster
        if (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin') {
            const isSupervisor = String(detail.supervisor?._id) === String(req.user._id);
            const isOnRoster = detail.staffRoster.some(s => String(s.id) === String(req.user._id));
            if (!isSupervisor && !isOnRoster) {
                return res.status(403).json({ success: false, error: 'Unauthorized' });
            }
        }

        res.status(200).json({ success: true, data: detail, timestamp: new Date() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
