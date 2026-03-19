const path = require('path');
const ejs = require('ejs');
const { chromium } = require('playwright');
const fs = require('fs');

// Assuming Cloudinary might be configured in the project, we can try to require it
let cloudinary;
try {
    cloudinary = require('cloudinary').v2;
} catch (err) {
    cloudinary = null;
}

const ClientETR = require('../models/ClientETR');
// Staff system models
const Assignment = require('../../staff-system/models/Assignment');
const ClientInvoice = require('../../staff-system/models/ClientInvoice');
const EventLedger = require('../../staff-system/models/EventLedger');
const Attendance = require('../../staff-system/models/Attendance');
const ExpenseReceipt = require('../../staff-system/models/ExpenseReceipt');
const StaffPayroll = require('../../staff-system/models/StaffPayroll');
const EventPredictionSnapshot = require('../../staff-system/models/EventPredictionSnapshot');

exports.generateETR = async (eventId, generatedBy) => {
    // 1. Gather Data
    const assignment = await Assignment.findById(eventId).lean();
    if (!assignment) throw new Error('Assignment not found');

    const invoices = await ClientInvoice.find({ eventId }).lean();
    const ledger = await EventLedger.findOne({ event_id: eventId }).lean();
    const attendanceCount = await Attendance.countDocuments({ assignment_id: eventId });
    const expenses = await ExpenseReceipt.find({ event_id: eventId }).lean();
    const payrolls = await StaffPayroll.find({ event_id: eventId }).lean();
    const prediction = await EventPredictionSnapshot.findOne({ event_id: eventId }).sort({ createdAt: -1 }).lean();

    // 2. Compute Financials
    const totalQuoted = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0);
    const outstandingBalance = totalQuoted - totalPaid;
    
    let paymentStatus = 'OUTSTANDING';
    if (totalQuoted > 0) {
        if (totalPaid >= totalQuoted) paymentStatus = 'PAID';
        else if (totalPaid > 0) paymentStatus = 'PARTIAL';
    }

    const staffCost = payrolls.reduce((sum, pr) => sum + (pr.net_pay || 0), 0);
    const emergencyFundsUsed = expenses.filter(e => e.paid_from_emergency_fund).reduce((sum, e) => sum + (e.amount || 0), 0);
    
    let logisticsCost = 0;
    let equipmentCost = 0;
    let otherExpenses = 0;

    expenses.forEach(e => {
        const cat = (e.category || '').toLowerCase();
        if (cat.includes('logistic') || cat.includes('transport')) logisticsCost += e.amount || 0;
        else if (cat.includes('equipment') || cat.includes('gear')) equipmentCost += e.amount || 0;
        else if (!e.paid_from_emergency_fund) otherExpenses += e.amount || 0;
    });

    const totalCost = staffCost + logisticsCost + equipmentCost + otherExpenses + emergencyFundsUsed;

    // Delivery Status
    let deliveryStatus = 'Fully Delivered';
    if (attendanceCount < (assignment.required_staff_count || 1)) {
        deliveryStatus = 'Partially Delivered';
    }

    // Prediction Accuracy
    let predictionAccuracy = '';
    if (prediction && prediction.prediction) {
        const predictedCost = prediction.prediction.estimatedCost || 0;
        if (actualCost > 0 && predictedCost > 0) {
            const diff = Math.abs(totalCost - predictedCost);
            const rawAcc = 100 - ((diff / predictedCost) * 100);
            predictionAccuracy = Math.max(0, rawAcc).toFixed(1) + '%';
        }
    }

    const aiPredictionComparison = prediction && prediction.prediction ? {
        predictedCost: prediction.prediction.estimatedCost || 0,
        actualCost: totalCost,
        predictedStaff: prediction.prediction.predictedStaff || assignment.required_staff_count,
        actualStaff: attendanceCount,
        predictionAccuracy
    } : null;

    // Zero-padded NNNNN
    const totalEtrs = await ClientETR.countDocuments();
    const etrSeq = String(totalEtrs + 1).padStart(5, '0');
    const currentYear = new Date().getFullYear();
    const etrNumber = `ETR-${currentYear}-${etrSeq}`;

    // Get previous version if regenerating
    const prevEtr = await ClientETR.findOne({ event_id: eventId }).sort({ version: -1 });
    const newVersion = prevEtr ? prevEtr.version + 1 : 1;

    // 3. Build Summary Object
    const summary = {
        etrNumber,
        eventName: assignment.title,
        eventDate: assignment.date,
        venue: assignment.location,
        clientName: assignment.client_name,
        eventType: assignment.title, // or derive from booking
        eventDuration: `${assignment.start_time} - ${assignment.end_time}`,
        staffDeployed: attendanceCount,
        financialSummary: {
            totalQuoted,
            totalPaid,
            outstandingBalance,
            paymentStatus
        },
        costBreakdown: {
            staffCost,
            logisticsCost,
            equipmentCost,
            emergencyFundsUsed,
            otherExpenses,
            totalCost
        },
        serviceDelivery: {
            plannedStartTime: assignment.start_time,
            actualStartTime: assignment.start_time, // would need logic if actual clock-in tracked
            plannedEndTime: assignment.end_time,
            actualEndTime: assignment.end_time,
            deliveryStatus
        },
        aiPredictionComparison,
        generatedAt: new Date().toISOString(),
        etrVersion: newVersion
    };

    // 4. Generate PDF
    const ejsPath = path.join(__dirname, '../../views/pdf/etr.ejs');
    let pdfUrl = '';
    let pdfBuffer;
    
    try {
        const html = await ejs.renderFile(ejsPath, { summary });
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle' });
        pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        // 5. Upload to Cloudinary or save locally
        if (cloudinary && process.env.CLOUDINARY_URL) {
            pdfUrl = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream({
                    folder: 'emerald/etr',
                    resource_type: 'document',
                    format: 'pdf',
                    public_id: `${etrNumber}-v${newVersion}`
                }, (error, result) => {
                    if (error) reject(error);
                    else resolve(result.secure_url);
                }).end(pdfBuffer);
            });
        } else {
            console.warn('Cloudinary not configured. Falling back to local storage for ETR.');
            const localPath = path.join(__dirname, '../../public/etr');
            if (!fs.existsSync(localPath)) {
                fs.mkdirSync(localPath, { recursive: true });
            }
            const fileName = `${etrNumber}-v${newVersion}.pdf`;
            fs.writeFileSync(path.join(localPath, fileName), pdfBuffer);
            pdfUrl = `/etr/${fileName}`;
        }
    } catch (pdfErr) {
        console.error('PDF Generation failed:', pdfErr);
        // Do not fail entirely if PDF fails, store document without pdf_url
    }

    // 6. Save ClientETR Record
    const newEtr = await ClientETR.create({
        event_id: eventId,
        client_id: assignment.client_id || null,
        version: newVersion,
        generated_by: generatedBy,
        pdf_url: pdfUrl,
        summary,
        delivery_status: 'pending'
    });

    return newEtr;
};

exports.getLatestETR = async (eventId) => {
    return await ClientETR.findOne({ event_id: eventId }).sort({ version: -1 });
};

exports.resendETR = async (eventId, adminId) => {
    let etr = await this.getLatestETR(eventId);
    if (!etr) {
        etr = await this.generateETR(eventId, adminId);
    }
    
    // Call existing email module
    const emailService = require('../../server/services/emailService');
    const assignment = await Assignment.findById(eventId).select('client_email client_name title').lean();
    
    if (assignment && assignment.client_email) {
        try {
            await emailService.sendEmail({
                to: assignment.client_email,
                subject: `Event Transaction Report - ${assignment.title}`,
                htmlContent: `<p>Dear ${assignment.client_name},</p><p>Please find attached your Event Transaction Report (ETR) for ${assignment.title}.</p><p><a href="${etr.pdf_url}">Download ETR</a></p>`,
                attachments: etr.pdf_url.startsWith('http') ? [{
                    filename: `ETR-${assignment.title}.pdf`,
                    path: etr.pdf_url
                }] : []
            });
            etr.delivery_status = 'sent';
            etr.sent_at = new Date();
            await etr.save();
            
            const ClientEmailLog = require('../models/ClientEmailLog');
            await ClientEmailLog.create({
                event_id: eventId,
                email_type: 'ETR',
                recipient_email: assignment.client_email,
                status: 'sent'
            });
            return true;
        } catch (err) {
            console.error('Email failed:', err);
            etr.delivery_status = 'failed';
            await etr.save();
            return false;
        }
    }
    return false;
};

exports.markETROpened = async (etrId) => {
    return await ClientETR.findByIdAndUpdate(etrId, {
        opened_at: new Date(),
        delivery_status: 'delivered'
    });
};
