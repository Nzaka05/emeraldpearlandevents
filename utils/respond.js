function respond(res, status, data, meta = {}) {
  res.status(status).json({
    success: status < 400,
    data: status < 400 ? data : null,
    error: status >= 400 ? data : null,
    meta: { timestamp: new Date().toISOString(), ...meta }
  });
}
module.exports = respond;
