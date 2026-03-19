// checkEnv.js
// Runs synchronously at boot to ensure all expected Environment Variables are present.
require('dotenv').config();

const criticalVars = [
    'JWT_SECRET',
    'STAFF_JWT_SECRET',
    'CLIENT_JWT_SECRET',
    'MONGO_URI',
    'MPESA_CONSUMER_KEY',
    'MPESA_CONSUMER_SECRET',
    'MPESA_B2C_SHORT_CODE',
    'MPESA_B2C_INITIATOR_NAME',
    'MPESA_B2C_SECURITY_CREDENTIAL',
    'MPESA_B2C_QUEUE_TIMEOUT_URL',
    'MPESA_B2C_RESULT_URL',
    'MPESA_ENVIRONMENT',
    'WEBAUTHN_RP_ID',
    'WEBAUTHN_ORIGIN',
    'WEBAUTHN_RP_NAME'
];

const optionalVars = [
    'CLOUDINARY_URL',
    'EMAIL_HOST',
    'SOCKET_AUTH_REQUIRED'
];

let failed = false;

console.log('[ENV_CHECK] Auditing environment variables...');

for (const v of criticalVars) {
    if (!process.env[v]) {
        console.error(`❌ [CRITICAL ENV MISSING] ${v}`);
        console.error(`   -> The server cannot safely start without this value. If upgrading, please add it to your .env file.`);
        failed = true;
    }
}

for (const v of optionalVars) {
    if (!process.env[v]) {
        console.warn(`⚠️  [OPTIONAL ENV MISSING] ${v}`);
        console.warn(`   -> Feature will be gracefully disabled or fallback to degraded operation (e.g. local uploads or no emails).`);
    } else {
        if (v === 'SOCKET_AUTH_REQUIRED' && process.env[v] !== 'true') {
             console.warn(`⚠️  [OPTIONAL ENV UPDATE] ${v} usually maps to true. Currently set to ${process.env[v]}.`);
        }
    }
}

if (failed) {
    console.error('===============================================================');
    console.error('🚨 SERVER HALTED: Critical environments are missing. Do not bypass.');
    console.error('   Please consult UPGRADE.md on how to fulfill these properties.');
    console.error('===============================================================');
    process.exit(1);
}

console.log('✅ [ENV_CHECK] All critical runtime configs fulfilled.');
