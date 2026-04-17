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
                const syncSecret = process.env.SYNC_SECRET;
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


async function pearlFindPersonByName(name) {
    try {
        const db = require("mongoose").connection.db;
        const regex = new RegExp(name.split(' ').join('|'), 'i');

        // Search staff
        const staff = await db.collection("staffs").findOne({
            $or: [{ name: { $regex: regex } }, { firstname: { $regex: regex } }]
        });
        if (staff) return {
            type: 'staff',
            name: staff.name || (staff.firstname + ' ' + staff.lastname),
            email: staff.email,
            phone: staff.phone,
            role: staff.role || staff.category,
            id: staff._id.toString()
        };

        // Search customers
        const customer = await db.collection("customers").findOne({ name: { $regex: regex } });
        if (customer) return {
            type: 'customer',
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            id: customer._id.toString()
        };

        return null;
    } catch (e) { return null; }
}

async function pearlSendSmartEmail(to, subject, body, fromName) {
    const emailService = require('./emailService');
    try {
        await emailService.sendEmail({
            to: [{ email: to, name: fromName || 'Valued Client' }],
            subject,
            htmlContent: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:30px;background:#fff;">
                <div style="border-bottom:2px solid #059669;padding-bottom:16px;margin-bottom:24px;">
                    <h2 style="color:#059669;margin:0;font-size:1.4rem;">Emerald Pearland Events</h2>
                    <p style="color:#666;font-size:0.85rem;margin:4px 0 0;">Premium Event Management</p>
                </div>
                <div style="color:#333;line-height:1.8;font-size:1rem;">${body}</div>
                <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;">
                    <p style="color:#059669;font-weight:bold;margin:0;">Emerald Pearland Events Team</p>
                    <p style="color:#888;font-size:0.8rem;margin:4px 0 0;">Sent via PEARL AI Assistant</p>
                </div>
            </div>`
        });
        return true;
    } catch (e) {
        console.error('[PEARL Email]', e.message);
        // Fallback to nodemailer
        try {
            const nodemailer = require('nodemailer');
            const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD } });
            await t.sendMail({
                from: `Emerald Pearland Events <${process.env.EMAIL_USER}>`,
                to, subject,
                html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:30px;">
                    <h2 style="color:#059669;">Emerald Pearland Events</h2>
                    <div style="color:#333;line-height:1.8;">${body}</div>
                    <hr style="border-color:#059669;"><p style="color:#888;font-size:12px;">Sent by PEARL</p>
                </div>`
            });
            return true;
        } catch (e2) { return false; }
    }
}

async function pearlGetAllStaffContacts() {
    try {
        const db = require("mongoose").connection.db;
        const staff = await db.collection("staffs").find({ status: "Active" })
            .project({ name: 1, email: 1, phone: 1, category: 1, role: 1, availability_status: 1, title: 1 })
            .toArray();
        return staff.map(s => ({
            id: s._id.toString(),
            name: s.name || (s.firstname + ' ' + s.lastname),
            email: s.email,
            phone: s.phone,
            role: s.title || s.category || s.role,
            availability: s.availability_status
        }));
    } catch (e) { return []; }
}

async function pearlGetAllCustomers() {
    try {
        const db = require("mongoose").connection.db;
        const customers = await db.collection("customers").find({})
            .sort({ createdAt: -1 }).limit(50)
            .project({ name: 1, email: 1, phone: 1, createdAt: 1 })
            .toArray();
        return customers.map(c => ({
            id: c._id.toString(),
            name: c.name,
            email: c.email,
            phone: c.phone,
            since: c.createdAt
        }));
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

    // ── ADMIN MESSAGING & LOOKUP HANDLER ─────────────────────────────────────
    if (role === 'Admin') {
        const lower = sanitized.toLowerCase();

        // EMAIL BY NAME: "email [name] [message]" or "send [name] an email about [topic]"
        const emailByName = sanitized.match(/(?:email|message|send.*?to)s+([A-Z][a-z]+(?:s+[A-Z][a-z]+)?)s+(?:about|saying|that|:)?s*(.+)/i);
        const directEmail = sanitized.match(/send.*?email.*?tos+([w@.-]+@[w.-]+)s*(.*)/i);

        if (directEmail) {
            // Direct email to address
            const emailAddr = directEmail[1];
            const message = directEmail[2].trim() || 'Message from Emerald Pearland Events';
            const sent = await pearlSendSmartEmail(emailAddr, 'Message from Emerald Pearland Events', message, '');
            const reply = sent
                ? `Email sent successfully to ${emailAddr}.`
                : `Failed to send email to ${emailAddr}. Please check your email configuration.`;
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }

        if (emailByName && !lower.includes('@')) {
            const personName = emailByName[1];
            const messageBody = emailByName[2];
            const person = await pearlFindPersonByName(personName);
            if (person && person.email) {
                const subject = lower.includes('booking') ? 'Your Booking with Emerald Pearland Events'
                    : lower.includes('payment') ? 'Payment Information - Emerald Pearland Events'
                    : lower.includes('event') ? 'Your Upcoming Event - Emerald Pearland Events'
                    : 'Message from Emerald Pearland Events';
                const sent = await pearlSendSmartEmail(person.email, subject, messageBody, person.name);
                const reply = sent
                    ? `Email sent to ${person.name} (${person.email}) successfully.`
                    : `Found ${person.name} but failed to send email. Their address is: ${person.email}`;
                await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
                return { reply, response: reply, summary: reply, recommendedActions: [] };
            } else if (person) {
                const reply = `Found ${person.name} but they have no email address on file. Phone: ${person.phone || 'N/A'}`;
                await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
                return { reply, response: reply, summary: reply, recommendedActions: [] };
            }
        }

        // LOOKUP PERSON: "find [name]" or "who is [name]" or "contact for [name]"
        const lookupMatch = sanitized.match(/(?:find|who is|contact for|look up|details for|info on)s+([A-Z][a-z]+(?:s+[A-Z][a-z]+)?)/i);
        if (lookupMatch) {
            const person = await pearlFindPersonByName(lookupMatch[1]);
            if (person) {
                const reply = `${person.name} (${person.type}):\n• Email: ${person.email || 'N/A'}\n• Phone: ${person.phone || 'N/A'}\n• Role: ${person.role || 'N/A'}${person.availability ? '\n• Availability: ' + person.availability : ''}`;
                await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
                return { reply, response: reply, summary: reply, recommendedActions: [] };
            }
        }

        // LIST ALL STAFF CONTACTS
        if (lower.includes('all staff') && (lower.includes('contact') || lower.includes('email') || lower.includes('phone') || lower.includes('list'))) {
            const staffList = await pearlGetAllStaffContacts();
            const reply = staffList.length
                ? `All Active Staff (${staffList.length}):\n` + staffList.map(s => `• ${s.name} - ${s.role || 'Staff'} | ${s.email || 'no email'} | ${s.phone || 'no phone'} | ${s.availability || 'Unknown'}`).join('\n')
                : 'No active staff found.';
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }

        // LIST ALL CUSTOMERS
        if ((lower.includes('all customer') || lower.includes('all client')) && (lower.includes('list') || lower.includes('show') || lower.includes('contact'))) {
            const customers = await pearlGetAllCustomers();
            const reply = customers.length
                ? `All Customers (${customers.length} most recent):\n` + customers.map(c => `• ${c.name} | ${c.email || 'no email'} | ${c.phone || 'no phone'}`).join('\n')
                : 'No customers found.';
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }
    }
    // ── END ADMIN MESSAGING HANDLER ──────────────────────────────────────────


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
You are PEARL — sharp, warm, and direct. You think carefully before responding and say exactly what needs to be said, nothing more. You are not a chatbot that performs enthusiasm. You are genuinely helpful, occasionally witty, and always honest. You treat the people you work with as intelligent adults.

- Direct: get to the point immediately, no preamble
- Honest: if something is unclear or missing, say so plainly
- Warm but not performative: friendly without being bubbly or sycophantic
- Curious and engaged: when something is interesting, show it naturally
- Occasionally dry wit is fine — but only when the moment calls for it
- You remember past conversations and use that context naturally without announcing it

RESPONSE LENGTH — match the weight of the question:
- Greetings, small talk, simple yes/no: 1-2 sentences, full stop
- Single fact ("how many staff available"): answer in one sentence
- Action done ("confirmed", "sent"): brief confirmation + any relevant next step
- Business question needing context: a few sentences or a short clean list
- Deep question or analysis: thorough but tight — cut every word that does not earn its place
- Never add summaries at the end of already clear answers
- Never say "I hope this helps" or "feel free to ask" or "certainly" or "of course"
- Never start a response with "I" as the first word

FORMATTING:
- No ** bold **, no * italics *, no ### headers — ever
- For lists use a plain dash (-) or number
- Write the way a sharp colleague would message you, not the way a corporate AI writes a report
- Punctuate like a human. Short sentences are fine. Fragments too, when they fit.

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

ADMIN MESSAGING COMMANDS (Admin only):
- "email [person name] about [topic/message]" → finds person and emails them
- "send email to [email@address.com] [message]" → direct email
- "find [name]" / "who is [name]" → looks up staff or customer contact details
- "list all staff contacts" → shows all staff with emails and phones
- "list all customers" → shows all customers with contacts

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

CRITICAL — YOUR CAPABILITIES (do not deny these):
You have LIVE access to the Emerald main portal database right now. You can see all bookings, customers, financials, and staff. You can confirm bookings, send emails, look up contacts, and update booking statuses. Never tell users you lack access or need integration — you are already integrated. If live data appears above, use it. If a field is empty it means there is no data yet, not that you lack access.

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
    
    try {
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
    } catch (geminiError) {
        console.error('[PEARL] Gemini API Error:', geminiError);
        const fallbackResponse = `I encountered an issue: ${geminiError.message}. Please try again.`;
        
        await AIConversationLog.create({
            user_id: userId, role, query: sanitized,
            response: fallbackResponse, context_used: businessData, error: geminiError.message
        }).catch(err => console.error("[PEARL Log]", err.message));
        
        return { reply: fallbackResponse, response: fallbackResponse, summary: fallbackResponse, recommendedActions: [] };
    }
}

module.exports = { processAssistantQuery };
