const Staff = require('../models/Staff');
const EventTeam = require('../models/EventTeam');
const Assignment = require('../models/Assignment');
const AuditLog = require('../models/AuditLog');

// Haversine formula — returns distance in meters between two GPS coordinates
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth radius in meters
    const φ1 = lat1 * (Math.PI / 180);
    const φ2 = lat2 * (Math.PI / 180);
    const Δφ = (lat2 - lat1) * (Math.PI / 180);
    const Δλ = (lng2 - lng1) * (Math.PI / 180);

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Basic GPS spoof detection — reject impossible coordinate changes
function detectSpoof(lat, lng) {
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return true;
    // Check for common spoof zeros
    if (lat === 0 && lng === 0) return true;
    return false;
}

// Proximity Check Middleware
// Usage: auth → roleCheck → proximityCheck → saveAttendance
exports.proximityCheck = async (req, res, next) => {
    try {
        const { lat, lng, assignment_id, admin_override, action } = req.body;

        // Only check on clock-in actions, not clock-out
        if (action !== 'in') return next();

        // Validate GPS coordinates are provided
        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                error: 'GPS coordinates required for clock-in. Please enable location access.',
                code: 'NO_GPS'
            });
        }

        const staffLat = parseFloat(lat);
        const staffLng = parseFloat(lng);

        // GPS spoof detection
        if (detectSpoof(staffLat, staffLng)) {
            await AuditLog.create({
                actionType: 'GPS_SPOOF_DETECTED',
                targetModel: 'Staff',
                targetId: req.user._id,
                performedBy: req.user._id,
                details: {
                    lat: staffLat,
                    lng: staffLng,
                    ip: req.ip,
                    assignment_id,
                    reason: 'Invalid or suspicious GPS coordinates'
                }
            });
            return res.status(403).json({
                success: false,
                error: 'Invalid location data detected. Clock-in denied.',
                code: 'SPOOF_DETECTED'
            });
        }

        // Admin override — bypass proximity check but still log it
        if (admin_override === 'true' || admin_override === true) {
            // Only admins can trigger admin_override in practice — but we also
            // allow an admin to pass it via the API. We mark it for audit.
            req.proximityOverride = true;
            req.staffLocation = { lat: staffLat, lng: staffLng };
            await AuditLog.create({
                actionType: 'PROXIMITY_OVERRIDE',
                targetModel: 'Staff',
                targetId: req.user._id,
                performedBy: req.user._id,
                details: {
                    lat: staffLat,
                    lng: staffLng,
                    assignment_id,
                    ip: req.ip,
                    reason: 'Admin override used for clock-in'
                }
            });
            return next();
        }

        // Find the event team for this assignment to get the supervisor
        let supervisorId = null;
        if (assignment_id) {
            const team = await EventTeam.findOne({ event_id: assignment_id });
            if (team) {
                supervisorId = team.supervisor_id;
            }
            // Also check assignment's supervisor_id field
            if (!supervisorId) {
                const assignment = await Assignment.findById(assignment_id);
                if (assignment && assignment.supervisor_id) {
                    supervisorId = assignment.supervisor_id;
                }
            }
        }

        // If no supervisor found, check if any admin is nearby (fallback)
        let referenceLocation = null;
        let referenceType = null;

        if (supervisorId) {
            const supervisor = await Staff.findById(supervisorId).select('name last_location');
            if (supervisor && supervisor.last_location && supervisor.last_location.updatedAt) {
                const locationAge = Date.now() - new Date(supervisor.last_location.updatedAt).getTime();
                const MAX_LOCATION_AGE_MS = 5 * 60 * 1000; // 5 minutes

                if (locationAge <= MAX_LOCATION_AGE_MS) {
                    referenceLocation = supervisor.last_location;
                    referenceType = 'supervisor';
                } else {
                    // Location is stale — log and deny
                    await AuditLog.create({
                        actionType: 'CLOCK_IN_DENIED',
                        targetModel: 'Staff',
                        targetId: req.user._id,
                        performedBy: req.user._id,
                        details: {
                            reason: 'Supervisor location is stale (>5 min old)',
                            locationAge: Math.round(locationAge / 60000) + ' minutes',
                            supervisorId: supervisorId.toString(),
                            staffLat,
                            staffLng,
                            ip: req.ip,
                            assignment_id
                        }
                    });
                    return res.status(403).json({
                        success: false,
                        error: 'Supervisor location data is outdated. Please ask your supervisor to update their location.',
                        code: 'SUPERVISOR_LOCATION_STALE'
                    });
                }
            }
        }

        // If no supervisor location, try to find any admin with a recent location
        if (!referenceLocation) {
            const adminWithLocation = await Staff.findOne({
                role: { $in: ['Admin', 'Supervisor'] },
                'last_location.updatedAt': { $gte: new Date(Date.now() - 5 * 60 * 1000) }
            }).select('last_location name');

            if (adminWithLocation && adminWithLocation.last_location) {
                referenceLocation = adminWithLocation.last_location;
                referenceType = 'admin';
            }
        }

        // No reference location available at all
        if (!referenceLocation) {
            await AuditLog.create({
                actionType: 'CLOCK_IN_DENIED',
                targetModel: 'Staff',
                targetId: req.user._id,
                performedBy: req.user._id,
                details: {
                    reason: 'No supervisor or admin location available',
                    staffLat,
                    staffLng,
                    ip: req.ip,
                    assignment_id
                }
            });
            return res.status(403).json({
                success: false,
                error: 'No supervisor location data available. Please ensure your supervisor has the app open.',
                code: 'NO_SUPERVISOR_LOCATION'
            });
        }

        // Calculate distance using Haversine formula
        const distanceMeters = haversineDistance(
            staffLat, staffLng,
            referenceLocation.lat, referenceLocation.lng
        );

        const PROXIMITY_LIMIT_M = 500; // 500 meters

        if (distanceMeters > PROXIMITY_LIMIT_M) {
            // Deny clock-in
            await AuditLog.create({
                actionType: 'CLOCK_IN_DENIED',
                targetModel: 'Staff',
                targetId: req.user._id,
                performedBy: req.user._id,
                details: {
                    reason: 'Outside 500m proximity range',
                    distanceMeters: Math.round(distanceMeters),
                    referenceType,
                    staffLat,
                    staffLng,
                    ip: req.ip,
                    assignment_id
                }
            });

            // Notify admin via socket
            if (global.io) {
                global.io.to('Admin').emit('proximityDenied', {
                    staff: req.user.name,
                    distanceMeters: Math.round(distanceMeters),
                    assignment_id,
                    time: new Date()
                });
            }

            return res.status(403).json({
                success: false,
                error: `Supervisor not within required range. You are ${Math.round(distanceMeters)}m away (max 500m).`,
                code: 'OUT_OF_RANGE',
                distanceMeters: Math.round(distanceMeters)
            });
        }

        // Passed proximity check — attach info to request for controller
        req.staffLocation = { lat: staffLat, lng: staffLng };
        req.supervisorDistanceM = Math.round(distanceMeters);
        next();

    } catch (error) {
        console.error('Proximity check error:', error);
        next(error);
    }
};

// Export the haversine function for use in other places
exports.haversineDistance = haversineDistance;
