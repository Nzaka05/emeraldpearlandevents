const fs = require('fs');

const filePath = 'staff-system/services/aiAssistantService.js';
let content = fs.readFileSync(filePath, 'utf8');

// ─── 1. Add smart lookup + messaging functions ────────────────────────────────
const smartFunctions = `
async function pearlFindPersonByName(name) {
    try {
        const db = require("mongoose").connection.db;
        const regex = new RegExp(name.split(' ').join('|'), 'i');

        // Search staff
        const staff = await db.collection("staffs").findOne({
            $or: [{ name: { $regex: regex } }, { firstname: { $regex: regex } }]
        });
        if (staff) return {
            type: 'staff',
            name: staff.name || (staff.firstname + ' ' + staff.lastname),
            email: staff.email,
            phone: staff.phone,
            role: staff.role || staff.category,
            id: staff._id.toString()
        };

        // Search customers
        const customer = await db.collection("customers").findOne({ name: { $regex: regex } });
        if (customer) return {
            type: 'customer',
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            id: customer._id.toString()
        };

        return null;
    } catch (e) { return null; }
}

async function pearlSendSmartEmail(to, subject, body, fromName) {
    const emailService = require('./emailService');
    try {
        await emailService.sendEmail({
            to: [{ email: to, name: fromName || 'Valued Client' }],
            subject,
            htmlContent: \`<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:30px;background:#fff;">
                <div style="border-bottom:2px solid #059669;padding-bottom:16px;margin-bottom:24px;">
                    <h2 style="color:#059669;margin:0;font-size:1.4rem;">Emerald Pearland Events</h2>
                    <p style="color:#666;font-size:0.85rem;margin:4px 0 0;">Premium Event Management</p>
                </div>
                <div style="color:#333;line-height:1.8;font-size:1rem;">\${body}</div>
                <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;">
                    <p style="color:#059669;font-weight:bold;margin:0;">Emerald Pearland Events Team</p>
                    <p style="color:#888;font-size:0.8rem;margin:4px 0 0;">Sent via PEARL AI Assistant</p>
                </div>
            </div>\`
        });
        return true;
    } catch (e) {
        console.error('[PEARL Email]', e.message);
        // Fallback to nodemailer
        try {
            const nodemailer = require('nodemailer');
            const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD } });
            await t.sendMail({
                from: \`Emerald Pearland Events <\${process.env.EMAIL_USER}>\`,
                to, subject,
                html: \`<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:30px;">
                    <h2 style="color:#059669;">Emerald Pearland Events</h2>
                    <div style="color:#333;line-height:1.8;">\${body}</div>
                    <hr style="border-color:#059669;"><p style="color:#888;font-size:12px;">Sent by PEARL</p>
                </div>\`
            });
            return true;
        } catch (e2) { return false; }
    }
}

async function pearlGetAllStaffContacts() {
    try {
        const db = require("mongoose").connection.db;
        const staff = await db.collection("staffs").find({ status: "Active" })
            .project({ name: 1, email: 1, phone: 1, category: 1, role: 1, availability_status: 1, title: 1 })
            .toArray();
        return staff.map(s => ({
            id: s._id.toString(),
            name: s.name || (s.firstname + ' ' + s.lastname),
            email: s.email,
            phone: s.phone,
            role: s.title || s.category || s.role,
            availability: s.availability_status
        }));
    } catch (e) { return []; }
}

async function pearlGetAllCustomers() {
    try {
        const db = require("mongoose").connection.db;
        const customers = await db.collection("customers").find({})
            .sort({ createdAt: -1 }).limit(50)
            .project({ name: 1, email: 1, phone: 1, createdAt: 1 })
            .toArray();
        return customers.map(c => ({
            id: c._id.toString(),
            name: c.name,
            email: c.email,
            phone: c.phone,
            since: c.createdAt
        }));
    } catch (e) { return []; }
}
`;

// Insert before processAssistantQuery
content = content.replace(
    'async function processAssistantQuery(',
    smartFunctions + '\nasync function processAssistantQuery('
);

// ─── 2. Add Admin messaging action handler ────────────────────────────────────
const messagingHandler = `
    // ── ADMIN MESSAGING & LOOKUP HANDLER ─────────────────────────────────────
    if (role === 'Admin') {
        const lower = sanitized.toLowerCase();

        // EMAIL BY NAME: "email [name] [message]" or "send [name] an email about [topic]"
        const emailByName = sanitized.match(/(?:email|message|send.*?to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:about|saying|that|:)?\s*(.+)/i);
        const directEmail = sanitized.match(/send.*?email.*?to\s+([\w@.\-]+@[\w.\-]+)\s*(.*)/i);

        if (directEmail) {
            // Direct email to address
            const emailAddr = directEmail[1];
            const message = directEmail[2].trim() || 'Message from Emerald Pearland Events';
            const sent = await pearlSendSmartEmail(emailAddr, 'Message from Emerald Pearland Events', message, '');
            const reply = sent
                ? \`Email sent successfully to \${emailAddr}.\`
                : \`Failed to send email to \${emailAddr}. Please check your email configuration.\`;
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }

        if (emailByName && !lower.includes('@')) {
            const personName = emailByName[1];
            const messageBody = emailByName[2];
            const person = await pearlFindPersonByName(personName);
            if (person && person.email) {
                const subject = lower.includes('booking') ? 'Your Booking with Emerald Pearland Events'
                    : lower.includes('payment') ? 'Payment Information - Emerald Pearland Events'
                    : lower.includes('event') ? 'Your Upcoming Event - Emerald Pearland Events'
                    : 'Message from Emerald Pearland Events';
                const sent = await pearlSendSmartEmail(person.email, subject, messageBody, person.name);
                const reply = sent
                    ? \`Email sent to \${person.name} (\${person.email}) successfully.\`
                    : \`Found \${person.name} but failed to send email. Their address is: \${person.email}\`;
                await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
                return { reply, response: reply, summary: reply, recommendedActions: [] };
            } else if (person) {
                const reply = \`Found \${person.name} but they have no email address on file. Phone: \${person.phone || 'N/A'}\`;
                await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
                return { reply, response: reply, summary: reply, recommendedActions: [] };
            }
        }

        // LOOKUP PERSON: "find [name]" or "who is [name]" or "contact for [name]"
        const lookupMatch = sanitized.match(/(?:find|who is|contact for|look up|details for|info on)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
        if (lookupMatch) {
            const person = await pearlFindPersonByName(lookupMatch[1]);
            if (person) {
                const reply = \`\${person.name} (\${person.type}):\\n• Email: \${person.email || 'N/A'}\\n• Phone: \${person.phone || 'N/A'}\\n• Role: \${person.role || 'N/A'}\${person.availability ? '\\n• Availability: ' + person.availability : ''}\`;
                await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
                return { reply, response: reply, summary: reply, recommendedActions: [] };
            }
        }

        // LIST ALL STAFF CONTACTS
        if (lower.includes('all staff') && (lower.includes('contact') || lower.includes('email') || lower.includes('phone') || lower.includes('list'))) {
            const staffList = await pearlGetAllStaffContacts();
            const reply = staffList.length
                ? \`All Active Staff (\${staffList.length}):\\n\` + staffList.map(s => \`• \${s.name} - \${s.role || 'Staff'} | \${s.email || 'no email'} | \${s.phone || 'no phone'} | \${s.availability || 'Unknown'}\`).join('\\n')
                : 'No active staff found.';
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }

        // LIST ALL CUSTOMERS
        if ((lower.includes('all customer') || lower.includes('all client')) && (lower.includes('list') || lower.includes('show') || lower.includes('contact'))) {
            const customers = await pearlGetAllCustomers();
            const reply = customers.length
                ? \`All Customers (\${customers.length} most recent):\\n\` + customers.map(c => \`• \${c.name} | \${c.email || 'no email'} | \${c.phone || 'no phone'}\`).join('\\n')
                : 'No customers found.';
            await AIConversationLog.create({ user_id: userId, role, query: sanitized, response: reply, context_used: {} }).catch(() => {});
            return { reply, response: reply, summary: reply, recommendedActions: [] };
        }
    }
    // ── END ADMIN MESSAGING HANDLER ──────────────────────────────────────────
`;

// Insert after the existing PEARL ACTION HANDLER closing comment
content = content.replace(
    '    // ── END ACTION HANDLER ───────────────────────────────────────────────────',
    '    // ── END ACTION HANDLER ───────────────────────────────────────────────────\n' + messagingHandler
);

// ─── 3. Update system prompt for Admin role ───────────────────────────────────
content = content.replace(
    'PEARL BOOKING ACTIONS (Admin/Supervisor only):',
    `ADMIN MESSAGING COMMANDS (Admin only):
- "email [person name] about [topic/message]" → finds person and emails them
- "send email to [email@address.com] [message]" → direct email
- "find [name]" / "who is [name]" → looks up staff or customer contact details
- "list all staff contacts" → shows all staff with emails and phones
- "list all customers" → shows all customers with contacts

PEARL BOOKING ACTIONS (Admin/Supervisor only):`
);

// ─── 4. Expand getMainPortalData for Admin to include more customer details ───
content = content.replace(
    `\${portalData ? \``,
    `\${portalData ? \`
- Admin Commands Available: email clients/staff by name, look up contacts, list all staff/customers\n` + '`\n    : "") + (portalData ? `'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done - Admin Pearl now has full messaging + contact lookup');

const v = fs.readFileSync(filePath, 'utf8');
console.log('pearlFindPersonByName exists:', v.includes('pearlFindPersonByName'));
console.log('pearlSendSmartEmail exists:', v.includes('pearlSendSmartEmail'));
console.log('Messaging handler exists:', v.includes('ADMIN MESSAGING'));
console.log('Admin commands in prompt:', v.includes('ADMIN MESSAGING COMMANDS'));
