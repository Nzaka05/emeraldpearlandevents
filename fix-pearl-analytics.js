const fs = require('fs');
let content = fs.readFileSync('staff-system/services/aiAssistantService.js', 'utf8');

// Add analytics data fetching to getBusinessData function
const oldAnalytics = "    } catch (e) { data.eventsError = e.message; }\n    return data;";

const newAnalytics = `    } catch (e) { data.eventsError = e.message; }

    // Fetch AI Analytics data
    try {
        const AIConversationLog = require('../ai-learning/models/AIConversationLog');
        const AIFeedback = require('../ai-learning/models/AIFeedback');
        const AIInsight = require('../ai-learning/models/AIInsight');
        const AIAlert = require('../ai-learning/models/AIAlert');

        const totalConversations = await AIConversationLog.countDocuments();
        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const todayConversations = await AIConversationLog.countDocuments({ createdAt: { $gte: todayStart } });
        const recentConversations = await AIConversationLog.find().sort({ createdAt: -1 }).limit(5).select('role query createdAt').lean();
        const feedbackCount = await AIFeedback.countDocuments();
        const positiveFeedback = await AIFeedback.countDocuments({ marked_accurate: true });
        const activeAlerts = await AIAlert.find({ resolved: false }).limit(5).lean();
        const insights = await AIInsight.find().sort({ createdAt: -1 }).limit(3).lean();

        data.aiAnalytics = {
            totalConversations,
            todayConversations,
            recentConversations: recentConversations.map(c => ({ role: c.role, query: c.query?.substring(0,50), time: c.createdAt })),
            feedbackAccuracy: feedbackCount > 0 ? Math.round((positiveFeedback/feedbackCount)*100) : 0,
            activeAlerts: activeAlerts.map(a => ({ type: a.type, message: a.message })),
            insights: insights.map(i => ({ type: i.type, summary: i.summary }))
        };
    } catch (e) { data.analyticsError = e.message; }

    return data;`;

content = content.replace(oldAnalytics, newAnalytics);

// Add analytics to system prompt
content = content.replace(
    "IMPORTANT: You are PEARL. Never mention Claude or Anthropic to users.",
    `AI ANALYTICS DATA:
- Total PEARL Conversations: \${businessData.aiAnalytics?.totalConversations || 0}
- Today's Conversations: \${businessData.aiAnalytics?.todayConversations || 0}
- Feedback Accuracy: \${businessData.aiAnalytics?.feedbackAccuracy || 0}%
- Active Alerts: \${JSON.stringify(businessData.aiAnalytics?.activeAlerts || [])}
- AI Insights: \${JSON.stringify(businessData.aiAnalytics?.insights || [])}
- Recent Queries: \${JSON.stringify(businessData.aiAnalytics?.recentConversations || [])}

IMPORTANT: You are PEARL. Never mention Claude, Gemini, or Anthropic to users.`
);

fs.writeFileSync('staff-system/services/aiAssistantService.js', content);
console.log('Done');
