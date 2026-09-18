const NodeCache = require("node-cache");
const redis = require("../config/redis");


const NAMESPACE = "cache:";

const DEFAULT_TTL_SECONDS = 300; 

const localCache = new NodeCache({
    stdTTL: DEFAULT_TTL_SECONDS,
    checkperiod: 60,      
    useClones: false      
});

function namespacedKey(key) {
    return `${NAMESPACE}${key}`;
}

/**
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function get(key) {

    if (redis.isRedisConfigured()) {


        if (!redis.isRedisReady()) {
            return null;
        }

        try {
            const raw = await redis.client.get(namespacedKey(key));
            return raw === null ? null : JSON.parse(raw);
        } catch (err) {
            console.error("cache.get (redis) error:", err.message);

            return null;
        }
    }

    try {
        const value = localCache.get(key);
        return value === undefined ? null : value;
    } catch (err) {
        console.error("cache.get (local) error:", err.message);
        return null; 
    }
}

/**
 * @param {string} key
 * @param {any} value
 * @param {number} ttlSeconds
 * @returns {Promise<boolean>}
 */
async function set(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {

    if (redis.isRedisConfigured()) {

        if (!redis.isRedisReady()) {
            return false;
        }

        try {
            await redis.client.set(
                namespacedKey(key),
                JSON.stringify(value),
                "EX",
                ttlSeconds
            );
            return true;
        } catch (err) {
            console.error("cache.set (redis) error:", err.message);
            return false;
        }
    }

    try {
        localCache.set(key, value, ttlSeconds);
        return true;
    } catch (err) {
        console.error("cache.set (local) error:", err.message);
        return false;
    }
}

/**
 * @param {string} key
 */
async function del(key) {

    if (redis.isRedisConfigured()) {

        if (!redis.isRedisReady()) {
            return;
        }

        try {
            await redis.client.del(namespacedKey(key));
        } catch (err) {
            console.error("cache.del (redis) error:", err.message);
        }
        return;
    }

    try {
        localCache.del(key);
    } catch (err) {
        console.error("cache.del (local) error:", err.message);
    }
}

/**

 * @param {string} prefix
 */
async function delByPrefix(prefix) {

    if (redis.isRedisConfigured()) {

        if (!redis.isRedisReady()) {
            return;
        }

        try {
            const pattern = `${namespacedKey(prefix)}*`;
            let cursor = "0";

            do {
                const [nextCursor, keys] = await redis.client.scan(
                    cursor,
                    "MATCH",
                    pattern,
                    "COUNT",
                    100
                );

                cursor = nextCursor;

                if (keys.length) {
                    await redis.client.del(...keys);
                }
            } while (cursor !== "0");
        } catch (err) {
            console.error("cache.delByPrefix (redis) error:", err.message);
        }
        return;
    }

    try {
        const matchingKeys = localCache
            .keys()
            .filter((key) => key.startsWith(prefix));

        if (matchingKeys.length) {
            localCache.del(matchingKeys);
        }
    } catch (err) {
        console.error("cache.delByPrefix (local) error:", err.message);
    }
}


async function flushAll() {
    await delByPrefix("");
}

module.exports = {
    get,
    set,
    del,
    delByPrefix,
    flushAll,
    client: redis.client
};