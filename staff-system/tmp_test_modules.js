/**
 * tmp_test_modules.js
 * Test script for AI Brain & Emergency Funds Modules
 */
require('dotenv').config({ path: 'c:/My Web Sites/school/live.themewild.com/emerald/.env' });
const mongoose = require('mongoose');

// Models
const Staff = require('./models/Staff');
const Assignment = require('./models/Assignment');
const Booking = require('../server/models/Booking');
const BiometricSession = require('./models/BiometricSession');
const EmergencyOtp = require('./models/EmergencyOtp');
const RateLimitEntry = require('./models/RateLimitEntry');
const EmergencyFundAudit = require('./models/EmergencyFundAudit');

// Services
const { generatePrediction } = require('./services/eventPredictionService');
const emergencyFundService = require('./services/emergencyFundService');

async function checkTtlIndex(model, indexName) {
    const indexes = await model.collection.getIndexes();
    const hasTtl = Object.values(indexes).some(idx => idx[indexName] === 1 && idx.expireAfterSeconds === 0);
    console.log(`[TTL CHECK] ${model.modelName} has TTL on ${indexName}:`, hasTtl ? '✅ YES' : '❌ NO');
}

async function runTests() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/emerald?directConnection=true');
        console.log('✅ Connected to MongoDB');

        console.log('\n--- Checking TTL Indexes ---');
        await checkTtlIndex(BiometricSession, 'expiresAt');
        await checkTtlIndex(EmergencyOtp, 'expiresAt');
        await checkTtlIndex(RateLimitEntry, 'expiresAt');

        console.log('\n--- Data Setup ---');
        const admin = await Staff.findOne({ role: 'Admin' });
        if (!admin) {
            console.log('❌ No admin found in DB to run tests. Exiting.');
            return;
        }
        
        const booking = await Booking.create({
            clientName: 'Test Client', email: 'client@test.com', phone: '254700',
            eventType: 'Wedding', eventDate: new Date(), guests: 300,
            bookingReference: 'TEST_' + Date.now().toString(), status: 'Confirmed'
        });

        const liveAssignment = await Assignment.create({
            title: 'Test Wedding event', date: new Date(),
            start_time: '14:00', end_time: '20:00',
            gps_location: { lat: -1.29, lng: 36.82, display_name: 'Nairobi' },
            pay_rate: 1500, usherCount: 8, clientPaymentAmount: 50000,
            lifecycle_state: 'LIVE', booking_ref: booking.bookingReference
        });

        const plannedAssignment = await Assignment.create({
            title: 'Planned event', date: new Date(), start_time: '14:00', end_time: '20:00',
            pay_rate: 1000, usherCount: 5, clientPaymentAmount: 30000, lifecycle_state: 'PLANNED'
        });

        console.log('\n--- 1. Testing AI Prediction ---');
        const prediction1 = await generatePrediction(liveAssignment._id.toString());
        console.log('With Booking/No Reviews:', Object.keys(prediction1).join(', '));
        console.log(`   Staff: ${prediction1.predictedStaff}, Cost: ${prediction1.estimatedCost}, Profit: ${prediction1.estimatedProfit}, Risk: ${prediction1.riskLevel}, Confidence: ${prediction1.confidenceScore}`);
        if (prediction1.confidenceScore <= 0.9) console.log('   ✅ Confidence score drops properly for missing invoice');

        const prediction2 = await generatePrediction(plannedAssignment._id.toString());
        console.log('Without Booking:', `Staff: ${prediction2.predictedStaff}, Risk: ${prediction2.riskLevel}, Conf: ${prediction2.confidenceScore}`);
        if (prediction2.confidenceScore <= 0.8) console.log('   ✅ Confidence score drops properly for missing booking');

        console.log('\n--- 2. Testing Emergency Funds Security Flow ---');
        const defaultParams = {
            adminId: admin._id, eventId: liveAssignment._id, amount: 5000, phone: '254700000000',
            reason: 'Test', reasonCategory: 'logistics', adminLat: -1.29, adminLng: 36.82, deviceId: 'test_dev_1'
        };

        let res = await emergencyFundService.processEmergencyFund({ ...defaultParams, adminLat: null });
        console.log('Missing GPS:', res.error);
        if (res.statusCode === 400) console.log('   ✅ GPS Check Passed');

        res = await emergencyFundService.processEmergencyFund({ ...defaultParams, eventId: plannedAssignment._id });
        console.log('Not LIVE:', res.error);
        if (res.statusCode === 400) console.log('   ✅ Status Check Passed');

        res = await emergencyFundService.processEmergencyFund(defaultParams);
        console.log('No Biometric:', res.error);
        if (res.statusCode === 403) console.log('   ✅ Biometric Check Passed');

        await emergencyFundService.verifyBiometric(admin._id, defaultParams.deviceId, '127.0.0.1', 'NodeTest');
        console.log('   ✅ Biometric Session Created');

        res = await emergencyFundService.processEmergencyFund({ ...defaultParams, amount: 15000 });
        console.log('Threshold > 10k, no OTP:', res.error);
        if (res.statusCode === 403) console.log('   ✅ Threshold Check Passed');

        const otpRes = await emergencyFundService.requestOtp(admin._id, liveAssignment._id, defaultParams.deviceId, admin.email);
        console.log('OTP Request:', otpRes.message);
        
        // Manual verification of fraud method
        const fraudFlags = await emergencyFundService._detectFraud(admin._id, liveAssignment._id, 100000, 10.0, 10.0);
        console.log('Fraud Flags Generated:', fraudFlags.join(', '));

        console.log('\n--- Tests Complete ---');
    } catch (e) {
        console.error('TEST ERROR:', e);
    } finally {
        await mongoose.connection.close();
    }
}

runTests();
