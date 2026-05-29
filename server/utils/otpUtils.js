// ═══════════════════════════════════════════════════════════
// OTP UTILITIES — Generate, Hash, Verify one-time passwords
// ═══════════════════════════════════════════════════════════

const bcrypt = require('bcrypt');

/**
 * Generate a random 6-digit OTP string.
 * @returns {string} e.g. "482916"
 */
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Hash an OTP using bcrypt (10 rounds).
 * @param {string} otp - The plaintext OTP
 * @returns {Promise<string>} The bcrypt hash
 */
const hashOTP = async (otp) => {
    return bcrypt.hash(otp, 10);
};

/**
 * Verify a plaintext OTP against a bcrypt hash.
 * @param {string} otp - The plaintext OTP to verify
 * @param {string} hash - The stored bcrypt hash
 * @returns {Promise<boolean>} True if the OTP matches
 */
const verifyOTP = async (otp, hash) => {
    return bcrypt.compare(otp, hash);
};

module.exports = { generateOTP, hashOTP, verifyOTP };
