const Brevo = require('@getbrevo/brevo');

// ═══════════════════════════════════════════════════════════
// EMAIL SERVICE FOR BOOKING NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

let apiInstance;

const initializeEmailService = () => {
    const defaultClient = Brevo.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = process.env.BREVO_API_KEY;
    apiInstance = new Brevo.TransactionalEmailsApi();
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
    if (!apiInstance) {
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

    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { name: 'Emerald Pearland Events', email: process.env.ADMIN_EMAIL };
    sendSmtpEmail.to = [{ email: process.env.ADMIN_EMAIL }];
    sendSmtpEmail.subject = `🎉 NEW EVENT BOOKING REQUEST - ${booking.bookingReference}`;
    sendSmtpEmail.htmlContent = emailHTML;
    return apiInstance.sendTransacEmail(sendSmtpEmail);
};

// Email 2: Send to client
const sendClientBookingConfirmation = async (booking, customer) => {
    if (!apiInstance) {
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

    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { name: 'Emerald Pearland Events', email: process.env.ADMIN_EMAIL };
    sendSmtpEmail.to = [{ email: customer.email, name: customer.name }];
    sendSmtpEmail.subject = `✨ Booking Request Received - Reference: ${booking.bookingReference}`;
    sendSmtpEmail.htmlContent = emailHTML;
    return apiInstance.sendTransacEmail(sendSmtpEmail);
};

// Send follow-up email (24 hours after booking)
const sendFollowUpEmail = async (booking, customer) => {
    if (!apiInstance) {
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

    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { name: 'Emerald Pearland Events', email: process.env.ADMIN_EMAIL };
    sendSmtpEmail.to = [{ email: customer.email, name: customer.name }];
    sendSmtpEmail.subject = `Follow-up: Your ${booking.eventType} - Reference: ${booking.bookingReference}`;
    sendSmtpEmail.htmlContent = emailHTML;
    return apiInstance.sendTransacEmail(sendSmtpEmail);
};

// Send event reminder (48 hours before event)
const sendEventReminderEmail = async (booking, customer) => {
    if (!apiInstance) {
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

    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { name: 'Emerald Pearland Events', email: process.env.ADMIN_EMAIL };
    sendSmtpEmail.to = [{ email: customer.email, name: customer.name }];
    sendSmtpEmail.subject = `🎉 Reminder: Your ${booking.eventType} is in 2 Days!`;
    sendSmtpEmail.htmlContent = emailHTML;
    return apiInstance.sendTransacEmail(sendSmtpEmail);
};

module.exports = {
    initializeEmailService,
    sendBusinessBookingNotification,
    sendClientBookingConfirmation,
    sendFollowUpEmail,
    sendEventReminderEmail
};
