/**
 * validateObjectId.js
 * Validates MongoDB ObjectId strings to prevent CastError crashes.
 */

const mongoose = require('mongoose');

/**
 * Returns true if the given id is a valid 24-hex-char MongoDB ObjectId.
 */
function isValidObjectId(id) {
    if (!id) return false;
    return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === String(id);
}

/**
 * Express middleware factory — validates a named param.
 * Usage: router.get('/:eventId', validateParam('eventId'), handler)
 */
function validateParam(paramName) {
    return (req, res, next) => {
        const id = req.params[paramName];
        if (!isValidObjectId(id)) {
            return res.status(400).json({ success: false, error: 'Invalid ID' });
        }
        next();
    };
}

module.exports = { isValidObjectId, validateParam };
