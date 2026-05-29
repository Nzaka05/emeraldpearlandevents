const store = new Map();

class RedisMock {
    constructor() {
        this.status = 'ready';
    }

    async get(key) {
        return store.has(key) ? store.get(key) : null;
    }

    async set(key, value, ...args) {
        // Supports: set(key, value) and set(key, value, 'EX', ttl)
        store.set(key, value);
        if (args.length >= 2 && String(args[0]).toUpperCase() === 'EX') {
            const ttlSeconds = Number(args[1]);
            if (Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
                setTimeout(() => {
                    store.delete(key);
                }, ttlSeconds * 1000).unref?.();
            }
        }
        return 'OK';
    }

    async del(key) {
        const existed = store.delete(key);
        return existed ? 1 : 0;
    }

    async ping() {
        return 'PONG';
    }

    async incr(key) {
        const current = parseInt(store.get(key) || '0', 10);
        const next = current + 1;
        store.set(key, next.toString());
        return next;
    }

    async quit() {
        this.status = 'end';
        return 'OK';
    }

    disconnect() {
        this.status = 'end';
    }

    on() {
        return this;
    }

    static __clearAll() {
        store.clear();
    }
}

module.exports = RedisMock;
