// ═══════════════════════════════════════════════════════════
// NORMALIZATION UTILITIES — Phone & Email
// Kenyan phone numbers: 07xx, 01xx, +254xx, 254xx, 7xx, 1xx
// ═══════════════════════════════════════════════════════════

/**
 * Normalizes a Kenyan phone number to the 254XXXXXXXXX format (12 digits).
 * Handles: 07..., 01..., +254..., 254..., 7..., 1...
 * Returns the normalized string, or the original input if it can't be parsed.
 */
function normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') return phone;

    // Strip spaces, dashes, parentheses, dots
    let cleaned = phone.replace(/[\s\-().+]/g, '');

    // If it starts with 254 and is 12 digits, it's already normalized
    if (/^254\d{9}$/.test(cleaned)) return cleaned;

    // 07xxxxxxxx or 01xxxxxxxx → 2547... or 2541...
    if (/^0[17]\d{8}$/.test(cleaned)) {
        return '254' + cleaned.substring(1);
    }

    // 7xxxxxxxx or 1xxxxxxxx (9 digits, missing the leading 0)
    if (/^[17]\d{8}$/.test(cleaned)) {
        return '254' + cleaned;
    }

    // 254 prefix but came via "+254..." (already stripped the +)
    if (/^254\d{9,}$/.test(cleaned)) {
        return cleaned.substring(0, 12); // cap at 12 digits
    }

    // Fallback: return as-is
    return cleaned;
}

/**
 * Normalizes an email: lowercase + trim.
 */
function normalizeEmail(email) {
    if (!email || typeof email !== 'string') return email;
    return email.toLowerCase().trim();
}

module.exports = { normalizePhone, normalizeEmail };
