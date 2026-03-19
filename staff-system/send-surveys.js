require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    // Register all models first
    require('./models/Staff');
    require('./models/Assignment');
    const S = require('./models/Survey');
    const A = require('./models/Assignment');
    const e = require('./services/emailService');

    const appUrl = process.env.STAFF_APP_URL || 'http://localhost:3001';
    const surveys = await S.find({ submitted: false }).populate('respondent_id', 'name email').lean();

    let sent = 0;
    for (const s of surveys) {
        if (!s.respondent_id?.email) {
            console.log('Skipping - no email for:', s.respondent_name);
            continue;
        }
        const assignment = await A.findById(s.assignment_id).select('title').lean();
        const surveyUrl = `${appUrl}/portal/staff/survey/${s.token}`;
        const body = `
            <p>Dear <strong>${s.respondent_id.name}</strong>,</p>
            <p>Please complete your post-event survey for <strong>${assignment?.title || 'your recent event'}</strong>.</p>
            <p>Your feedback helps us improve future events.</p>
            <div style="text-align:center;margin:24px 0;">
                <a href="${surveyUrl}" style="display:inline-block;background:#0D2B1F;color:#C9A84C;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;letter-spacing:1px;">COMPLETE SURVEY</a>
            </div>
            <p style="font-size:12px;color:#888;">Or copy this link: <a href="${surveyUrl}">${surveyUrl}</a></p>
        `;
        try {
            await e.sendEmail({
                to: [{ email: s.respondent_id.email, name: s.respondent_id.name }],
                subject: `Post-Event Survey: ${assignment?.title || 'Recent Event'} | Emerald Pearland Events`,
                htmlContent: e.brandedWrapper('POST-EVENT SURVEY', body)
            });
            console.log('Sent to:', s.respondent_id.email);
            sent++;
        } catch (err) {
            console.log('Failed for:', s.respondent_id.email, '-', err.message);
        }
    }
    console.log('Total sent:', sent);
    process.exit();
});
