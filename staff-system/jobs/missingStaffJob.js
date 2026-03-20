/**
 * missingStaffJob.js
 * Background job to detect staff missing from LIVE events.
 * Emits Socket.IO alerts and logs to StaffMissingAlert.
 */

const Assignment = require('../models/Assignment');
const Attendance = require('../models/Attendance');
const StaffMissingAlert = require('../models/StaffMissingAlert');

// Helper to check if event started > 15 mins ago
function isOver15MinsLate(dateStr, startTimeStr) {
    if (!dateStr || !startTimeStr) return false;
    
    // Parse the event date (ignoring time component and timezone weirdness)
    const eventDate = new Date(dateStr);
    
    // Parse start_time (e.g. "14:30")
    const [hours, minutes] = startTimeStr.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return false;
    
    // Construct actual JS Date for the exact start time
    const actualStartTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), hours, minutes, 0);
    
    const now = new Date();
    const diffMs = now - actualStartTime;
    const diffMins = Math.floor(diffMs / 60000);
    
    return diffMins > 15;
}

// Helper: actually scan an event and trigger alerts
async function scanEvent(assignment) {
    if (!assignment.date || !assignment.start_time) return;
    
    // Parse time to calculate exact minutes late
    const eventDate = new Date(assignment.date);
    const [hours, minutes] = assignment.start_time.split(':').map(Number);
    const actualStartTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), hours, minutes, 0);
    const diffMins = Math.floor((new Date() - actualStartTime) / 60000);

    // Only process if more than 15 mins late
    if (diffMins <= 15) return;

    // Get all assigned staff
    const assignedIds = [
        ...(assignment.accepted_staff_ids || []).map(s => s._id || s),
        ...(assignment.assigned_staff_ids || []).map(s => s._id || s)
    ];

    if (assignedIds.length === 0) return;

    // Get clocked in staff from Attendance
    const attendances = await Attendance.find({
        assignment_id: assignment._id,
        status: { $in: ['Clocked In', 'Completed'] }
    }).select('staff_id').lean();
    
    const clockedInIds = new Set(attendances.map(a => a.staff_id.toString()));

    // Find missing
    for (const staffId of assignedIds) {
        if (!clockedInIds.has(staffId.toString())) {
            
            // Check if alert already exists
            const existingAlert = await StaffMissingAlert.findOne({
                event_id: assignment._id,
                staff_id: staffId,
                resolved: false
            });

            if (!existingAlert) {
                // Create alert
                await StaffMissingAlert.create({
                    event_id: assignment._id,
                    staff_id: staffId,
                    minutes_late: diffMins,
                    alerted_at: new Date()
                });

                // Populate staff name for the socket event
                const Staff = require('../models/Staff');
                const staffDoc = await Staff.findById(staffId).select('name').lean();
                
                // Emit alert to Admin room
                if (global.io) {
                    const payload = {
                        event_id: assignment._id,
                        staff_id: staffId,
                        staff_name: staffDoc?.name || 'Unknown Staff',
                        minutes_late: diffMins,
                        timestamp: new Date()
                    };
                    
                    global.io.to('Admin').emit('staff_missing_alert', payload);
                    
                    // Push to Supervisor feed persistence
                    // (Assuming supervisor notification service exists, or directly emitting)
                    const SupervisorNotification = require('../models/SupervisorNotification');
                    if (assignment.supervisor_id) {
                        try {
                            const notif = await SupervisorNotification.create({
                                event_id: assignment._id,
                                supervisor_id: assignment.supervisor_id,
                                type: 'staff_missing',
                                title: 'Missing Staff Alert',
                                message: `${staffDoc?.name || 'A staff member'} is ${diffMins} minutes late.`,
                                payload: payload
                            });
                            global.io.to(`Supervisor:${assignment._id}`).emit('team_update', { message: 'Missing staff alert created' });
                            global.io.to(`Supervisor:${assignment._id}`).emit('notification', notif);
                        } catch (err) {
                            console.error('[MissingStaffJob] Failed to auto-create supervisor notif:', err);
                        }
                    }
                }
            }
        }
    }
}

async function runMissingStaffCheck() {
    try {
        const liveEvents = await Assignment.find({ lifecycle_state: 'LIVE' })
            .select('date start_time accepted_staff_ids assigned_staff_ids supervisor_id')
            .lean();
            
        for (const event of liveEvents) {
            await scanEvent(event);
        }
    } catch (error) {
        console.error('[MissingStaffJob] Error during missing staff check:', error);
    }
}

function startJob() {
    console.log('[MissingStaffJob] Running immediate startup recovery check...');
    // Immediate execution on server start (Startup Recovery Check)
    runMissingStaffCheck().then(() => {
        console.log('[MissingStaffJob] Recovery check complete. Starting 5-minute interval loop.');
        // Run every 5 minutes
        setInterval(runMissingStaffCheck, 5 * 60 * 1000);
    });
}

module.exports = {
    startJob,
    _runCheckNow: runMissingStaffCheck // Exposed for tests
};

