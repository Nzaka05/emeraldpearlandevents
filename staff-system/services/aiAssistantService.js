/**
 * aiAssistantService.js
 * 
 * Provides an interaction layer with strict prompt scaffolding,
 * anti-hallucination framing, and role-based data injection.
 */

const aiLearningService = require('../ai-learning/aiLearningService');
const aiActionService = require('./aiActionService');
const AIConversationLog = require('../ai-learning/models/AIConversationLog');

/**
 * Mocks an LLM response locally for demonstration/testing without an API key,
 * but enforces the strict system prompt logic conceptually.
 * In a real scenario, this would POST to OpenAI/Gemini.
 */
async function processAssistantQuery(userId, role, query, eventContext = {}) {
    // 0. Sanitize input
    if (!query || typeof query !== 'string') throw new Error('Invalid query');
    const sanitized = query.trim().substring(0, 2000)
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    if (sanitized.length === 0) throw new Error('Empty query after sanitization');

    // 1. Fetch Role-Filtered Data
    const { merged: insights } = await aiLearningService.getInsights({
        eventType: eventContext.eventType || null,
        clientId: eventContext.clientId || null,
        staffIds: eventContext.staffIds || []
    });

    if (role === 'Staff') {
        // Staff cannot see financial or global metrics
        delete insights.cost;
        delete insights.profit;
        delete insights.paymentDelays;
    }

    // 2. Strict Prompt Construction
    const systemPrompt = `
[SYSTEM CONTEXT]
You are the Emerald AI Event Assistant.
User Role: ${role}

[DATA]
Event Insights: ${JSON.stringify(insights)}

[RULES]
1. Never generate data outside the provided insights.
2. If data to answer the query is missing, return exactly: "No data available".
3. Provide reasoning using the provided data points.

[TASK]
Answer the following query securely and concisely:
${sanitized}
`;

    // 3. Simulated LLM Response Generation (Replace with actual fetch to Gemini/OpenAI API)
    let aiResponse = "";
    if (!insights || Object.keys(insights).length === 0) {
        aiResponse = "No data available";
    } else {
        // Mocking logic
        if (sanitized.toLowerCase().includes('profit') && role !== 'Staff') {
            aiResponse = `Based on historical models, the expected profit margin adjustment is ${insights.profit || 'unknown'} KSh.`;
        } else if (sanitized.toLowerCase().includes('staff') || sanitized.toLowerCase().includes('reliable')) {
            aiResponse = `Historical data suggests staffing requirements average at ${insights.staffCount || 'unknown'} for this type.`;
        } else {
            aiResponse = `I have received your query. Based on our AI metrics (Confidence: ${insights.confidence || 0}%), operations are behaving normally. (Mocked LLM Response)`;
        }
    }

    if (role === 'Staff' && sanitized.toLowerCase().includes('profit')) {
        aiResponse = "No data available"; // Role-restricted
    }

    // 4. Action Recommendation Injection (Only for Admins/Supervisors)
    let recommendedActions = [];
    if (role === 'Admin' || role === 'Supervisor') {
        // For demonstration, mock a prediction context to get actions
        recommendedActions = aiActionService.generateActions({
            predictedStaff: insights.staffCount,
            riskLabel: insights.confidence < 40 ? 'HIGH' : 'LOW'
        });
    }

    // 5. Log the Conversation
    await AIConversationLog.create({
        user_id: userId,
        role: role,
        query: sanitized,
        response: aiResponse,
        context_used: insights
    }).catch(err => console.error('[AIConversationLog] Save failed:', err.message));

    return {
        reply: aiResponse,
        recommendedActions
    };
}

module.exports = {
    processAssistantQuery
};
