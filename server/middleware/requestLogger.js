const crypto = require('crypto');
const pinoHttp = require('pino-http');
const logger = require('../utils/logger');

const httpLogger = pinoHttp({
    logger,
    genReqId: () => crypto.randomUUID(),
    autoLogging: {
        ignore: (req) => req.url === '/health/live'
    }
});

function requestLogger(req, res, next) {
    httpLogger(req, res);
    req.logger = req.log.child({ requestId: req.id });
    next();
}

module.exports = requestLogger;
