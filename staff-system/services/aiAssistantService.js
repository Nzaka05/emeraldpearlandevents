/**
 * aiAssistantService.js
 * PEARL - Personal Emerald Assistant for Real-time Leadership
 * Powered by Claude (Anthropic)
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

    // Get current time in Nairobi
    const now = new Date();
    const nairobiTime = now.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hour12: true });
    const nairobiDate = now.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const hour = parseInt(now.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', hour12: false }));
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    // Fetch live business data
    let businessData = { staffCount: 0, availableStaff: 0, staff: [] };
    try {
        const Staff = require('../models/Staff');
        const staffList = await Staff.find({ status: 'Active' }).select('name role category availability_status title').lean();
        businessData.staff = staffList;
        businessData.staffCount = staffList.length;
        businessData.availableStaff = staffList.filter(s => s.availability_status === 'Available').length;
        businessData.busyStaff = staffList.filter(s => s.availability_status === 'Busy').length;
    } catch (e) { businessData.staffError = e.message; }

    // Fetch upcoming bookings
    try {
        const mongoose = require('mongoose');
        const db = mongoose.connection.db;
        const bookings = await db.collection('bookings').find({ 
            eventDate: { $gte: new Date() } 
        }).sort({ eventDate: 1 }).limit(5).toArray();
        businessData.upcomingEvents = bookings.map(b => ({
            client: b.clientName || b.client_name,
            date: b.eventDate,
            type: b.eventType || b.event_type,
            status: b.status
        }));
    } catch (e) { businessData.eventsError = e.message; }

    const systemPrompt = `You are PEARL (Personal Emerald Assistant for Real-time Leadership), the official AI secretary and assistant for Emerald Pearland Events, a luxury event planning company based in Nairobi, Kenya.

You have a warm, professional, and elegant personality — like a high-end executive secretary. You are conversational, friendly, and proactive. You greet users appropriately based on the time of day.

Current Time in Nairobi: ${nairobiTime}
Current Date: ${nairobiDate}
Appropriate Greeting: ${greeting}

User Info:
- Name: ${eventContext.userName || 'Team Member'}
- Role: ${role}
- Title: ${eventContext.title || ''}

Live Business Data:
- Total Active Staff: ${businessData.staffCount}
- Available Staff: ${businessData.availableStaff}
- Busy Staff: ${businessData.busyStaff}
- Staff Members: ${JSON.stringify(businessData.staff?.map(s => s.name + ' (' + (s.title || s.category || s.role) + ') - ' + (s.availability_status || 'Unknown')) || [])}
- Upcoming Events: ${JSON.stringify(businessData.upcomingEvents || [])}

Your personality:
- Warm and professional like a luxury brand secretary
- Address admins by their title when known (CEO, Director, etc.)
- Give morning briefings when greeted in the morning
- Proactively mention urgent things (upcoming events, staff issues)
- Be conversational — chat naturally, not just data dumps
- Use elegant language befitting a luxury events company
- Add a touch of personality — occasional light humor is fine
- When greeted, always give a brief status update of the business

${role === 'Staff' ? 'Note: This user is Staff level — do NOT share financial data, other staff salaries, or confidential business metrics.' : 'This is an Admin/Supervisor — you can share full business information.'}

You are powered by Claude, made by Anthropic, but you identify yourself as PEARL to the users.`;

    // Build conversation history
    const messages = [];
    if (history && history.length > 0) {
        history.slice(-8).forEach(h => {
            if (h.query) messages.push({ role: 'user', content: h.query });
            if (h.response) messages.push({ role: 'assistant', content: h.response });
        });
    }
    messages.push({ role: 'user', content: sanitized });

    // Call Claude
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
