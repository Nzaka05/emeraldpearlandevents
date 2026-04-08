/**
const respond = require('../../utils/respond');
 * plannerController.js — Phase 7: Event Planners Directory
 * CRUD for external event planner / organiser contacts
 */
const EventPlanner = require('../models/EventPlanner');
const Assignment   = require('../models/Assignment');
const AuditLog     = require('../models/AuditLog');

// ── GET /admin/planners — Render planners page ────────────────────────────────
exports.getPlannersPage = async (req, res) => {
    try {
        const { search, event_type, status } = req.query;
        const filter = {};

        if (status) filter.status = status;
        if (event_type) filter.event_types = event_type;
        if (search) filter.$text = { $search: search };

        const planners = await EventPlanner.find(filter)
            .populate('linked_assignments', 'title date status')
            .sort({ createdAt: -1 })
            .lean();

        const assignments = await Assignment.find({ status: 'Active' })
            .select('title date').lean();

        const eventTypes = ['Wedding', 'Corporate', 'Birthday', 'Concert', 'Conference',
                           'Exhibition', 'Sports', 'Private', 'Other'];

        res.render('admin/planners', {
            user:        req.user,
            currentPage: 'planners',
            planners,
            assignments,
            eventTypes,
            query:       req.query,
            title:       'Event Planners Directory'
        });
    } catch (err) {
        console.error('[plannerController] getPlannersPage error:', err);
        res.status(500).send('Error loading planners: ' + err.message);
    }
};

// ── POST /admin/planners — Create planner ─────────────────────────────────────
exports.createPlanner = async (req, res) => {
    try {
        const { name, company, phone, email, event_types, notes } = req.body;

        const planner = await EventPlanner.create({
            name, company, phone, email,
            event_types: Array.isArray(event_types) ? event_types : (event_types ? [event_types] : []),
            notes
        });

        await AuditLog.create({
            user_id:   req.user._id,
            user_name: req.user.name,
            action:    'CREATE_PLANNER',
            details:   `Created planner: ${name}`,
            ip_address: req.ip
        });

        respond(res, 200, { success: true, planner });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message });
    }
};

// ── PUT /admin/planners/:id — Update planner ──────────────────────────────────
exports.updatePlanner = async (req, res) => {
    try {
        const { name, company, phone, email, event_types, notes, status, rating } = req.body;

        const planner = await EventPlanner.findByIdAndUpdate(
            req.params.id,
            {
                name, company, phone, email,
                event_types: Array.isArray(event_types) ? event_types : (event_types ? [event_types] : []),
                notes, status,
                rating: rating ? parseFloat(rating) : undefined,
                updatedAt: new Date()
            },
            { new: true }
        ).lean();

        if (!planner) return respond(res, 404, { success: false, error: 'Planner not found' });

        respond(res, 200, { success: true, planner });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message });
    }
};

// ── DELETE /admin/planners/:id — Delete planner ───────────────────────────────
exports.deletePlanner = async (req, res) => {
    try {
        const planner = await EventPlanner.findByIdAndDelete(req.params.id);
        if (!planner) return respond(res, 404, { success: false, error: 'Not found' });

        await AuditLog.create({
            user_id:   req.user._id,
            user_name: req.user.name,
            action:    'DELETE_PLANNER',
            details:   `Deleted planner: ${planner.name}`,
            ip_address: req.ip
        });

        respond(res, 200, { success: true });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message });
    }
};

// ── POST /admin/planners/:id/link/:assignmentId — Link to event ───────────────
exports.linkPlannerToAssignment = async (req, res) => {
    try {
        const planner = await EventPlanner.findById(req.params.id);
        if (!planner) return respond(res, 404, { success: false, error: 'Not found' });

        const assignId = req.params.assignmentId;
        if (!planner.linked_assignments.includes(assignId)) {
            planner.linked_assignments.push(assignId);
            await planner.save();
        }

        respond(res, 200, { success: true });
    } catch (err) {
        respond(res, 500, { success: false, error: err.message });
    }
};
