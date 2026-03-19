/**
 * Emerald Pearl Events - PDF Report Service
 * Handles generation of PDF receipts and CSV/PDF reports to keep controllers thin.
 */

const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');

exports.generateReceiptPDF = (assignment, payment, staff) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            doc.fontSize(20).fillColor('#1a6b3c').text('EMERALD PEARLAND EVENTS', { align: 'center' });
            doc.fontSize(12).fillColor('#333').text('Payment Receipt', { align: 'center' });
            doc.moveDown();
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();

            doc.fontSize(11).fillColor('#000');
            doc.text(`Receipt Date: ${new Date().toLocaleDateString('en-KE')}`);
            doc.text(`Event: ${assignment.title}`);
            doc.text(`Date: ${new Date(assignment.date).toLocaleDateString('en-KE')}`);
            doc.text(`Location: ${assignment.location}`);
            doc.moveDown();

            doc.text(`Staff Name: ${staff?.name || payment.staff_name}`);
            doc.text(`Phone: ${staff?.phone || payment.phone || 'N/A'}`);
            doc.moveDown();

            doc.fontSize(13).fillColor('#1a6b3c').text(`Amount Paid: KSh ${(payment.amount || 0).toLocaleString()}`);
            doc.fontSize(11).fillColor('#000');
            doc.text(`Payment Status: ${payment.status}`);
            if (payment.sent_at) doc.text(`Sent At: ${new Date(payment.sent_at).toLocaleString('en-KE')}`);
            doc.moveDown();

            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();
            doc.fontSize(10).fillColor('#666').text('This is an official payment receipt from Emerald Pearland Events.', { align: 'center' });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};

exports.generateEventReportCSV = (report) => {
    const safeName = report.event_title.replace(/[^a-zA-Z0-9]/g, '_');
    const dateStr = new Date(report.date).toISOString().split('T')[0];
    
    const rows = report.attendances.map(a => ({
        'Staff': a.staff,
        'Clock In': a.clock_in ? new Date(a.clock_in).toLocaleString() : 'N/A',
        'Clock Out': a.clock_out ? new Date(a.clock_out).toLocaleString() : 'N/A',
        'Hours': a.total_hours || 0,
        'Status': a.status || 'N/A',
        'Event': report.event_title,
        'Date': dateStr,
        'Location': report.location,
        'Pay Rate': report.pay_rate,
        'Payment Status': report.payment_status,
        'Payment Confirmed At': report.payment_confirmed_at ? new Date(report.payment_confirmed_at).toISOString().split('T')[0] : 'N/A',
        'Supervisor': report.supervisor
    }));

    if (rows.length === 0) {
        rows.push({
            'Staff': 'No attendance records',
            'Clock In': '', 'Clock Out': '', 'Hours': '',
            'Status': '', 'Event': report.event_title,
            'Date': dateStr, 'Location': report.location,
            'Pay Rate': report.pay_rate, 'Supervisor': report.supervisor
        });
    }

    const parser = new Parser();
    return parser.parse(rows);
};

exports.generateEventReportPDF = (report, getReadinessLabel) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 40 });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            const dateStr = new Date(report.date).toISOString().split('T')[0];

            doc.rect(0, 0, 595, 80).fill('#0D2B1F');
            doc.fontSize(22).fillColor('#C9A84C').text('EMERALD PEARLAND EVENTS', 40, 20);
            doc.fontSize(11).fillColor('#a0c0a8').text('Event Completion Report', 40, 48);

            doc.moveDown(3);
            doc.fillColor('#333');

            doc.fontSize(14).fillColor('#0D2B1F').text('Event Details', 40);
            doc.moveDown(0.5);
            doc.fontSize(10).fillColor('#333');
            doc.text(`Event: ${report.event_title}`, 40);
            doc.text(`Date: ${dateStr}`);
            doc.text(`Location: ${report.location}`);
            doc.text(`Pay Rate: KSh ${report.pay_rate}`);
            doc.text(`Status: ${report.status}`);
            doc.text(`Payment: ${report.payment_status}`);
            doc.text(`Payment Confirmed At: ${report.payment_confirmed_at ? new Date(report.payment_confirmed_at).toLocaleDateString() : 'N/A'}`);
            doc.text(`Supervisor: ${report.supervisor}`);
            doc.text(`Readiness: ${report.team_readiness}% (${getReadinessLabel(report.team_readiness)})`);
            doc.text(`Staff Assigned/Accepted: ${report.total_assigned} / ${report.total_accepted}`);
            if (report.dress_code) doc.text(`Dress Code: ${report.dress_code}`);

            doc.moveDown(1);

            doc.fontSize(14).fillColor('#0D2B1F').text('Attendance Records', 40);
            doc.moveDown(0.5);
            doc.fontSize(9).fillColor('#333');

            if (report.attendances.length > 0) {
                const tableTop = doc.y;
                doc.rect(40, tableTop, 515, 18).fill('#f0f0f0');
                doc.fillColor('#333');
                doc.text('Staff', 45, tableTop + 4, { width: 120 });
                doc.text('Clock In', 170, tableTop + 4, { width: 100 });
                doc.text('Clock Out', 275, tableTop + 4, { width: 100 });
                doc.text('Hours', 380, tableTop + 4, { width: 60 });
                doc.text('Status', 445, tableTop + 4, { width: 100 });

                let y = tableTop + 22;
                report.attendances.forEach(a => {
                    if (y > 750) { doc.addPage(); y = 40; }
                    doc.text(a.staff, 45, y, { width: 120 });
                    doc.text(a.clock_in ? new Date(a.clock_in).toLocaleTimeString() : 'N/A', 170, y, { width: 100 });
                    doc.text(a.clock_out ? new Date(a.clock_out).toLocaleTimeString() : 'N/A', 275, y, { width: 100 });
                    doc.text(String(a.total_hours || 0), 380, y, { width: 60 });
                    doc.text(a.status || 'N/A', 445, y, { width: 100 });
                    y += 18;
                });
            } else {
                doc.text('No attendance records found.', 40);
            }

            doc.moveDown(2);

            if (report.actions_log.length > 0) {
                doc.fontSize(14).fillColor('#0D2B1F').text('Action Log', 40);
                doc.moveDown(0.5);
                doc.fontSize(9).fillColor('#333');
                report.actions_log.forEach(l => {
                    if (doc.y > 750) doc.addPage();
                    doc.text(`${new Date(l.time).toLocaleString()} - ${l.by}: ${l.action} - ${l.reason || ''}`, 40);
                });
            }

            doc.moveDown(2);
            doc.fontSize(8).fillColor('#999').text('Generated by Emerald Pearland Events Staff System', 40, doc.y, { align: 'center' });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};

exports.generatePaymentsCSV = (assignments, attendancesMap) => {
    const rows = [];
    for (const a of assignments) {
        for (const staff of (a.accepted_staff_ids || [])) {
            const attendance = attendancesMap[`${staff._id}_${a._id}`];
            rows.push({
                'Staff Name': staff.name,
                'Staff Email': staff.email,
                'Assignment': a.title,
                'Date': new Date(a.date).toISOString().split('T')[0],
                'Location': a.location,
                'Pay Rate': a.pay_rate,
                'Payment Status': a.payment_status,
                'Payment Confirmed At': a.payment_confirmed_at ? new Date(a.payment_confirmed_at).toISOString().split('T')[0] : 'N/A',
                'Hours Worked': attendance ? attendance.total_hours : 0,
                'Attendance Status': attendance ? attendance.status : 'No Record'
            });
        }
    }

    if (rows.length === 0) {
        rows.push({ 'Staff Name': 'No records', 'Staff Email': '', 'Assignment': '', 'Date': '', 'Location': '', 'Pay Rate': '', 'Payment Status': '', 'Hours Worked': '', 'Attendance Status': '' });
    }

    const parser = new Parser();
    return parser.parse(rows);
};
