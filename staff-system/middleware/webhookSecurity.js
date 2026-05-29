/**
 * webhookSecurity.js — M-Pesa IP verification middleware
 *
 * FIXES:
 *  1. Uses req.ip (which Express resolves via 'trust proxy') instead of
 *     manually parsing X-Forwarded-For — this is the ONLY safe approach
 *     behind a reverse proxy (Render / Nginx / Cloudflare).
 *  2. Requires 'trust proxy' to be set to the exact hop count or subnet
 *     of the edge proxy so that req.ip returns the *real* client IP, not
 *     the first (attacker-controlled) value in X-Forwarded-For.
 *  3. Falls back to a pure-JS CIDR matcher when ip-range-check is absent.
 */

// Safaricom B2C callback source IPs (official documentation)
const SAFARICOM_IP_ALLOWLIST = [
    '196.201.214.0/24',
    '196.201.214.200',
    '196.201.216.0/24',
    '196.201.214.196',
    '196.201.214.197'
];

// Optional dependency — degrades gracefully
const ipRangeCheck = (() => {
    try { return require('ip-range-check'); } catch { return null; }
})();

/**
 * Strip IPv6-mapped prefix (::ffff:) from an IP string.
 */
function normalizeIp(raw) {
    if (!raw) return '';
    return String(raw).replace(/^::ffff:/, '');
}

/**
 * Convert dotted-quad IP to 32-bit unsigned integer.
 * Returns null on invalid input.
 */
function ipToNumber(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => !Number.isInteger(p) || p < 0 || p > 255)) return null;
    return parts.reduce((acc, p) => ((acc << 8) + p) >>> 0, 0);
}

/**
 * Pure-JS CIDR match — zero dependencies.
 */
function isCidrMatch(ip, cidr) {
    const [network, bits] = cidr.split('/');
    const prefix = Number(bits);
    const ipNum = ipToNumber(ip);
    const netNum = ipToNumber(network);
    if (ipNum === null || netNum === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (ipNum & mask) === (netNum & mask);
}

/**
 * Express middleware — blocks any request whose source IP is not in the
 * Safaricom allowlist.  Must be placed BEFORE the callback handler.
 *
 * IMPORTANT: Express must be configured with the correct 'trust proxy'
 * setting for req.ip to be meaningful.
 *   - Render.com: app.set('trust proxy', true)        — Render terminates TLS
 *   - Nginx:      app.set('trust proxy', 'loopback')  — Nginx on same host
 *   - Custom:     app.set('trust proxy', '10.0.0.0/8') — proxy subnet
 */
function verifySafaricomIP(req, res, next) {
    // req.ip is the ONLY reliable source when trust proxy is configured.
    // Never fall back to req.headers['x-forwarded-for'] — it is attacker-controlled.
    const candidateIp = normalizeIp(req.ip);

    if (!candidateIp) {
        console.warn('[Webhook] Blocked: no source IP resolved');
        return res.status(403).json({ error: 'Forbidden' });
    }

    const allowed = SAFARICOM_IP_ALLOWLIST.some(entry => {
        if (entry.includes('/')) {
            return ipRangeCheck ? ipRangeCheck(candidateIp, entry) : isCidrMatch(candidateIp, entry);
        }
        return candidateIp === entry;
    });

    if (!allowed) {
        console.warn(`[Webhook] Blocked IP: ${candidateIp}`);
        return res.status(403).json({ error: 'Forbidden' });
    }

    next();
}

module.exports = { verifySafaricomIP, SAFARICOM_IP_ALLOWLIST };
