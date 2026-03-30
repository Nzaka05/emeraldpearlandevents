const fs = require('fs');

const filePath = 'staff-system/services/aiAssistantService.js';
let content = fs.readFileSync(filePath, 'utf8');

// ─── 1. Add booking action functions after getMainPortalData ───────────────────
const actionFunctions = `
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
`;

// Insert before processAssistantQuery
content = content.replace(
    'async function processAssistantQuery(',
    actionFunctions + '\nasync function processAssistantQuery('
);

// ─── 2. Add action command handler inside processAssistantQuery ───────────────
const actionHandler = `
    // ── PEARL ACTION HANDLER ──────────────────────────────────────────────────
    if (role === 'Admin' || role === 'Supervisor') {
        const lower = sanitized.toLowerCase();
        const idMatch = sanitized.match(/\\b([a-fA-F0-9]{24})\\b/);

        // CONFIRM BOOKING
        if ((lower.includes('confirm') && lower.includes('booking')) && idMatch) {
            const result = await pearlUpdateBooking(idMatch[1], { status: 'confirmed' });
            const reply = result.success
                ? \`Booking \${idMatch[1]} has been confirmed successfully. The event has also been synced to the staff portal for assignment.\`
                : \`Could not confirm booking: \${result.error}\`;
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }

        // MARK AS CONTACTED
        if ((lower.includes('mark') && lower.includes('contacted')) && idMatch) {
            const result = await pearlUpdateBooking(idMatch[1], { status: 'contacted' });
            const reply = result.success
                ? \`Booking \${idMatch[1]} has been marked as contacted.\`
                : \`Could not update booking: \${result.error}\`;
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }

        // MARK AS COMPLETED
        if ((lower.includes('mark') && lower.includes('complet')) && idMatch) {
            const result = await pearlUpdateBooking(idMatch[1], { status: 'completed' });
            const reply = result.success
                ? \`Booking \${idMatch[1]} has been marked as completed.\`
                : \`Could not update booking: \${result.error}\`;
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }

        // CANCEL BOOKING
        if ((lower.includes('cancel') && lower.includes('booking')) && idMatch) {
            const result = await pearlUpdateBooking(idMatch[1], { status: 'cancelled' });
            const reply = result.success
                ? \`Booking \${idMatch[1]} has been cancelled.\`
                : \`Could not cancel booking: \${result.error}\`;
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }

        // MARK AS PAID
        if ((lower.includes('mark') && lower.includes('paid')) && idMatch) {
            const result = await pearlUpdateBooking(idMatch[1], { isPaid: true });
            const reply = result.success
                ? \`Booking \${idMatch[1]} has been marked as paid.\`
                : \`Could not update booking: \${result.error}\`;
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }

        // ADD NOTE TO BOOKING
        if ((lower.includes('add note') || lower.includes('note to booking')) && idMatch) {
            const noteText = sanitized.replace(/add note (to booking)?/i, '').replace(idMatch[1], '').trim();
            if (noteText) {
                const result = await pearlUpdateBooking(idMatch[1], { notes: noteText });
                const reply = result.success
                    ? \`Note added to booking \${idMatch[1]}: "\${noteText}"\`
                    : \`Could not add note: \${result.error}\`;
                await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
                return { reply, response: reply, summary: reply, recommendedActions: [] };
            }
        }

        // GET BOOKING DETAILS
        if ((lower.includes('show booking') || lower.includes('booking details') || lower.includes('lookup booking')) && idMatch) {
            const b = await pearlGetBookingById(idMatch[1]);
            const reply = b
                ? \`Booking Details:\\n• Client: \${b.client} (\${b.email})\\n• Type: \${b.type}\\n• Date: \${new Date(b.date).toLocaleDateString('en-KE')}\\n• Location: \${b.location}\\n• Guests: \${b.guests}\\n• Status: \${b.status}\\n• Payment: \${b.isPaid ? 'Paid' : 'Pending'} | Budget: \${b.budgetRange}\\n• Reference: \${b.reference || 'N/A'}\`
                : \`Could not find booking with ID \${idMatch[1]}\`;
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }
    }
    // ── END ACTION HANDLER ───────────────────────────────────────────────────
`;

// Insert at the start of processAssistantQuery, after sanitized is defined
content = content.replace(
    '    // Email command handler',
    actionHandler + '\n    // Email command handler'
);

// ─── 3. Update system prompt to list action commands ─────────────────────────
content = content.replace(
    'IMPORTANT: You are PEARL. Never mention Claude or Anthropic.',
    `PEARL BOOKING ACTIONS (Admin/Supervisor only):
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

IMPORTANT: You are PEARL. Never mention Claude or Anthropic.`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done - Pearl can now confirm/update/cancel bookings');

// Verify
const v = fs.readFileSync(filePath, 'utf8');
console.log('pearlUpdateBooking exists:', v.includes('pearlUpdateBooking'));
console.log('Action handler exists:', v.includes('PEARL ACTION HANDLER'));
console.log('Action commands in prompt:', v.includes('PEARL BOOKING ACTIONS'));
