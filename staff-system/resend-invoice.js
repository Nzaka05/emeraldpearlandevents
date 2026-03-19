const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const ClientInvoice = require('./models/ClientInvoice');
  const Assignment = require('./models/Assignment');
  const emailService = require('./services/emailService');
  const invoice = await ClientInvoice.findOne({ invoiceNumber: 'EPE-INV-2026-0004' });
  const assignment = await Assignment.findById(invoice.eventId).lean();
  await emailService.sendClientInvoiceEmail(invoice.clientEmail, invoice.clientName, invoice, assignment);
  console.log('Invoice email resent with PDF attachment');
  process.exit();
});
