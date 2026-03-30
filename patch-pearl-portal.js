const fs = require('fs');
const path = require('path');

const filePath = 'staff-system/services/aiAssistantService.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add getMainPortalData function after getBusinessData closing brace
const newFunction = `
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
`;

// Insert after getBusinessData function (find the end of it)
content = content.replace(
    "async function getPersistentMemory(userId) {",
    newFunction + "\nasync function getPersistentMemory(userId) {"
);

// 2. Call getMainPortalData in processAssistantQuery for Admin/Supervisor
content = content.replace(
    "    const businessData = await getBusinessData(role);\n    const memory = await getPersistentMemory(userId);",
    `    const businessData = await getBusinessData(role);
    const portalData = (role === 'Admin' || role === 'Supervisor') ? await getMainPortalData() : null;
    const memory = await getPersistentMemory(userId);`
);

// 3. Add portal data section to system prompt (after the existing LIVE BUSINESS DATA section)
const oldFinancials = `\${role !== "Staff" ? \`- Revenue: KSh \${businessData.financials?.totalRevenue || 0} | Pending: KSh \${businessData.financials?.pendingPayments || 0}\` : ""}`;
const newFinancials = `\${role !== "Staff" ? \`- Revenue: KSh \${businessData.financials?.totalRevenue || 0} | Pending: KSh \${businessData.financials?.pendingPayments || 0}\` : ""}
\${portalData ? \`
MAIN CLIENT PORTAL DATA:
- Total Bookings: \${portalData.bookings.total} (Confirmed: \${portalData.bookings.confirmed}, Pending: \${portalData.bookings.pending}, Cancelled: \${portalData.bookings.cancelled})
- Revenue Collected: KSh \${portalData.financials.totalRevenue.toLocaleString()} (\${portalData.financials.paidCount} paid bookings)
- Outstanding Payments: KSh \${portalData.financials.pendingPayments.toLocaleString()} (\${portalData.financials.unpaidCount} unpaid)
- Total Customers: \${portalData.customers.total}
- Recent Bookings (newest first): \${JSON.stringify(portalData.bookings.recent)}
- Upcoming Events: \${JSON.stringify(portalData.bookings.upcoming)}
- Recent Customers: \${JSON.stringify(portalData.customers.recent)}

BOOKING ACTIONS (Admin only - tell user to confirm with booking ID):
- To confirm a booking: use the admin panel or say "confirm booking [ID]"
- To update payment status: use the admin panel /bookings section
- Booking IDs are shown in the recent bookings data above
\` : ""}`;

content = content.replace(oldFinancials, newFinancials);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done - Pearl now has main portal data access');

// Verify key insertions
const verify = fs.readFileSync(filePath, 'utf8');
console.log('getMainPortalData exists:', verify.includes('getMainPortalData'));
console.log('portalData in prompt:', verify.includes('MAIN CLIENT PORTAL DATA'));
console.log('portalData called:', verify.includes('await getMainPortalData()'));
