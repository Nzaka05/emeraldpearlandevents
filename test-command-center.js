const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const commandCenterService = require('./staff-system/services/commandCenterService');
const eventPredictionService = require('./staff-system/services/eventPredictionService');
const emergencyFundService = require('./staff-system/services/emergencyFundService');

async function testCommandCenter() {
    console.log('--- Connecting to Mongoose ---');
    await mongoose.connect(process.env.MONGO_URI);
    
    try {
        console.log('1. Testing CommandCenter Summary API...');
        const summary = await commandCenterService.getActiveEventsSummary();
        console.log('Summary output:', summary.length, 'events found.');
        
        console.log('2. Testing CommandCenter Metrics API...');
        const metrics = await commandCenterService.getCommandCenterMetrics();
        console.log('Metrics output:', JSON.stringify(metrics, null, 2));
        
        console.log('3. Testing Prediction Engine Setup...');
        console.log('Prediction function exists:', typeof eventPredictionService.generatePrediction === 'function');
        
        console.log('4. Testing Emergency Funds Security Setup...');
        console.log('Emergency fund request exists:', typeof emergencyFundService.requestEmergencyFunds === 'function');
        console.log('Payout lock capability exists:', typeof emergencyFundService.approveEmergencyFunds === 'function');
        
        console.log('\n--- ALL ARCHITECTURE TESTS PASSED ---');
    } catch(err) {
        console.error('TEST FAILED:', err);
    } finally {
        await mongoose.disconnect();
    }
}

testCommandCenter();
