require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Staff = require('./models/Staff');
const Assignment = require('./models/Assignment');
const EventTeam = require('./models/EventTeam');
const Attendance = require('./models/Attendance');
const AuditLog = require('./models/AuditLog');
const EventTeamCommunication = require('./models/EventTeamCommunication');

const MONGO_URI = process.env.MONGO_URI ||
    'mongodb+srv://admin:Galaxyimpact.@cluster0.wa8samz.mongodb.net/emerald?retryWrites=true&w=majority';

const seedData = async () => {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // ── Wipe collections ──────────────────────────────────
        await Promise.all([
            Staff.deleteMany({}),
            Assignment.deleteMany({}),
            EventTeam.deleteMany({}),
            Attendance.deleteMany({}),
            AuditLog.deleteMany({}),
            EventTeamCommunication.deleteMany({})
        ]);
        console.log('🗑  Cleared existing data');

        const salt = await bcrypt.genSalt(10);
        const passwd = await bcrypt.hash('password123', salt);

        // ── Accounts ─────────────────────────────────────────
        const admin = await Staff.create({
            name: 'Nzaka Admin', email: 'admin@emeraldevents.com',
            password: passwd, role: 'Admin', status: 'Active', mustChangePassword: false,
            phone: '+1 555-000-0001',
            last_location: { lat: 5.6037, lng: -0.1870, updatedAt: new Date() }
        });

        const supervisor = await Staff.create({
            name: 'Sandra Mensah', email: 'super@emeraldevents.com',
            password: passwd, role: 'Supervisor', status: 'Active', mustChangePassword: false,
            phone: '+1 555-000-0002',
            last_location: { lat: 5.6048, lng: -0.1862, updatedAt: new Date() }
        });

        const supervisor2 = await Staff.create({
            name: 'Kwame Asante', email: 'super2@emeraldevents.com',
            password: passwd, role: 'Supervisor', status: 'Active', mustChangePassword: false,
            phone: '+1 555-000-0006',
            last_location: { lat: 5.6050, lng: -0.1865, updatedAt: new Date() }
        });

        const staff1 = await Staff.create({
            name: 'John Doe', email: 'staff1@emeraldevents.com',
            password: passwd, role: 'Staff', status: 'Active', mustChangePassword: false,
            phone: '+1 555-000-0003', availability_status: 'Available',
            shift_start: '09:00', shift_end: '17:00'
        });

        const staff2 = await Staff.create({
            name: 'Jane Smith', email: 'staff2@emeraldevents.com',
            password: passwd, role: 'Staff', status: 'Active', mustChangePassword: false,
            phone: '+1 555-000-0004', availability_status: 'Available',
            shift_start: '10:00', shift_end: '18:00'
        });

        const staff3 = await Staff.create({
            name: 'Abena Osei', email: 'staff3@emeraldevents.com',
            password: passwd, role: 'Staff', status: 'Active', mustChangePassword: false,
            phone: '+1 555-000-0005', availability_status: 'Available',
            shift_start: '08:00', shift_end: '16:00'
        });

        const staff4 = await Staff.create({
            name: 'Mark Tetteh', email: 'staff4@emeraldevents.com',
            password: passwd, role: 'Staff', status: 'Suspended', mustChangePassword: false,
            phone: '+1 555-000-0007', availability_status: 'Not Available'
        });

        console.log('✅ Created 7 accounts (1 Admin, 2 Supervisors, 4 Staff)');

        // ── Tomorrow / future dates ───────────────────────────
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7);
        const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7);
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);

        // ── Assignments (Events) ──────────────────────────────
        const event1 = await Assignment.create({
            title: 'Diamond Gala VIP Night',
            description: 'High-profile VIP gala. Full setup: tables, lighting, entry arches.',
            location: 'Pearland Grand Ballroom, Houston TX',
            date: tomorrow,
            start_time: '18:00', end_time: '23:59',
            pay_rate: 1500, vip_flag: true,
            dress_code: 'Black Tie',
            special_instructions: 'Report 2 hours early. No phones during service.',
            staff_needed_count: 3,
            assigned_staff_ids: [staff1._id, staff2._id, staff3._id],
            accepted_staff_ids: [staff1._id, staff2._id],
            declined_staff_ids: [],
            supervisor_id: supervisor._id,
            createdByAdmin: admin._id,
            status: 'Active',
            payment_status: 'Pending',
            gps_location: { lat: 5.6037, lng: -0.1870 }
        });

        const event2 = await Assignment.create({
            title: 'Emerald Garden Wedding',
            description: 'Outdoor garden wedding ceremony and reception.',
            location: 'The Emerald Estate, Accra',
            date: nextWeek,
            start_time: '10:00', end_time: '20:00',
            pay_rate: 1000, vip_flag: false,
            dress_code: 'Formal – White Shirts',
            special_instructions: 'Coordinate with florist on arrival.',
            staff_needed_count: 2,
            assigned_staff_ids: [staff1._id, staff3._id],
            accepted_staff_ids: [staff3._id],
            declined_staff_ids: [],
            supervisor_id: supervisor2._id,
            createdByAdmin: admin._id,
            status: 'Active',
            payment_status: 'Pending',
            gps_location: { lat: 5.6055, lng: -0.1875 }
        });

        const event3 = await Assignment.create({
            title: 'Corporate Annual Banquet',
            description: 'Formal corporate dinner for 250 guests.',
            location: 'Accra International Conference Centre',
            date: lastWeek,
            start_time: '09:00', end_time: '18:00',
            pay_rate: 800, vip_flag: false,
            dress_code: 'Smart Casual',
            staff_needed_count: 2,
            assigned_staff_ids: [staff1._id, staff2._id],
            accepted_staff_ids: [staff1._id, staff2._id],
            supervisor_id: supervisor._id,
            createdByAdmin: admin._id,
            status: 'Completed',
            payment_status: 'Sent',
            gps_location: { lat: 5.5913, lng: -0.2002 }
        });

        console.log('✅ Created 3 events (2 Active, 1 Completed)');

        // ── Event Teams ───────────────────────────────────────
        const team1 = await EventTeam.create({
            event_id: event1._id,
            supervisor_id: supervisor._id,
            member_ids: [staff1._id, staff2._id, staff3._id],
            readiness_status: 'Ready',
            readiness_percentage: 67
        });

        const team2 = await EventTeam.create({
            event_id: event3._id,
            supervisor_id: supervisor._id,
            member_ids: [staff1._id, staff2._id],
            readiness_status: 'Fully Deployed',
            readiness_percentage: 100
        });

        console.log('✅ Created 2 event teams');

        // ── Team Communications ───────────────────────────────
        await EventTeamCommunication.create({
            team_id: team1._id,
            sender_id: supervisor._id,
            message_content: 'All staff please arrive at 16:00 for briefing. Black tie dress code is mandatory.',
            message_type: 'announcement',
            timestamp: new Date(Date.now() - 3600000)
        });

        await EventTeamCommunication.create({
            team_id: team1._id,
            sender_id: supervisor._id,
            message_content: 'Reminder: Gear check at 15:30 sharp tomorrow.',
            message_type: 'shift_reminder',
            timestamp: new Date()
        });

        console.log('✅ Created team communications');

        // ── Attendance Records ────────────────────────────────
        const att1 = await Attendance.create({
            staff_id: staff1._id,
            assignment_id: event3._id,
            date: lastWeek.toISOString().split('T')[0],
            clock_in: new Date(lastWeek.getTime() + 9 * 3600000),
            clock_out: new Date(lastWeek.getTime() + 17 * 3600000 + 45 * 60000),
            total_hours: 8.75,
            status: 'On Time',
            clock_in_location: { lat: 5.5914, lng: -0.2001 },
            clock_out_location: { lat: 5.5915, lng: -0.2003 },
            supervisor_distance_m: 42
        });

        const att2 = await Attendance.create({
            staff_id: staff2._id,
            assignment_id: event3._id,
            date: lastWeek.toISOString().split('T')[0],
            clock_in: new Date(lastWeek.getTime() + 9.5 * 3600000),
            clock_out: new Date(lastWeek.getTime() + 18 * 3600000),
            total_hours: 8.5,
            status: 'Late',
            clock_in_location: { lat: 5.5916, lng: -0.2000 },
            clock_out_location: { lat: 5.5913, lng: -0.2002 },
            supervisor_distance_m: 87
        });

        console.log('✅ Created attendance records');

        // ── Audit Logs ────────────────────────────────────────
        await AuditLog.create([
            {
                actionType: 'CLOCK_IN_DENIED',
                targetModel: 'Staff', targetId: staff1._id,
                performedBy: staff1._id,
                timestamp: new Date(Date.now() - 7200000),
                details: { reason: 'Too far from supervisor (890m > 500m)', distanceMeters: 890, supervisorId: supervisor._id }
            },
            {
                actionType: 'PROXIMITY_OVERRIDE',
                targetModel: 'Staff', targetId: staff2._id,
                performedBy: admin._id,
                timestamp: new Date(Date.now() - 6000000),
                details: { reason: 'Admin override – supervisor GPS was stale', staffId: staff2._id }
            },
            {
                actionType: 'GPS_SPOOF_DETECTED',
                targetModel: 'Staff', targetId: staff3._id,
                performedBy: staff3._id,
                timestamp: new Date(Date.now() - 172800000),
                details: { lat: 0.0, lng: 0.0, reason: 'Null island coordinates detected' }
            },
            {
                actionType: 'PASSWORD_RESET',
                targetModel: 'Staff', targetId: staff4._id,
                performedBy: admin._id,
                timestamp: new Date(Date.now() - 86400000),
                details: { targetStaff: staff4._id }
            },
            {
                actionType: 'STAFF_SUSPENDED',
                targetModel: 'Staff', targetId: staff4._id,
                performedBy: admin._id,
                timestamp: new Date(Date.now() - 86400000),
                details: { targetStaff: staff4._id, reason: 'No-show on 3 consecutive events' }
            }
        ]);


        console.log('✅ Created 5 audit log entries');

        // ── Summary ───────────────────────────────────────────
        console.log('\n╔═══════════════════════════════════════════╗');
        console.log('║          SEED COMPLETE ✅                  ║');
        console.log('╠═══════════════════════════════════════════╣');
        console.log('║  LOGIN CREDENTIALS (password: password123) ║');
        console.log('╠═══════════════════════════════════════════╣');
        console.log('║  Admin:       admin@emeraldevents.com      ║');
        console.log('║  Supervisor:  super@emeraldevents.com      ║');
        console.log('║  Supervisor2: super2@emeraldevents.com     ║');
        console.log('║  Staff 1:     staff1@emeraldevents.com     ║');
        console.log('║  Staff 2:     staff2@emeraldevents.com     ║');
        console.log('║  Staff 3:     staff3@emeraldevents.com     ║');
        console.log('║  Staff 4:     staff4@emeraldevents.com     ║');
        console.log('╚═══════════════════════════════════════════╝\n');
        console.log('🌐 Start server:  node server.js');
        console.log('🔗 Admin:         http://localhost:3001/portal/auth/login');
        console.log('🔗 Staff App:     http://localhost:3001/portal/auth/login');
        process.exit(0);

    } catch (error) {
        console.error('❌ Seed Error:', error);
        process.exit(1);
    }
};

seedData();
