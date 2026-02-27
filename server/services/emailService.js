// ═══════════════════════════════════════════════════════════
// EMAIL SERVICE FOR BOOKING NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

const nodemailer = require('nodemailer');

let transporter = null;

const initializeEmailService = () => {
    try {
        const apiKey = process.env.BREVO_API_KEY;

        if (!apiKey) {
            console.warn('⚠️ BREVO_API_KEY not found in environment variables');
            console.log('Using Gmail SMTP as fallback for email service');

            // Fallback to Gmail
            transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD
                }
            });
            return;
        }

        // Use Brevo SMTP (Sendinblue)
        transporter = nodemailer.createTransport({
            host: 'smtp-relay.brevo.com',
            port: 587,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: apiKey
            }
        });

        console.log('✅ Brevo email service initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing email service:', error.message);
    }
};

// Format booking details for email
const formatBookingDetailsHTML = (booking, customer) => {
    const bookingDate = new Date(booking.eventDate);
    const formattedDate = bookingDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
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
            </tr>
            ` : ''}
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Estimated Investment:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;"><span class="highlight">${booking.budgetRange}</span></td>
            </tr>
            ${booking.notes ? `
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd;"><strong>Special Requests:</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">${booking.notes}</td>
            </tr>
            ` : ''}
        </table>
    `;
};

// Email 1: Send to business
const sendBusinessBookingNotification = async (booking, customer) => {
    if (!transporter) {
        throw new Error('Email service not initialized');
    }

    const emailHTML = `
        <html>
            <head>
                <style>
                    body { font-family: 'Arial', sans-serif; color: #333; background-color: #f9f9f9; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .header { background: linear-gradient(135deg, #0a2f1c 0%, #2d8a5e 100%); color: white; padding: 20px; text-align: center; border-radius: 4px; }
                    .header h1 { margin: 0; font-size: 24px; }
                    .content { margin-top: 20px; }
                    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
                    .highlight { background-color: #d4af37; color: #000; padding: 2px 6px; border-radius: 3px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>NEW EVENT BOOKING REQUEST</h1>
                    </div>
                    <div class="content">
                        <p>You have received a new booking request from <span class="highlight">${customer.name}</span>.</p>
                        ${formatBookingDetailsHTML(booking, customer)}
                        <p style="margin-top: 20px;"><strong>Next Steps:</strong> Contact the client via WhatsApp or email to confirm all details and discuss customization options.</p>
                    </div>
                    <div class="footer">
                        <p>Emerald Pearland Events | Booking Reference: ${booking.bookingReference}</p>
                        <p>This is an automated email. Please do not reply to this message.</p>
                    </div>
                </div>
            </body>
        </html>
    `;

    return transporter.sendMail({
        from: `Emerald Pearland Events <${process.env.ADMIN_EMAIL}>`,
        to: process.env.ADMIN_EMAIL,
        subject: `🎉 NEW EVENT BOOKING REQUEST - ${booking.bookingReference}`,
        html: emailHTML
    });
};

// Email 2: Send to client
const sendClientBookingConfirmation = async (booking, customer) => {
    if (!transporter) {
        throw new Error('Email service not initialized');
    }

    const bookingDate = new Date(booking.eventDate);
    const formattedDate = bookingDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const emailHTML = `
        <html>
            <head>
                <style>
                    body { font-family: 'Arial', sans-serif; color: #333; background-color: #f9f9f9; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .header { background: linear-gradient(135deg, #0a2f1c 0%, #2d8a5e 100%); color: white; padding: 20px; text-align: center; border-radius: 4px; }
                    .header h1 { margin: 0; font-size: 24px; }
                    .content { margin-top: 20px; line-height: 1.6; }
                    .reference-box { background-color: #f0f7f4; border-left: 4px solid #d4af37; padding: 15px; margin: 20px 0; border-radius: 4px; }
                    .reference-box p { margin: 0; }
                    .reference-box .ref { font-size: 18px; font-weight: bold; color: #0a2f1c; }
                    .whatsapp-btn { display: inline-block; background-color: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 20px; margin-top: 15px; }
                    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>✨ Booking Request Received!</h1>
                    </div>
                    <div class="content">
                        <p>Thank you, <strong>${customer.name}</strong>!</p>
                        <p>We have successfully received your event booking request. Our team is reviewing the details and will contact you shortly to confirm everything and discuss any special customization.</p>
                        
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
                            <li><strong>Ushers Required:</strong> ${booking.needUshers || 'Not specified'}${booking.needUshers === 'Yes' ? ` (${booking.usherCount} ushers)` : ''}</li>
                            <li><strong>Estimated Investment:</strong> ${booking.budgetRange}</li>
                        </ul>

                        <p><strong>📱 Quick Connect via WhatsApp:</strong></p>
                        <p>Click below to chat with us directly on WhatsApp. We typically respond within 2 hours during business hours.</p>
                        <a href="https://wa.me/254722446937?text=Hi%20Emerald%20Pearland%20Events%2C%20I%20have%20a%20booking%20reference%20${booking.bookingReference}" class="whatsapp-btn">Chat on WhatsApp 💬</a>

                        <p style="margin-top: 25px;"><strong>What happens next?</strong></p>
                        <ol>
                            <li>Our team reviews your request</li>
                            <li>We contact you within 24 hours</li>
                            <li>We confirm all details and customization</li>
                            <li>We prepare a tailored proposal</li>
                            <li>Your event becomes unforgettable! ✨</li>
                        </ol>

                        <p style="margin-top: 20px; color: #666; font-style: italic;">If you have any urgent questions, please reach out via WhatsApp at +254 722 446 937 or reply to this email.</p>
                    </div>
                    <div class="footer">
                        <p><strong>Emerald Pearland Events</strong></p>
                        <p>📱 WhatsApp: +254 722 446 937 | 📧 Email: ${process.env.EMAIL_USER}</p>
                        <p>We look forward to making your event extraordinary!</p>
                    </div>
                </div>
            </body>
        </html>
    `;

    return transporter.sendMail({
        from: `Emerald Pearland Events <${process.env.ADMIN_EMAIL}>`,
        to: customer.email,
        subject: `✨ Booking Request Received - Reference: ${booking.bookingReference}`,
        html: emailHTML
    });
};

// Send follow-up email (24 hours after booking)
const sendFollowUpEmail = async (booking, customer) => {
    if (!transporter) {
        throw new Error('Email service not initialized');
    }

    const emailHTML = `
        <html>
            <head>
                <style>
                    body { font-family: 'Arial', sans-serif; color: #333; background-color: #f9f9f9; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .header { background: linear-gradient(135deg, #0a2f1c 0%, #2d8a5e 100%); color: white; padding: 20px; text-align: center; border-radius: 4px; }
                    .whatsapp-btn { display: inline-block; background-color: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 20px; margin-top: 15px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Follow-up: Your ${booking.eventType}</h1>
                    </div>
                    <div class="content">
                        <p>Hi ${customer.name},</p>
                        <p>We wanted to follow up on your booking request (Reference: <strong>${booking.bookingReference}</strong>) for your ${booking.eventType} on <strong>${new Date(booking.eventDate).toLocaleDateString()}</strong>.</p>
                        <p>Our team is preparing a customized proposal for you. In the meantime, if you have any questions or would like to discuss more details, please don't hesitate to reach out!</p>
                        <a href="https://wa.me/254722446937?text=Hi%20Emerald%20Pearland%20Events%2C%20I%20have%20a%20booking%20reference%20${booking.bookingReference}" class="whatsapp-btn">Chat with us on WhatsApp 💬</a>
                    </div>
                </div>
            </body>
        </html>
    `;

    return transporter.sendMail({
        from: `Emerald Pearland Events <${process.env.ADMIN_EMAIL}>`,
        to: customer.email,
        subject: `Follow-up: Your ${booking.eventType} - Reference: ${booking.bookingReference}`,
        html: emailHTML
    });
};

// Send event reminder (48 hours before event)
const sendEventReminderEmail = async (booking, customer) => {
    if (!transporter) {
        throw new Error('Email service not initialized');
    }

    const bookingDate = new Date(booking.eventDate);
    const formattedDate = bookingDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const emailHTML = `
        <html>
            <head>
                <style>
                    body { font-family: 'Arial', sans-serif; color: #333; background-color: #f9f9f9; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .header { background: linear-gradient(135deg, #d4af37 0%, #e8c547 100%); color: #0a2f1c; padding: 20px; text-align: center; border-radius: 4px; }
                    .header h1 { margin: 0; font-size: 26px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎉 Your Event is Almost Here!</h1>
                    </div>
                    <div class="content">
                        <p>Hi ${customer.name},</p>
                        <p>Your ${booking.eventType} is coming up in just 48 hours! We're all set and ready to make it spectacular.</p>
                        <p><strong>Event Details:</strong></p>
                        <ul>
                            <li>📅 Date: ${formattedDate}</li>
                            <li>⏰ Duration: ${booking.eventDuration}</li>
                            <li>📍 Location: ${booking.location}</li>
                        </ul>
                        <p>If you have any last-minute questions or changes, please contact us immediately via WhatsApp or email.</p>
                        <p>We can't wait to make your event unforgettable! ✨</p>
                    </div>
                </div>
            </body>
        </html>
    `;

    return transporter.sendMail({
        from: `Emerald Pearland Events <${process.env.ADMIN_EMAIL}>`,
        to: customer.email,
        subject: `🎉 Reminder: Your ${booking.eventType} is in 2 Days!`,
        html: emailHTML
    });
};
// Email: Client Appreciation and Feedback Request
const sendClientAppreciationEmail = async (booking, customer) => {
    if (!transporter) throw new Error('Email service not initialized');

    const emailHTML = `
        <html>
            <head>
                <style>
                    body { font-family: 'Arial', sans-serif; color: #333; background-color: #f9f9f9; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); text-align: center; }
                    .logo { font-size: 24px; font-family: serif; color: #0a2f1c; margin-bottom: 20px; letter-spacing: 2px; }
                    .header { color: #d4af37; font-size: 28px; margin-bottom: 20px; font-family: serif; }
                    .content { line-height: 1.8; color: #555; font-size: 16px; margin-bottom: 30px; text-align: left; }
                    .feedback-btn { display: inline-block; background-color: #0a2f1c; color: white; padding: 14px 30px; text-decoration: none; border-radius: 4px; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; margin: 20px 0; }
                    .signature { margin-top: 40px; font-style: italic; color: #888; border-top: 1px solid #eee; padding-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="logo">EMERALD PEARLAND</div>
                    <div class="header">Thank You For Choosing Us</div>
                    <div class="content">
                        <p>Dear ${customer.name},</p>
                        <p>It was our absolute pleasure to host and organize your recent <strong>${booking.eventType}</strong>.</p>
                        <p>At Emerald Pearland Events, we strive to transform your vision into an unforgettable reality. We sincerely hope that the ambiance, coordination, and overall experience met your expectations.</p>
                        <p>Your opinion is invaluable to us as we continuously refine our luxury services. We would deeply appreciate it if you could take a brief moment to share your feedback or provide a testimonial regarding your experience.</p>
                        <div style="text-align: center;">
                            <a href="mailto:${process.env.EMAIL_USER}?subject=Feedback:%20${booking.bookingReference}" class="feedback-btn">Share Your Feedback</a>
                        </div>
                        <p>Thank you once again for entrusting us with your special day. We look forward to celebrating with you again in the future.</p>
                    </div>
                    <div class="signature">
                        <p>Warmest Regards,</p>
                        <p><strong>The Emerald Pearland Events Team</strong></p>
                    </div>
                </div>
            </body>
        </html>
    `;

    return transporter.sendMail({
        from: `Emerald Pearland Events <${process.env.ADMIN_EMAIL}>`,
        to: customer.email,
        subject: `Thank you for choosing Emerald Pearland Events - ${booking.bookingReference}`,
        html: emailHTML,
        replyTo: process.env.EMAIL_USER
    });
};

// Email: Internal Staff Feedback Request
const sendStaffFeedbackRequestEmail = async (staffEmail, staffName, booking, customMessage) => {
    if (!transporter) throw new Error('Email service not initialized');

    // Fallback if staff doesn't have an email in the DB
    if (!staffEmail) throw new Error(`Staff member ${staffName} does not have a registered email address.`);

    const emailHTML = `
        <html>
            <head>
                <style>
                    body { font-family: 'Arial', sans-serif; color: #333; background-color: #f4f4f4; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 6px; border-top: 4px solid #0a2f1c; }
                    .header { font-size: 20px; color: #0a2f1c; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
                    .content { line-height: 1.6; }
                    .message-box { background-color: #f9f9f9; border-left: 4px solid #d4af37; padding: 15px; margin: 20px 0; font-style: italic; color: #444; }
                    .meta { font-size: 13px; color: #666; background: #eee; padding: 10px; border-radius: 4px; margin-bottom: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <strong>Review Request: Client Experience & Event Feedback</strong>
                    </div>
                    <div class="content">
                        <p>Hi ${staffName},</p>
                        <p>We are reviewing the internal performance and client satisfaction for a recent event you were assigned to.</p>
                        
                        <div class="meta">
                            <strong>Event Type:</strong> ${booking.eventType}<br>
                            <strong>Booking Ref:</strong> ${booking.bookingReference}<br>
                            <strong>Date:</strong> ${new Date(booking.eventDate).toLocaleDateString()}
                        </div>

                        <p>The Admin has requested your specific feedback on the following:</p>
                        
                        <div class="message-box">
                            "${customMessage.replace(/\n/g, '<br>')}"
                        </div>
                        
                        <p>Please reply directly to this email with your insights.</p>
                        <p>Thank you for your hard work.</p>
                    </div>
                </div>
            </body>
        </html>
    `;

    return transporter.sendMail({
        from: `Emerald Pearland Tasks <${process.env.ADMIN_EMAIL}>`,
        to: staffEmail,
        subject: `Event Feedback Required: ${booking.eventType} (${booking.bookingReference})`,
        html: emailHTML,
        replyTo: process.env.ADMIN_EMAIL
    });
};

// Email: 48-Hour Pre-Event Staff Reminder
const sendStaffEventReminder = async (staff, booking, customer, role = 'Team Member') => {
    if (!transporter) throw new Error('Email service not initialized');
    if (!staff.email) return; // No email, skip

    const eventDate = new Date(booking.eventDate);
    const formattedDate = eventDate.toLocaleDateString('en-KE', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const whatsappAdminLink = process.env.ADMIN_WHATSAPP
        ? `<a href="https://wa.me/${process.env.ADMIN_WHATSAPP.replace(/\D/g, '')}" style="color:#C9A84C;">Click to WhatsApp Admin</a>`
        : '';

    const emailHTML = `
        <html><head><style>
            body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #0D2B1F, #1a4a35); color: white; padding: 32px; text-align: center; }
            .header h1 { font-family: serif; font-size: 24px; margin: 0; letter-spacing: 2px; color: #C9A84C; }
            .header p { margin: 8px 0 0; color: #a0c0a8; font-size: 14px; }
            .alert-banner { background: #C9A84C; color: #0D2B1F; text-align: center; padding: 12px; font-weight: bold; font-size: 16px; letter-spacing: 1px; }
            .body { padding: 32px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
            .info-item { background: #f9f9f9; border-left: 3px solid #C9A84C; padding: 12px 16px; border-radius: 4px; }
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
                    <div class="info-grid">
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
                        <div class="info-item" style="grid-column: span 2;">
                            <div class="info-label">Venue / Location</div>
                            <div class="info-value">${booking.location}</div>
                        </div>
                        <div class="info-item" style="grid-column: span 2;">
                            <div class="info-label">Guests Expected</div>
                            <div class="info-value">${booking.guests} guests</div>
                        </div>
                    </div>
                    <p style="color:#666; font-size:14px;">Please ensure you are on-site at least 1 hour before the event starts. Contact the admin team immediately if you have any conflicts.</p>
                    ${whatsappAdminLink ? `<p style="text-align:center; margin-top:20px;">${whatsappAdminLink}</p>` : ''}
                </div>
                <div class="footer">
                    <p>Emerald Pearland Events &mdash; Internal Staff Communication</p>
                    <p>Do not share this email. For queries, reply directly or use WhatsApp.</p>
                </div>
            </div>
        </body></html>
    `;

    return transporter.sendMail({
        from: `Emerald Pearland Events <${process.env.ADMIN_EMAIL}>`,
        to: staff.email,
        subject: `⚡ 48hr Alert: You are assigned to ${booking.eventType} on ${formattedDate}`,
        html: emailHTML
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
    sendStaffEventReminder
};
