const mongoose = require('mongoose');

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function validateParam(paramName) {
    return (req, res, next) => {
        const id = req.params[paramName];
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: `Invalid ${paramName}` });
        }
        next();
    };
}

module.exports = { isValidObjectId, validateParam };
