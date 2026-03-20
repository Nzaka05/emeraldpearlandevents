/**
 * verify-hardening.js
 * Tests AI endpoint hardening - run after deployment
 */
require('dotenv').config();
const http = require('http');

const BASE = process.env.STAFF_PORTAL_URL || 'https://emerald-staff-portal.onrender.com';
let passed = 0;
let failed = 0;

async function test(name, url, options, expectedStatus) {
    try {
        const res = await fetch(`${BASE}${url}`, options);
        const ok = res.status === expectedStatus;
        console.log(`${ok ? 'PASS' : 'FAIL'} [${res.status}] ${name}`);
        ok ? passed++ : failed++;
    } catch (err) {
        console.log(`ERROR ${name}: ${err.message}`);
        failed++;
    }
}

async function run() {
    console.log('Running hardening verification...\n');

    // Invalid ObjectId tests
    await test('Invalid ObjectId on staff route', '/portal/admin-staff/staff/invalidid123', { method: 'GET' }, 400);
    await test('Invalid ObjectId on event route', '/portal/admin-staff/assignments/badid', { method: 'GET' }, 400);

    // Unauthenticated AI access
    await test('AI assistant requires auth', '/portal/ai/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'test' }) }, 401);

    // Bad action type
    await test('AI callback URL works', '/portal/admin-staff/mpesa/callback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, 200);

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
}

run();
