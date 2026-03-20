/**
 * staffIntelligenceController.js
 * Renders staff intelligence view + provides JSON API for rankings.
 */

const staffIntelligenceService = require('../staff-system/services/staffIntelligenceService');

exports.renderStaffIntelligence = async (req, res) => {
    try {
        const leaderboard = await staffIntelligenceService.getStaffRanking(30);
        res.render('admin/staff-intelligence', {
            user: req.user,
            leaderboard,
            csrfToken: req.csrfToken ? req.csrfToken() : ''
        });
    } catch (error) {
        console.error('[StaffIntelligence] Render Error:', error);
        res.status(500).send('Failed to load Staff Intelligence');
    }
};

exports.getStaffRankingAPI = async (req, res) => {
    try {
        const leaderboard = await staffIntelligenceService.getStaffRanking(parseInt(req.query.limit) || 20);
        res.json({ success: true, data: leaderboard });
    } catch (error) {
        console.error('[StaffIntelligence] API Error:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
