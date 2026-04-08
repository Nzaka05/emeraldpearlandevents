const axios = require('axios');

const STAFF_SYSTEM_BASE_URL = process.env.STAFF_SYSTEM_BASE_URL || 'http://localhost:3001';

function buildHeaders() {
    const headers = {};
    if (process.env.SYNC_SECRET) {
        headers['x-sync-secret'] = process.env.SYNC_SECRET;
    }
    return headers;
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

module.exports = {
    getEventHealth,
    getClientInvoices,
    getClientInvoiceById
};