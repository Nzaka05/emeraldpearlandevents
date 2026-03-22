const fs = require('fs');
let content = fs.readFileSync('staff-system/services/aiAssistantService.js', 'utf8');

// Add pearlActionService import after existing imports
content = content.replace(
    "const nodemailer = require('nodemailer');",
    `const nodemailer = require('nodemailer');
const pearlActions = require('./pearlActionService');`
);

// Add action handling before Claude API call
const actionHandler = `
    // PEARL Action Handler - detect and execute commands
    let actionResult = null;
    const lowerQuery = sanitized.toLowerCase();
    
    // Confirm booking
    if (lowerQuery.includes('confirm booking') || lowerQuery.includes('confirm the booking')) {
        const idMatch = sanitized.match(/[a-f0-9]{24}/i);
        if (idMatch) {
            const success = await pearlActions.confirmBooking(idMatch[0]);
            actionResult = success ? 'Booking confirmed successfully.' : 'Could not confirm booking.';
        }
    }
    // Cancel booking
    else if (lowerQuery.includes('cancel booking')) {
        const idMatch = sanitized.match(/[a-f0-9]{24}/i);
        if (idMatch) {
            const success = await pearlActions.cancelBooking(idMatch[0], 'Cancelled by admin via PEARL');
            actionResult = success ? 'Booking cancelled successfully.' : 'Could not cancel booking.';
        }
    }
    // Get bookings
    else if (lowerQuery.includes('show bookings') || lowerQuery.includes('list bookings') || lowerQuery.includes('all bookings')) {
        const bookings = await pearlActions.getBookings({});
        businessData.allBookings = bookings;
    }
    // Get pending bookings
    else if (lowerQuery.includes('pending booking') || lowerQuery.includes('unconfirmed')) {
        const bookings = await pearlActions.getBookings({ status: 'pending' });
        businessData.pendingBookings = bookings;
    }
    // Get upcoming bookings
    else if (lowerQuery.includes('upcoming') || lowerQuery.includes('next event')) {
        const bookings = await pearlActions.getBookings({ upcoming: true });
        businessData.upcomingBookings = bookings;
    }
    // Get analytics
    else if (lowerQuery.includes('analytics') || lowerQuery.includes('revenue') || lowerQuery.includes('statistics')) {
        const analytics = await pearlActions.getAnalytics();
        businessData.analytics = analytics;
    }
    // Get clients
    else if (lowerQuery.includes('clients') || lowerQuery.includes('customers')) {
        const clients = await pearlActions.getClients();
        businessData.clients = clients;
    }
    // Update staff availability
    else if (lowerQuery.includes('set') && lowerQuery.includes('available')) {
        const staffName = sanitized.match(/set\s+(\w+\s?\w*)\s+(available|busy|on leave)/i);
        if (staffName) {
            const Staff = require('../models/Staff');
            const staff = await Staff.findOne({ name: new RegExp(staffName[1], 'i') });
            if (staff) {
                const status = staffName[2].toLowerCase() === 'available' ? 'Available' : 
                               staffName[2].toLowerCase() === 'busy' ? 'Busy' : 'On Leave';
                await pearlActions.updateStaffAvailability(staff._id, status);
                actionResult = staffName[1] + ' availability updated to ' + status;
            }
        }
    }
    
    if (actionResult) {
        await AIConversationLog.create({
            user_id: userId, role, query: sanitized,
            response: actionResult, context_used: {}
        }).catch(() => {});
        return { reply: actionResult, response: actionResult, summary: actionResult, recommendedActions: [] };
    }
`;

// Insert before Gemini API call
content = content.replace(
    "    // Build conversation history",
    actionHandler + "\n    // Build conversation history"
);

// Update system prompt to include action capabilities
content = content.replace(
    "IMPORTANT: You are PEARL. Never mention Claude, Gemini, or Anthropic to users.",
    `REAL-TIME BUSINESS DATA:
Bookings: \${JSON.stringify(businessData.allBookings || businessData.pendingBookings || businessData.upcomingBookings || [])}
Analytics: \${JSON.stringify(businessData.analytics || {})}
Clients: \${JSON.stringify(businessData.clients || [])}

ACTION COMMANDS (you can tell users to say these):
- "confirm booking [ID]" - confirms a booking
- "cancel booking [ID]" - cancels a booking  
- "show pending bookings" - lists unconfirmed bookings
- "show upcoming events" - lists upcoming events
- "show analytics" - shows business analytics
- "show clients" - lists all clients
- "set [staff name] available/busy/on leave" - updates staff status
- "send email to [email] [message]" - sends email

IMPORTANT: You are PEARL. Never mention Claude, Gemini, or Anthropic to users.
When users ask about bookings/clients/analytics, you now have LIVE data above.
Guide users to use action commands for making changes.`
);

fs.writeFileSync('staff-system/services/aiAssistantService.js', content);
console.log('Done - PEARL now has full system access');
