const {
    getCache,
    setCache,
    invalidateCache,
    invalidatePattern
} = require('../../utils/cache');

async function get(key) {
    return getCache(key);
}

async function set(key, value, ttlSeconds) {
    return setCache(key, value, ttlSeconds);
}

async function del(key) {
    return invalidateCache(key);
}

async function delPattern(prefix) {
    return invalidatePattern(prefix);
}

module.exports = {
    get,
    set,
    del,
    delPattern,
    getCache,
    setCache,
    invalidateCache,
    invalidatePattern
};