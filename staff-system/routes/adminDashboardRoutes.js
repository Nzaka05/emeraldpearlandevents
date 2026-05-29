/**
 * adminDashboardRoutes.js
 * Routes: Dashboard analytics, Audit Logs, Security, Leaderboard
 * Mount prefix: /portal/admin-staff  (all URLs stay identical to the old admin.js)
 */

const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/adminDashboardController');
const { protect, authorize } = require('../middleware/auth');
const liveCtrl = require('../controllers/liveController');

// ── Apply auth to every route in this file ────────────────────
router.use(protect, authorize('Admin'));

// ── EJS page views ────────────────────────────────────────────
router.get('/dashboard',        ctrl.getDashboard);
router.get('/audit-logs-page',  ctrl.getAuditLogsPage);
router.get('/security',         ctrl.getSecurityPage);
router.get('/leaderboard',      ctrl.getLeaderboardPage);

// ── JSON API ──────────────────────────────────────────────────
router.get('/audit-logs',       ctrl.getAuditLogs);

// ── Phase 12: Live Command Center ─────────────────────────────
router.get('/live',                     liveCtrl.getLiveDashboard);
router.post('/live/message',            liveCtrl.liveChatUpload.single('attachment'), liveCtrl.sendAdminMessage);
router.post('/live/emergency-ack/:id',  liveCtrl.ackEmergency);
router.get('/live/messages',            liveCtrl.getRecentMessages);

// -- AI Assistant --
router.get('/ai/analytics', (req, res) => res.render('admin/ai-analytics', { currentPage: 'ai-analytics', user: req.user }));
router.get('/ai/analytics-data', async (req, res) => {
	try {
		const AIConversationLog = require('../ai-learning/models/AIConversationLog');
		const AIFeedback = require('../ai-learning/models/AIFeedback');
		const AIInsight = require('../ai-learning/models/AIInsight');
		const AIAlert = require('../ai-learning/models/AIAlert');
		const todayStart = new Date();
		todayStart.setHours(0,0,0,0);
		const [totalConversations, todayConversations, recentConversations, feedbackCount, positiveFeedback, activeAlerts, insights] = await Promise.all([
			AIConversationLog.countDocuments(),
			AIConversationLog.countDocuments({ createdAt: { $gte: todayStart } }),
			AIConversationLog.find().sort({ createdAt: -1 }).limit(10).select('role query createdAt').lean(),
			AIFeedback.countDocuments(),
			AIFeedback.countDocuments({ marked_accurate: true }),
			AIAlert.find({ resolved: false }).limit(5).lean(),
			AIInsight.find().sort({ createdAt: -1 }).limit(5).lean()
		]);
		res.json({ success: true, analytics: {
			totalConversations,
			todayConversations,
			recentConversations: recentConversations.map(c => ({ role: c.role, query: c.query?.substring(0, 80), time: c.createdAt })),
			feedbackAccuracy: feedbackCount > 0 ? Math.round((positiveFeedback / feedbackCount) * 100) : 0,
			activeAlerts: activeAlerts.map(a => ({ type: a.alert_type, message: a.message })),
			insights: insights.map(i => ({ type: i.insight_type, summary: i.summary }))
		}});
	} catch (error) {
		res.status(500).json({ success: false, message: error.message });
	}
});
router.get('/ai/command-center', (req, res) => res.render('admin/ai-command-center', { currentPage: 'ai', user: req.user }));
router.post('/ai/assistant', async (req, res) => {
	try {
		const aiAssistantService = require('../services/aiAssistantService');
		const { query, eventContext, history } = req.body;
		if (!query) return res.status(400).json({ success: false, message: 'Query required' });

		const userId = req.user?._id || '000000000000000000000000';
		const role = req.user?.role || 'Admin';
		const fullContext = {
			...eventContext,
			userName: req.user?.name || eventContext?.userName,
			title: req.user?.title || eventContext?.title,
			email: req.user?.email || eventContext?.email,
			role
		};

		const result = await aiAssistantService.processAssistantQuery(userId, role, query, fullContext, history || []);
		res.json({ success: true, data: result });
	} catch (error) {
		res.status(500).json({ success: false, message: error.message });
	}
});

module.exports = router;
