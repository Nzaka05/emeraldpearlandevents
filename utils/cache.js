const requireQueues = require('../config/queues');

function getClient() {
    const currentClient = requireQueues.redisClient || requireQueues.connection;
    if (!currentClient || typeof currentClient.get !== 'function') {
        return null;
    }
    return currentClient;
}

async function getCache(key) {
    const client = getClient();
    if (!client) return null;
    try {
        const data = await client.get(key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        console.error(`Redis GET error for ${key}:`, err.message);
        return null;
    }
}

async function setCache(key, value, ttlSeconds) {
    const client = getClient();
    if (!client) return;
    try {
        await client.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
        console.error(`Redis SET error for ${key}:`, err.message);
    }
}

async function invalidateCache(key) {
    const client = getClient();
    if (!client) return;
    try {
        await client.del(key);
    } catch (err) {
        console.error(`Redis DEL error for ${key}:`, err.message);
    }
}

async function invalidatePattern(prefix) {
    const client = getClient();
    if (!client) return;

    let batchChain = Promise.resolve();

    await new Promise((resolve, reject) => {
        const stream = client.scanStream({
            match: `${prefix}*`,
            count: 100
        });

        let settled = false;
        const settleReject = (err) => {
            if (settled) return;
            settled = true;
            reject(err);
        };

        stream.on('data', (keys) => {
            if (!Array.isArray(keys) || keys.length === 0) {
                return;
            }

            batchChain = batchChain.then(async () => {
                const pipeline = client.pipeline();
                keys.forEach((key) => pipeline.del(key));
                await pipeline.exec();
            });

            batchChain.catch((err) => {
                console.error(`Redis SCAN pipeline error for pattern ${prefix}:`, err);
                stream.destroy(err);
            });
        });

        stream.on('error', (err) => {
            console.error(`Redis SCAN error for pattern ${prefix}:`, err);
            settleReject(err);
        });

        stream.on('end', () => {
            batchChain
                .then(() => {
                    if (!settled) {
                        settled = true;
                        resolve();
                    }
                })
                .catch((err) => {
                    console.error(`Redis invalidatePattern batch error for ${prefix}:`, err);
                    settleReject(err);
                });
        });
    });

}

module.exports = { getCache, setCache, invalidateCache, invalidatePattern };
