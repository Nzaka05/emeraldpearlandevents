/**
 * jest.config.js
 * Place this at the root of your project (same level as package.json)
 */

module.exports = {
    // Test environment
    testEnvironment: 'node',

    // Where Jest looks for tests
    testMatch: [
        '**/tests/**/*.test.js',
        '**/tests/**/*.spec.js'
    ],

    // Global setup file — runs before every test suite
    setupFilesAfterFramework: ['./tests/setup.js'],

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

    // Coverage thresholds — enforce minimum coverage on security-critical paths
    coverageThresholds: {
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
