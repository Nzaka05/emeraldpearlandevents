/**
 * invoiceController.js — Phase 6: Client Invoice System
 * Generates PDF invoices, sends via email, manages invoice records
 * FIXED: All field names now match ClientInvoice schema (camelCase)
 */
const ClientInvoice = require('../models/ClientInvoice');
const Assignment    = require('../models/Assignment');
const AuditLog      = require('../models/AuditLog');
const path          = require('path');
const fs            = require('fs');

/**
 * Helper: Decode basic HTML entities for PDF rendering
 */
function decodeHTMLEntities(str) {
    if (!str) return '';
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

// —— GET /admin/invoices — List all invoices ——————————————————————————————————
exports.getInvoicesPage = async (req, res) => {
    try {
        const invoices = await ClientInvoice.find()
            .populate('eventId', 'title date')
            .sort({ createdAt: -1 })
            .lean();

        const assignments = await Assignment.find({ status: 'Completed' })
            .select('title date client_name client_email pay_rate accepted_staff_ids')
            .sort({ date: -1 })
            .lean();

        const stats = {
            total:   invoices.length,
            draft:   invoices.filter(i => i.invoiceStatus === 'Draft').length,
            sent:    invoices.filter(i => i.invoiceStatus === 'Sent').length,
            paid:    invoices.filter(i => i.invoiceStatus === 'Paid').length,
            overdue: invoices.filter(i => i.invoiceStatus === 'Overdue').length,
            totalRevenue: invoices
                .filter(i => i.invoiceStatus === 'Paid')
                .reduce((s, i) => s + (i.totalAmount || 0), 0)
        };

        res.render('admin/invoices', {
            user:        req.user,
            currentPage: 'invoices',
            invoices,
            assignments,
            stats,
            title:       'Client Invoices'
        });
    } catch (err) {
        res.status(500).send('Error loading invoices: ' + err.message);
    }
};

// —— POST /admin/invoices/generate — Create and generate PDF invoice ———————————
exports.generateInvoice = async (req, res) => {
    try {
        const {
            assignment_id, client_name, client_email, event_name,
            event_date, staff_count, services_json, notes
        } = req.body;

        let services = [];
        try { services = JSON.parse(services_json || '[]'); } catch(e) { services = []; }

        // Calculate totals using PricingSettings vatRate if available
        let vatRate = 16;
        try {
            const PricingSettings = require('../models/PricingSettings');
            const pricing = await PricingSettings.findOne().lean();
            if (pricing && pricing.vatRate) vatRate = pricing.vatRate;
        } catch(_) {}

        const subtotal   = services.reduce((sum, s) => sum + (parseFloat(s.unit_price || s.unitPrice) * parseInt(s.quantity || 1)), 0);
        const vatAmount  = Math.round(subtotal * vatRate / 100);
        const totalAmount = subtotal + vatAmount;

        const servicesForDb = services.map(s => ({
            name:       s.description || s.name || 'Service',
            description: s.description || '',
            quantity:   parseInt(s.quantity) || 1,
            unitPrice:  parseFloat(s.unit_price || s.unitPrice) || 0,
            total:      parseFloat(s.unit_price || s.unitPrice) * parseInt(s.quantity || 1)
        }));

        const invoice = await ClientInvoice.create({
            eventId:      assignment_id || null,
            clientName:   client_name,
            clientEmail:  client_email,
            eventName:    event_name,
            eventDate:    event_date ? new Date(event_date) : null,
            staffCount:   parseInt(staff_count) || 0,
            services:     servicesForDb,
            subtotal,
            vatRate,
            vatAmount,
            totalAmount,
            notes,
            invoiceStatus: 'Draft',
            recordedBy:   req.user._id
        });

        // Generate PDF
        try {
            const pdfPath = await generateInvoicePDF(invoice);
            invoice.pdfUrl = pdfPath;
            await invoice.save();
        } catch (pdfErr) {
            console.error('[invoiceController] PDF generation error:', pdfErr);
        }

        await AuditLog.create({
            actionType:  'CREATE_INVOICE',
            targetModel: 'ClientInvoice',
            targetId:    invoice._id,
            performedBy: req.user._id,
            details:     { invoiceNumber: invoice.invoiceNumber, clientName: client_name }
        });

        res.json({ success: true, invoice, invoiceId: invoice._id });

    } catch (err) {
        console.error('[invoiceController] generateInvoice error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Download PDF invoice
// @route   GET /admin/invoices/:id/download
exports.downloadInvoice = async (req, res) => {
    try {
        const invoice = await ClientInvoice.findById(req.params.id);
        if (!invoice) return res.status(404).send('Invoice not found');

        let pdfPath = invoice.pdfUrl;
        const publicPath = path.join(__dirname, '..', 'public');
        const fullPath = pdfPath ? path.join(publicPath, pdfPath) : null;
        
        // If pdfUrl is missing OR file doesn't exist on disk, regenerate it
        if (!pdfPath || !fs.existsSync(fullPath)) {
            console.log(`[invoiceController] PDF missing for ${invoice.invoiceNumber || invoice._id}, regenerating...`);
            const newPdfPath = await generateInvoicePDF(invoice);
            invoice.pdfUrl = newPdfPath;
            await invoice.save();
            pdfPath = newPdfPath;
        }

        const finalPath = path.join(publicPath, pdfPath);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber || 'invoice'}.pdf"`);
        
        const stream = fs.createReadStream(finalPath);
        stream.on('error', (err) => {
            console.error('[invoiceController] stream error:', err);
            if (!res.headersSent) res.status(500).send('Error streaming PDF');
        });
        stream.pipe(res);

    } catch (err) {
        console.error('[invoiceController] downloadInvoice error:', err);
        if (!res.headersSent) res.status(500).send('Download error: ' + err.message);
    }
};

// —— PUT /admin/invoices/:id/status — Update invoice status ———————————————————
exports.updateInvoiceStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const invoice = await ClientInvoice.findByIdAndUpdate(
            req.params.id,
            { invoiceStatus: status, updatedAt: new Date() },
            { new: true }
        ).lean();
        if (!invoice) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, invoice });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// —— POST /admin/invoices/:id/send-email — Email invoice to client —————————————
exports.sendInvoiceEmail = async (req, res) => {
    try {
        const invoice = await ClientInvoice.findById(req.params.id)
            .populate('eventId', 'title date location').lean();
        if (!invoice) return res.status(404).json({ success: false, error: 'Not found' });

        const emailService = require('../services/emailService');

        // Send via dedicated invoice email function if available, else fallback
        if (emailService.sendClientInvoiceEmail && invoice.eventId) {
            await emailService.sendClientInvoiceEmail(
                invoice.clientEmail,
                invoice.clientName,
                invoice,
                invoice.eventId
            );
        } else {
            // Inline HTML fallback
            const htmlContent = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#1a472a;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
                    <h1 style="color:#10b981;margin:0;font-size:28px;">Emerald Pearland Events</h1>
                    <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;">Professional Event Staffing</p>
                </div>
                <div style="background:#f8fafc;padding:32px;border-radius:0 0 12px 12px;">
                    <h2 style="color:#1e293b;">Invoice ${invoice.invoiceNumber}</h2>
                    <p style="color:#475569;">Dear <strong>${invoice.clientName}</strong>,</p>
                    <p style="color:#475569;">Please find your invoice for: <strong>${invoice.eventName}</strong>.</p>
                    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
                        <tr style="background:#e2e8f0;"><th style="padding:10px;text-align:left;">Description</th><th style="text-align:right;padding:10px;">Amount</th></tr>
                        ${(invoice.services || []).map(s => `<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;">${s.name || s.description} × ${s.quantity}</td><td style="text-align:right;padding:10px;border-bottom:1px solid #e2e8f0;">KSh ${(s.total || 0).toLocaleString()}</td></tr>`).join('')}
                        <tr style="background:#f1f5f9;"><td style="padding:10px;"><strong>Subtotal</strong></td><td style="text-align:right;padding:10px;"><strong>KSh ${(invoice.subtotal||0).toLocaleString()}</strong></td></tr>
                        <tr><td style="padding:10px;">VAT (${invoice.vatRate||16}%)</td><td style="text-align:right;padding:10px;">KSh ${(invoice.vatAmount||0).toLocaleString()}</td></tr>
                        <tr style="background:#1a472a;color:white;"><td style="padding:12px;font-size:18px;border-radius:4px 0 0 4px;"><strong>TOTAL</strong></td><td style="text-align:right;padding:12px;font-size:18px;color:#10b981;border-radius:0 4px 4px 0;"><strong>KSh ${(invoice.totalAmount||0).toLocaleString()}</strong></td></tr>
                    </table>
                    <p style="color:#64748b;font-size:13px;">${invoice.notes || ''}</p>
                    <p style="color:#64748b;">Thank you for choosing Emerald Pearland Events!</p>
                </div>
            </div>`;
            await emailService.sendEmail({
                to:          invoice.clientEmail,
                subject:     `Invoice ${invoice.invoiceNumber} — Emerald Pearland Events`,
                htmlContent
            });
        }

        await ClientInvoice.findByIdAndUpdate(req.params.id, {
            invoiceStatus:       'Sent',
            invoiceEmailSentAt:  new Date()
        });

        res.json({ success: true, message: `Invoice sent to ${invoice.clientEmail}` });

    } catch (err) {
        console.error('[invoiceController] sendInvoiceEmail error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// —— DELETE /admin/invoices/:id — Delete invoice ———————————————————————————————
exports.deleteInvoice = async (req, res) => {
    try {
        const invoice = await ClientInvoice.findByIdAndDelete(req.params.id);
        if (!invoice) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// —— Helper: Generate PDF using pdfkit ————————————————————————————————————————
const generateInvoicePDF = async function(invoice) {
    const PDFDocument = require('pdfkit');
    const outputDir = path.join(__dirname, '../public/invoices');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const filename = `${invoice.invoiceNumber || invoice.invoice_number || 'invoice'}.pdf`;
    const filepath = path.join(outputDir, filename);
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);
    try {
        const W = 595, gold = '#C9A84C', darkGreen = '#0D2B1F', midGreen = '#1a472a', lightGrey = '#F7F4EF', slate = '#334155', muted = '#64748b';

        // -- HEADER BAND ------------------------------------------
        doc.fillColor(darkGreen).rect(0, 0, W, 130).fill();
        // Gold left accent bar
        doc.fillColor(gold).rect(0, 0, 6, 130).fill();
        // Logo area circle
        doc.fillColor('#ffffff').circle(70, 65, 38).fill();
        try {
            const https = require('https');
            const logoBuffer = await new Promise((res, rej) => {
                https.get('https://i.ibb.co/xtBMgm1m/logo.png', r => {
                    const c = []; r.on('data', d => c.push(d)); r.on('end', () => res(Buffer.concat(c))); r.on('error', rej);
                }).on('error', rej);
            });
            doc.image(logoBuffer, 35, 30, { width: 70, height: 70 });
        } catch(e) {}
        // Company name
        doc.fillColor(gold).fontSize(20).font('Helvetica-Bold').text('EMERALD PEARLAND', 125, 28);
        doc.fillColor(gold).fontSize(20).font('Helvetica-Bold').text('EVENTS', 125, 50);
        doc.fillColor('#ffffff').fontSize(9).font('Helvetica').text('Professional Event Staffing Services', 125, 74);
        doc.fillColor('#94a3b8').fontSize(8).text('Nairobi, Kenya  ·  emeraldpearlandevents@gmail.com  ·  www.emeraldpearlandevents.com', 125, 88);
        // INVOICE label top right
        doc.fillColor(gold).fontSize(28).font('Helvetica-Bold').text(invoice.etrNumber ? 'RECEIPT' : 'INVOICE', 380, 40, { width: 180, align: 'right' });
        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text(invoice.etrNumber ? 'ELECTRONIC TAX RECEIPT' : 'CLIENT INVOICE', 380, 74, { width: 180, align: 'right' });

        // -- INVOICE META BAR -------------------------------------
        doc.fillColor(lightGrey).rect(0, 130, W, 55).fill();
        doc.fillColor(gold).rect(0, 130, W, 2).fill();
        // Invoice number
        doc.fillColor(muted).fontSize(8).font('Helvetica').text('INVOICE NO.', 30, 143);
        doc.fillColor(darkGreen).fontSize(11).font('Helvetica-Bold').text(decodeHTMLEntities(invoice.invoiceNumber || invoice.invoice_number || 'N/A'), 30, 156);
        // Date
        doc.fillColor(muted).fontSize(8).font('Helvetica').text('DATE ISSUED', 185, 143);
        doc.fillColor(darkGreen).fontSize(11).font('Helvetica-Bold').text(new Date(invoice.createdAt || Date.now()).toLocaleDateString('en-KE', { day:'2-digit', month:'long', year:'numeric' }), 185, 156);
        // Status
        doc.fillColor(muted).fontSize(8).font('Helvetica').text('STATUS', 370, 143);
        const statusColor = invoice.invoiceStatus === 'Paid' ? '#059669' : invoice.invoiceStatus === 'Sent' ? '#2563eb' : '#92701a';
        doc.fillColor(statusColor).fontSize(11).font('Helvetica-Bold').text((invoice.invoiceStatus || invoice.status || 'Draft').toUpperCase(), 370, 156);
        // ETR number if present
        if (invoice.etrNumber) {
            doc.fillColor(muted).fontSize(8).font('Helvetica').text('ETR NO.', 460, 143);
            doc.fillColor('#059669').fontSize(11).font('Helvetica-Bold').text(decodeHTMLEntities(invoice.etrNumber), 460, 156);
        }
        doc.fillColor(gold).rect(0, 183, W, 1).fill();

        // -- BILLED TO + EVENT DETAILS ----------------------------
        let y = 205;
        // Left: Billed To
        doc.fillColor(gold).fontSize(8).font('Helvetica-Bold').text('BILLED TO', 30, y);
        doc.fillColor(darkGreen).rect(30, y + 12, 40, 2).fill();
        doc.fillColor(darkGreen).fontSize(13).font('Helvetica-Bold').text(decodeHTMLEntities(invoice.clientName || invoice.client_name || 'Client'), 30, y + 20, { width: 250 });
        doc.fillColor(slate).fontSize(10).font('Helvetica').text(decodeHTMLEntities(invoice.clientEmail || invoice.client_email || ''), 30, doc.y + 2, { width: 250 });
        if (invoice.clientPhone) doc.text(decodeHTMLEntities(invoice.clientPhone), 30, doc.y + 2);

        // Right: Event Details
        const eventX = 320;
        doc.fillColor(gold).fontSize(8).font('Helvetica-Bold').text('EVENT DETAILS', eventX, y);
        doc.fillColor(darkGreen).rect(eventX, y + 12, 40, 2).fill();
        doc.fillColor(darkGreen).fontSize(13).font('Helvetica-Bold').text(decodeHTMLEntities(invoice.eventName || invoice.event_name || 'Event'), eventX, y + 20, { width: 245 });
        const afterEventNameY = doc.y + 4;
        doc.fillColor(slate).fontSize(10).font('Helvetica');
        if (invoice.eventDate) doc.text(`Date: ${new Date(invoice.eventDate).toLocaleDateString('en-KE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}`, eventX, afterEventNameY);
        if (invoice.eventLocation) doc.text(`Location: ${decodeHTMLEntities(invoice.eventLocation)}`, eventX, doc.y + 2, { width: 245 });
        if (invoice.staffCount) doc.text(`Staff Deployed: ${invoice.staffCount}`, eventX, doc.y + 2);

        // -- SERVICES TABLE ---------------------------------------
        // -- DATA BACKFILL / FALLBACK -----------------------------
        // Populate event if missing and services are empty (for old/broken invoices)
        let services = invoice.services || [];
        if (services.length === 0 && invoice.eventId) {
            try {
                const Assignment = require('../models/Assignment');
                const event = await Assignment.findById(invoice.eventId);
                if (event) {
                    const rate = event.pay_rate || (invoice.subtotal > 0 ? invoice.subtotal : 0);
                    const count = event.usherCount || 1;
                    services = [{
                        name: `Staffing Services - ${event.title}`,
                        description: `Professional event staffing for ${event.title}`,
                        quantity: count,
                        unitPrice: rate / count || rate,
                        total: invoice.subtotal || rate
                    }];
                    // If subtotal is still 0, use the one from the event
                    if ((invoice.subtotal === 0 || !invoice.subtotal) && rate > 0) {
                        invoice.subtotal = rate;
                        invoice.vatAmount = Math.round(rate * 0.16);
                        invoice.totalAmount = invoice.subtotal + invoice.vatAmount;
                    }
                }
            } catch (err) { console.error('PDF Fallback Error:', err); }
        }

        // Table header
        doc.fillColor(darkGreen).rect(30, y, W - 60, 26).fill();
        doc.fillColor(gold).fontSize(9).font('Helvetica-Bold');
        doc.text('DESCRIPTION', 42, y + 8);
        doc.text('QTY', 355, y + 8, { width: 40, align: 'center' });
        doc.text('RATE (KSh)', 400, y + 8, { width: 70, align: 'right' });
        doc.text('TOTAL (KSh)', 475, y + 8, { width: 80, align: 'right' });
        y += 26;

        const services = invoice.services || [];
        services.forEach((svc, i) => {
            const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
            doc.fillColor(bg).rect(30, y, W - 60, 26).fill();
            doc.fillColor('#e2e8f0').rect(30, y + 25, W - 60, 1).fill();
            doc.fillColor(slate).fontSize(10).font('Helvetica');
            doc.text(decodeHTMLEntities(svc.name || svc.description || '—'), 42, y + 7, { width: 300 });
            doc.text(String(svc.quantity || 1), 355, y + 7, { width: 40, align: 'center' });
            doc.text(Number(svc.unitPrice || svc.unit_price || 0).toLocaleString(), 400, y + 7, { width: 70, align: 'right' });
            doc.fillColor(darkGreen).font('Helvetica-Bold').text(Number(svc.total || 0).toLocaleString(), 475, y + 7, { width: 80, align: 'right' });
            y += 26;
        });

        // -- TOTALS BLOCK -----------------------------------------
        y += 16;
        const totalsX = 350;
        // Subtotal row
        doc.fillColor('#f8fafc').rect(totalsX, y, W - totalsX - 30, 24).fill();
        doc.fillColor(muted).fontSize(10).font('Helvetica').text('Subtotal', totalsX + 10, y + 6);
        doc.fillColor(slate).font('Helvetica-Bold').text(`KSh ${Number(invoice.subtotal || 0).toLocaleString()}`, totalsX + 10, y + 6, { width: W - totalsX - 50, align: 'right' });
        y += 24;
        // VAT row
        doc.fillColor('#f1f5f9').rect(totalsX, y, W - totalsX - 30, 24).fill();
        doc.fillColor(muted).fontSize(10).font('Helvetica').text(`VAT (${invoice.vatRate || 16}%)`, totalsX + 10, y + 6);
        doc.fillColor(slate).font('Helvetica-Bold').text(`KSh ${Number(invoice.vatAmount || invoice.tax_amount || 0).toLocaleString()}`, totalsX + 10, y + 6, { width: W - totalsX - 50, align: 'right' });
        y += 24;
        // Total row - gold highlight
        doc.fillColor(darkGreen).rect(totalsX, y, W - totalsX - 30, 32).fill();
        doc.fillColor(gold).rect(totalsX, y, 4, 32).fill();
        doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold').text('TOTAL DUE', totalsX + 14, y + 9);
        doc.fillColor(gold).fontSize(13).font('Helvetica-Bold').text(`KSh ${Number(invoice.totalAmount || invoice.total_amount || 0).toLocaleString()}`, totalsX + 14, y + 9, { width: W - totalsX - 54, align: 'right' });
        y += 46;

        // -- PAYMENT INFO -----------------------------------------
        if (invoice.paymentMethod || invoice.transactionId) {
            doc.fillColor(gold).rect(30, y, W - 60, 1).fill();
            y += 10;
            doc.fillColor(muted).fontSize(8).font('Helvetica-Bold').text('PAYMENT INFORMATION', 30, y);
            y += 14;
            if (invoice.paymentMethod) { doc.fillColor(slate).fontSize(9).font('Helvetica').text(`Method: ${invoice.paymentMethod}`, 30, y); y += 14; }
            if (invoice.transactionId) { doc.fillColor(slate).fontSize(9).text(`Transaction ID: ${invoice.transactionId}`, 30, y); y += 14; }
            if (invoice.paymentStatus) { doc.fillColor(invoice.paymentStatus === 'paid' ? '#059669' : '#92701a').fontSize(9).font('Helvetica-Bold').text(`Payment Status: ${invoice.paymentStatus.toUpperCase()}`, 30, y); y += 14; }
        }

        // -- NOTES ------------------------------------------------
        if (invoice.notes && invoice.notes !== `Auto-generated invoice for ${invoice.eventName}`) {
            y += 10;
            doc.fillColor(gold).rect(30, y, 3, 30).fill();
            doc.fillColor(muted).fontSize(9).font('Helvetica-Oblique').text(decodeHTMLEntities(invoice.notes), 40, y + 5, { width: W - 80 });
            y += 40;
        }

        // -- FOOTER -----------------------------------------------
        const footerY = 780;
        doc.fillColor(darkGreen).rect(0, footerY, W, 62).fill();
        doc.fillColor(gold).rect(0, footerY, W, 2).fill();
        doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold').text('Thank you for choosing Emerald Pearland Events.', 0, footerY + 12, { width: W, align: 'center' });
        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text('Emerald Pearland Events  ·  Nairobi, Kenya  ·  emeraldpearlandevents@gmail.com  ·  +254 722 446 937', 0, footerY + 28, { width: W, align: 'center' });
        doc.fillColor(gold).fontSize(7).text('This is an electronically generated document and is valid without a physical signature.', 0, footerY + 44, { width: W, align: 'center' });

        await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); doc.end(); });
        return path.join('invoices', filename);
    } catch(err) { doc.end(); throw err; }
};

/**
 * Exported PDF generation helper
 */
exports.generateInvoicePDF = generateInvoicePDF;
