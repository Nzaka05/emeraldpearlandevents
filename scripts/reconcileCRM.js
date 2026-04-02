#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
// CRM RECONCILIATION SCRIPT
// One-time cleanup: normalizes phone numbers in existing Customer records
// and merges duplicate profiles so all bookings are correctly linked.
// Usage: node scripts/reconcileCRM.js
// ═══════════════════════════════════════════════════════════

require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../server/models/Customer');
const Booking = require('../server/models/Booking');
const { normalizePhone, normalizeEmail } = require('../server/utils/normalization');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const customers = await Customer.find().lean();
    console.log(`Found ${customers.length} customer records`);

    let normalized = 0;
    let merged = 0;

    // Phase 1: Normalize all phone numbers and emails in-place
    for (const c of customers) {
        const normPhone = normalizePhone(c.phone);
        const normEmail = normalizeEmail(c.email);
        const updates = {};

        if (normPhone !== c.phone) updates.phone = normPhone;
        if (normEmail !== c.email) updates.email = normEmail;

        if (Object.keys(updates).length > 0) {
            await Customer.updateOne({ _id: c._id }, { $set: updates });
            normalized++;
            console.log(`  [NORM] ${c.name}: phone ${c.phone} → ${normPhone}, email ${c.email} → ${normEmail}`);
        }
    }
    console.log(`\nPhase 1 complete: normalized ${normalized} records`);

    // Phase 2: Find duplicates (same email or same phone) and merge
    const freshCustomers = await Customer.find().lean();
    const emailMap = {};
    const phoneMap = {};

    for (const c of freshCustomers) {
        if (c.email) {
            if (!emailMap[c.email]) emailMap[c.email] = [];
            emailMap[c.email].push(c);
        }
        if (c.phone) {
            if (!phoneMap[c.phone]) phoneMap[c.phone] = [];
            phoneMap[c.phone].push(c);
        }
    }

    // Merge by email duplicates
    for (const [email, dupes] of Object.entries(emailMap)) {
        if (dupes.length <= 1) continue;

        // Keep the one with the most bookings, or the oldest
        dupes.sort((a, b) => (b.totalBookings || 0) - (a.totalBookings || 0));
        const primary = dupes[0];
        const secondaries = dupes.slice(1);

        for (const sec of secondaries) {
            const result = await Booking.updateMany(
                { customerId: sec._id },
                { $set: { customerId: primary._id } }
            );
            if (result.modifiedCount > 0) {
                console.log(`  [MERGE] Moved ${result.modifiedCount} bookings from ${sec.name} (${sec._id}) → ${primary.name} (${primary._id}) [email: ${email}]`);
                merged += result.modifiedCount;
            }

            // Update primary's totalBookings
            primary.totalBookings = (primary.totalBookings || 0) + (sec.totalBookings || 0);
        }

        // Save updated primary
        await Customer.updateOne({ _id: primary._id }, { $set: { totalBookings: primary.totalBookings } });
    }

    // Merge by phone duplicates (only if not already merged above)
    for (const [phone, dupes] of Object.entries(phoneMap)) {
        if (dupes.length <= 1) continue;

        dupes.sort((a, b) => (b.totalBookings || 0) - (a.totalBookings || 0));
        const primary = dupes[0];
        const secondaries = dupes.slice(1);

        for (const sec of secondaries) {
            const result = await Booking.updateMany(
                { customerId: sec._id },
                { $set: { customerId: primary._id } }
            );
            if (result.modifiedCount > 0) {
                console.log(`  [MERGE] Moved ${result.modifiedCount} bookings from ${sec.name} (${sec._id}) → ${primary.name} (${primary._id}) [phone: ${phone}]`);
                merged += result.modifiedCount;
            }
        }
    }

    console.log(`\nPhase 2 complete: merged ${merged} bookings`);
    console.log('\n✅ CRM reconciliation complete');
    process.exit(0);
}

run().catch(err => {
    console.error('❌ Reconciliation failed:', err);
    process.exit(1);
});
