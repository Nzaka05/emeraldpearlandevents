/**
 * staffSystemGateway.js — HTTP client for Port 3000 → Port 3001 calls
 *
 * Phase 3: Uses HMAC-signed headers via createSyncHeaders().
 * Legacy x-sync-secret has been REMOVED.
 */

const axios = require('axios');
const { createSyncHeaders } = require('../../staff-system/middleware/syncAuth');

const STAFF_SYSTEM_BASE_URL = process.env.STAFF_SYSTEM_BASE_URL || 'http://localhost:3001';

/**
 * Build HMAC headers for GET requests.
 * GET requests have no body, so we sign an empty object.
 */
function buildHeaders() {
    const secret = process.env.SYNC_SECRET;
    if (!secret) {
        console.warn('[StaffSystemGateway] SYNC_SECRET not set — requests will fail');
        return { 'Content-Type': 'application/json' };
    }
    return createSyncHeaders(secret, {});
}

async function getEventHealth(eventId, clientId) {
    const response = await axios.get(
        `${STAFF_SYSTEM_BASE_URL}/internal/client-portal/event-health/${eventId}`,
        {
            params: { clientId },
            headers: buildHeaders(),
            timeout: 5000
        }
    );
    return response.data;
}

async function getClientInvoices(clientId) {
    const response = await axios.get(
        `${STAFF_SYSTEM_BASE_URL}/internal/client-portal/invoices`,
        {
            params: { clientId },
            headers: buildHeaders(),
            timeout: 5000
        }
    );
    return response.data;
}

async function getClientInvoiceById(clientId, invoiceId) {
    const response = await axios.get(
        `${STAFF_SYSTEM_BASE_URL}/internal/client-portal/invoices/${invoiceId}`,
        {
            params: { clientId },
            headers: buildHeaders(),
            timeout: 5000
        }
    );
    return response.data;
}

async function getClientEtr(eventId, clientId) {
    const response = await axios.get(
        `${STAFF_SYSTEM_BASE_URL}/internal/client-portal/etr/${eventId}`,
        {
            params: { clientId },
            headers: buildHeaders(),
            timeout: 5000
        }
    );
    return response.data;
}

module.exports = {
    getEventHealth,
    getClientInvoices,
    getClientInvoiceById,
    getClientEtr
};