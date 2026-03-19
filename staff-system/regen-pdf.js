const mongoose = require('mongoose');
require('dotenv').config();
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const ClientInvoice = require('./models/ClientInvoice');
  const { generateInvoicePDF } = require('./controllers/invoiceController');
  const invoice = await ClientInvoice.findOne({ invoiceNumber: 'EPE-INV-2026-0004' });
  if (!invoice) { console.log('Not found'); process.exit(); }
  // Clear old PDF so it regenerates
  invoice.pdfUrl = null;
  await invoice.save();
  const pdfPath = await generateInvoicePDF(invoice);
  await ClientInvoice.findByIdAndUpdate(invoice._id, { pdfUrl: pdfPath });
  console.log('PDF regenerated:', pdfPath);
  process.exit();
});
