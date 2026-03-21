/**
 * aiAssistantService.js
 * PEARL - Personal Emerald Assistant for Real-time Leadership
 * Powered by Claude (Anthropic)
 */

const Anthropic = require('@anthropic-ai/sdk');
const AIConversationLog = require('../ai-learning/models/AIConversationLog');
const nodemailer = require('nodemailer');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
});

async function sendEmailViaPearl(to, subject, body) {
    try {
        await transporter.sendMail({
            from: `PEARL - Emerald Events <${process.env.EMAIL_USER}>`,
            to, subject,
            html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:30px;background:#fff;">
                <img src="https://i.ibb.co/0R6f9BCB/pearl-logo.png" style="height:60px;margin-bottom:20px;">
                <h2 style="color:#1a6b3c;">Emerald Pearland Events</h2>
                <div style="color:#333;line-height:1.8;">${body}</div>
                <hr style="margin:30px 0;border-color:#c9a84c;">
                <p style="color:#888;font-size:12px;">Sent by PEARL — Personal Emerald Assistant</p>
            </div>`
        });
        return true;
    } catch (e) {
        console.error('[PEARL Email]', e.message);
        return false;
    }
}

async function getBusinessData(role) {
    const data = { staffCount: 0, availableStaff: 0, busyStaff: 0, staff: [], upcomingEvents: [], recentBookings: [], financials: null };
    
    try {
        const Staff = require('../models/Staff');
        const staffList = await Staff.find({ status: 'Active' }).select('name role category availability_status title email phone').lean();
        data.staff = staffList;
        data.staffCount = staffList.length;
        data.availableStaff = staffList.filter(s => s.availability_status === 'Available').length;
        data.busyStaff = staffList.filter(s => s.availability_status === 'Busy').length;
        data.onLeave = staffList.filter(s => s.availability_status === 'On Leave').length;
    } catch (e) { data.staffError = e.message; }

    try {
        const mongoose = require('mongoose');
        const db = mongoose.connection.db;
        
        // Upcoming events
        const bookings = await db.collection('bookings').find({
            eventDate: { $gte: new Date() },
            status: { $ne: 'cancelled' }
        }).sort({ eventDate: 1 }).limit(10).toArray();
        data.upcomingEvents = bookings.map(b => ({
            client: b.clientName || b.client_name || 'Unknown',
            date: b.eventDate,
            type: b.eventType || b.event_type || 'Event',
            status: b.status,
            venue: b.venue || b.location
        }));

        // Recent bookings
        const recent = await db.collection('bookings').find({}).sort({ createdAt: -1 }).limit(5).toArray();
        data.recentBookings = recent.map(b => ({
            client: b.clientName || b.client_name,
            type: b.eventType || b.event_type,
            status: b.status,
            date: b.eventDate
        }));

        // Financials (admin only)
        if (role !== 'Staff') {
            const paid = await db.collection('bookings').aggregate([
                { $match: { isPaid: true } },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ]).toArray();
            const pending = await db.collection('bookings').aggregate([
                { $match: { isPaid: false, status: { $ne: 'cancelled' } } },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ]).toArray();
            data.financials = {
                totalRevenue: paid[0]?.total || 0,
                pendingPayments: pending[0]?.total || 0
            };
        }
    } catch (e) { data.eventsError = e.message; }

    return data;
}

async function processAssistantQuery(userId, role, query, eventContext = {}, history = []) {
    if (!query || typeof query !== 'string') throw new Error('Invalid query');

    const sanitized = query.trim().substring(0, 2000)
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    if (sanitized.length === 0) throw new Error('Empty query after sanitization');

    // Nairobi time
    const now = new Date();
    const nairobiTime = now.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hour12: true });
    const nairobiDate = now.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const hour = parseInt(now.toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', hour12: false }));
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    // Get live data
    const businessData = await getBusinessData(role);

    // Check for email command
    const emailMatch = sanitized.match(/send.*email.*to\s+([\w@.\-]+)/i);
    if (emailMatch && (role === 'Admin' || role === 'Supervisor')) {
        const to = emailMatch[1];
        const emailBody = sanitized.replace(/send.*email.*to\s+[\w@.\-]+/i, '').trim();
        const sent = await sendEmailViaPearl(to, 'Message from Emerald Pearland Events', emailBody || 'No message provided');
        return {
            reply: sent ? `Email sent to ${to} successfully.` : `Failed to send email to ${to}.`,
            response: sent ? `Email sent to ${to} successfully.` : `Failed to send email to ${to}.`,
            summary: 'Email action completed',
            recommendedActions: []
        };
    }

    const systemPrompt = `You are PEARL (Personal Emerald Assistant for Real-time Leadership), the official AI secretary for Emerald Pearland Events, a luxury event planning company in Nairobi, Kenya.

Your personality:
- Warm, professional, elegant — like a high-end executive secretary
- Conversational and friendly — respond naturally to greetings, small talk
- Proactive — mention important business updates when appropriate
- Address ${role === 'Admin' ? (eventContext.title || 'the team') : 'staff'} appropriately
- Use elegant language fitting a luxury brand
- When greeted, give a warm response AND a brief business briefing

Current Time: ${nairobiTime} — ${nairobiDate}
Greeting to use: ${greeting}
User: ${eventContext.userName || 'Team Member'} | Role: ${role} | Title: ${eventContext.title || ''}

LIVE BUSINESS DATA:
Staff Overview:
- Total Active Staff: ${businessData.staffCount}
- Available Now: ${businessData.availableStaff}
- Busy: ${businessData.busyStaff}  
- On Leave: ${businessData.onLeave || 0}
- Staff: ${JSON.stringify(businessData.staff?.map(s => s.name + ' (' + (s.title || s.category || s.role) + ') - ' + (s.availability_status || 'Unknown')))}

Upcoming Events: ${JSON.stringify(businessData.upcomingEvents)}
Recent Bookings: ${JSON.stringify(businessData.recentBookings)}
${role !== 'Staff' ? `Financials: Total Revenue: KSh ${businessData.financials?.totalRevenue || 0} | Pending: KSh ${businessData.financials?.pendingPayments || 0}` : ''}

CAPABILITIES:
- Answer questions about staff, events, bookings, analytics
- Send emails (say "send email to [address] [message]")
- Give daily briefings and summaries
- Provide alerts about staff availability or upcoming events
- Financial reports (Admin/Supervisor only)

${role === 'Staff' ? 'RESTRICTION: Do NOT share financial data, other staff salaries, or confidential metrics with this Staff user.' : ''}

You are PEARL. Never call yourself Claude or mention Anthropic to users.`;

    // Build messages
    const messages = [];
    if (history && history.length > 0) {
        history.slice(-8).forEach(h => {
            if (h.query) messages.push({ role: 'user', content: h.query });
            if (h.response) messages.push({ role: 'assistant', content: h.response });
        });
    }
    messages.push({ role: 'user', content: sanitized });

    const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages
    });

    const aiResponse = response.content[0].text;

    await AIConversationLog.create({
        user_id: userId, role, query: sanitized,
        response: aiResponse, context_used: businessData
    }).catch(err => console.error('[PEARL Log]', err.message));

    return { reply: aiResponse, response: aiResponse, summary: aiResponse, recommendedActions: [] };
}

module.exports = { processAssistantQuery };
