/**
 * supervisorService.js
 * ===================================================================
 * Supervisor Operations Layer
 * -------------------------------------------------------------------
 * Responsibilities:
 *  1. Supervisor assignment per event (EventTeam model)
 *  2. Geolocation anchor — set/clear supervisor GPS anchor for an event
 *  3. Staff clock-in radius validation (Haversine distance check)
 *  4. Attendance verification (approve, deny, override clock-ins)
 *     ↳ Selfie image + device fingerprint stored for fraud prevention
 *  5. Payroll auto-trigger on clock-out
 *
 * This service is consumed by:
 *  - supervisorController.js (HTTP routes)
 *  - Socket.IO event handlers (real-time proximity checks)
 *  - Mobile operations portal staff clock-in flow
 * ===================================================================
 */

'use strict';

const EventTeam  = require('../models/EventTeam');
const Assignment = require('../models/Assignment');
const Attendance = require('../models/Attendance');
const Staff      = require('../models/Staff');
const AuditLog   = require('../models/AuditLog');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Default allowed radius in metres within which staff may clock in */
const DEFAULT_CLOCK_IN_RADIUS_METRES = 200;

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Haversine formula — returns straight-line distance in metres between two GPS coords.
 */
function haversineMetres(lat1, lon1, lat2, lon2) {
    const R = 6_371_000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SUPERVISOR ASSIGNMENT PER EVENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assign a supervisor to an event team.
 * If no team exists for the event, one is auto-created.
 */
exports.assignSupervisorToEvent = async (adminId, adminName, assignmentId, supervisorId) => {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new Error('Assignment not found');

    const supervisor = await Staff.findById(supervisorId);
    if (!supervisor) throw new Error('Supervisor not found');

    let team = await EventTeam.findOneAndUpdate(
        { event_id: assignmentId },
        {
            $set: { supervisor_id: supervisorId },
            $setOnInsert: { event_id: assignmentId, member_ids: [] }
        },
        { upsert: true, new: true }
    );

    assignment.supervisor_id = supervisorId;
    await assignment.save();

    await AuditLog.create({
        actionType:  'SUPERVISOR_ASSIGNED',
        targetModel: 'Assignment',
        targetId:    assignment._id,
        performedBy: adminId,
        details: {
            supervisorId,
            supervisorName:  supervisor.name,
            assignmentTitle: assignment.title,
            assignedBy:      adminName
        }
    });

    return { assignment, team };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. GEOLOCATION ANCHOR
// ─────────────────────────────────────────────────────────────────────────────

exports.dropGeoAnchor = async (supervisorId, assignmentId, lat, lng, radiusMetres) => {
    if (lat === undefined || lng === undefined) throw new Error('Lat/lng are required to drop a geo anchor');

    const team = await EventTeam.findOneAndUpdate(
        { event_id: assignmentId },
        {
            $set: {
                geoAnchor: {
                    lat,
                    lng,
                    radiusMetres: radiusMetres || DEFAULT_CLOCK_IN_RADIUS_METRES,
                    droppedAt:    new Date(),
                    droppedBy:    supervisorId
                }
            }
        },
        { new: true, upsert: true }
    );

    await Staff.findByIdAndUpdate(supervisorId, {
        $set: {
            last_location: { type: 'Point', coordinates: [lng, lat] },
            last_seen:     new Date()
        }
    });

    if (global.io) {
        const payload = { event_id: assignmentId, anchor_lat: lat, anchor_lng: lng, radius_meters: radiusMetres || DEFAULT_CLOCK_IN_RADIUS_METRES };
        global.io.to(`Supervisor:${assignmentId}`).emit('cmd:anchor_confirmed', payload);
        
        try {
            const SupervisorNotification = require('../models/SupervisorNotification');
            await SupervisorNotification.create({
                event_id: assignmentId, supervisor_id: supervisorId,
                type: 'event_update', title: 'Geo Anchor Set',
                message: 'Your GPS clock-in anchor has been set successfully.',
                payload
            });
        } catch(e) { console.error(e) }
    }

    return team;
};

exports.clearGeoAnchor = async (assignmentId) => {
    return EventTeam.findOneAndUpdate(
        { event_id: assignmentId },
        { $unset: { geoAnchor: '' } },
        { new: true }
    );
};

exports.getGeoAnchor = async (assignmentId) => {
    const team = await EventTeam.findOne({ event_id: assignmentId }).select('geoAnchor');
    return team?.geoAnchor || null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. CLOCK-IN RADIUS VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

exports.validateClockInRadius = async (assignmentId, staffLat, staffLng) => {
    const team = await EventTeam.findOne({ event_id: assignmentId }).select('geoAnchor');

    if (!team || !team.geoAnchor) {
        return { allowed: true, distance: null, radiusMetres: null, reason: 'No geo anchor set — proximity check skipped' };
    }

    const { lat: anchorLat, lng: anchorLng, radiusMetres } = team.geoAnchor;
    const distance = Math.round(haversineMetres(anchorLat, anchorLng, staffLat, staffLng));
    const allowed = distance <= radiusMetres;

    return {
        allowed,
        distance,
        radiusMetres,
        reason: allowed
            ? `Within radius (${distance}m / ${radiusMetres}m)`
            : `Too far from event location (${distance}m away, limit ${radiusMetres}m)`
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. CLOCK-IN  (with Selfie + Device Fingerprint)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a staff clock-in with:
 *  - GPS proximity validation against supervisor geo-anchor
 *  - Selfie image URL (uploaded to /uploads/selfies/ or an external CDN)
 *  - Device fingerprint for fraud detection
 *
 * @param {string} staffId
 * @param {string} assignmentId
 * @param {number} lat
 * @param {number} lng
 * @param {object} [verificationData]
 * @param {string} [verificationData.selfie_url]         - Path/URL to uploaded selfie
 * @param {string} [verificationData.user_agent]         - HTTP User-Agent header
 * @param {string} [verificationData.platform]           - 'Android' | 'iOS' | 'Web'
 * @param {string} [verificationData.device_id]          - Unique hashed device identifier
 * @param {string} [verificationData.session_token]      - Per-session rotating token
 * @param {string} [verificationData.ip_address]         - Client IP from request
 *
 * @returns {{ attendance, proximityResult, fraudFlags }}
 */
exports.clockIn = async (staffId, assignmentId, lat, lng, verificationData = {}) => {
    // ── Proximity check ───────────────────────────────────────────────────────
    const proximityResult = await exports.validateClockInRadius(assignmentId, lat, lng);

    // ── Fraud detection: check if same device_id already clocked in elsewhere ─
    const fraudFlags = [];
    if (verificationData.device_id) {
        const today = new Date();
        const dayStart = new Date(today.setHours(0, 0, 0, 0));
        const existingToday = await Attendance.findOne({
            'device_fingerprint.device_id': verificationData.device_id,
            clock_in: { $gte: dayStart },
            staff_id: { $ne: staffId }  // different staff, same device
        }).select('staff_id assignment_id');

        if (existingToday) {
            fraudFlags.push({
                type:   'DEVICE_REUSE',
                detail: `Device ${verificationData.device_id} already used by another staff today`,
                severity: 'HIGH'
            });
        }
    }

    // ── Build Attendance document ─────────────────────────────────────────────
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    const attendanceData = {
        staff_id:      staffId,
        assignment_id: assignmentId,
        date:          dateStr,
        clock_in:      now,
        clock_in_location: (lat && lng) ? { lat, lng } : undefined,
        proximity_denied:  !proximityResult.allowed,
        proximity_distance: proximityResult.distance,
        status: !proximityResult.allowed ? 'Proximity Denied' : 'Clocked In',

        // Selfie
        selfie_url:      verificationData.selfie_url || null,
        selfie_verified: false, // Will be set true by supervisor/ML review

        // Device fingerprint
        device_fingerprint: {
            user_agent:    verificationData.user_agent   || null,
            platform:      verificationData.platform     || null,
            device_id:     verificationData.device_id    || null,
            session_token: verificationData.session_token|| null,
            ip_address:    verificationData.ip_address   || null,
            captured_at:   now
        }
    };

    const attendance = await Attendance.create(attendanceData);

    // ── Audit logs ────────────────────────────────────────────────────────────
    if (!proximityResult.allowed) {
        await AuditLog.create({
            actionType:   'CLOCK_IN_DENIED',
            targetModel:  'Attendance',
            targetId:     attendance._id,
            performedBy:  staffId,
            details: {
                assignmentId,
                distance:      proximityResult.distance,
                limit:         proximityResult.radiusMetres,
                reason:        proximityResult.reason,
                hasSelfie:     !!verificationData.selfie_url,
                hasFingerprint:!!verificationData.device_id
            }
        });
    }

    if (fraudFlags.length > 0) {
        await AuditLog.create({
            actionType:  'FRAUD_FLAG',
            targetModel: 'Attendance',
            targetId:    attendance._id,
            performedBy: staffId,
            details:     { flags: fraudFlags, assignmentId }
        });

        // Real-time alert to Admin room
        if (global.io) {
            global.io.to('Admin').emit('fraudAlert', {
                staffId,
                assignmentId,
                attendanceId: attendance._id,
                flags: fraudFlags
            });
        }
    }

    // ── Lifecycle hook: onStaffAccepted (may advance PLANNED→STAFFING) ────────
    try {
        const eventLifecycleService = require('./eventLifecycleService');
        await eventLifecycleService.onStaffAccepted(assignmentId, staffId);
    } catch (_) { /* silent — lifecycle is advisory */ }

    // ── COMMAND CENTER SOCKET TRIGGERS ───────────────────────────────────────
    if (global.io) {
        try {
            const staffDoc = await Staff.findById(staffId).select('name').lean();
            const staffName = staffDoc ? staffDoc.name : 'Unknown';
            const Assignment = require('../models/Assignment');
            const assign = await Assignment.findById(assignmentId).select('supervisor_id').lean();
            const SupervisorNotification = require('../models/SupervisorNotification');

            if (proximityResult.allowed) {
                const payload = {
                    event_id: assignmentId, staff_id: staffId, staff_name: staffName,
                    timestamp: now, proximity_result: proximityResult
                };
                global.io.to('Admin').emit('cmd:staff_clocked_in', payload);
                if (assign && assign.supervisor_id) {
                    global.io.to(`Supervisor:${assignmentId}`).emit('cmd:team_update', payload);
                    await SupervisorNotification.create({
                        event_id: assignmentId, supervisor_id: assign.supervisor_id,
                        type: 'team_update', title: 'Staff Clocked In',
                        message: `${staffName} clocked in successfully.`, payload
                    });
                }
            } else {
                const payload = {
                    staff_id: staffId, staff_name: staffName,
                    distance_from_anchor: proximityResult.distance, timestamp: now
                };
                if (assign && assign.supervisor_id) {
                    global.io.to(`Supervisor:${assignmentId}`).emit('cmd:clock_in_denied', payload);
                    await SupervisorNotification.create({
                        event_id: assignmentId, supervisor_id: assign.supervisor_id,
                        type: 'clock_in_denied', title: 'Clock-In Denied',
                        message: `${staffName} was denied clock-in (${proximityResult.distance}m from anchor).`, payload
                    });
                }
            }
        } catch(e) { console.error('[Socket Trigger Error]', e) }
    }

    return { attendance, proximityResult, fraudFlags };
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. PROXIMITY OVERRIDE
// ─────────────────────────────────────────────────────────────────────────────

exports.overrideProximityDenial = async (supervisorId, attendanceId, reason) => {
    const attendance = await Attendance.findByIdAndUpdate(
        attendanceId,
        {
            $set: {
                proximity_denied:          false,
                proximity_override:        true,
                proximity_override_by:     supervisorId,
                proximity_override_at:     new Date(),
                proximity_override_reason: reason || 'Supervisor override',
                status: 'Clocked In'
            }
        },
        { new: true }
    );

    if (!attendance) throw new Error('Attendance record not found');

    await AuditLog.create({
        actionType:  'PROXIMITY_OVERRIDE',
        targetModel: 'Attendance',
        targetId:    attendanceId,
        performedBy: supervisorId,
        details:     { reason }
    });

    if (global.io) {
        global.io.to('Admin').emit('cmd:event_update', { event_id: attendance.assignment_id });
        global.io.to(`Supervisor:${attendance.assignment_id}`).emit('cmd:team_update', { event_id: attendance.assignment_id });
    }

    return attendance;
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. SELFIE VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark a selfie as verified by a supervisor or automated ML check.
 *
 * @param {string} attendanceId
 * @param {string} verifierId - Staff/Admin ObjectId who verified
 * @returns {object} Updated Attendance
 */
exports.verifySelfie = async (attendanceId, verifierId) => {
    const attendance = await Attendance.findByIdAndUpdate(
        attendanceId,
        {
            $set: {
                selfie_verified:    true,
                selfie_verified_at: new Date(),
                selfie_verified_by: verifierId
            }
        },
        { new: true }
    );
    if (!attendance) throw new Error('Attendance record not found');
    return attendance;
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. CLOCK-OUT  (with auto payroll generation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a staff clock-out.
 * Automatically generates a payroll record via payrollService after saving.
 * Attempts to advance the event lifecycle to COMPLETED if all staff are clocked out.
 *
 * @param {string} staffId
 * @param {string} assignmentId
 * @param {number|null} lat
 * @param {number|null} lng
 * @returns {{ attendance, payroll|null }}
 */
exports.clockOut = async (staffId, assignmentId, lat, lng) => {
    const attendance = await Attendance.findOne({
        staff_id:      staffId,
        assignment_id: assignmentId,
        clock_out:     null,
        status:        { $in: ['Clocked In', 'On Time'] }
    }).sort({ clock_in: -1 });

    if (!attendance) throw new Error('No active clock-in found for this staff and event');

    attendance.clock_out = new Date();
    if (lat && lng) {
        attendance.clock_out_location = { lat, lng };
    }

    const diffMs = attendance.clock_out - attendance.clock_in;
    attendance.total_hours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
    attendance.status = 'Completed';

    await attendance.save();

    // ── Auto-generate Payroll record ──────────────────────────────────────────
    let payroll = null;
    try {
        const payrollService = require('../financials/services/payrollService');
        const assignment = await Assignment.findById(assignmentId);

        if (assignment) {
            const [payrollEntry] = await payrollService.generateEventPayroll(
                assignmentId,
                [attendance],
                [assignment]
            );
            payroll = payrollEntry;

            // Link payroll to attendance record
            attendance.payroll_id = payroll._id;
            attendance.payroll_generated = true;
            attendance.payroll_generated_at = new Date();
            await attendance.save();

            console.log(`[supervisorService] Payroll generated — Staff: ${staffId}, Assignment: ${assignmentId}, Total: ${payroll.total_pay}`);
        }
    } catch (payrollErr) {
        console.error('[supervisorService] Payroll auto-generation failed:', payrollErr.message);
        // Non-fatal — attendance is still saved
    }

    // ── Lifecycle: check if all staff clocked out → advance to COMPLETED ─────────
    try {
        const eventLifecycleService = require('./eventLifecycleService');
        await eventLifecycleService.onAllClockedOut(assignmentId, staffId);
    } catch (_) { /* silent */ }

    if (global.io) {
        global.io.to('Admin').emit('cmd:event_update', { event_id: assignmentId });
        global.io.to(`Supervisor:${assignmentId}`).emit('cmd:team_update', { event_id: assignmentId });
    }

    return { attendance, payroll };
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. QUERY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

exports.getEventAttendance = async (assignmentId) => {
    return Attendance.find({ assignment_id: assignmentId })
        .populate('staff_id', 'name email role photo_url')
        .sort({ clock_in: 1 });
};

exports.getStaffAttendanceHistory = async (staffId) => {
    return Attendance.find({ staff_id: staffId })
        .populate('assignment_id', 'title date location')
        .sort({ clock_in: -1 });
};
