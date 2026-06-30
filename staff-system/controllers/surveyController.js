const respond = require('../../utils/respond');
/**
 * surveyController.js — Phase 11: Post-Event Survey System
 * Staff, Supervisor, and Client survey management
 */
const Survey     = require('../models/Survey');
const Assignment = require('../models/Assignment');
const Staff      = require('../models/Staff');
const crypto     = require('crypto');
const emailService = require('../services/emailService');
const { notificationQueue } = require('../../config/queues');
const queueMode = (process.env.QUEUE_MODE || 'inline').toLowerCase();

// Default question templates
const SURVEY_TEMPLATES = {
    Staff: [
        { question: 'How would you rate today\'s event overall?', answer_type: 'rating' },
        { question: 'Was the event location clearly communicated?', answer_type: 'boolean' },
        { question: 'Were you provided adequate equipment and resources?', answer_type: 'boolean' },
        { question: 'How would you rate supervisor support on the day?', answer_type: 'rating' },
        { question: 'Any issues or concerns to report?', answer_type: 'text' },
        { question: 'Would you work this type of event again?', answer_type: 'boolean' },
    ],
    Supervisor: [
        { question: 'How prepared was your team for this event?', answer_type: 'rating' },
        { question: 'Were there any staff who underperformed?', answer_type: 'boolean' },
        { question: 'Rate the logistics coordination before the event.', answer_type: 'rating' },
        { question: 'Were there any safety or security concerns?', answer_type: 'boolean' },
        { question: 'How would you rate communication with admin during the event?', answer_type: 'rating' },
        { question: 'Additional notes or recommendations:', answer_type: 'text' },
    ],
    Client: [
        { question: 'How satisfied were you with our staff overall?', answer_type: 'rating' },
        { question: 'Were all staff members professional and punctual?', answer_type: 'boolean' },
        { question: 'How would you rate the quality of service?', answer_type: 'rating' },
        { question: 'Were your specific requirements fulfilled?', answer_type: 'boolean' },
        { question: 'Would you recommend Emerald Pearland Events?', answer_type: 'boolean' },
        { question: 'Any comments or suggestions for improvement?', answer_type: 'text' },
    ]
};

// ── GET /staff/survey/:token — Staff fills survey ─────────────────────────────
exports.getSurveyPage = async (req, res) => {
    try {
        const survey = await Survey.findOne({ token: req.params.token })
            .populate({
                path: 'assignment_id',
                select: 'title date location accepted_staff_ids',
                populate: { path: 'accepted_staff_ids', select: 'name' }
            })
            .lean();

        if (!survey) return res.status(404).render('auth/login', { error: 'Survey link invalid or expired.', message: null });
        if (survey.submitted) return res.render('staff/survey', { survey, submitted: true, user: req.user || null, title: 'Survey Already Submitted' });

        res.render('staff/survey', { survey, submitted: false, user: req.user || null, title: 'Post-Event Survey' });
    } catch (err) {
        res.status(500).send('Error loading survey: ' + err.message);
    }
};

// ── POST /staff/survey/:token/submit — Submit survey ─────────────────────────
exports.submitSurvey = async (req, res) => {
    try {
        const survey = await Survey.findOne({ token: req.params.token });
        if (!survey) return respond(res, 404, { success: false, error: 'Invalid survey' });
        if (survey.submitted) return respond(res, 400, { success: false, error: 'Already submitted' });

        const { responses, overall_rating } = req.body;
        const parsedResponses = typeof responses === 'string' ? JSON.parse(responses) : responses;

        survey.responses    = parsedResponses || [];
        survey.overall_rating = parseInt(overall_rating) || null;
        survey.submitted    = true;
        survey.submitted_at = new Date();
        await survey.save();

        respond(res, 200, { success: true, message: 'Thank you for your feedback!' });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message });
    }
};

// ── GET /admin/surveys — Survey analytics page ────────────────────────────────
exports.getSurveyAnalyticsPage = async (req, res) => {
    try {
        const { assignment_id, type } = req.query;
        const filter = { submitted: true };
        if (assignment_id) filter.assignment_id = assignment_id;
        if (type) filter.type = type;

        const surveys = await Survey.find(filter)
            .populate('assignment_id', 'title date')
            .populate('respondent_id', 'name')
            .sort({ submitted_at: -1 })
            .lean();

        // Aggregate average ratings
        const ratingsByType = {};
        ['Staff', 'Supervisor', 'Client'].forEach(t => {
            const typed = surveys.filter(s => s.type === t && s.overall_rating);
            ratingsByType[t] = typed.length > 0
                ? (typed.reduce((sum, s) => sum + s.overall_rating, 0) / typed.length).toFixed(1)
                : null;
        });

        const assignments = await Assignment.find().select('title date').sort({ date: -1 }).lean();

        res.render('admin/survey-analytics', {
            user:         req.user,
            currentPage:  'surveys',
            surveys,
            ratingsByType,
            assignments,
            query:        req.query,
            title:        'Survey Analytics'
        });
    } catch (err) {
        res.status(500).send('Error loading surveys: ' + err.message);
    }
};

// ── Helper: Create survey tokens for all staff on an assignment ───────────────
exports.createSurveysForAssignment = async (assignment) => {
    try {
        const existing = await Survey.find({ assignment_id: assignment._id, type: 'Staff' }).lean();
        const existingStaffIds = existing
            .map(s => s.respondent_id?.toString())
            .filter(Boolean);

        const newStaff = (assignment.accepted_staff_ids || [])
            .filter(sid => !existingStaffIds.includes(sid.toString()));

        for (const staffId of newStaff) {
            const staff = await Staff.findById(staffId).select('name').lean();
            await Survey.create({
                type:           'Staff',
                assignment_id:  assignment._id,
                respondent_id:  staffId,
                respondent_name: staff?.name || 'Staff',
                responses:      SURVEY_TEMPLATES.Staff.map(q => ({ ...q, answer: null })),
                token:          crypto.randomBytes(32).toString('hex')
            });
        }

        // Supervisor survey
        if (assignment.supervisor_id) {
            const supExists = await Survey.findOne({ assignment_id: assignment._id, type: 'Supervisor', respondent_id: assignment.supervisor_id });
            if (!supExists) {
                const sup = await Staff.findById(assignment.supervisor_id).select('name').lean();
                await Survey.create({
                    type:           'Supervisor',
                    assignment_id:  assignment._id,
                    respondent_id:  assignment.supervisor_id,
                    respondent_name: sup?.name || 'Supervisor',
                    responses:      SURVEY_TEMPLATES.Supervisor.map(q => ({ ...q, answer: null })),
                    token:          crypto.randomBytes(32).toString('hex')
                });
            }
        }

        // Client survey
        if (assignment.client_email) {
            const clientExists = await Survey.findOne({ assignment_id: assignment._id, type: 'Client' });
            if (!clientExists) {
                await Survey.create({
                    type:           'Client',
                    assignment_id:  assignment._id,
                    respondent_name: assignment.client_name || 'Client',
                    responses:      SURVEY_TEMPLATES.Client.map(q => ({ ...q, answer: null })),
                    token:          crypto.randomBytes(32).toString('hex')
                });
            }
        }

        // Email survey links to each staff member
        try {
            const appUrl = process.env.STAFF_APP_URL || 'http://localhost:3001';
            const allSurveys = await Survey.find({ assignment_id: assignment._id, submitted: false })
                .populate('respondent_id', 'name email').lean();

            for (const survey of allSurveys) {
                if (!survey.respondent_id?.email) continue;
                const surveyUrl = `${appUrl}/portal/staff/survey/${survey.token}`;
                const body = `
                    <p>Dear <strong>${survey.respondent_id.name}</strong>,</p>
                    <p>The event <strong>${assignment.title}</strong> has been completed. Please take a moment to fill in your post-event survey.</p>
                    <p>Your feedback helps us improve future events.</p>
                    <div style="text-align:center;margin:24px 0;">
                        <a href="${surveyUrl}" style="display:inline-block;background:#0D2B1F;color:#C9A84C;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:700;letter-spacing:1px;">COMPLETE SURVEY</a>
                    </div>
                    <p style="font-size:12px;color:#888;">Or copy this link: <a href="${surveyUrl}">${surveyUrl}</a></p>
                `;
                if (queueMode === 'async') {
                    await notificationQueue.add('email', {
                        type: 'generic.email',
                        payload: {
                            to: [{ email: survey.respondent_id.email, name: survey.respondent_id.name }],
                            subject: `Post-Event Survey: ${assignment.title} | Emerald Pearland Events`,
                            htmlContent: body,
                            templateTitle: 'POST-EVENT SURVEY'
                        }
                    });
                } else {
                    await emailService.sendEmail({
                        to: [{ email: survey.respondent_id.email, name: survey.respondent_id.name }],
                        subject: `Post-Event Survey: ${assignment.title} | Emerald Pearland Events`,
                        htmlContent: emailService.brandedWrapper
                            ? emailService.brandedWrapper('POST-EVENT SURVEY', body)
                            : body
                    });
                }
            }
        } catch (emailErr) {
            console.log('[surveyController] Survey email error (non-critical):', emailErr.message);
        }

        console.log(`[surveyController] Surveys created for assignment: ${assignment.title}`);
    } catch (err) {
        console.error('[surveyController] createSurveysForAssignment error:', err);
    }
};
