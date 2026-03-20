/**
 * eventLifecycleService.js
 * ===================================================================
 * Event Lifecycle State Machine — Emerald Pearl Events Platform
 * -------------------------------------------------------------------
 *
 * Valid lifecycle states and transitions:
 *
 *   PLANNED ──► STAFFING ──► READY ──► LIVE ──► COMPLETED ──► FINANCE_SETTLED
 *
 * Guards:
 *   - PLANNED  → STAFFING :  at least 1 staff accepted
 *   - STAFFING → READY    :  required_staff_count filled
 *   - READY    → LIVE     :  supervisor geo anchor must be dropped
 *   - LIVE     → COMPLETED   :  all accepted staff have clocked out
 *   - COMPLETED   → FINANCE_SETTLED : all staff_payments status Sent/Received/Disputed
 *
 * Backward compat:
 *   The existing Assignment.status enum ('Active', 'Completed', 'Cancelled') is
 *   preserved for the Admin UI. lifecycle_state is stored in a SEPARATE field
 *   so the old status field keeps working unchanged.
 * ===================================================================
 */

'use strict';

const Assignment = require('../models/Assignment');
const EventTeam  = require('../models/EventTeam');
const Attendance = require('../models/Attendance');
const AuditLog   = require('../models/AuditLog');
const StaffPerformanceProfile = require('../models/StaffPerformanceProfile');
const SupervisorRatingProfile = require('../models/SupervisorRatingProfile');
const EventPerformanceBaseline = require('../models/EventPerformanceBaseline');

// ── CLIENT PORTAL INTEGRATION (WEBHOOKS) ──
const axios = require('axios');
const sendWebhook = async (endpoint, payload) => {
    try {
        const url = process.env.MAIN_PORTAL_URL || 'http://localhost:3000';
        const secret = process.env.JWT_SECRET || 'fallback_secret_key';
        await axios.post(`${url}/internal/webhook/${endpoint}`, payload, {
            headers: { 'X-Internal-Secret': secret }
        });
    } catch (err) {
        console.error(`[Webhook] Failed to notify ${endpoint}:`, err.message);
    }
};
// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE STATES
// ─────────────────────────────────────────────────────────────────────────────

const LIFECYCLE_STATES = Object.freeze({
    PLANNED:         'PLANNED',
    STAFFING:        'STAFFING',
    READY:           'READY',
    LIVE:            'LIVE',
    COMPLETED:       'COMPLETED',
    FINANCE_SETTLED: 'FINANCE_SETTLED'
});

/**
 * Allowed successor states for each lifecycle state.
 * An event may only transition to states explicitly listed here.
 */
const VALID_TRANSITIONS = Object.freeze({
    PLANNED:         ['STAFFING'],
    STAFFING:        ['READY', 'PLANNED'],          // Allow rollback to PLANNED (e.g. reassign)
    READY:           ['LIVE', 'STAFFING'],           // Allow rollback to STAFFING
    LIVE:            ['COMPLETED'],
    COMPLETED:       ['FINANCE_SETTLED'],
    FINANCE_SETTLED: []                              // Terminal state
});

// ─────────────────────────────────────────────────────────────────────────────
// GUARD CONDITIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-transition guard functions.
 * Each guard returns { ok: boolean, reason?: string }.
 */
const TRANSITION_GUARDS = {
    'PLANNED→STAFFING':  async (assignment) => {
        if (assignment.accepted_staff_ids.length === 0) {
            return { ok: false, reason: 'At least one staff member must accept before moving to STAFFING' };
        }
        return { ok: true };
    },

    'STAFFING→READY': async (assignment) => {
        const filled = assignment.accepted_staff_ids.length;
        const required = assignment.required_staff_count || 1;
        if (filled < required) {
            return { ok: false, reason: `Need ${required} staff, currently ${filled} accepted` };
        }
        return { ok: true };
    },

    'READY→LIVE': async (assignment) => {
        const team = await EventTeam.findOne({ event_id: assignment._id }).select('geoAnchor supervisor_id');
        if (!team || !team.geoAnchor) {
            return { ok: false, reason: 'Supervisor must drop a geo anchor before going LIVE' };
        }
        if (!team.supervisor_id) {
            return { ok: false, reason: 'Supervisor must be assigned before going LIVE' };
        }
        return { ok: true };
    },

    'LIVE→COMPLETED': async (assignment) => {
        const openClockIns = await Attendance.countDocuments({
            assignment_id: assignment._id,
            clock_out: null,
            status: { $in: ['Clocked In', 'On Time'] }
        });
        if (openClockIns > 0) {
            return { ok: false, reason: `${openClockIns} staff member(s) have not clocked out yet` };
        }
        return { ok: true };
    },

    'COMPLETED→FINANCE_SETTLED': async (assignment) => {
        const payments = assignment.staff_payments || [];
        if (payments.length === 0) return { ok: true }; // No payments needed
        const unsettled = payments.filter(p => !['Sent', 'Received', 'Disputed'].includes(p.status));
        if (unsettled.length > 0) {
            return { ok: false, reason: `${unsettled.length} payment(s) still pending` };
        }
        return { ok: true };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CORE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transition an assignment to a new lifecycle state.
 * Enforces valid successor states and runs guard conditions.
 *
 * @param {string} assignmentId   - Mongoose ObjectId
 * @param {string} targetState    - One of LIFECYCLE_STATES
 * @param {string} performedById  - Staff/Admin ObjectId (for audit log)
 * @param {{ force?: boolean, reason?: string }} [opts]
 *   force: skip guard checks (admin override) — audit logged
 * @returns {{ assignment, previousState, newState }}
 */
exports.transition = async (assignmentId, targetState, performedById, opts = {}) => {
    if (!LIFECYCLE_STATES[targetState]) {
        throw new Error(`Unknown lifecycle state: "${targetState}". Valid states: ${Object.keys(LIFECYCLE_STATES).join(', ')}`);
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new Error('Assignment not found');

    // Initialise state for legacy records that don't have it yet
    const previousState = assignment.lifecycle_state || 'PLANNED';

    if (previousState === targetState) {
        return { assignment, previousState, newState: targetState, noOp: true };
    }

    // ── Validate transition is allowed ────────────────────────────────────────
    const allowed = VALID_TRANSITIONS[previousState] || [];
    if (!allowed.includes(targetState)) {
        throw new Error(
            `Invalid lifecycle transition: ${previousState} → ${targetState}. ` +
            `Allowed from ${previousState}: [${allowed.join(', ') || 'none — terminal state'}]`
        );
    }

    // ── Run guards unless force-overriding ────────────────────────────────────
    const guardKey = `${previousState}→${targetState}`;
    const guard = TRANSITION_GUARDS[guardKey];
    if (guard && !opts.force) {
        const result = await guard(assignment);
        if (!result.ok) {
            throw new Error(`Transition blocked: ${result.reason}`);
        }
    }

    // ── Apply lifecycle_state update ───────────────────────────────────────────
    assignment.lifecycle_state = targetState;

    // ── Client Portal: READY Hook ──────────────────────────────────────────────
    if (targetState === 'READY' && assignment.client_id) {
        try {
            await sendWebhook('team-ready', { eventId: assignment._id });
        } catch (err) {
            console.error('[Client Portal] READY hook failed:', err);
        }
    }

    // ── Client Portal: LIVE Hook ───────────────────────────────────────────────
    if (targetState === 'LIVE' && assignment.client_id) {
        try {
            await sendWebhook('event-started', { eventId: assignment._id });
            if (global.io) {
                global.io.to(`Client:${assignment.client_id}`).emit('client:event_live', {
                    event_id: assignment._id,
                    event_name: assignment.title,
                    message: 'Your event has started'
                });
            }
        } catch (err) {
            console.error('[Client Portal] LIVE hook failed:', err);
        }
    }

    // ── Sync legacy Assignment.status for backward compat ─────────────────────
    const STATUS_SYNC = {
        LIVE:            'Active',
        COMPLETED:       'Completed',
        FINANCE_SETTLED: 'Completed'
    };
    if (STATUS_SYNC[targetState]) {
        assignment.status = STATUS_SYNC[targetState];
    }

    await assignment.save();

    // ── Capture Performance Baseline Snapshot on Event Completion (COMPLETED matches status=Completed) ─
    if (targetState === 'COMPLETED') {
        try {
            const team = await EventTeam.findOne({ event_id: assignment._id }).lean();
            const assignedStaffIds = [...(assignment.accepted_staff_ids || []), ...(assignment.assigned_staff_ids || [])];
            
            const scoresMap = {};
            if (assignedStaffIds.length > 0) {
                const profiles = await StaffPerformanceProfile.find({ staff_id: { $in: assignedStaffIds } }).lean();
                profiles.forEach(p => {
                    scoresMap[p.staff_id.toString()] = p.average_overall_score || 0;
                });
            }
            
            let supRating = null;
            let supId = team ? team.supervisor_id : null;
            if (supId) {
                const supProfile = await SupervisorRatingProfile.findOne({ staff_id: supId }).lean();
                if (supProfile) supRating = supProfile.supervisor_rating || null;
            }

            await EventPerformanceBaseline.findOneAndUpdate(
                { event_id: assignment._id },
                {
                    $set: {
                        snapshot_taken_at: new Date(),
                        assigned_staff_ids: assignedStaffIds,
                        staff_performance_scores_at_time: scoresMap,
                        supervisor_id: supId,
                        supervisor_rating_at_time: supRating,
                        notes: 'pre-review baseline'
                    }
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            console.error('[EventLifecycleService] Failed to capture performance baseline:', err);
        }

        // ── Automated ETR Trigger & Client Thank You ─────────────────────────────────
        setImmediate(async () => {
            try {
                // Step 1: Send thank you message to client
                try {
                    if (assignment.client_id) {
                        await sendWebhook('event-complete', { eventId: assignment._id });
                    }
                } catch (err) {
                    console.error('[ETR Auto] Step 1 Failed (Client Thank You Email Hook):', err);
                }

                // Use the performedById or fallback admin for generatedBy
                const systemAdminId = performedById || null;
                let etrService = null; try { etrService = require('../../server/services/etrService'); } catch(e) { console.log('[EventLifecycle] etrService not available - running standalone'); }
                let generatedEtr = null;

                // Step 2: Generate ETR
                try {
                    generatedEtr = await etrService.generateETR(assignment._id, systemAdminId);
                } catch (err) {
                    console.error('[ETR Auto] Step 2 Failed (Generate ETR):', err);
                }

                // Step 3: Resend ETR
                try {
                    await etrService.resendETR(assignment._id, systemAdminId);
                } catch (err) {
                    console.error('[ETR Auto] Step 3 Failed (Resend ETR):', err);
                }

                // Step 4: Emit Socket.IO cmd:etr_generated and Client ETR Ready
                try {
                    if (global.io && generatedEtr) {
                        global.io.to('Admin').emit('cmd:etr_generated', {
                            event_id: assignment._id,
                            client_name: assignment.client_name,
                            etr_number: generatedEtr.summary ? generatedEtr.summary.etrNumber : 'Unknown',
                            pdf_url: generatedEtr.pdf_url,
                            timestamp: new Date().toISOString()
                        });

                        if (assignment.client_id) {
                            global.io.to(`Client:${assignment.client_id}`).emit('client:etr_ready', {
                                event_id: assignment._id,
                                etr_number: generatedEtr.summary ? generatedEtr.summary.etrNumber : 'Unknown',
                                message: 'Your event report is ready'
                            });
                        }
                    }
                } catch (err) {
                    console.error('[ETR Auto] Step 4 Failed (Socket Emission):', err);
                }
            } catch (err) {
                console.error('[ETR Auto] Uncaught wrapper error:', err);
            }
        });
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    await AuditLog.create({
        actionType:  'LIFECYCLE_TRANSITION',
        targetModel: 'Assignment',
        targetId:    assignment._id,
        performedBy: performedById,
        details: {
            from:    previousState,
            to:      targetState,
            forced:  opts.force || false,
            reason:  opts.reason || null,
            title:   assignment.title
        }
    });

    // ── Real-time Socket notification ─────────────────────────────────────────
    if (global.io) {
        global.io.to('Admin').emit('eventLifecycleUpdated', {
            assignmentId: assignment._id,
            title:        assignment.title,
            previousState,
            newState:     targetState
        });
        
        // Command Center standardized emit
        global.io.to('Admin').emit('cmd:event_state_change', {
            event_id: assignment._id,
            old_state: previousState,
            new_state: targetState,
            timestamp: new Date()
        });

        // Client Portal emit for COMPLETED
        if (targetState === 'COMPLETED' && assignment.client_id) {
            global.io.to(`Client:${assignment.client_id}`).emit('client:event_completed', {
                event_id: assignment._id,
                event_name: assignment.title,
                message: 'Your event has been completed successfully'
            });
        }
    }

    return { assignment, previousState, newState: targetState };
};

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Advance to STAFFING when first staff accepts */
exports.onStaffAccepted = async (assignmentId, performedById) => {
    const a = await Assignment.findById(assignmentId).select('lifecycle_state');
    if (!a) return;
    if ((a.lifecycle_state || 'PLANNED') === 'PLANNED') {
        try {
            await exports.transition(assignmentId, 'STAFFING', performedById);
        } catch (_) { /* guard not met yet, fine */ }
    }
};

/** Advance to READY when staffing count is filled */
exports.onStaffingFilled = async (assignmentId, performedById) => {
    const a = await Assignment.findById(assignmentId).select('lifecycle_state');
    if (!a) return;
    if ((a.lifecycle_state || 'PLANNED') === 'STAFFING') {
        try {
            await exports.transition(assignmentId, 'READY', performedById);
        } catch (_) { /* guard not met yet, fine */ }
    }
};

/** Advance to COMPLETED when final staff clocks out */
exports.onAllClockedOut = async (assignmentId, performedById) => {
    const a = await Assignment.findById(assignmentId).select('lifecycle_state');
    if (!a) return;
    if ((a.lifecycle_state || 'PLANNED') === 'LIVE') {
        try {
            await exports.transition(assignmentId, 'COMPLETED', performedById);
        } catch (_) { /* guard not yet met */ }
    }
};

/**
 * Get the current lifecycle state of an assignment.
 * Defaults to PLANNED for legacy records without the field.
 *
 * @param {string} assignmentId
 * @returns {string} lifecycle state
 */
exports.getCurrentState = async (assignmentId) => {
    const a = await Assignment.findById(assignmentId).select('lifecycle_state');
    if (!a) throw new Error('Assignment not found');
    return a.lifecycle_state || 'PLANNED';
};

/**
 * Get valid next states given the current lifecycle state.
 *
 * @param {string} currentState
 * @returns {string[]}
 */
exports.getValidTransitions = (currentState) => {
    return VALID_TRANSITIONS[currentState] || [];
};

// Export constants for use in controllers / tests
exports.LIFECYCLE_STATES      = LIFECYCLE_STATES;
exports.VALID_TRANSITIONS     = VALID_TRANSITIONS;

