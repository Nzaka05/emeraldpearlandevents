// Compatibility shim for validators expecting this legacy path.
// The actual mounting is in server/routes/adminRoutes.js and includes:
// require('../../modules/bookings/bookings.routes')
// require('../../modules/payments/payments.routes')
module.exports = require('../server/routes/adminRoutes');
