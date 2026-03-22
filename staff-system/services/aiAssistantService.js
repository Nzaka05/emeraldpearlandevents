/**
 * PEARL - Personal Emerald Assistant for Real-time Leadership
 * Powered by Claude (Anthropic) - Full Secretary Mode
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const AIConversationLog = require("../ai-learning/models/AIConversationLog");
const nodemailer = require("nodemailer");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
});

async function sendEmailViaPearl(to, subject, body) {
    try {
        await transporter.sendMail({
            from: `PEARL - Emerald Events <${process.env.EMAIL_USER}>`,
            to, subject,
            html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:30px;">
                <h2 style="color:#1a6b3c;">Emerald Pearland Events</h2>
                <div style="color:#333;line-height:1.8;">${body}</div>
                <hr style="border-color:#c9a84c;">
                <p style="color:#888;font-size:12px;">Sent by PEARL</p>
            </div>`
        });
        return true;
    } catch (e) { console.error("[PEARL Email]", e.message); return false; }
}

async function getBusinessData(role) {
    const data = { staffCount: 0, availableStaff: 0, busyStaff: 0, onLeave: 0, staff: [], upcomingEvents: [], recentBookings: [], financials: null };
    try {
        const db = require("mongoose").connection.db;
        const staffList = await db.collection("staffs").find({ status: "Active" }).toArray();
        data.staff = staffList;
        data.staffCount = staffList.length;
        data.availableStaff = staffList.filter(s => s.availability_status === "Available").length;
        data.busyStaff = staffList.filter(s => s.availability_status === "Busy").length;
        data.onLeave = staffList.filter(s => s.availability_status === "On Leave").length;
    } catch (e) { data.staffError = e.message; }
    try {
        const mongoose = require("mongoose");
        const db = mongoose.connection.db;
        const bookings = await db.collection("bookings").find({ eventDate: { $gte: new Date() }, status: { $ne: "cancelled" } }).sort({ eventDate: 1 }).limit(10).toArray();
        data.upcomingEvents = bookings.map(b => ({ client: b.clientName || b.client_name || "Unknown", date: b.eventDate, type: b.eventType || b.event_type || "Event", status: b.status, venue: b.venue || b.location }));
        const recent = await db.collection("bookings").find({}).sort({ createdAt: -1 }).limit(5).toArray();
        data.recentBookings = recent.map(b => ({ client: b.clientName || b.client_name, type: b.eventType || b.event_type, status: b.status, date: b.eventDate }));
        if (role !== "Staff") {
            const paid = await db.collection("bookings").aggregate([{ $match: { isPaid: true } }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]).toArray();
            const pending = await db.collection("bookings").aggregate([{ $match: { isPaid: false, status: { $ne: "cancelled" } } }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]).toArray();
            data.financials = { totalRevenue: paid[0]?.total || 0, pendingPayments: pending[0]?.total || 0 };
        }
    } catch (e) { data.eventsError = e.message; }
    return data;
}

async function getPersistentMemory(userId) {
    try {
        const logs = await AIConversationLog.find({ user_id: userId }).sort({ createdAt: -1 }).limit(20).lean();
        return logs.reverse().map(l => ({ query: l.query, response: l.response, date: l.createdAt }));
    } catch (e) { return []; }
}

async function processAssistantQuery(userId, role, query, eventContext = {}, history = []) {
    if (!query || typeof query !== "string") throw new Error("Invalid query");
    const sanitized = query.trim().substring(0, 2000).replace(/<script[^>]*>.*?<\/script>/gi, "").replace(/<[^>]+>/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    if (sanitized.length === 0) throw new Error("Empty query");

    const now = new Date();
    const nairobiTime = now.toLocaleString("en-KE", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit", hour12: true });
    const nairobiDate = now.toLocaleString("en-KE", { timeZone: "Africa/Nairobi", weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const hour = parseInt(now.toLocaleString("en-KE", { timeZone: "Africa/Nairobi", hour: "2-digit", hour12: false }));
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

    const businessData = await getBusinessData(role);
    const memory = await getPersistentMemory(userId);

    // Email command handler
    const emailMatch = sanitized.match(/send.*?email.*?to\s+([\w@.\-]+)(.*)/i);
    if (emailMatch && role !== "Staff") {
        const sent = await sendEmailViaPearl(emailMatch[1], "Message from Emerald Pearland Events", emailMatch[2].trim() || "Message from Emerald Pearland Events");
        const reply = sent ? `I have sent the email to ${emailMatch[1]} successfully.` : `I was unable to send the email to ${emailMatch[1]}. Please check the address.`;
        await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
        return { reply, response: reply, summary: reply, recommendedActions: [] };
    }

    const systemPrompt = `You are PEARL (Personal Emerald Assistant for Real-time Leadership), the dedicated AI secretary and assistant for Emerald Pearland Events.

You have the intelligence, warmth, and versatility of a world-class AI assistant � like Claude � but you are exclusively dedicated to Emerald Pearland Events and its team. You can help with virtually anything: business questions, general knowledge, writing, calculations, creative ideas, advice, and casual conversation.

PERSONALITY:
- Warm, elegant, professional � like a luxury brand executive secretary
- Conversational and natural � respond to greetings, jokes, small talk
- Proactive � volunteer useful business insights
- Intelligent � answer ANY question, not just business ones
- ${role === "Admin" ? `Address the user as ${eventContext.title || "Admin"} when appropriate` : "Be friendly and supportive to staff"}
- When greeted, respond warmly AND give a brief business snapshot
- You have memory of past conversations with this user

CURRENT TIME: ${nairobiTime} � ${nairobiDate}
USE GREETING: ${greeting}
USER: ${eventContext.userName || "Team Member"} | ROLE: ${role} | TITLE: ${eventContext.title || ""}

PAST CONVERSATION MEMORY (last 20 interactions):
${memory.length > 0 ? memory.slice(-5).map(m => `User: ${m.query}\nPEARL: ${m.response}`).join("\n---\n") : "No previous conversations with this user."}

LIVE BUSINESS DATA:
- Active Staff: ${businessData.staffCount} (Available: ${businessData.availableStaff}, Busy: ${businessData.busyStaff}, On Leave: ${businessData.onLeave || 0})
- Staff: ${JSON.stringify(businessData.staff?.map(s => s.name + " (" + (s.title || s.category || s.role) + ") - " + (s.availability_status || "Unknown")))}
- Upcoming Events: ${JSON.stringify(businessData.upcomingEvents)}
- Recent Bookings: ${JSON.stringify(businessData.recentBookings)}
${role !== "Staff" ? `- Revenue: KSh ${businessData.financials?.totalRevenue || 0} | Pending: KSh ${businessData.financials?.pendingPayments || 0}` : ""}

CAPABILITIES:
1. Business assistant � staff, events, bookings, analytics, reports
2. General knowledge � answer ANY question like a knowledgeable assistant  
3. Event planning expert � luxury events, trends, best practices, vendor advice
4. Writing assistant � draft proposals, contracts, emails, speeches, thank you notes
5. Email sender � say "send email to [address] [message]"
6. Financial advisor � budgets, pricing, cost analysis (Admin only)
7. Creative assistant � event themes, decor ideas, unique experiences
8. Personal assistant � reminders, summaries, research

LUXURY EVENT EXPERTISE:
- Expert in weddings, corporate galas, birthday parties, traditional ceremonies
- Knows Kenyan event industry, Nairobi venues, local vendors
- Familiar with luxury brands, high-end catering, premium entertainment
- Can suggest themes, budgets, timelines, staffing requirements

WRITING TEMPLATES AVAILABLE:
- Event proposals, quotations, contracts
- Client thank you letters
- Staff briefing documents  
- Post-event reports
- Marketing copy

${role === "Staff" ? "RESTRICTION: Do not share financial data, other staff salaries, or confidential business metrics with Staff users." : ""}

IMPORTANT: You are PEARL. Never mention Claude or Anthropic. You are Emerald's own AI.
Always be helpful, never refuse reasonable requests. If asked something outside business, answer it � you are a full assistant.`;

    const messages = [];
    if (history && history.length > 0) {
        history.slice(-6).forEach(h => {
            if (h.query) messages.push({ role: "user", content: h.query });
            if (h.response) messages.push({ role: "assistant", content: h.response });
        });
    }
    messages.push({ role: "user", content: sanitized });
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: systemPrompt });
    const geminiHistory = [];

    if (messages.length > 1) { messages.slice(0,-1).forEach(m => { geminiHistory.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }); }); }
    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(sanitized);
    const aiResponse = result.response.text();



    await AIConversationLog.create({
        user_id: userId, role, query: sanitized,
        response: aiResponse, context_used: businessData
    }).catch(err => console.error("[PEARL Log]", err.message));

    return { reply: aiResponse, response: aiResponse, summary: aiResponse, recommendedActions: [] };
}

module.exports = { processAssistantQuery };

