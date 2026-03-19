/**
 * Emerald Pearl Events - Invoice Service
 *
 * Exclusively manages Client Invoice data generation.
 */

const ClientInvoice = require('../../models/ClientInvoice');
const { calculateTaxAmount, calculateTotalWithTax } = require('../utils/calculationEngine');

exports.generateInvoice = async (event_id, client_details, services, base_vat_rate = 16) => {
    // Basic service logic 
    const subtotal = services.reduce((sum, s) => sum + (s.total || 0), 0);
    const tax_amount = calculateTaxAmount(subtotal, base_vat_rate);
    const total_amount = calculateTotalWithTax(subtotal, base_vat_rate);

    const invoice = await ClientInvoice.create({
        invoiceNumber: 'EPE-INV-' + new Date().getFullYear() + '-' + Date.now().toString().slice(-4),
        eventId: event_id,
        clientName: client_details.client_name,
        clientEmail: client_details.client_email,
        staffCount: client_details.staff_count,
        services,
        subtotal,
        vatRate: base_vat_rate,
        vatAmount: tax_amount,
        totalAmount: total_amount,
        paymentStatus: 'pending',
        invoiceStatus: 'Draft' // Still requires admin manual send
    });

    return invoice;
};
