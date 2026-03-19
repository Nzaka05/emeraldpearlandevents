// ═══════════════════════════════════════════════════════════
// EMAIL SERVICE — BREVO SDK (Official @getbrevo/brevo)
// ═══════════════════════════════════════════════════════════

const Brevo = require('sib-api-v3-sdk');

let apiInstance = null;

const initializeEmailService = () => {
    try {
        const apiKey = process.env.BREVO_API_KEY;

        if (!apiKey) {
            console.warn('⚠️ BREVO_API_KEY not found. Email service disabled.');
            return;
        }

        const defaultClient = Brevo.ApiClient.instance;
        const apiKeyAuth = defaultClient.authentications['api-key'];
        apiKeyAuth.apiKey = apiKey;

        apiInstance = new Brevo.TransactionalEmailsApi();
        console.log('✅ Brevo SDK email service initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing Brevo email service:', error.message);
    }
};

// ─────────────────────────────────────────────────────────────
// HELPER: Send an email via Brevo SDK
// ─────────────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, htmlContent, replyTo }) => {
    if (!apiInstance) {
        throw new Error('Brevo SDK not initialized — BREVO_API_KEY missing');
    }

    const sendSmtpEmail = new Brevo.SendSmtpEmail();

    sendSmtpEmail.sender = {
        name: 'Emerald Pearland Events',
        email: process.env.EMAIL_USER || 'emeraldpearlandevents@gmail.com'
    };

    sendSmtpEmail.to = Array.isArray(to) ? to : [to];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;

    if (replyTo) {
        sendSmtpEmail.replyTo = { email: replyTo };
    }

    return apiInstance.sendTransacEmail(sendSmtpEmail);
};

// ─────────────────────────────────────────────────────────────
// Format booking details HTML table
// ─────────────────────────────────────────────────────────────
const formatBookingDetailsHTML = (booking, customer) => {
    const bookingDate = new Date(booking.eventDate);
    const formattedDate = bookingDate.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    return `
        <table style="width: 100%; border-collapse: collapse;">
            <tr style="background-color: #f5f5f5;">
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Booking Reference:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${booking.bookingReference}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Client Name:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${customer.name}</td>
            </tr>
            <tr style="background-color: #f5f5f5;">
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Email:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${customer.email}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Phone:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${customer.phone}</td>
            </tr>
            <tr style="background-color: #f5f5f5;">
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Event Type:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${booking.eventType}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Event Date:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${formattedDate}</td>
            </tr>
            <tr style="background-color: #f5f5f5;">
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Event Duration:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${booking.eventDuration}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Location:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${booking.location}</td>
            </tr>
            <tr style="background-color: #f5f5f5;">
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Number of Guests:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${booking.guests}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Ushers Required:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${booking.needUshers || 'Not specified'}</td>
            </tr>
            ${booking.needUshers === 'Yes' ? `
            <tr style="background-color: #f5f5f5;">
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Number of Ushers:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${booking.usherCount}</td>
            </tr>` : ''}
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Estimated Investment:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;"><span style="background:#d4af37;color:#000;padding:2px 6px;border-radius:3px;font-weight:bold;">${booking.budgetRange}</span></td>
            </tr>
            ${booking.notes ? `
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Special Requests:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${booking.notes}</td>
            </tr>` : ''}
        </table>
    `;
};

// ─────────────────────────────────────────────────────────────
// Email 1: Business notification
// ─────────────────────────────────────────────────────────────
const sendBusinessBookingNotification = async (booking, customer) => {
    const htmlContent = `
        <html><head><style>
            body { font-family: Arial, sans-serif; color: #333; background-color: #f9f9f9; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #0a2f1c 0%, #2d8a5e 100%); color: white; padding: 20px; text-align: center; border-radius: 4px; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
        </style></head>
        <body>
            <div class="container">
                <div class="header"><h1>NEW EVENT BOOKING REQUEST</h1></div>
                <div style="margin-top:20px;">
                    <p>You have received a new booking request from <strong>${customer.name}</strong>.</p>
                    ${formatBookingDetailsHTML(booking, customer)}
                    <p style="margin-top:20px;"><strong>Next Steps:</strong> Contact the client via WhatsApp or email to confirm all details.</p>
                </div>
                <div class="footer">
                    <p>Emerald Pearland Events | Booking Reference: ${booking.bookingReference}</p>
                    <p>This is an automated email. Please do not reply to this message.</p>
                </div>
            </div>
        </body></html>
    `;

    return sendEmail({
        to: [{ email: process.env.ADMIN_EMAIL || 'emeraldpearlandevents@gmail.com', name: 'Emerald Admin' }],
        subject: `🎉 NEW EVENT BOOKING REQUEST - ${booking.bookingReference}`,
        htmlContent
    });
};

// ─────────────────────────────────────────────────────────────
// Email 2: Client booking confirmation
// ─────────────────────────────────────────────────────────────
const sendClientBookingConfirmation = async (booking, customer) => {
    const formattedDate = new Date(booking.eventDate).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const htmlContent = `
        <html><head><style>
            body { font-family: Arial, sans-serif; color: #333; background-color: #f9f9f9; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #0a2f1c 0%, #2d8a5e 100%); color: white; padding: 20px; text-align: center; border-radius: 4px; }
            .reference-box { background-color: #f0f7f4; border-left: 4px solid #d4af37; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .ref { font-size: 18px; font-weight: bold; color: #0a2f1c; }
            .whatsapp-btn { display: inline-block; background-color: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 20px; margin-top: 15px; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
        </style></head>
        <body>
            <div class="container">
                <div class="header"><h1>✨ Booking Request Received!</h1></div>
                <div style="margin-top:20px; line-height:1.6;">
                    <p>Thank you, <strong>${customer.name}</strong>!</p>
                    <p>We have successfully received your event booking request. Our team is reviewing the details and will contact you shortly.</p>
                    <div class="reference-box">
                        <p>Your Booking Reference:</p>
                        <p class="ref">${booking.bookingReference}</p>
                    </div>
                    <p><strong>Event Summary:</strong></p>
                    <ul>
                        <li><strong>Event Type:</strong> ${booking.eventType}</li>
                        <li><strong>Date:</strong> ${formattedDate}</li>
                        <li><strong>Duration:</strong> ${booking.eventDuration}</li>
                        <li><strong>Location:</strong> ${booking.location}</li>
                        <li><strong>Number of Guests:</strong> ${booking.guests}</li>
                        <li><strong>Estimated Investment:</strong> ${booking.budgetRange}</li>
                    </ul>
                    <p><strong>📱 Quick Connect via WhatsApp:</strong></p>
                    <a href="https://wa.me/254722446937?text=Hi%20Emerald%20Pearland%20Events%2C%20I%20have%20a%20booking%20reference%20${booking.bookingReference}" class="whatsapp-btn">Chat on WhatsApp 💬</a>
                    <p style="margin-top:25px;"><strong>What happens next?</strong></p>
                    <ol>
                        <li>Our team reviews your request</li>
                        <li>We contact you within 24 hours</li>
                        <li>We confirm all details and customization</li>
                        <li>We prepare a tailored proposal</li>
                        <li>Your event becomes unforgettable! ✨</li>
                    </ol>
                </div>
                <div class="footer">
                    <p><strong>Emerald Pearland Events</strong></p>
                    <p>📱 WhatsApp: +254 722 446 937 | 📧 ${process.env.EMAIL_USER || 'emeraldpearlandevents@gmail.com'}</p>
                </div>
            </div>
        </body></html>
    `;

    return sendEmail({
        to: [{ email: customer.email, name: customer.name }],
        subject: `✨ Booking Request Received - Reference: ${booking.bookingReference}`,
        htmlContent
    });
};

// ─────────────────────────────────────────────────────────────
// Email 3: Follow-up (sent ~5 min after booking)
// ─────────────────────────────────────────────────────────────
const sendFollowUpEmail = async (booking, customer) => {
    const htmlContent = `
        <html><head><style>
            body { font-family: Arial, sans-serif; color: #333; background-color: #f9f9f9; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; }
            .header { background: linear-gradient(135deg, #0a2f1c 0%, #2d8a5e 100%); color: white; padding: 20px; text-align: center; border-radius: 4px; }
            .whatsapp-btn { display: inline-block; background-color: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 20px; margin-top: 15px; }
        </style></head>
        <body>
            <div class="container">
                <div class="header"><h1>Follow-up: Your ${booking.eventType}</h1></div>
                <div style="margin-top:20px;">
                    <p>Hi ${customer.name},</p>
                    <p>We wanted to follow up on your booking request (Reference: <strong>${booking.bookingReference}</strong>) for your ${booking.eventType} on <strong>${new Date(booking.eventDate).toLocaleDateString()}</strong>.</p>
                    <p>Our team is preparing a customized proposal for you. If you have any questions, please reach out!</p>
                    <a href="https://wa.me/254722446937?text=Hi%20Emerald%20Pearland%20Events%2C%20I%20have%20a%20booking%20reference%20${booking.bookingReference}" class="whatsapp-btn">Chat with us on WhatsApp 💬</a>
                </div>
            </div>
        </body></html>
    `;

    return sendEmail({
        to: [{ email: customer.email, name: customer.name }],
        subject: `Follow-up: Your ${booking.eventType} - Reference: ${booking.bookingReference}`,
        htmlContent
    });
};

// ─────────────────────────────────────────────────────────────
// Email 4: Event reminder (48hrs before)
// ─────────────────────────────────────────────────────────────
const sendEventReminderEmail = async (booking, customer) => {
    const formattedDate = new Date(booking.eventDate).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const htmlContent = `
        <html><head><style>
            body { font-family: Arial, sans-serif; color: #333; background-color: #f9f9f9; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; }
            .header { background: linear-gradient(135deg, #d4af37 0%, #e8c547 100%); color: #0a2f1c; padding: 20px; text-align: center; border-radius: 4px; }
        </style></head>
        <body>
            <div class="container">
                <div class="header"><h1>🎉 Your Event is Almost Here!</h1></div>
                <div style="margin-top:20px;">
                    <p>Hi ${customer.name},</p>
                    <p>Your ${booking.eventType} is coming up in just 48 hours! We're all set and ready to make it spectacular.</p>
                    <p><strong>Event Details:</strong></p>
                    <ul>
                        <li>📅 Date: ${formattedDate}</li>
                        <li>⏰ Duration: ${booking.eventDuration}</li>
                        <li>📍 Location: ${booking.location}</li>
                    </ul>
                    <p>If you have any last-minute questions, please contact us immediately!</p>
                    <p>We can't wait to make your event unforgettable! ✨</p>
                </div>
            </div>
        </body></html>
    `;

    return sendEmail({
        to: [{ email: customer.email, name: customer.name }],
        subject: `🎉 Reminder: Your ${booking.eventType} is in 2 Days!`,
        htmlContent
    });
};

// ─────────────────────────────────────────────────────────────
// Email 5: Client appreciation & feedback
// ─────────────────────────────────────────────────────────────
const sendClientAppreciationEmail = async (booking, customer) => {
    const senderEmail = process.env.EMAIL_USER || 'emeraldpearlandevents@gmail.com';

    const htmlContent = `
        <html><head><style>
            body { font-family: Arial, sans-serif; color: #333; background-color: #f9f9f9; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); text-align: center; }
            .logo { font-size: 24px; font-family: serif; color: #0a2f1c; margin-bottom: 20px; letter-spacing: 2px; }
            .header { color: #d4af37; font-size: 28px; margin-bottom: 20px; font-family: serif; }
            .content { line-height: 1.8; color: #555; font-size: 16px; margin-bottom: 30px; text-align: left; }
            .feedback-btn { display: inline-block; background-color: #0a2f1c; color: white; padding: 14px 30px; text-decoration: none; border-radius: 4px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; margin: 20px 0; }
            .signature { margin-top: 40px; font-style: italic; color: #888; border-top: 1px solid #eee; padding-top: 20px; }
        </style></head>
        <body>
            <div class="container">
                <div class="logo">EMERALD PEARLAND</div>
                <div class="header">Thank You For Choosing Us</div>
                <div class="content">
                    <p>Dear ${customer.name},</p>
                    <p>It was our absolute pleasure to host and organize your recent <strong>${booking.eventType}</strong>.</p>
                    <p>At Emerald Pearland Events, we strive to transform your vision into an unforgettable reality. We sincerely hope the experience met your expectations.</p>
                    <p>Your opinion is invaluable to us. We would deeply appreciate it if you could share your feedback.</p>
                    <div style="text-align:center;">
                        <a href="mailto:${senderEmail}?subject=Feedback:%20${booking.bookingReference}" class="feedback-btn">Share Your Feedback</a>
                    </div>
                    <p>Thank you again for choosing us. We look forward to celebrating with you again!</p>
                </div>
                <div class="signature">
                    <p>Warmest Regards,</p>
                    <p><strong>The Emerald Pearland Events Team</strong></p>
                </div>
            </div>
        </body></html>
    `;

    return sendEmail({
        to: [{ email: customer.email, name: customer.name }],
        subject: `Thank you for choosing Emerald Pearland Events - ${booking.bookingReference}`,
        htmlContent,
        replyTo: senderEmail
    });
};

// ─────────────────────────────────────────────────────────────
// Email 6: Internal staff feedback request
// ─────────────────────────────────────────────────────────────
const sendStaffFeedbackRequestEmail = async (staffEmail, staffName, booking, customMessage) => {
    if (!staffEmail) throw new Error(`Staff member ${staffName} does not have a registered email address.`);

    const htmlContent = `
        <html><head><style>
            body { font-family: Arial, sans-serif; color: #333; background-color: #f4f4f4; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 6px; border-top: 4px solid #0a2f1c; }
            .header { font-size: 20px; color: #0a2f1c; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
            .message-box { background-color: #f9f9f9; border-left: 4px solid #d4af37; padding: 15px; margin: 20px 0; font-style: italic; color: #444; }
            .meta { font-size: 13px; color: #666; background: #eee; padding: 10px; border-radius: 4px; margin-bottom: 20px; }
        </style></head>
        <body>
            <div class="container">
                <div class="header"><strong>Review Request: Client Experience & Event Feedback</strong></div>
                <div>
                    <p>Hi ${staffName},</p>
                    <p>We are reviewing the internal performance and client satisfaction for a recent event you were assigned to.</p>
                    <div class="meta">
                        <strong>Event Type:</strong> ${booking.eventType}<br>
                        <strong>Booking Ref:</strong> ${booking.bookingReference}<br>
                        <strong>Date:</strong> ${new Date(booking.eventDate).toLocaleDateString()}
                    </div>
                    <p>The Admin has requested your specific feedback on the following:</p>
                    <div class="message-box">"${customMessage.replace(/\n/g, '<br>')}"</div>
                    <p>Please reply directly to this email with your insights.</p>
                    <p>Thank you for your hard work.</p>
                </div>
            </div>
        </body></html>
    `;

    return sendEmail({
        to: [{ email: staffEmail, name: staffName }],
        subject: `Event Feedback Required: ${booking.eventType} (${booking.bookingReference})`,
        htmlContent,
        replyTo: process.env.ADMIN_EMAIL || 'emeraldpearlandevents@gmail.com'
    });
};

// ─────────────────────────────────────────────────────────────
// Email 7: 48-hour pre-event staff reminder
// ─────────────────────────────────────────────────────────────
const sendStaffEventReminder = async (staff, booking, customer, role = 'Team Member') => {
    if (!staff.email) return;

    const formattedDate = new Date(booking.eventDate).toLocaleDateString('en-KE', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const htmlContent = `
        <html><head><style>
            body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #0D2B1F, #1a4a35); color: white; padding: 32px; text-align: center; }
            .header h1 { font-family: serif; font-size: 24px; margin: 0; letter-spacing: 2px; color: #C9A84C; }
            .header p { margin: 8px 0 0; color: #a0c0a8; font-size: 14px; }
            .alert-banner { background: #C9A84C; color: #0D2B1F; text-align: center; padding: 12px; font-weight: bold; font-size: 16px; letter-spacing: 1px; }
            .body { padding: 32px; }
            .info-item { background: #f9f9f9; border-left: 3px solid #C9A84C; padding: 12px 16px; border-radius: 4px; margin-bottom: 10px; }
            .info-label { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 1px; }
            .info-value { font-size: 15px; color: #0D2B1F; font-weight: 600; margin-top: 4px; }
            .role-badge { display: inline-block; background: #0D2B1F; color: #C9A84C; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
            .footer { background: #f8f6f0; text-align: center; padding: 20px; font-size: 12px; color: #999; }
        </style></head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>EMERALD PEARLAND</h1>
                    <p>Event Day Notification</p>
                </div>
                <div class="alert-banner">⏰ EVENT IN 48 HOURS — ACTION REQUIRED</div>
                <div class="body">
                    <p>Dear <strong>${staff.name}</strong>,</p>
                    <p>You have been assigned to an upcoming event. Please review the details below and confirm your availability.</p>
                    <p>Your Role: <span class="role-badge">${role}</span></p>
                    <div class="info-item">
                        <div class="info-label">Event Type</div>
                        <div class="info-value">${booking.eventType}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Client</div>
                        <div class="info-value">${customer?.name || 'Confidential'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Event Date</div>
                        <div class="info-value">${formattedDate}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Duration</div>
                        <div class="info-value">${booking.eventDuration || 'TBD'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Venue / Location</div>
                        <div class="info-value">${booking.location}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Guests Expected</div>
                        <div class="info-value">${booking.guests} guests</div>
                    </div>
                    <p style="color:#666; font-size:14px; margin-top:20px;">Please ensure you are on-site at least 1 hour before the event starts. Contact the admin team immediately if you have any conflicts.</p>
                </div>
                <div class="footer">
                    <p>Emerald Pearland Events — Internal Staff Communication</p>
                    <p>Do not share this email. For queries, reply directly or use WhatsApp.</p>
                </div>
            </div>
        </body></html>
    `;

    return sendEmail({
        to: [{ email: staff.email, name: staff.name }],
        subject: `⚡ 48hr Alert: You are assigned to ${booking.eventType} on ${formattedDate}`,
        htmlContent
    });
};

module.exports = {
    initializeEmailService,
    sendBusinessBookingNotification,
    sendClientBookingConfirmation,
    sendFollowUpEmail,
    sendEventReminderEmail,
    sendClientAppreciationEmail,
    sendStaffFeedbackRequestEmail,
    sendStaffEventReminder,
    sendEmail
};
