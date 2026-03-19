const Brevo = require('sib-api-v3-sdk');
const nodemailer = require('nodemailer');
const { logoBase64 } = require('./emailAssets');
let apiInstance = null;
let nodemailerTransport = null;
const initializeEmailService = () => {
    try {
        const apiKey = process.env.BREVO_API_KEY;
        if (apiKey) {
            const defaultClient = Brevo.ApiClient.instance;
            const apiKeyAuth = defaultClient.authentications['api-key'];
            apiKeyAuth.apiKey = apiKey;
            apiInstance = new Brevo.TransactionalEmailsApi();
            console.log('Staff System: Brevo email service initialized');
        } else {
            console.warn('Staff System: BREVO_API_KEY not found, trying Gmail SMTP fallback...');
        }
        if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
            nodemailerTransport = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
            });
            console.log('Staff System: Gmail SMTP fallback configured');
        }
        if (!apiInstance && !nodemailerTransport) {
            console.warn('Staff System: No email service configured.');
        }
    } catch (error) {
        console.error('Staff System: Error initializing email service:', error.message);
    }
};
initializeEmailService();

const sendEmail = async ({ to, subject, htmlContent, attachments }) => {
    if (apiInstance) {
        try {
            const sendSmtpEmail = new Brevo.SendSmtpEmail();
            sendSmtpEmail.sender = { name: 'Emerald Pearland Events', email: 'emeraldpearlandevents@gmail.com' };
            sendSmtpEmail.to = Array.isArray(to) ? to : [to];
            sendSmtpEmail.subject = subject;
            sendSmtpEmail.htmlContent = htmlContent;
            if (attachments && attachments.length > 0) {
                sendSmtpEmail.attachment = attachments.map(a => ({ name: a.name, content: a.content }));
            }
            await apiInstance.sendTransacEmail(sendSmtpEmail);
            return;
        } catch (err) {
            console.error('Staff System: Brevo error:', err.message);
        }
    }
    if (nodemailerTransport) {
        try {
            const mailOptions = {
                from: '"Emerald Pearland Events" <emeraldpearlandevents@gmail.com>',
                to: Array.isArray(to) ? to.map(r => r.email).join(',') : to.email,
                subject, html: htmlContent
            };
            if (attachments && attachments.length > 0) {
                mailOptions.attachments = attachments.map(a => ({ filename: a.name, content: Buffer.from(a.content, 'base64'), encoding: 'base64' }));
            }
            await nodemailerTransport.sendMail(mailOptions);
            return;
        } catch (err) {
            console.error('Staff System: Gmail error:', err.message);
        }
    }
    console.log('[EMAIL FALLBACK]', subject, '->', Array.isArray(to) ? to.map(r=>r.email).join(',') : to.email);
};

const brandedWrapper = (title, bodyHtml) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
<tr><td style="background:#0D2B1F;padding:32px 40px;text-align:center;">
  <div style="display:inline-block;background:#fff;border-radius:50%;width:70px;height:70px;line-height:70px;margin-bottom:12px;">
    <img src="https://i.ibb.co/xtBMgm1m/logo.png" width="60" height="60" style="border-radius:50%;vertical-align:middle;" onerror="this.style.display=''none''">
  </div>
  <h1 style="color:#C9A84C;margin:0;font-size:26px;letter-spacing:2px;font-family:Georgia,serif;">EMERALD PEARLAND EVENTS</h1>
  <p style="color:rgba(255,255,255,0.6);margin:6px 0 0;font-size:12px;letter-spacing:1px;">${title}</p>
</td></tr>
<tr><td style="padding:0;">${bodyHtml}</td></tr>
<tr><td style="background:#0D2B1F;padding:24px 40px;text-align:center;">
  <p style="color:rgba(255,255,255,0.5);font-size:11px;margin:0;">Emerald Pearland Events &nbsp;·&nbsp; Nairobi, Kenya &nbsp;·&nbsp; emeraldpearlandevents@gmail.com</p>
  <p style="color:rgba(255,255,255,0.3);font-size:10px;margin:8px 0 0;">© ${new Date().getFullYear()} Emerald Pearland Events. All rights reserved.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
const sendStaffWelcomeEmail = async (staff, plainPassword, loginUrl) => {
    try {
        const body = `<div style="padding:32px 40px;">
            <h2 style="color:#0D2B1F;font-family:Georgia,serif;">Welcome to Emerald Pearland Events!</h2>
            <p style="color:#334155;">Hello <strong>${staff.name}</strong>, your staff account has been created.</p>
            <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #C9A84C;">
                <p style="margin:0 0 8px;color:#64748b;font-size:13px;">YOUR LOGIN CREDENTIALS</p>
                <p style="margin:4px 0;color:#1e293b;"><strong>Email:</strong> ${staff.email}</p>
                <p style="margin:4px 0;color:#1e293b;"><strong>Password:</strong> ${plainPassword}</p>
                <p style="margin:4px 0;color:#1e293b;"><strong>Role:</strong> ${staff.role}</p>
            </div>
            <p style="color:#334155;">Please log in and change your password immediately.</p>
            <a href="${loginUrl||'http://localhost:3001'}" style="display:inline-block;background:#C9A84C;color:#0D2B1F;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:12px;">Login Now</a>
        </div>`;
        await sendEmail({ to:[{email:staff.email,name:staff.name}], subject:'Welcome to Emerald Pearland Events — Your Account Details', htmlContent:brandedWrapper('STAFF WELCOME',body) });
    } catch(err) { console.error('Welcome email error:',err.message); }
};

const sendPasswordResetEmail = async (staff, resetUrl) => {
    try {
        const body = `<div style="padding:32px 40px;">
            <h2 style="color:#0D2B1F;font-family:Georgia,serif;">Password Reset Request</h2>
            <p style="color:#334155;">Hello <strong>${staff.name}</strong>, click the button below to reset your password.</p>
            <a href="${resetUrl}" style="display:inline-block;background:#C9A84C;color:#0D2B1F;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:12px;">Reset Password</a>
            <p style="color:#94a3b8;font-size:12px;margin-top:20px;">This link expires in 1 hour. If you did not request this, ignore this email.</p>
        </div>`;
        await sendEmail({ to:[{email:staff.email,name:staff.name}], subject:'Password Reset — Emerald Pearland Events', htmlContent:brandedWrapper('PASSWORD RESET',body) });
    } catch(err) { console.error('Password reset email error:',err.message); }
};

const sendAdminPasswordResetNotification = async (staff, plainPassword) => {
    try {
        const body = `<div style="padding:32px 40px;">
            <h2 style="color:#0D2B1F;font-family:Georgia,serif;">Your Password Has Been Reset</h2>
            <p style="color:#334155;">Hello <strong>${staff.name}</strong>, an admin has reset your password.</p>
            <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #C9A84C;">
                <p style="margin:4px 0;color:#1e293b;"><strong>New Password:</strong> ${plainPassword}</p>
            </div>
            <p style="color:#334155;">Please log in and change your password immediately.</p>
        </div>`;
        await sendEmail({ to:[{email:staff.email,name:staff.name}], subject:'Password Reset Notification — Emerald Pearland Events', htmlContent:brandedWrapper('PASSWORD RESET',body) });
    } catch(err) { console.error('Admin password reset notification error:',err.message); }
};

const sendPaymentSentNotification = async (staff, assignment) => {
    try {
        const body = `<div style="padding:32px 40px;">
            <h2 style="color:#0D2B1F;font-family:Georgia,serif;">Payment Initiated</h2>
            <p style="color:#334155;">Hello <strong>${staff.name}</strong>, your payment for <strong>${assignment.title}</strong> has been initiated.</p>
            <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #C9A84C;">
                <p style="margin:4px 0;color:#1e293b;"><strong>Amount:</strong> KSh ${(assignment.pay_rate||0).toLocaleString()}</p>
                <p style="margin:4px 0;color:#1e293b;"><strong>Event:</strong> ${assignment.title}</p>
            </div>
            <p style="color:#334155;">Please check your M-Pesa for confirmation.</p>
        </div>`;
        await sendEmail({ to:[{email:staff.email,name:staff.name}], subject:`Payment Initiated — ${assignment.title} | Emerald Pearland Events`, htmlContent:brandedWrapper('PAYMENT NOTIFICATION',body) });
    } catch(err) { console.error('Payment sent notification error:',err.message); }
};

const sendPaymentReceiptEmail = async (staff, assignment, staffPayment, transactionId) => {
    try {
        const body = `<div style="padding:32px 40px;">
            <h2 style="color:#0D2B1F;font-family:Georgia,serif;">Payment Receipt</h2>
            <p style="color:#334155;">Hello <strong>${staff.name}</strong>, here is your payment receipt.</p>
            <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #059669;">
                <p style="margin:4px 0;color:#1e293b;"><strong>Event:</strong> ${assignment.title}</p>
                <p style="margin:4px 0;color:#1e293b;"><strong>Amount:</strong> KSh ${(staffPayment.amount||0).toLocaleString()}</p>
                <p style="margin:4px 0;color:#1e293b;"><strong>Transaction ID:</strong> ${transactionId||'N/A'}</p>
                <p style="margin:4px 0;color:#1e293b;"><strong>Status:</strong> Received</p>
            </div>
        </div>`;
        await sendEmail({ to:[{email:staff.email,name:staff.name}], subject:`Payment Receipt — ${assignment.title} | Emerald Pearland Events`, htmlContent:brandedWrapper('PAYMENT RECEIPT',body) });
    } catch(err) { console.error('Payment receipt email error:',err.message); }
};

const sendAssignmentNotification = async (staff, assignment) => {
    try {
        const body = `<div style="padding:32px 40px;">
            <h2 style="color:#0D2B1F;font-family:Georgia,serif;">New Assignment</h2>
            <p style="color:#334155;">Hello <strong>${staff.name}</strong>, you have been assigned to a new event.</p>
            <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #C9A84C;">
                <p style="margin:4px 0;color:#1e293b;"><strong>Event:</strong> ${assignment.title}</p>
                <p style="margin:4px 0;color:#1e293b;"><strong>Date:</strong> ${assignment.date?new Date(assignment.date).toLocaleDateString('en-KE'):''}</p>
                <p style="margin:4px 0;color:#1e293b;"><strong>Location:</strong> ${assignment.location||'TBD'}</p>
                <p style="margin:4px 0;color:#1e293b;"><strong>Pay Rate:</strong> KSh ${(assignment.pay_rate||0).toLocaleString()}</p>
                <p style="margin:4px 0;color:#1e293b;"><strong>Dress Code:</strong> ${assignment.dress_code||'TBD'}</p>
            </div>
            <p style="color:#334155;">Please log in to accept or decline this assignment.</p>
        </div>`;
        await sendEmail({ to:[{email:staff.email,name:staff.name}], subject:`New Assignment: ${assignment.title} | Emerald Pearland Events`, htmlContent:brandedWrapper('NEW ASSIGNMENT',body) });
    } catch(err) { console.error('Assignment notification error:',err.message); }
};

const sendAssignmentUpdateNotification = async (staff, assignment) => {
    try {
        const body = `<div style="padding:32px 40px;">
            <h2 style="color:#0D2B1F;font-family:Georgia,serif;">Assignment Updated</h2>
            <p style="color:#334155;">Hello <strong>${staff.name}</strong>, the details for <strong>${assignment.title}</strong> have been updated.</p>
            <div style="background:#f8fafc;border-radius:8px;padding:20px;margin:20px 0;border-left:4px solid #C9A84C;">
                <p style="margin:4px 0;color:#1e293b;"><strong>Event:</strong> ${assignment.title}</p>
                <p style="margin:4px 0;color:#1e293b;"><strong>Date:</strong> ${assignment.date?new Date(assignment.date).toLocaleDateString('en-KE'):''}</p>
                <p style="margin:4px 0;color:#1e293b;"><strong>Location:</strong> ${assignment.location||'TBD'}</p>
            </div>
            <p style="color:#334155;">Please log in to review the changes.</p>
        </div>`;
        await sendEmail({ to:[{email:staff.email,name:staff.name}], subject:`Assignment Updated: ${assignment.title} | Emerald Pearland Events`, htmlContent:brandedWrapper('ASSIGNMENT UPDATE',body) });
    } catch(err) { console.error('Assignment update notification error:',err.message); }
};
const sendClientThankYouEmail = async (clientEmail, clientName, assignment) => {
    try {
        const staffCount = assignment.accepted_staff_ids?.length || assignment.staffCount || 0;
        const body = `<div style="padding:32px 40px;">
            <h2 style="color:#0D2B1F;font-family:Georgia,serif;margin-bottom:8px;">Thank You, ${clientName}!</h2>
            <p style="color:#334155;line-height:1.7;margin-bottom:20px;">
                We are delighted to have been part of your special occasion —
                <strong>${assignment.title}</strong> on <strong>${assignment.date?new Date(assignment.date).toLocaleDateString('en-KE',{weekday:'long',year:'numeric',month:'long',day:'numeric'}):''}</strong>.
            </p>
            <p style="color:#334155;line-height:1.7;">Our team worked hard to ensure everything ran smoothly, and we hope your experience exceeded expectations.</p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:24px 0;">
                <h3 style="color:#065f46;margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Event Summary</h3>
                <p style="margin:4px 0;color:#334155;">📅 ${assignment.date?new Date(assignment.date).toLocaleDateString('en-KE'):''}</p>
                <p style="margin:4px 0;color:#334155;">📍 ${assignment.location||'Your venue'}</p>
                <p style="margin:4px 0;color:#334155;">👥 ${staffCount} staff deployed</p>
            </div>
            <p style="color:#334155;line-height:1.7;">You will shortly receive your official invoice. We would love to serve you again!</p>
            <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;">
                <p style="color:#64748b;font-size:13px;">With warm regards,<br><strong style="color:#0D2B1F;">The Emerald Pearland Events Team</strong></p>
            </div>
        </div>`;
        await sendEmail({ to:[{email:clientEmail,name:clientName}], subject:`Thank You for Choosing Emerald Pearland Events — ${assignment.title}`, htmlContent:brandedWrapper('THANK YOU',body) });
        console.log('Thank you email sent to client:', clientEmail);
    } catch(err) { console.error('Client thank you email error:',err.message); }
};

const sendClientSurveyEmail = async (clientEmail, clientName, assignment, surveyToken) => {
    try {
        const surveyUrl = `${process.env.MAIN_PORTAL_URL||'http://localhost:3000'}/survey/${surveyToken}`;
        const body = `<div style="padding:32px 40px;">
            <h2 style="color:#0D2B1F;font-family:Georgia,serif;">We Value Your Feedback</h2>
            <p style="color:#334155;line-height:1.7;">Dear <strong>${clientName}</strong>, thank you for choosing Emerald Pearland Events for <strong>${assignment.title}</strong>.</p>
            <p style="color:#334155;line-height:1.7;">Please take a moment to share your experience with us.</p>
            <div style="text-align:center;margin:28px 0;">
                <a href="${surveyUrl}" style="display:inline-block;background:#C9A84C;color:#0D2B1F;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Complete Survey</a>
            </div>
            <p style="color:#94a3b8;font-size:12px;">Your feedback helps us improve our services.</p>
        </div>`;
        await sendEmail({ to:[{email:clientEmail,name:clientName}], subject:`Your Feedback Matters — ${assignment.title} | Emerald Pearland Events`, htmlContent:brandedWrapper('CLIENT SURVEY',body) });
        console.log('Client survey email sent:', clientEmail);
    } catch(err) { console.error('Client survey email error:',err.message); }
};

const sendClientInvoiceEmail = async (clientEmail, clientName, invoice, assignment) => {
    try {
        const invoiceNum = invoice.invoiceNumber || invoice.invoice_number || 'N/A';
        const total = invoice.totalAmount || invoice.total_amount || 0;
        const subtotal = invoice.subtotal || 0;
        const vatAmt = invoice.vatAmount || invoice.tax_amount || 0;
        const body = `<div style="padding:32px 40px;">
            <h2 style="color:#0D2B1F;font-family:Georgia,serif;margin-bottom:8px;">Invoice ${invoiceNum}</h2>
            <p style="color:#334155;line-height:1.6;">Dear <strong>${clientName}</strong>, please find your invoice details for <strong>${assignment.title}</strong> below.</p>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0;">
                <table style="width:100%;border-collapse:collapse;">
                    <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:10px;color:#64748b;font-size:0.85rem;">Invoice Number</td><td style="padding:10px;font-weight:700;color:#1e293b;">${invoiceNum}</td></tr>
                    <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:10px;color:#64748b;font-size:0.85rem;">Event</td><td style="padding:10px;color:#1e293b;">${assignment.title}</td></tr>
                    <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:10px;color:#64748b;font-size:0.85rem;">Event Date</td><td style="padding:10px;color:#1e293b;">${assignment.date?new Date(assignment.date).toLocaleDateString('en-KE'):''}</td></tr>
                    <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:10px;color:#64748b;font-size:0.85rem;">Subtotal</td><td style="padding:10px;color:#1e293b;">KSh ${subtotal.toLocaleString()}</td></tr>
                    <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:10px;color:#64748b;font-size:0.85rem;">VAT (${invoice.vatRate||16}%)</td><td style="padding:10px;color:#1e293b;">KSh ${vatAmt.toLocaleString()}</td></tr>
                    <tr style="background:#f0fdf4;"><td style="padding:12px;font-weight:700;color:#065f46;font-size:1rem;">TOTAL</td><td style="padding:12px;font-weight:900;color:#059669;font-size:1.2rem;">KSh ${total.toLocaleString()}</td></tr>
                </table>
            </div>
            <p style="color:#334155;line-height:1.6;">Please make payment within 30 days. For queries, contact us at <a href="mailto:emeraldpearlandevents@gmail.com" style="color:#059669;">emeraldpearlandevents@gmail.com</a></p>
            ${invoice.pdfUrl ? '<p style="color:#334155;font-size:13px;margin-top:12px;">📎 Your invoice PDF is attached to this email.</p>' : ''}
        </div>`;
        // Attach PDF if available
        const attachments = [];
        try {
            const fs = require('fs'), path = require('path');
            const pp = path.join(__dirname,'../public', invoice.pdfUrl||('invoices/'+(invoiceNum)+'.pdf'));
            if (invoice.pdfUrl && fs.existsSync(pp)) {
                attachments.push({ name: invoiceNum+'.pdf', content: fs.readFileSync(pp).toString('base64') });
            }
        } catch(_e) { console.log('PDF attach skip:', _e.message); }
        await sendEmail({ to:[{email:clientEmail,name:clientName}], subject:`Invoice ${invoiceNum} — ${assignment.title} | Emerald Pearland Events`, htmlContent:brandedWrapper('CLIENT INVOICE',body), attachments });
        console.log('Client invoice email sent:', clientEmail);
    } catch(err) { console.error('Client invoice email error:',err.message); }
};

const sendEventCompletionReceipt = async (clientEmail, clientName, assignment, invoice) => {
    try {
        const etrNumber = invoice?.etrNumber || invoice?.invoiceNumber || invoice?.invoice_number || 'N/A';
        const totalPaid = invoice?.totalAmount || invoice?.total_amount || 0;
        const vatAmt = invoice?.vatAmount || invoice?.tax_amount || 0;
        const staffCount = assignment?.accepted_staff_ids?.length || assignment?.staffCount || 0;
        const body = `<div style="padding:32px 40px;">
            <p style="color:#334155;font-size:1rem;margin-bottom:20px;">
                Dear <strong>${clientName}</strong>, your event has been successfully completed. Thank you for choosing Emerald Pearland Events.
            </p>
            <div style="background:#f8fafc;border-radius:8px;padding:20px;margin-bottom:20px;border-left:4px solid #059669;">
                <h3 style="color:#0D2B1F;margin-bottom:12px;font-size:1rem;">Event Summary</h3>
                <p style="margin:4px 0;color:#334155;"><strong>Event:</strong> ${assignment?.title||''}</p>
                <p style="margin:4px 0;color:#334155;"><strong>Date:</strong> ${assignment?.date?new Date(assignment.date).toLocaleDateString('en-KE',{weekday:'long',year:'numeric',month:'long',day:'numeric'}):''}</p>
                <p style="margin:4px 0;color:#334155;"><strong>Location:</strong> ${assignment?.location||''}</p>
                <p style="margin:4px 0;color:#334155;"><strong>Staff Deployed:</strong> ${staffCount}</p>
            </div>
            <div style="background:#f8fafc;border-radius:8px;padding:20px;margin-bottom:20px;border-left:4px solid #C9A84C;">
                <h3 style="color:#0D2B1F;margin-bottom:12px;font-size:1rem;">Payment Receipt</h3>
                <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:6px 0;color:#64748b;">ETR Number</td><td style="padding:6px 0;font-weight:700;color:#0D2B1F;text-align:right;">${etrNumber}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b;">Invoice Number</td><td style="padding:6px 0;font-weight:700;color:#0D2B1F;text-align:right;">${invoice?.invoiceNumber||invoice?.invoice_number||'N/A'}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b;">Subtotal</td><td style="padding:6px 0;text-align:right;">KSh ${((invoice?.subtotal||0)).toLocaleString()}</td></tr>
                    <tr><td style="padding:6px 0;color:#64748b;">VAT (${invoice?.vatRate||16}%)</td><td style="padding:6px 0;text-align:right;">KSh ${vatAmt.toLocaleString()}</td></tr>
                    <tr style="border-top:2px solid #e2e8f0;"><td style="padding:10px 0;font-weight:900;color:#0D2B1F;font-size:1.1rem;">TOTAL PAID</td><td style="padding:10px 0;font-weight:900;color:#059669;font-size:1.2rem;text-align:right;">KSh ${totalPaid.toLocaleString()}</td></tr>
                </table>
            </div>
            ${invoice?.pdfUrl ? '<p style="color:#334155;font-size:13px;">📎 Your receipt PDF is attached to this email.</p>' : ''}
            <p style="color:#64748b;font-size:0.85rem;text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0;">
                This serves as your official Electronic Tax Receipt (ETR) for services rendered by Emerald Pearland Events.
            </p>
        </div>`;
        // Attach PDF
        const attachments = [];
        try {
            const { generateInvoicePDF } = require('../controllers/invoiceController');
            const fs = require('fs'), path = require('path');
            if (invoice && typeof generateInvoicePDF === 'function') {
                const etrPdfPath = await generateInvoicePDF(invoice);
                const fullPath = path.join(__dirname, '../public', etrPdfPath);
                if (fs.existsSync(fullPath)) {
                    attachments.push({ name: (invoice.etrNumber||invoice.invoiceNumber||'receipt')+'.pdf', content: fs.readFileSync(fullPath).toString('base64') });
                }
            }
        } catch(etrPdfErr) { console.log('ETR PDF attach skip:', etrPdfErr.message); }
        await sendEmail({ to:[{email:clientEmail,name:clientName}], subject:`Event Completion Receipt — ${assignment?.title||'Your Event'} | Emerald Pearland Events`, htmlContent:brandedWrapper('EVENT COMPLETION RECEIPT',body), attachments });
        console.log('ETR sent to:', clientEmail);
    } catch(err) { console.error('ETR email error:',err.message); }
};

module.exports = {
    initializeEmailService,
    sendStaffWelcomeEmail,
    sendPasswordResetEmail,
    sendAdminPasswordResetNotification,
    sendPaymentSentNotification,
    sendPaymentReceiptEmail,
    sendAssignmentNotification,
    sendAssignmentUpdateNotification,
    sendClientThankYouEmail,
    sendClientSurveyEmail,
    sendClientInvoiceEmail,
    sendEventCompletionReceipt,
    sendEmail,
    brandedWrapper
};