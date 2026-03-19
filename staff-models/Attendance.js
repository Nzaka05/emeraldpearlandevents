const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    staff_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
    assignment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' }, // Optional: If not tied to an assignment
    date: { type: String, required: true }, // YYYY-MM-DD
    clock_in: { type: Date, required: true },
    clock_out: { type: Date },
    ip_address: { type: String },
    gps_coordinates: {
        lat: { type: Number },
        lng: { type: Number }
    },
    selfie_url: { type: String },
    total_hours: { type: Number, default: 0 },
    status: { type: String, enum: ['On Time', 'Late', 'Absent'], default: 'On Time' }
});

module.exports = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
