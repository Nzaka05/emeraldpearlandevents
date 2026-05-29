/**
 * jest.config.js
 * Place this at the root of your project (same level as package.json)
 */

module.exports = {
    // Test environment
    testEnvironment: 'node',

    // Runs ONCE before any test module is loaded
    // Starts shared MongoMemoryServer & sets env vars
    globalSetup: './tests/globalSetup.js',

    // Runs ONCE after all suites finish — stops the shared MongoMemoryServer
    globalTeardown: './tests/globalTeardown.js',

    // Where Jest looks for tests
    testMatch: [
        '**/tests/**/*.test.js',
        '**/tests/**/*.spec.js'
    ],

    // Runs before each test suite (after modules load)
    setupFilesAfterEnv: ['./tests/setup.js'],

    // Force web-push to use local mock during tests
    moduleNameMapper: {
        '^web-push$': '<rootDir>/__mocks__/web-push.js',
        '^ioredis$': '<rootDir>/__mocks__/ioredis.js'
    },

    // How long a single test can run before timing out
    testTimeout: 30000,

    // Coverage collection
    collectCoverageFrom: [
        'server/**/*.js',
        'staff-system/**/*.js',
        'modules/**/*.js',
        '!**/node_modules/**',
        '!**/tests/**',
        '!**/*.config.js'
    ],

    // Coverage output
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],

    // Coverage thresholds
    coverageThreshold: {
        global: {
            branches: 40,
            functions: 40,
            lines: 40,
            statements: 40
        }
    },

    // Show individual test results
    verbose: true,

    // Run tests serially to avoid DB conflicts between suites
    maxWorkers: 1,

    // Ignore these paths
    testPathIgnorePatterns: [
        '/node_modules/',
        '/admin/',
        '/public/'
    ]
};
