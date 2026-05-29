const express = require('express');
const https = require('https');
const jwt = require('jsonwebtoken');
const router = express.Router();

// ─────────────────────────────────────────────────────────────
// Admin-only middleware
// ─────────────────────────────────────────────────────────────
const protectAdmin = async (req, res, next) => {
    try {
        const token = req.cookies?.adminToken || req.cookies?.portal_token ||
            (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : null);

        if (!token) {
            return res.status(401).json({ message: 'Admin authentication required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = { _id: decoded.adminId, email: decoded.email, role: decoded.role || 'admin' };
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired admin token' });
    }
};

// ─────────────────────────────────────────────────────────────
// Helper: Paystack API request (mirrors paystackService pattern)
// ─────────────────────────────────────────────────────────────
const paystackRequest = (method, path, data = null) => {
    return new Promise((resolve, reject) => {
        const payload = data ? JSON.stringify(data) : null;

        const options = {
            hostname: 'api.paystack.co',
            port: 443,
            path,
            method,
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (res.statusCode >= 200 && res.statusCode < 300 && parsed.status) {
                        resolve(parsed);
                    } else {
                        reject(new Error(parsed.message || `Paystack API error (${res.statusCode})`));
                    }
                } catch (err) {
                    reject(new Error(`Failed to parse Paystack response: ${body.substring(0, 200)}`));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('Paystack API request timed out'));
        });

        if (payload) req.write(payload);
        req.end();
    });
};

// ─────────────────────────────────────────────────────────────
// POST /api/payouts/staff — Initiate a staff payout via Paystack Transfer
// ─────────────────────────────────────────────────────────────
// Body: { staffName, bankCode, accountNumber, amount, reason }
router.post('/staff', protectAdmin, async (req, res) => {
    try {
        const { staffName, bankCode, accountNumber, amount, reason } = req.body;

        if (!staffName || !bankCode || !accountNumber || !amount) {
            return res.status(400).json({
                message: 'Missing required fields: staffName, bankCode, accountNumber, amount'
            });
        }

        // Step 1: Create a transfer recipient
        const recipientResult = await paystackRequest('POST', '/transferrecipient', {
            type: 'mobile_money',   // or 'nuban' for Nigerian bank accounts
            name: staffName,
            bank_code: bankCode,
            account_number: accountNumber,
            currency: 'KES'
        });

        const recipientCode = recipientResult.data.recipient_code;

        // Step 2: Initiate the transfer
        const transferResult = await paystackRequest('POST', '/transfer', {
            source: 'balance',
            amount: Math.round(amount * 100), // kobo / cents
            recipient: recipientCode,
            reason: reason || `Staff payout — ${staffName}`
        });

        console.log(`[payouts/staff] Transfer initiated for ${staffName}: ${transferResult.data.transfer_code}`);

        res.json({
            success: true,
            transfer_code: transferResult.data.transfer_code,
            status: transferResult.data.status,
            amount: amount
        });
    } catch (err) {
        console.error('[payouts/staff] error:', err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
