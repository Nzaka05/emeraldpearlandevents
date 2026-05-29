/**
 * queue/connection.js — BullMQ Redis connection factory
 *
 * BullMQ requires SEPARATE ioredis instances for Queue and Worker.
 * This module creates dedicated connections (not shared with SSO Redis in server-prod.js).
 *
 * SAFETY: Each call returns a NEW connection instance.
 * Never reuse a single connection across Queue and Worker — BullMQ
 * uses blocking commands on the Worker connection that would starve
 * a shared Queue connection.
 */

const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Create a new ioredis connection for BullMQ.
 * @param {string} [label='bullmq'] — label for logging
 * @returns {import('ioredis').Redis}
 */
function createConnection(label = 'bullmq') {
    const connection = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,     // Required by BullMQ — retries are handled internally
        enableReadyCheck: false,        // Avoid blocking startup on Upstash (serverless Redis)
        lazyConnect: false,
    });

    connection.on('connect', () => {
        console.log(`[Queue] Redis connection established (${label})`);
    });

    connection.on('error', (err) => {
        console.error(`[Queue] Redis connection error (${label}):`, err.message);
    });

    return connection;
}

// ── Shared connection references for graceful shutdown ────────────────────────
const _connections = [];

/**
 * Create a tracked connection that will be closed on graceful shutdown.
 * @param {string} [label]
 * @returns {import('ioredis').Redis}
 */
function createTrackedConnection(label) {
    const conn = createConnection(label);
    _connections.push(conn);
    return conn;
}

/**
 * Close all tracked connections. Called during SIGTERM/SIGINT.
 */
async function closeAllConnections() {
    console.log(`[Queue] Closing ${_connections.length} Redis connections...`);
    await Promise.allSettled(_connections.map(c => {
        try { return c.quit(); } catch { return Promise.resolve(); }
    }));
    console.log('[Queue] All Redis connections closed');
}

// ── Graceful shutdown ────────────────────────────────────────────────────────
function registerShutdownHooks() {
    const handler = async (signal) => {
        console.log(`[Queue] Received ${signal}, closing connections...`);
        await closeAllConnections();
    };
    process.once('SIGTERM', handler);
    process.once('SIGINT', handler);
}

registerShutdownHooks();

module.exports = {
    createConnection,
    createTrackedConnection,
    closeAllConnections,
};
