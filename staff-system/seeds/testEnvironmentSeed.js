const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Assignment = require('../models/Assignment');
const EventTeam = require('../models/EventTeam');
const Staff = require('../models/Staff');
const BiometricSession = require('../models/BiometricSession');
const ClientInvoice = require('../models/ClientInvoice');
const EventLedger = require('../models/EventLedger');
const EventPredictionSnapshot = require('../models/EventPredictionSnapshot');

async function seedTestEnvironment() {
    try {
        console.log('🌱 Starting Port 3001 Test Environment Seed...');
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // 1. Get required test users
        const supervisor = await Staff.findOneAndUpdate({ email: 'testsupervisor@emerald.com' }, { mustChangePassword: false }, { new: true });
        const staff = await Staff.findOneAndUpdate({ email: 'teststaff@emerald.com' }, { mustChangePassword: false }, { new: true });
        const admin = await Staff.findOneAndUpdate({ email: 'testadmin@emerald.com' }, { mustChangePassword: false }, { new: true });

        if (!supervisor || !staff || !admin) {
            throw new Error('Test accounts not found. Run run_seed_fixed.js first.');
        }
        console.log(`  Found: supervisor=${supervisor._id}, staff=${staff._id}, admin=${admin._id}`);

        // 2. Idempotent Assignment (Event) — LIVE state
        const eventTitle = 'Automated Test Event Alpha';
        const assignment = await Assignment.findOneAndUpdate(
            { title: eventTitle },
            {
                title: eventTitle,
                description: 'Test event for automated API testing',
                location: 'Nairobi Test Venue',
                date: new Date(Date.now() + 86400000), // Tomorrow
                start_time: '09:00 AM',
                end_time: '05:00 PM',
                pay_rate: 2500,
                status: 'Active',
                lifecycle_state: 'LIVE',
                supervisor_id: supervisor._id,
                assigned_staff_ids: [supervisor._id, staff._id],
                accepted_staff_ids: [supervisor._id, staff._id],
                createdByAdmin: admin._id,
                client_name: 'Test Client Corp',
                client_email: 'client@test.com',
                clientPaymentAmount: 50000,
                required_staff_count: 3,
                gps_location: { lat: -1.2921, lng: 36.8219 }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log('✅ Assignment (Event) seeded — ID:', assignment._id);

        // 3. EventTeam with Geo Anchor
        await EventTeam.findOneAndUpdate(
            { event_id: assignment._id },
            {
                event_id: assignment._id,
                supervisor_id: supervisor._id,
                member_ids: [staff._id],
                status: 'Active',
                team_readiness: 100,
                geoAnchor: {
                    lat: -1.2921,
                    lng: 36.8219,
                    radiusMetres: 200,
                    droppedAt: new Date(),
                    droppedBy: supervisor._id
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log('✅ EventTeam & Geo-Anchor seeded');

        // 4. BiometricSession for Admin (field: admin_id, not staff_id)
        await BiometricSession.findOneAndUpdate(
            { admin_id: admin._id, device_id: 'test-device-001' },
            {
                admin_id: admin._id,
                device_id: 'test-device-001',
                verified_at: new Date(),
                expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
                ip_address: '127.0.0.1',
                user_agent: 'TestRunner/1.0'
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log('✅ BiometricSession seeded');

        // 5. ClientInvoice (delete + create to avoid stale unique index conflicts)
        await ClientInvoice.deleteOne({ invoiceNumber: 'INV-TEST-001' });
        await ClientInvoice.create({
            invoiceNumber: 'INV-TEST-001',
            eventId: assignment._id,
            clientId: admin._id.toString(),
            clientName: 'Test Client Corp',
            clientEmail: 'client@test.com',
            clientPhone: '+254700000000',
            eventName: eventTitle,
            eventDate: assignment.date,
            eventLocation: 'Nairobi Test Venue',
            services: [{ name: 'Event Coordination', description: 'Full coordination', quantity: 1, unitPrice: 50000, total: 50000 }],
            subtotal: 50000,
            vatRate: 16,
            vatAmount: 8000,
            totalAmount: 58000,
            invoiceStatus: 'Sent',
            invoiceDate: new Date(),
            dueDate: new Date(Date.now() + 7 * 86400000)
        });
        console.log('✅ ClientInvoice seeded');

        // 6. EventLedger (line-item: requires type, amount, direction, description)
        await EventLedger.findOneAndUpdate(
            { eventId: assignment._id, type: 'clientPayment' },
            {
                eventId: assignment._id,
                type: 'clientPayment',
                amount: 50000,
                direction: 'in',
                description: 'Initial client deposit for test event',
                paymentMethod: 'MPesa',
                balanceAfter: 50000,
                createdBy: admin._id
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log('✅ EventLedger seeded');

        // 7. EventPredictionSnapshot (requires assignmentId, predictedStaff, estimatedCost, riskLevel, confidenceScore, generatedBy)
        await EventPredictionSnapshot.findOneAndUpdate(
            { assignmentId: assignment._id },
            {
                assignmentId: assignment._id,
                predictedStaff: 5,
                estimatedCost: 12500,
                estimatedProfit: 37500,
                riskLevel: 'LOW',
                confidenceScore: 0.92,
                recommendations: ['Maintain current staffing levels', 'Consider backup staff for VIP areas'],
                dataQuality: {
                    hasBooking: true,
                    hasInvoice: true,
                    hasReviews: false,
                    historicalEventsUsed: 3
                },
                generatedBy: admin._id,
                generatedAt: new Date()
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log('✅ EventPredictionSnapshot seeded');

        console.log('\n🎉 Test environment seed complete!');
        console.log(`   Event ID: ${assignment._id}`);
        console.log(`   Supervisor: ${supervisor.email}`);
        console.log(`   Staff: ${staff.email}`);
        console.log(`   Admin: ${admin.email}`);

        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        console.error('❌ Seeding failed:', error.message || error);
        await mongoose.disconnect().catch(() => {});
        process.exit(1);
    }
}

seedTestEnvironment();
