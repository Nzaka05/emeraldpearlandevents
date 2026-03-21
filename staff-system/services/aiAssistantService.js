/**
 * aiAssistantService.js
 * Powered by Claude (Anthropic) - Emerald Pearland Events AI Assistant
 */

const Anthropic = require('@anthropic-ai/sdk');
const AIConversationLog = require('../ai-learning/models/AIConversationLog');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function processAssistantQuery(userId, role, query, eventContext = {}, history = []) {
    if (!query || typeof query !== 'string') throw new Error('Invalid query');
    
    const sanitized = query.trim().substring(0, 2000)
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    if (sanitized.length === 0) throw new Error('Empty query after sanitization');

    // Fetch live business data
    let businessData = {};
    try {
        const Staff = require('../models/Staff');
        const staffList = await Staff.find({ status: 'Active' }).select('name role category availability_status').lean();
        businessData.staff = staffList;
        businessData.staffCount = staffList.length;
        businessData.availableStaff = staffList.filter(s => s.availability_status === 'Available').length;
    } catch (e) { businessData.staffError = e.message; }

    // System prompt
    const systemPrompt = `You are the official AI Assistant for Emerald Pearland Events, a luxury event planning company based in Nairobi, Kenya.

You are embedded in the internal staff and admin portal. Your role is to assist the team with:
- Staff management and scheduling
- Event planning and coordination  
- Business analytics and insights
- Operational questions

Current User Role: ${role}
${eventContext.userName ? 'User Name: ' + eventContext.userName : ''}

Live Business Data:
- Total Active Staff: ${businessData.staffCount || 'Unknown'}
- Available Staff Right Now: ${businessData.availableStaff || 'Unknown'}
- Staff List: ${JSON.stringify(businessData.staff?.map(s => s.name + ' (' + (s.category || s.role) + ')') || [])}

Rules:
1. Only answer questions related to Emerald Pearland Events business operations
2. ${role === 'Staff' ? 'Do NOT share financial data, profit figures, or other staff salaries - this user is Staff level' : 'You can share full business data as this is an Admin/Supervisor'}
3. Be concise, professional, and helpful
4. If you don't have specific data, say so honestly
5. Always respond in the context of Emerald Pearland Events
6. You are Claude, made by Anthropic, integrated into Emerald's system`;

    // Build message history
    const messages = [];
    if (history && history.length > 0) {
        history.slice(-6).forEach(h => {
            messages.push({ role: 'user', content: h.query });
            messages.push({ role: 'assistant', content: h.response });
        });
    }
    messages.push({ role: 'user', content: sanitized });

    // Call Claude API
    const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages
    });

    const aiResponse = response.content[0].text;

    // Log conversation
    await AIConversationLog.create({
        user_id: userId,
        role: role,
        query: sanitized,
        response: aiResponse,
        context_used: businessData
    }).catch(err => console.error('[AIConversationLog] Save failed:', err.message));

    return {
        reply: aiResponse,
        response: aiResponse,
        summary: aiResponse,
        recommendedActions: []
    };
}

module.exports = { processAssistantQuery };
