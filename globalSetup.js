/**
 * tests/globalSetup.js
 * Runs ONCE before any test module loads — the only hook
 * that fires before notificationService.js validates VAPID keys.
 */

module.exports = async () => {
    require('dotenv').config({ path: '.env.test' });

    // Valid-format fake VAPID keys (correct byte length, never send real pushes)
    process.env.VAPID_PUBLIC_KEY  = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    process.env.VAPID_PRIVATE_KEY = 'UUxI4O8-FbRouAevSmBQ6co62groezfL_ZkFlylHfOQ';
    process.env.NODE_ENV          = 'test';

    // Fallback values for any secret checkEnv.js requires
    const setIfMissing = (key, val) => { if (!process.env[key] || process.env[key] === 'placeholder') process.env[key] = val; };

    setIfMissing('JWT_SECRET',            'test-jwt-secret-min-32-chars-long!!');
    setIfMissing('STAFF_JWT_SECRET',      'test-staff-jwt-secret-min-32-chars!');
    setIfMissing('SSO_JWT_SECRET',        'test-sso-jwt-secret-min-32-chars!!');
    setIfMissing('CLIENT_JWT_SECRET',     'test-client-jwt-secret-min-32-chars');
    setIfMissing('SYNC_SECRET',           'test-sync-secret-value');
    setIfMissing('CLOUDINARY_URL',        'cloudinary://key:secret@testcloud');
    setIfMissing('GEMINI_API_KEY',        'test-gemini-key');
    setIfMissing('ALLOWED_ORIGINS',       'http://localhost:3000');
    setIfMissing('STAFF_PORTAL_URL',      'http://localhost:3001');
    setIfMissing('STAFF_SYSTEM_BASE_URL', 'http://localhost:3001');
    setIfMissing('ADMIN_SERVER_URL',      'http://localhost:3000');
    setIfMissing('REDIS_URL',             'redis://localhost:6379');
};
