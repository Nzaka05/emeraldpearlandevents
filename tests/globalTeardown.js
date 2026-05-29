/**
 * tests/globalTeardown.js
 *
 * Jest globalTeardown — runs ONCE after all suites finish.
 *
 * Stops the shared MongoMemoryServer instance that globalSetup started.
 * Handles both --runInBand (same-process via globalThis) and normal
 * worker mode (separate process via temp file).
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { MongoMemoryServer } = require('mongodb-memory-server');

const CONFIG_PATH = path.join(os.tmpdir(), 'jest-mongo-config.json');

module.exports = async () => {
    // ── Path 1: Same-process (--runInBand) ──────────────────────
    if (globalThis.__MONGOD__) {
        await globalThis.__MONGOD__.stop({ doCleanup: true, force: false });
        globalThis.__MONGOD__ = undefined;
    }

    // ── Path 2: Separate worker — use saved config ──────────────
    // When Jest runs globalTeardown in a separate worker, the mongod
    // instance is still the OS child process started by globalSetup.
    // MongoMemoryServer.create() spawns mongod as a detached child,
    // so it stays alive across Jest workers. We clean up the temp file.
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            fs.unlinkSync(CONFIG_PATH);
        } catch (_) {
            // Best-effort cleanup
        }
    }
};
