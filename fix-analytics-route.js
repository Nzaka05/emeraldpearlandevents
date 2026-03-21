const fs = require('fs');
let content = fs.readFileSync('staff-system/routes/admin.js', 'utf8');

const newRoutes = `
router.get('/ai/analytics', (req, res) => res.render('admin/ai-analytics', { currentPage: 'ai-analytics', user: req.user }));

router.get('/ai/analytics-data', async (req, res) => {
    try {
        const AIConversationLog = require('../ai-learning/models/AIConversationLog');
        const AIFeedback = require('../ai-learning/models/AIFeedback');
        const AIInsight = require('../ai-learning/models/AIInsight');
        const AIAlert = require('../ai-learning/models/AIAlert');
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
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
            totalConversations, todayConversations,
            recentConversations: recentConversations.map(c => ({ role: c.role, query: c.query?.substring(0,80), time: c.createdAt })),
            feedbackAccuracy: feedbackCount > 0 ? Math.round((positiveFeedback/feedbackCount)*100) : 0,
            activeAlerts: activeAlerts.map(a => ({ type: a.alert_type, message: a.message })),
            insights: insights.map(i => ({ type: i.insight_type, summary: i.summary }))
        }});
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});`;

content = content.replace(
    "router.get('/ai/command-center',",
    newRoutes + "\nrouter.get('/ai/command-center',"
);

fs.writeFileSync('staff-system/routes/admin.js', content);
console.log('Done');
