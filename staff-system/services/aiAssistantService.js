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


async function getMainPortalData() {
    const data = {
        bookings: { total: 0, confirmed: 0, pending: 0, cancelled: 0, recent: [], upcoming: [] },
        financials: { totalRevenue: 0, pendingPayments: 0, paidCount: 0, unpaidCount: 0 },
        customers: { total: 0, recent: [] },
        analytics: {}
    };
    try {
        const db = require("mongoose").connection.db;

        // Booking counts
        const [total, confirmed, pending, cancelled] = await Promise.all([
            db.collection("bookings").countDocuments(),
            db.collection("bookings").countDocuments({ status: "confirmed" }),
            db.collection("bookings").countDocuments({ status: { $in: ["pending", "new"] } }),
            db.collection("bookings").countDocuments({ status: "cancelled" })
        ]);
        data.bookings.total = total;
        data.bookings.confirmed = confirmed;
        data.bookings.pending = pending;
        data.bookings.cancelled = cancelled;

        // Recent bookings (last 8)
        const recent = await db.collection("bookings").find({})
            .sort({ createdAt: -1 }).limit(8).toArray();
        data.bookings.recent = recent.map(b => ({
            id: b._id.toString(),
            client: b.clientName || b.client_name || "Unknown",
            email: b.clientEmail || b.client_email || "",
            phone: b.clientPhone || b.client_phone || "",
            type: b.eventType || b.event_type || "Event",
            date: b.eventDate,
            location: b.location || b.venue || "",
            guests: b.guests || 0,
            status: b.status,
            isPaid: b.isPaid || false,
            amount: b.totalAmount || b.budgetMin || 0,
            budgetRange: b.budgetRange || "",
            createdAt: b.createdAt
        }));

        // Upcoming bookings
        const upcoming = await db.collection("bookings").find({
            eventDate: { $gte: new Date() },
            status: { $ne: "cancelled" }
        }).sort({ eventDate: 1 }).limit(10).toArray();
        data.bookings.upcoming = upcoming.map(b => ({
            id: b._id.toString(),
            client: b.clientName || b.client_name || "Unknown",
            type: b.eventType || b.event_type || "Event",
            date: b.eventDate,
            location: b.location || b.venue || "",
            status: b.status,
            isPaid: b.isPaid || false
        }));

        // Financials
        const [paid, unpaid] = await Promise.all([
            db.collection("bookings").aggregate([
                { $match: { isPaid: true } },
                { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
            ]).toArray(),
            db.collection("bookings").aggregate([
                { $match: { isPaid: false, status: { $ne: "cancelled" } } },
                { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
            ]).toArray()
        ]);
        data.financials.totalRevenue = paid[0]?.total || 0;
        data.financials.paidCount = paid[0]?.count || 0;
        data.financials.pendingPayments = unpaid[0]?.total || 0;
        data.financials.unpaidCount = unpaid[0]?.count || 0;

        // Customers
        const customerCount = await db.collection("customers").countDocuments();
        const recentCustomers = await db.collection("customers").find({})
            .sort({ createdAt: -1 }).limit(5).toArray();
        data.customers.total = customerCount;
        data.customers.recent = recentCustomers.map(c => ({
            id: c._id.toString(),
            name: c.name || c.clientName || "Unknown",
            email: c.email || "",
            phone: c.phone || "",
            createdAt: c.createdAt
        }));

    } catch (e) {
        data.error = e.message;
        console.error("[PEARL Portal Data]", e.message);
    }
    return data;
}

async function getPersistentMemory(userId) {
    try {
        const logs = await AIConversationLog.find({ user_id: userId }).sort({ createdAt: -1 }).limit(20).lean();
        return logs.reverse().map(l => ({ query: l.query, response: l.response, date: l.createdAt }));
    } catch (e) { return []; }
}


async function pearlUpdateBooking(bookingId, updates) {
    try {
        const mongoose = require("mongoose");
        const { ObjectId } = require("mongodb");
        const db = mongoose.connection.db;

        if (!bookingId || !/^[a-fA-F0-9]{24}$/.test(bookingId)) {
            return { success: false, error: "Invalid booking ID" };
        }

        const booking = await db.collection("bookings").findOne({ _id: new ObjectId(bookingId) });
        if (!booking) return { success: false, error: "Booking not found" };

        const allowed = ['status', 'isPaid', 'notes', 'adminNotes'];
        const payload = {};
        for (const key of Object.keys(updates)) {
            if (allowed.includes(key)) payload[key] = updates[key];
        }

        // Validate status
        const validStatuses = ['new', 'contacted', 'confirmed', 'completed', 'cancelled'];
        if (payload.status && !validStatuses.includes(payload.status)) {
            return { success: false, error: "Invalid status. Valid: " + validStatuses.join(', ') };
        }

        // Set timestamps
        if (payload.status === 'confirmed') payload.confirmedAt = new Date();
        if (payload.status === 'completed') payload.completedAt = new Date();

        // Push admin note if provided
        const $push = {};
        if (payload.notes) {
            $push.adminNotes = { note: payload.notes, addedAt: new Date() };
            delete payload.notes;
        }

        const updateOp = { $set: payload };
        if (Object.keys($push).length) updateOp.$push = $push;

        await db.collection("bookings").updateOne(
            { _id: new ObjectId(bookingId) },
            updateOp
        );

        // If confirmed, trigger staff system sync via internal endpoint
        if (payload.status === 'confirmed') {
            try {
                const http = require("http");
                const syncSecret = process.env.JWT_SECRET || 'fallback_secret_key';
                const postData = JSON.stringify({
                    title: booking.eventType || 'Event',
                    description: booking.notes || 'Confirmed via PEARL',
                    location: booking.location || 'TBD',
                    date: booking.eventDate,
                    start_time: '09:00',
                    end_time: '17:00',
                    pay_rate: 1000,
                    usherCount: booking.usherCount || 0,
                    required_staff_count: booking.usherCount || 1,
                    booking_ref: bookingId,
                    client_name: booking.clientName || '',
                    client_email: booking.clientEmail || ''
                });
                const port = process.env.STAFF_PORT || process.env.PORT || 3001;
                const options = {
                    hostname: 'localhost', port,
                    path: '/internal/sync-booking',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-sync-secret': syncSecret,
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };
                await new Promise((resolve) => {
                    const req = http.request(options, resolve);
                    req.on('error', () => resolve());
                    req.write(postData);
                    req.end();
                });
                console.log('[PEARL] Booking synced to staff system:', bookingId);
            } catch (syncErr) {
                console.warn('[PEARL] Sync warning:', syncErr.message);
            }
        }

        return { success: true, bookingId, updates: payload };
    } catch (e) {
        console.error('[PEARL Action]', e.message);
        return { success: false, error: e.message };
    }
}

async function pearlGetBookingById(bookingId) {
    try {
        const mongoose = require("mongoose");
        const { ObjectId } = require("mongodb");
        const db = mongoose.connection.db;
        if (!/^[a-fA-F0-9]{24}$/.test(bookingId)) return null;
        const b = await db.collection("bookings").findOne({ _id: new ObjectId(bookingId) });
        if (!b) return null;
        return {
            id: b._id.toString(),
            client: b.clientName || b.client_name || 'Unknown',
            email: b.clientEmail || b.client_email || '',
            phone: b.clientPhone || b.client_phone || '',
            type: b.eventType || b.event_type || 'Event',
            date: b.eventDate,
            location: b.location || b.venue || '',
            guests: b.guests || 0,
            status: b.status,
            isPaid: b.isPaid || false,
            amount: b.totalAmount || b.estimatedTotal || 0,
            budgetRange: b.budgetRange || '',
            notes: b.notes || '',
            reference: b.bookingReference || ''
        };
    } catch (e) { return null; }
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
    const portalData = (role === 'Admin' || role === 'Supervisor') ? await getMainPortalData() : null;


    // ── PEARL ACTION HANDLER ──────────────────────────────────────────────────
    if (role === 'Admin' || role === 'Supervisor') {
        const lower = sanitized.toLowerCase();
        const idMatch = sanitized.match(/\b([a-fA-F0-9]{24})\b/);

        // CONFIRM BOOKING
        if ((lower.includes('confirm') && lower.includes('booking')) && idMatch) {
            const result = await pearlUpdateBooking(idMatch[1], { status: 'confirmed' });
            const reply = result.success
                ? `Booking ${idMatch[1]} has been confirmed successfully. The event has also been synced to the staff portal for assignment.`
                : `Could not confirm booking: ${result.error}`;
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }

        // MARK AS CONTACTED
        if ((lower.includes('mark') && lower.includes('contacted')) && idMatch) {
            const result = await pearlUpdateBooking(idMatch[1], { status: 'contacted' });
            const reply = result.success
                ? `Booking ${idMatch[1]} has been marked as contacted.`
                : `Could not update booking: ${result.error}`;
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }

        // MARK AS COMPLETED
        if ((lower.includes('mark') && lower.includes('complet')) && idMatch) {
            const result = await pearlUpdateBooking(idMatch[1], { status: 'completed' });
            const reply = result.success
                ? `Booking ${idMatch[1]} has been marked as completed.`
                : `Could not update booking: ${result.error}`;
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }

        // CANCEL BOOKING
        if ((lower.includes('cancel') && lower.includes('booking')) && idMatch) {
            const result = await pearlUpdateBooking(idMatch[1], { status: 'cancelled' });
            const reply = result.success
                ? `Booking ${idMatch[1]} has been cancelled.`
                : `Could not cancel booking: ${result.error}`;
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }

        // MARK AS PAID
        if ((lower.includes('mark') && lower.includes('paid')) && idMatch) {
            const result = await pearlUpdateBooking(idMatch[1], { isPaid: true });
            const reply = result.success
                ? `Booking ${idMatch[1]} has been marked as paid.`
                : `Could not update booking: ${result.error}`;
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }

        // ADD NOTE TO BOOKING
        if ((lower.includes('add note') || lower.includes('note to booking')) && idMatch) {
            const noteText = sanitized.replace(/add note (to booking)?/i, '').replace(idMatch[1], '').trim();
            if (noteText) {
                const result = await pearlUpdateBooking(idMatch[1], { notes: noteText });
                const reply = result.success
                    ? `Note added to booking ${idMatch[1]}: "${noteText}"`
                    : `Could not add note: ${result.error}`;
                await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
                return { reply, response: reply, summary: reply, recommendedActions: [] };
            }
        }

        // GET BOOKING DETAILS
        if ((lower.includes('show booking') || lower.includes('booking details') || lower.includes('lookup booking')) && idMatch) {
            const b = await pearlGetBookingById(idMatch[1]);
            const reply = b
                ? `Booking Details:\n• Client: ${b.client} (${b.email})\n• Type: ${b.type}\n• Date: ${new Date(b.date).toLocaleDateString('en-KE')}\n• Location: ${b.location}\n• Guests: ${b.guests}\n• Status: ${b.status}\n• Payment: ${b.isPaid ? 'Paid' : 'Pending'} | Budget: ${b.budgetRange}\n• Reference: ${b.reference || 'N/A'}`
                : `Could not find booking with ID ${idMatch[1]}`;
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }
    }
    // ── END ACTION HANDLER ───────────────────────────────────────────────────

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
${portalData ? `
MAIN CLIENT PORTAL DATA:
- Total Bookings: ${portalData.bookings.total} (Confirmed: ${portalData.bookings.confirmed}, Pending: ${portalData.bookings.pending}, Cancelled: ${portalData.bookings.cancelled})
- Revenue Collected: KSh ${portalData.financials.totalRevenue.toLocaleString()} (${portalData.financials.paidCount} paid bookings)
- Outstanding Payments: KSh ${portalData.financials.pendingPayments.toLocaleString()} (${portalData.financials.unpaidCount} unpaid)
- Total Customers: ${portalData.customers.total}
- Recent Bookings (newest first): ${JSON.stringify(portalData.bookings.recent)}
- Upcoming Events: ${JSON.stringify(portalData.bookings.upcoming)}
- Recent Customers: ${JSON.stringify(portalData.customers.recent)}

BOOKING ACTIONS (Admin only - tell user to confirm with booking ID):
- To confirm a booking: use the admin panel or say "confirm booking [ID]"
- To update payment status: use the admin panel /bookings section
- Booking IDs are shown in the recent bookings data above
` : ""}

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

PEARL BOOKING ACTIONS (Admin/Supervisor only):
You can directly perform these actions when given a booking ID:
- "confirm booking [ID]" → confirms booking + syncs to staff portal
- "mark booking [ID] as contacted" → updates status to contacted
- "mark booking [ID] as completed" → marks event as done
- "cancel booking [ID]" → cancels the booking
- "mark booking [ID] as paid" → marks payment as received
- "add note to booking [ID] [note text]" → adds admin note
- "show booking details [ID]" → shows full booking info

Booking IDs are the 24-character codes shown in the booking data above.
When an admin asks to confirm/update a booking, extract the ID from context and perform the action.
After any action, confirm what was done and suggest next steps.

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
