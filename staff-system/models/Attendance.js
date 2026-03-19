const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    staff_id:      { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
    date:          { type: String }, // YYYY-MM-DD — auto-set on clockIn

    clock_in:  { type: Date, required: true },
    clock_out: { type: Date },
    ip_address:{ type: String },

    // ── GPS ──────────────────────────────────────────────────────────────────
    clock_in_location: {
        lat: { type: Number },
        lng: { type: Number }
    },
    clock_out_location: {
        lat: { type: Number },
        lng: { type: Number }
    },
    gps_coordinates: { // legacy field — kept for backward compat
        lat: { type: Number },
        lng: { type: Number }
    },

    // ── Selfie Verification ──────────────────────────────────────────────────
    selfie_url:          { type: String },             // Uploaded photo path or URL
    selfie_verified:     { type: Boolean, default: false },
    selfie_verified_at:  { type: Date },
    selfie_verified_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },

    // ── Device Fingerprint (Fraud Prevention) ────────────────────────────────
    device_fingerprint: {
        user_agent:    { type: String },   // Browser / app UA string
        platform:      { type: String },   // 'Android' | 'iOS' | 'Web'
        device_id:     { type: String },   // Unique hashed device identifier sent by client
        session_token: { type: String },   // Short-lived hashed token, rotates per session
        ip_address:    { type: String },   // Client IP captured at clock-in
        captured_at:   { type: Date }
    },

    // ── Proximity ────────────────────────────────────────────────────────────
    proximity_denied:            { type: Boolean, default: false },
    proximity_distance:          { type: Number },  // metres from geo anchor
    proximity_override:          { type: Boolean, default: false },
    proximity_override_by:       { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    proximity_override_at:       { type: Date },
    proximity_override_reason:   { type: String },

    // ── Legacy compat ─────────────────────────────────────────────────────────
    override_by_admin:    { type: Boolean, default: false },
    supervisor_distance_m:{ type: Number },

    // ── Payroll linkage ───────────────────────────────────────────────────────
    payroll_id:           { type: mongoose.Schema.Types.ObjectId, ref: 'StaffPayroll' },
    payroll_generated:    { type: Boolean, default: false },
    payroll_generated_at: { type: Date },

    // ── Hours / Status ────────────────────────────────────────────────────────
    total_hours: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['On Time', 'Late', 'Absent', 'Clocked In', 'Proximity Denied', 'Completed'],
        default: 'On Time'
    }
});

// Indexes
attendanceSchema.index({ clock_in_location: '2d' });
attendanceSchema.index({ clock_out_location: '2d' });
attendanceSchema.index({ staff_id: 1, date: -1 });
attendanceSchema.index({ assignment_id: 1 });
attendanceSchema.index({ 'device_fingerprint.device_id': 1 }); // Fraud detection

module.exports = mongoose.model('Attendance', attendanceSchema);
