const mongoose = require('mongoose');

/**
 * StaffCategorySettings — Controls which staff categories are enabled/disabled
 * Used by Phase 4 admin category toggle switches
 */
const staffCategorySettingsSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
        unique: true,
        enum: ['Usher', 'Brand Ambassador', 'Supervisor', 'Event Planner', 
               'Organiser', 'Wedding Planner', 'Ticketing Agent', 
               'Event Coordinator', 'Technical Crew', 'Security']
    },
    is_enabled:  { type: Boolean, default: true },
    description: { type: String, default: '' },
    icon:        { type: String, default: 'fa-user' }, // Font Awesome icon class
    color:       { type: String, default: '#10b981' }, // Accent color
    updatedAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.models.StaffCategorySettings || mongoose.model('StaffCategorySettings', staffCategorySettingsSchema);

