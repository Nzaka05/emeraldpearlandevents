/**
const respond = require('../../utils/respond');
 * invoiceController.js — Phase 6: Client Invoice System
 * Generates PDF invoices, sends via email, manages invoice records
 * FIXED: All field names now match ClientInvoice schema (camelCase)
 */
const ClientInvoice = require('../models/ClientInvoice');
const Assignment    = require('../models/Assignment');
const AuditLog      = require('../models/AuditLog');
const path          = require('path');
const fs            = require('fs');
const emailService  = require('../services/emailService');
const { notificationQueue } = require('../../config/queues');
const queueMode = (process.env.QUEUE_MODE || 'inline').toLowerCase();

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

        const assignments = await Assignment.find()
            .select('title date client_name client_email pay_rate accepted_staff_ids usherCount status')
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
        try { 
            const cleanJson = decodeHTMLEntities(services_json || '[]');
            services = JSON.parse(cleanJson); 
        } catch(e) { services = []; }

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

        respond(res, 200, { success: true, invoice, invoiceId: invoice._id });

    } catch (err) {
        console.error('[invoiceController] generateInvoice error:', err);
        respond(res, 500, { success: false, error: err.message });
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
        if (!invoice) return respond(res, 404, { success: false, error: 'Not found' });
        respond(res, 200, { success: true, invoice });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message });
    }
};

// —— POST /admin/invoices/:id/send-email — Email invoice to client —————————————
exports.sendInvoiceEmail = async (req, res) => {
    try {
        const invoice = await ClientInvoice.findById(req.params.id)
            .populate('eventId', 'title date location').lean();
        if (!invoice) return respond(res, 404, { success: false, error: 'Not found' });

        // Dispatch via queue in async mode, or send inline when worker is deferred.
        if (invoice.eventId) {
            if (queueMode === 'async') {
                await notificationQueue.add('email', {
                    type: 'client.invoice',
                    payload: {
                        clientEmail: invoice.clientEmail,
                        clientName: invoice.clientName,
                        invoice,
                        assignment: invoice.eventId
                    }
                });
            } else {
                await emailService.sendClientInvoiceEmail(
                    invoice.clientEmail,
                    invoice.clientName,
                    invoice,
                    invoice.eventId
                );
            }
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
            if (queueMode === 'async') {
                await notificationQueue.add('email', {
                    type: 'generic.email',
                    payload: {
                        to: [{ email: invoice.clientEmail, name: invoice.clientName }],
                        subject: `Invoice ${invoice.invoiceNumber} — Emerald Pearland Events`,
                        htmlContent,
                        templateTitle: 'CLIENT INVOICE'
                    }
                });
            } else {
                await emailService.sendEmail({
                    to: [{ email: invoice.clientEmail, name: invoice.clientName }],
                    subject: `Invoice ${invoice.invoiceNumber} — Emerald Pearland Events`,
                    htmlContent
                });
            }
        }

        await ClientInvoice.findByIdAndUpdate(req.params.id, {
            invoiceStatus:       'Sent',
            invoiceEmailSentAt:  new Date()
        });

        respond(res, 200, { success: true, message: `Invoice sent to ${invoice.clientEmail}` });

    } catch (err) {
        console.error('[invoiceController] sendInvoiceEmail error:', err);
        respond(res, 500, { success: false, error: err.message });
    }
};

// —— DELETE /admin/invoices/:id — Delete invoice ———————————————————————————————
exports.deleteInvoice = async (req, res) => {
    try {
        const invoice = await ClientInvoice.findByIdAndDelete(req.params.id);
        if (!invoice) return respond(res, 404, { success: false, error: 'Not found' });
        respond(res, 200, { success: true });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message });
    }
};

// —— PUT /admin/invoices/:id — Update invoice fully ————————————————————————————
exports.updateInvoice = async (req, res) => {
    try {
        const invoice = await ClientInvoice.findById(req.params.id);
        if (!invoice) return respond(res, 404, { success: false, error: 'Not found' });

        const {
            client_name, client_email, event_name,
            event_date, staff_count, services_json, notes, assignment_id
        } = req.body;

        let services = [];
        try { 
            const cleanJson = decodeHTMLEntities(services_json || '[]');
            services = JSON.parse(cleanJson); 
        } catch(e) { services = []; }

        let vatRate = invoice.vatRate || 16;
        try {
            const PricingSettings = require('../models/PricingSettings');
            const pricing = await PricingSettings.findOne().lean();
            if (pricing && pricing.vatRate) vatRate = pricing.vatRate;
        } catch(_) {}

        const subtotal   = services.reduce((sum, s) => sum + (parseFloat(s.unit_price || s.unitPrice || 0) * parseInt(s.quantity || 1)), 0);
        const vatAmount  = Math.round(subtotal * vatRate / 100);
        const totalAmount = subtotal + vatAmount;

        const servicesForDb = services.map(s => ({
            name:       s.description || s.name || 'Service',
            description: s.description || s.name || '',
            quantity:   parseInt(s.quantity) || 1,
            unitPrice:  parseFloat(s.unit_price || s.unitPrice) || 0,
            total:      parseFloat(s.unit_price || s.unitPrice || 0) * parseInt(s.quantity || 1)
        }));

        if (client_name) invoice.clientName = client_name;
        if (client_email) invoice.clientEmail = client_email;
        if (event_name) invoice.eventName = event_name;
        if (event_date) invoice.eventDate = new Date(event_date);
        if (staff_count) invoice.staffCount = parseInt(staff_count) || 0;
        if (assignment_id) invoice.eventId = assignment_id;
        if (notes !== undefined) invoice.notes = notes;

        // If the user accidentally deleted all lines, or if the form filtered them out,
        // we forcefully add back one line so the invoice doesn't become empty.
        if (servicesForDb.length === 0) {
            servicesForDb.push({
                name: `Staffing Services - ${event_name || invoice.eventName || 'Event'}`,
                description: '',
                quantity: parseInt(staff_count) || 1,
                unitPrice: subtotal || invoice.subtotal || 0,
                total: subtotal || invoice.subtotal || 0
            });
        }

        invoice.services = servicesForDb;
        invoice.markModified('services');
        invoice.subtotal = subtotal;
        invoice.vatRate = vatRate;
        invoice.vatAmount = vatAmount;
        invoice.totalAmount = totalAmount;

        await invoice.save();

        // Regenerate PDF
        try {
            const pdfPath = await generateInvoicePDF(invoice);
            invoice.pdfUrl = pdfPath;
            await invoice.save();
        } catch (pdfErr) {
            console.error('[invoiceController] PDF regen error:', pdfErr);
        }

        await AuditLog.create({
            actionType:  'UPDATE_INVOICE',
            targetModel: 'ClientInvoice',
            targetId:    invoice._id,
            performedBy: req.user._id,
            details:     { invoiceNumber: invoice.invoiceNumber, totalAmount }
        });

        respond(res, 200, { success: true, invoice: invoice.toObject() });

    } catch (err) {
        console.error('[invoiceController] updateInvoice error:', err);
        respond(res, 500, { success: false, error: err.message });
    }
};

// —— Helper: Generate PDF using pdfkit ————————————————————————————————————————
const generateInvoicePDF = async function(invoice) {
    const PDFDocument = require('pdfkit');
    const path = require('path');
    const fs = require('fs');
    const outputDir = path.join(__dirname, '../public/invoices');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    // Properly sanitize invoice number for filename
    let invNum = invoice.invoiceNumber || invoice.invoice_number || 'invoice';
    invNum = invNum.replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `${invNum}.pdf`;
    const filepath = path.join(outputDir, filename);
    
    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);
    
    try {
        const W = 595, gold = '#C9A84C', darkGreen = '#1e3b2b', textDark = '#111827', textMuted = '#6b7280', beigeRow = '#FAF8F5';

        // Helper
        const decodeHTMLEntities = (str) => {
            if (!str) return '';
            return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                      .replace(/&#039;/g, "'").replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&#x27;/g, "'");
        };

        // -- HEADER BAND ------------------------------------------
        // Dark green banner
        doc.fillColor(darkGreen).rect(0, 0, W, 130).fill();
        // White logo box on the left (matches screenshot exactly)
        doc.fillColor('#ffffff').rect(0, 0, 140, 130).fill();
        
        // Logo image
        try {
            const https = require('https');
            const logoBuffer = await new Promise((res, rej) => {
                https.get('https://i.ibb.co/xtBMgm1m/logo.png', r => {
                    const c = []; r.on('data', d => c.push(d)); r.on('end', () => res(Buffer.concat(c))); r.on('error', rej);
                }).on('error', rej);
            });
            // Center the logo in the 140x130 white box
            doc.image(logoBuffer, 35, 30, { width: 70, height: 70 });
        } catch(e) {
            // Draw circle if image fails to load
            doc.fillColor(darkGreen).circle(70, 65, 35).fill();
        }

        // Company Details (Center-Left)
        doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold').text('EMERALD PEARLAND', 160, 26);
        doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold').text('EVENTS', 160, 56);
        doc.fillColor('#d1d5db').fontSize(9).font('Helvetica').text('Professional Event Staffing Services', 160, 92);
        doc.fillColor('#9ca3af').fontSize(8).text('Nairobi, Kenya  ·  emeraldpearlandevents@gmail.com  ·  www.emeraldpearlandevents.com', 160, 106);

        // INVOICE text (Top Right)
        doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold').text('INVOICE', 380, 26, { width: 180, align: 'right' });
        doc.fillColor('#9ca3af').fontSize(9).font('Helvetica').text('CLIENT INVOICE', 380, 58, { width: 180, align: 'right' });

        // -- INVOICE META VALUES (Below Header) -------------------
        doc.fillColor(textMuted).fontSize(8).font('Helvetica-Bold').text('INVOICE NO.', 40, 150);
        doc.fillColor(darkGreen).fontSize(11).font('Helvetica-Bold').text(decodeHTMLEntities(invoice.invoiceNumber || invoice.invoice_number || 'N/A'), 40, 164);
        
        doc.fillColor(textMuted).fontSize(8).font('Helvetica-Bold').text('DATE ISSUED', 220, 150);
        doc.fillColor(darkGreen).fontSize(11).font('Helvetica-Bold').text(new Date(invoice.createdAt || Date.now()).toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' }), 220, 164);
        
        doc.fillColor(textMuted).fontSize(8).font('Helvetica-Bold').text('STATUS', 400, 150);
        const st = (invoice.invoiceStatus || invoice.status || 'DRAFT').toUpperCase();
        doc.fillColor(st === 'PAID' ? '#059669' : gold).fontSize(11).font('Helvetica-Bold').text(st, 400, 164);
        
        // Thin separator line
        doc.fillColor('#e5e7eb').rect(40, 190, W - 80, 1).fill();

        // -- BILLED TO & EVENT DETAILS ----------------------------
        let y = 220;
        doc.fillColor(gold).fontSize(9).font('Helvetica-Bold').text('BILLED TO', 40, y);
        doc.fillColor(darkGreen).fontSize(14).font('Helvetica-Bold').text(decodeHTMLEntities(invoice.clientName || invoice.client_name || 'Client'), 40, y + 16, { width: 250 });
        doc.fillColor(textMuted).fontSize(10).font('Helvetica').text(decodeHTMLEntities(invoice.clientEmail || invoice.client_email || ''), 40, doc.y + 4, { width: 250 });
        const leftBottom = doc.y;

        doc.fillColor(gold).fontSize(9).font('Helvetica-Bold').text('EVENT DETAILS', 300, y);
        doc.fillColor(darkGreen).fontSize(14).font('Helvetica-Bold').text(decodeHTMLEntities(invoice.eventName || invoice.event_name || 'Event Name'), 300, y + 16, { width: 250 });
        const evtDateStr = invoice.eventDate ? new Date(invoice.eventDate).toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }) : '';
        if (evtDateStr) {
            doc.fillColor(textMuted).fontSize(10).font('Helvetica').text(`Date: ${evtDateStr}`, 300, doc.y + 4, { width: 250 });
        }
        const rightBottom = doc.y;

        y = Math.max(leftBottom, rightBottom) + 20;

        // -- DATA BACKFILL ----------------------------------------
        let services = invoice.services || [];
        if (services.length === 0) {
            try {
                const Assignment = require('../models/Assignment');
                let event = null;
                if (invoice.eventId) event = await Assignment.findById(invoice.eventId);
                else if (invoice.eventName || invoice.event_name) {
                    // Use a looser regex match if exact match fails
                    event = await Assignment.findOne({ title: new RegExp((invoice.eventName || invoice.event_name).replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&').substring(0, 15), 'i') });
                }

                const rate = (event && event.pay_rate) || (invoice.subtotal > 0 ? invoice.subtotal : 0);
                const count = (event && (event.usherCount || (event.accepted_staff_ids ? event.accepted_staff_ids.length : 0))) || invoice.staffCount || 1;
                
                services = [{
                    name: `Staffing Services - ${event ? event.title : decodeHTMLEntities(invoice.eventName || invoice.event_name || 'Event')}`, 
                    quantity: count, 
                    unitPrice: rate, 
                    total: invoice.subtotal || (rate * count)
                }];
                if ((!invoice.subtotal || invoice.subtotal === 0) && rate > 0) {
                    invoice.subtotal = rate * count;
                    invoice.vatAmount = Math.round(invoice.subtotal * invoice.vatRate / 100);
                    invoice.totalAmount = invoice.subtotal + invoice.vatAmount;
                }
            } catch (err) {}
            
            // Bulletproof guarantee: if try-catch completely failed or still left it empty
            if (services.length === 0) {
                 services = [{
                    name: `Staffing Services - ${decodeHTMLEntities(invoice.eventName || invoice.event_name || 'Event')}`, 
                    quantity: invoice.staffCount || 1, 
                    unitPrice: invoice.subtotal || 0, 
                    total: invoice.subtotal || 0
                }];
            }
        }

        // -- SERVICES TABLE ---------------------------------------
        // Table Header (Solid Gold background)
        doc.fillColor(gold).rect(40, y, W - 80, 24).fill();
        doc.fillColor(darkGreen).fontSize(9).font('Helvetica-Bold');
        doc.text('DESCRIPTION', 50, y + 7);
        doc.text('QTY', 370, y + 7, { width: 40, align: 'center' });
        doc.text('RATE (KSh)', 420, y + 7, { width: 60, align: 'right' });
        doc.text('TOTAL (KSh)', 490, y + 7, { width: 60, align: 'right' });
        y += 24;

        // Table Rows (Alternating white/beige)
        services.forEach((svc, i) => {
            const bg = i % 2 === 0 ? '#ffffff' : beigeRow;
            doc.fillColor(bg).rect(40, y, W - 80, 26).fill();
            doc.fillColor(darkGreen).fontSize(9).font('Helvetica');
            doc.text(decodeHTMLEntities(svc.name || svc.description || '—'), 50, y + 8, { width: 310 });
            doc.text(String(svc.quantity || 1), 370, y + 8, { width: 40, align: 'center' });
            doc.text(Number(svc.unitPrice || svc.unit_price || 0).toLocaleString(), 420, y + 8, { width: 60, align: 'right' });
            doc.text(Number(svc.total || 0).toLocaleString(), 490, y + 8, { width: 60, align: 'right' });
            y += 26;
        });

        // Add a thin line under the table
        doc.fillColor('#e5e7eb').rect(40, y + 10, W - 80, 1).fill();
        
        y += 30;

        // -- TOTALS BLOCK -----------------------------------------
        const totalsX = 350;
        const colWidths = [100, 105];

        // Subtotal row (White Background)
        doc.fillColor(textMuted).fontSize(10).font('Helvetica').text('Subtotal', totalsX, y, { width: colWidths[0], align: 'right' });
        doc.fillColor(textDark).font('Helvetica-Bold').text(`KSh ${Number(invoice.subtotal || 0).toLocaleString()}`, totalsX + colWidths[0] + 10, y, { width: colWidths[1]-10, align: 'right' });
        y += 20;

        // VAT row (Light Gray background like screenshot)
        doc.fillColor('#eeeeee').rect(350, y-4, (W-40)-350, 24).fill();
        doc.fillColor(textMuted).fontSize(10).font('Helvetica').text(`VAT (${invoice.vatRate || 16}%)`, totalsX, y+2, { width: colWidths[0], align: 'right' });
        doc.fillColor(textDark).font('Helvetica-Bold').text(`KSh ${Number(invoice.vatAmount || invoice.tax_amount || 0).toLocaleString()}`, totalsX + colWidths[0] + 10, y+2, { width: colWidths[1]-10, align: 'right' });
        y += 24;

        // TOTAL DUE row (Dark Green Background)
        doc.fillColor(darkGreen).rect(350, y, (W-40)-350, 28).fill();
        doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold').text('TOTAL DUE', totalsX, y+8, { width: colWidths[0], align: 'right' });
        doc.fillColor(gold).fontSize(13).font('Helvetica-Bold').text(`KSh ${Number(invoice.totalAmount || invoice.total_amount || 0).toLocaleString()}`, totalsX + colWidths[0] + 10, y+7, { width: colWidths[1]-10, align: 'right' });
        
        y += 40;

        // -- NOTES ------------------------------------------------
        if (invoice.notes && invoice.notes !== `Auto-generated invoice for ${invoice.eventName}`) {
            y += 20;
            doc.fillColor(textMuted).fontSize(9).font('Helvetica-Oblique').text(decodeHTMLEntities(invoice.notes), 40, y, { width: W - 80 });
        }

        // -- FOOTER -----------------------------------------------
        const footerY = 770;
        doc.fillColor(darkGreen).rect(0, footerY, W, 72).fill();
        doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('Thank you for choosing Emerald Pearland Events.', 0, footerY + 18, { width: W, align: 'center' });
        doc.fillColor('#d1d5db').fontSize(8).font('Helvetica').text('Emerald Pearland Events  ·  Nairobi, Kenya  ·  emeraldpearlandevents@gmail.com  ·  +254 722 446 937', 0, footerY + 36, { width: W, align: 'center' });
        doc.fillColor(gold).fontSize(7).font('Helvetica-Oblique').text('This is an electronically generated document and is valid without a physical signature.', 0, footerY + 52, { width: W, align: 'center' });

        await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); doc.end(); });
        return path.join('invoices', filename);
    } catch(err) { doc.end(); throw err; }
};

exports.generateInvoicePDF = generateInvoicePDF;
