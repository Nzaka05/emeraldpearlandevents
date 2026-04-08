const { Queue } = require('bullmq');

if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required to initialize BullMQ queues');
}

const redisUrl = new URL(process.env.REDIS_URL);
const isTls = redisUrl.protocol === 'rediss:';

const connection = {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || (isTls ? 6380 : 6379)),
    password: redisUrl.password || undefined,
    username: redisUrl.username || undefined,
    tls: isTls ? {} : undefined
};

const bookingQueue = new Queue('bookingQueue', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 3000
        },
        removeOnComplete: false,
        removeOnFail: false
    }
});

const paymentQueue = new Queue('paymentQueue', {
    connection,
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 2000
        },
        removeOnComplete: false,
        removeOnFail: false
    }
});

const notificationQueue = new Queue('notificationQueue', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'fixed',
            delay: 5000
        },
        removeOnComplete: true,
        removeOnFail: false
    }
});

const syncQueue = new Queue('syncQueue', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 3000
        },
        removeOnComplete: false,
        removeOnFail: false
    }
});

module.exports = {
    connection,
    bookingQueue,
    paymentQueue,
    notificationQueue,
    syncQueue
};
