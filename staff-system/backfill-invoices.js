const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const ClientInvoice = require('./models/ClientInvoice');
    const invoices = await ClientInvoice.find({ $or: [{ totalAmount: 0 }, { totalAmount: { $exists: false } }] });
    console.log('Invoices to fix:', invoices.length);
    for (const inv of invoices) {
        // Handle legacy snake_case data mapping
        if (!inv.invoiceNumber) inv.invoiceNumber = inv.invoice_number || `INV-BACKFILL-${Date.now()}`;
        if (!inv.clientName) inv.clientName = inv.client_name || 'Unknown Client';
        if (!inv.clientEmail) inv.clientEmail = inv.client_email || 'no-email@example.com';
        if (!inv.eventName) inv.eventName = inv.event_name || 'Legacy Event';
        
        if (inv.services && inv.services.length > 0) {
            const subtotal = inv.services.reduce((s, sv) => {
                if (!sv.name) sv.name = sv.description || 'Service';
                return s + (sv.total || sv.unitPrice * sv.quantity || 0);
            }, 0);
            const vatRate = inv.vatRate || 16;
            const vatAmount = Math.round(subtotal * vatRate / 100);
            inv.subtotal = subtotal;
            inv.vatAmount = vatAmount;
            inv.totalAmount = subtotal + vatAmount;
            
            try {
                await inv.save();
                console.log('Fixed:', inv.invoiceNumber, '-> KSh', inv.totalAmount);
            } catch(e) { console.error('Error saving', inv.invoiceNumber, e.message); }
        }
    }
    process.exit();
}).catch(err => {
    console.error('DB Connection error:', err);
    process.exit(1);
});
