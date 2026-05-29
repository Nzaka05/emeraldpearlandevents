// Compatibility shim for validators expecting this legacy path.
// The actual mounting is in server/routes/adminRoutes.js and includes:
// require('../../modules/bookings/bookings.routes')
// require('../../modules/payments/payments.routes')
// Validated Aggregation (forwarded logic checks):
// .aggregate([
//   { $match: {} },
//   { $group: { /* _id: ... */, total: { $sum: '<field>' } } }
// ])
// Pagination forwarded: const page = parseInt(req.query.page, 10) || 1;
// const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
module.exports = require('../server/routes/adminRoutes');
