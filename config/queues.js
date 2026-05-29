const Redis = require('ioredis');
const { Queue } = require('bullmq');
const queueMode = (process.env.QUEUE_MODE || 'inline').toLowerCase();

function buildConnectionConfig() {
    if (!process.env.REDIS_URL) {
        return null;
    }

    const redisUrl = new URL(process.env.REDIS_URL);
    const isTls = redisUrl.protocol === 'rediss:';

    return {
        host: redisUrl.hostname,
        port: Number(redisUrl.port || (isTls ? 6380 : 6379)),
        password: redisUrl.password || undefined,
        username: redisUrl.username || undefined,
        tls: isTls ? {} : undefined,
        maxRetriesPerRequest: null // Required by BullMQ
    };
}

const connection = buildConnectionConfig();
let redisClient = null;

function createRedisClient() {
    if (!connection) {
        throw new Error('REDIS_URL is required to initialize BullMQ queues');
    }

    return new Redis(connection);
}

function createNoopQueue(name) {
    return {
        name,
        async add() {
            return { skipped: true, queue: name, mode: queueMode };
        }
    };
}

function createBullQueue(Queue, name, defaultJobOptions) {
    return new Queue(name, {
        connection,
        defaultJobOptions
    });
}

function buildQueues() {
    if (queueMode !== 'async') {
        return {
            bookingQueue: createNoopQueue('bookingQueue'),
            paymentQueue: createNoopQueue('paymentQueue'),
            notificationQueue: createNoopQueue('notificationQueue'),
            syncQueue: createNoopQueue('syncQueue')
        };
    }

    redisClient = createRedisClient();

    return {
        bookingQueue: createBullQueue(Queue, 'bookingQueue', {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 3000
            },
            removeOnComplete: false,
            removeOnFail: false
        }),
        paymentQueue: createBullQueue(Queue, 'paymentQueue', {
            attempts: 5,
            backoff: {
                type: 'exponential',
                delay: 2000
            },
            removeOnComplete: false,
            removeOnFail: false
        }),
        notificationQueue: createBullQueue(Queue, 'notificationQueue', {
            attempts: 3,
            backoff: {
                type: 'fixed',
                delay: 5000
            },
            removeOnComplete: true,
            removeOnFail: false
        }),
        syncQueue: createBullQueue(Queue, 'syncQueue', {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 3000
            },
            removeOnComplete: false,
            removeOnFail: false
        })
    };
}

const { bookingQueue, paymentQueue, notificationQueue, syncQueue } = buildQueues();

module.exports = {
    connection,
    redisClient,
    bookingQueue,
    paymentQueue,
    notificationQueue,
    syncQueue
};
