const fs = require('fs');
const filepath = 'staff-system/controllers/invoiceController.js';
const content = fs.readFileSync(filepath, 'utf8');

const marker = "// —— Helper: Generate PDF using pdfkit ————————————————————————————————————————";
const idx = content.indexOf(marker);

if (idx !== -1) {
    const headerCode = content.substring(0, idx);
    const newPdfCode = `${marker}
const generateInvoicePDF = async function(invoice) {
    const PDFDocument = require('pdfkit');
    const path = require('path');
    const fs = require('fs');
    const outputDir = path.join(__dirname, '../public/invoices');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    // Properly sanitize invoice number for filename
    let invNum = invoice.invoiceNumber || invoice.invoice_number || 'invoice';
    invNum = invNum.replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = \`\${invNum}.pdf\`;
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
        doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('EMERALD PEARLAND', 160, 30);
        doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('EVENTS', 160, 54);
        doc.fillColor('#d1d5db').fontSize(9).font('Helvetica').text('Professional Event Staffing Services', 160, 84);
        doc.fillColor('#9ca3af').fontSize(8).text('Nairobi, Kenya  ·  emeraldpearlandevents@gmail.com  ·  www.emeraldpearlandevents.com', 160, 98);

        // INVOICE text (Top Right)
        doc.fillColor('#ffffff').fontSize(32).font('Helvetica-Bold').text('INVOICE', 380, 30, { width: 180, align: 'right' });
        doc.fillColor('#9ca3af').fontSize(9).font('Helvetica').text('CLIENT INVOICE', 380, 68, { width: 180, align: 'right' });

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
            doc.fillColor(textMuted).fontSize(10).font('Helvetica').text(\`Date: \${evtDateStr}\`, 300, doc.y + 4, { width: 250 });
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
                else if (invoice.eventName || invoice.event_name) event = await Assignment.findOne({ title: invoice.eventName || invoice.event_name });

                if (event) {
                    const rate = event.pay_rate || (invoice.subtotal > 0 ? invoice.subtotal : 0);
                    const count = event.usherCount || (event.accepted_staff_ids ? event.accepted_staff_ids.length : 0) || 1;
                    services = [{
                        name: \`Staffing Services - \${event.title}\`, quantity: count, unitPrice: rate, total: invoice.subtotal || (rate * count)
                    }];
                    if ((!invoice.subtotal || invoice.subtotal === 0) && rate > 0) {
                        invoice.subtotal = rate * count;
                        invoice.vatAmount = Math.round(invoice.subtotal * 0.16);
                        invoice.totalAmount = invoice.subtotal + invoice.vatAmount;
                    }
                }
            } catch (err) {}
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
        doc.fillColor(textDark).font('Helvetica-Bold').text(\`KSh \${Number(invoice.subtotal || 0).toLocaleString()}\`, totalsX + colWidths[0] + 10, y, { width: colWidths[1]-10, align: 'right' });
        y += 20;

        // VAT row (Light Gray background like screenshot)
        doc.fillColor('#eeeeee').rect(350, y-4, (W-40)-350, 24).fill();
        doc.fillColor(textMuted).fontSize(10).font('Helvetica').text(\`VAT (\${invoice.vatRate || 16}%)\`, totalsX, y+2, { width: colWidths[0], align: 'right' });
        doc.fillColor(textDark).font('Helvetica-Bold').text(\`KSh \${Number(invoice.vatAmount || invoice.tax_amount || 0).toLocaleString()}\`, totalsX + colWidths[0] + 10, y+2, { width: colWidths[1]-10, align: 'right' });
        y += 24;

        // TOTAL DUE row (Dark Green Background)
        doc.fillColor(darkGreen).rect(350, y, (W-40)-350, 28).fill();
        doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold').text('TOTAL DUE', totalsX, y+8, { width: colWidths[0], align: 'right' });
        doc.fillColor(gold).fontSize(13).font('Helvetica-Bold').text(\`KSh \${Number(invoice.totalAmount || invoice.total_amount || 0).toLocaleString()}\`, totalsX + colWidths[0] + 10, y+7, { width: colWidths[1]-10, align: 'right' });
        
        y += 40;

        // -- NOTES ------------------------------------------------
        if (invoice.notes && invoice.notes !== \`Auto-generated invoice for \${invoice.eventName}\`) {
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
`;
    // Write the new file
    fs.writeFileSync(filepath, headerCode + newPdfCode);
    console.log('Successfully updated invoiceController.js with the new PDF layout.');
} else {
    console.log('Marker not found, could not replace.');
}
