const Brevo = require('sib-api-v3-sdk');
const nodemailer = require('nodemailer');

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
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                }
            });
            console.log('Staff System: Gmail SMTP fallback configured');
        }

        if (!apiInstance && !nodemailerTransport) {
            console.warn('Staff System: No email service configured. Emails will be logged to console only.');
        }
    } catch (error) {
        console.error('Staff System: Error initializing email service:', error.message);
    }
};

const sendEmail = async ({ to, subject, htmlContent }) => {
    // Try Brevo first
    if (apiInstance) {
        try {
            const sendSmtpEmail = new Brevo.SendSmtpEmail();
            sendSmtpEmail.sender = {
                name: 'Emerald Pearland Events',
                email: process.env.EMAIL_USER || 'emeraldpearlandevents@gmail.com'
            };
            sendSmtpEmail.to = Array.isArray(to) ? to : [to];
            sendSmtpEmail.subject = subject;
            sendSmtpEmail.htmlContent = htmlContent;
            await apiInstance.sendTransacEmail(sendSmtpEmail);
            return true;
        } catch (err) {
            console.error('Brevo send failed, trying SMTP fallback:', err.message);
        }
    }

    // Fallback to Gmail SMTP
    if (nodemailerTransport) {
        try {
            const recipient = Array.isArray(to) ? to.map(t => t.email).join(',') : to.email;
            await nodemailerTransport.sendMail({
                from: `"Emerald Pearland Events" <${process.env.EMAIL_USER}>`,
                to: recipient,
                subject,
                html: htmlContent
            });
            return true;
        } catch (err) {
            console.error('Gmail SMTP send failed:', err.message);
        }
    }

    // Last resort: log to console
    const recipient = Array.isArray(to) ? to.map(t => t.email).join(',') : to.email;
    console.log(`\n[EMAIL NOT SENT - No provider configured]\nTo: ${recipient}\nSubject: ${subject}\n`);
    return false;
};

// Branded email wrapper
const brandedWrapper = (title, bodyHtml) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0D2B1F,#1a4a35);padding:32px;text-align:center;">
        <h1 style="margin:0;font-family:Georgia,serif;font-size:22px;letter-spacing:3px;color:#C9A84C;">EMERALD PEARLAND</h1>
        <p style="margin:8px 0 0;color:#a0c0a8;font-size:13px;letter-spacing:1px;">EVENTS MANAGEMENT</p>
    </div>
    <div style="background:#C9A84C;color:#0D2B1F;text-align:center;padding:10px;font-weight:700;font-size:14px;letter-spacing:1px;">
        ${title}
    </div>
    <div style="padding:32px;line-height:1.7;color:#333;font-size:15px;">
        ${bodyHtml}
    </div>
    <div style="background:#f8f6f0;text-align:center;padding:20px;font-size:11px;color:#999;border-top:1px solid #eee;">
        <p style="margin:0;">Emerald Pearland Events &mdash; Staff Management System</p>
        <p style="margin:4px 0 0;">This is an automated message. Do not reply directly.</p>
    </div>
</div>
</body>
</html>`;

// ── Email: Welcome new staff ──
const sendStaffWelcomeEmail = async (staff, plainPassword, loginUrl) => {
    try {
        const body = `
            <p>Dear <strong>${staff.name}</strong>,</p>
            <p>Welcome to the Emerald Pearland Events team! Your staff account has been created.</p>
            <div style="background:#f0f7f4;border-left:4px solid #C9A84C;padding:16px;border-radius:4px;margin:20px 0;">
                <p style="margin:0 0 8px;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:1px;">Your Login Credentials</p>
                <p style="margin:4px 0;"><strong>Email:</strong> ${staff.email}</p>
                <p style="margin:4px 0;"><strong>Temporary Password:</strong> <code style="background:#e8e8e8;padding:2px 8px;border-radius:3px;font-size:16px;font-weight:bold;">${plainPassword}</code></p>
            </div>
            <p><strong>You must change your password on first login.</strong></p>
            ${loginUrl ? `
            <div style="text-align:center;margin:24px 0;">
                <a href="${loginUrl}" style="display:inline-block;background:#0D2B1F;color:#C9A84C;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;letter-spacing:1px;">LOGIN TO YOUR ACCOUNT</a>
            </div>
            <p style="font-size:13px;color:#888;">Or copy this link: <br><a href="${loginUrl}" style="color:#0D2B1F;word-break:break-all;">${loginUrl}</a></p>
            <p style="font-size:12px;color:#999;">This secure link expires after first use or within 24 hours.</p>
            ` : ''}
            <p>If you have any questions, please contact your supervisor or the admin team.</p>
        `;
        await sendEmail({
            to: [{ email: staff.email, name: staff.name }],
            subject: 'Welcome to Emerald Pearland Events - Your Staff Account',
            htmlContent: brandedWrapper('WELCOME TO THE TEAM', body)
        });
    } catch (error) {
        console.error('Failed to send welcome email:', error.message);
    }
};

// ── Email: Password reset link (forgot password) ──
const sendPasswordResetEmail = async (staff, resetUrl) => {
    try {
        const body = `
            <p>Dear <strong>${staff.name}</strong>,</p>
            <p>You requested a password reset for your staff account. Click the button below to set a new password:</p>
            <div style="text-align:center;margin:24px 0;">
                <a href="${resetUrl}" style="display:inline-block;background:#0D2B1F;color:#C9A84C;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;letter-spacing:1px;">RESET PASSWORD</a>
            </div>
            <p style="font-size:13px;color:#888;">Or copy this link: <br><a href="${resetUrl}" style="color:#0D2B1F;word-break:break-all;">${resetUrl}</a></p>
            <p style="font-size:12px;color:#cc0000;"><strong>This link expires in 10 minutes.</strong> If you did not request this, please ignore this email.</p>
        `;
        await sendEmail({
            to: [{ email: staff.email, name: staff.name }],
            subject: 'Password Reset - Emerald Pearland Staff Portal',
            htmlContent: brandedWrapper('PASSWORD RESET REQUEST', body)
        });
    } catch (error) {
        console.error('Failed to send password reset email:', error.message);
    }
};

// ── Email: Admin-initiated password reset ──
const sendAdminPasswordResetNotification = async (staff, plainPassword) => {
    try {
        const body = `
            <p>Dear <strong>${staff.name}</strong>,</p>
            <p>Your password has been reset by an administrator. Please use the following temporary credentials to log in:</p>
            <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px;border-radius:4px;margin:20px 0;">
                <p style="margin:0 0 8px;font-size:13px;color:#92400e;text-transform:uppercase;letter-spacing:1px;">New Temporary Password</p>
                <p style="margin:4px 0;"><code style="background:#e8e8e8;padding:2px 8px;border-radius:3px;font-size:16px;font-weight:bold;">${plainPassword}</code></p>
            </div>
            <p><strong>You will be required to change this password when you log in.</strong></p>
            <div style="text-align:center;margin:24px 0;">
                <a href="${process.env.STAFF_APP_URL || 'http://localhost:3001'}/portal/auth/login" style="display:inline-block;background:#0D2B1F;color:#C9A84C;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;letter-spacing:1px;">LOG IN NOW</a>
            </div>
            <p style="font-size:12px;color:#999;">If you did not expect this reset, please contact your administrator immediately.</p>
        `;
        await sendEmail({
            to: [{ email: staff.email, name: staff.name }],
            subject: 'Your Password Has Been Reset - Emerald Pearland Staff Portal',
            htmlContent: brandedWrapper('PASSWORD RESET BY ADMIN', body)
        });
    } catch (error) {
        console.error('Failed to send admin reset notification:', error.message);
    }
};

// ── Email: Payment sent notification ──
const sendPaymentSentNotification = async (staff, assignment) => {
    try {
        const body = `
            <p>Dear <strong>${staff.name}</strong>,</p>
            <p>Payment has been sent for the following assignment:</p>
            <div style="background:#f0f7f4;border-left:4px solid #10b981;padding:16px;border-radius:4px;margin:20px 0;">
                <p style="margin:4px 0;"><strong>Assignment:</strong> ${assignment.title}</p>
                <p style="margin:4px 0;"><strong>Date:</strong> ${new Date(assignment.date).toLocaleDateString()}</p>
                <p style="margin:4px 0;"><strong>Pay Rate:</strong> $${assignment.pay_rate}</p>
                <p style="margin:4px 0;"><strong>Location:</strong> ${assignment.location}</p>
            </div>
            <p>Please log in to your staff portal to <strong>confirm receipt</strong> of this payment.</p>
            <div style="text-align:center;margin:24px 0;">
                <a href="${process.env.STAFF_APP_URL || 'http://localhost:3001'}/portal/staff/dashboard" style="display:inline-block;background:#10b981;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;letter-spacing:1px;">CONFIRM PAYMENT</a>
            </div>
            <p style="font-size:12px;color:#999;">If there is an issue with this payment, you can flag it from your dashboard.</p>
        `;
        await sendEmail({
            to: [{ email: staff.email, name: staff.name }],
            subject: `Payment Sent - ${assignment.title} | Emerald Pearland Events`,
            htmlContent: brandedWrapper('PAYMENT SENT', body)
        });
    } catch (error) {
        console.error('Failed to send payment notification:', error.message);
    }
};

// ── Email: Assignment notification ──
const sendAssignmentNotification = async (staff, assignment) => {
    try {
        const body = `
            <p>Dear <strong>${staff.name}</strong>,</p>
            <p>You have been assigned to a new event:</p>
            <div style="background:#f0f7f4;border-left:4px solid #C9A84C;padding:16px;border-radius:4px;margin:20px 0;">
                <p style="margin:4px 0;"><strong>Event:</strong> ${assignment.title}${assignment.vip_flag ? ' <span style="background:#f59e0b;color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">VIP</span>' : ''}</p>
                <p style="margin:4px 0;"><strong>Date:</strong> ${new Date(assignment.date).toLocaleDateString()}</p>
                <p style="margin:4px 0;"><strong>Time:</strong> ${assignment.start_time} - ${assignment.end_time}</p>
                <p style="margin:4px 0;"><strong>Location:</strong> ${assignment.location}</p>
                <p style="margin:4px 0;"><strong>Pay Rate:</strong> $${assignment.pay_rate}</p>
                ${assignment.dress_code ? `<p style="margin:4px 0;"><strong>Dress Code:</strong> ${assignment.dress_code}</p>` : ''}
                ${assignment.special_instructions ? `<p style="margin:4px 0;"><strong>Instructions:</strong> ${assignment.special_instructions}</p>` : ''}
            </div>
            <p>Please log in to <strong>accept or decline</strong> this assignment.</p>
            <div style="text-align:center;margin:24px 0;">
                <a href="${process.env.STAFF_APP_URL || 'http://localhost:3001'}/portal/staff/dashboard" style="display:inline-block;background:#0D2B1F;color:#C9A84C;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;letter-spacing:1px;">VIEW ASSIGNMENT</a>
            </div>
        `;
        await sendEmail({
            to: [{ email: staff.email, name: staff.name }],
            subject: `New Assignment: ${assignment.title} | Emerald Pearland Events`,
            htmlContent: brandedWrapper('NEW ASSIGNMENT', body)
        });
    } catch (error) {
        console.error('Failed to send assignment notification:', error.message);
    }
};

// ── Email: Assignment updated notification ──
const sendAssignmentUpdateNotification = async (staff, assignment, changes) => {
    try {
        const body = `
            <p>Dear <strong>${staff.name}</strong>,</p>
            <p>An assignment you accepted has been updated:</p>
            <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px;border-radius:4px;margin:20px 0;">
                <p style="margin:4px 0;"><strong>Event:</strong> ${assignment.title}</p>
                <p style="margin:4px 0;"><strong>Date:</strong> ${new Date(assignment.date).toLocaleDateString()}</p>
                <p style="margin:4px 0;"><strong>Time:</strong> ${assignment.start_time} - ${assignment.end_time}</p>
                <p style="margin:4px 0;"><strong>Location:</strong> ${assignment.location}</p>
                <p style="margin:4px 0;"><strong>Pay Rate:</strong> $${assignment.pay_rate}</p>
                ${assignment.dress_code ? `<p style="margin:4px 0;"><strong>Dress Code:</strong> ${assignment.dress_code}</p>` : ''}
            </div>
            <p>Please review the updated details in your staff portal.</p>
            <div style="text-align:center;margin:24px 0;">
                <a href="${process.env.STAFF_APP_URL || 'http://localhost:3001'}/portal/staff/dashboard" style="display:inline-block;background:#0D2B1F;color:#C9A84C;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;letter-spacing:1px;">VIEW DETAILS</a>
            </div>
        `;
        await sendEmail({
            to: [{ email: staff.email, name: staff.name }],
            subject: `Assignment Updated: ${assignment.title} | Emerald Pearland Events`,
            htmlContent: brandedWrapper('ASSIGNMENT UPDATED', body)
        });
    } catch (error) {
        console.error('Failed to send assignment update notification:', error.message);
    }
};

module.exports = {
    initializeEmailService,
    sendStaffWelcomeEmail,
    sendPasswordResetEmail,
    sendAdminPasswordResetNotification,
    sendPaymentSentNotification,
    sendAssignmentNotification,
    sendAssignmentUpdateNotification
};
