// jest.setup.js - Load test environment variables before any tests run
require('dotenv').config({ path: '.env.test' });

// Set test environment flag
process.env.NODE_ENV = 'test';

// Suppress console output during tests (set LOG_LEVEL to silent)
process.env.LOG_LEVEL = 'silent';

console.log('✅ Jest setup: Test environment loaded from .env.test');
