const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'staff-system', 'services', 'adminViewService.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find the function and replace it entirely using regex
const NEW_FN = "exports.getDashboardData = async () => {\n    const totalStaff = await Staff.countDocuments();\n    const availableStaff = await Staff.countDocuments({ availability_status: 'Available' });\n    const busyStaff = await Staff.countDocuments({ availability_status: 'Busy' });\n    const activeAssignments = await Assignment.countDocuments({ status: 'Active' });\n\n    const today = new Date();\n    today.setHours(0, 0, 0, 0);\n    const clockedInStaff = await Attendance.countDocuments({\n        clock_in: { $gte: today },\n        clock_out: null\n    });\n\n    const pendingPayments = await Assignment.countDocuments({ payment_status: 'Pending' });\n\n    // \u2500\u2500 Revenue metrics \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    const ClientInvoice = require('../models/ClientInvoice');\n    const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);\n    const startOfLastMonth = new Date(startOfMonth); startOfLastMonth.setMonth(startOfLastMonth.getMonth()-1);\n    const endOfLastMonth = new Date(startOfMonth);\n    const [thisMonthAgg, lastMonthAgg] = await Promise.all([\n        ClientInvoice.aggregate([{ $match: { invoiceStatus: 'Paid', updatedAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),\n        ClientInvoice.aggregate([{ $match: { invoiceStatus: 'Paid', updatedAt: { $gte: startOfLastMonth, $lt: endOfLastMonth } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }])\n    ]);\n    const revenueThisMonth = thisMonthAgg[0]?.total || 0;\n    const revenueLastMonth = lastMonthAgg[0]?.total || 0;\n\n    // \u2500\u2500 Overdue invoices \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    const overdueInvoices = await ClientInvoice.countDocuments({ invoiceStatus: 'Overdue' });\n\n    // \u2500\u2500 Unassigned bookings \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n    let unassignedBookings = 0;\n    try {\n        const SharedBooking = require('../models/SharedBooking');\n        unassignedBookings = await SharedBooking.countDocuments({ status: 'pending' });\n    } catch (_) {}\n    // \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n    const recentAuditLogs = await AuditLog.find()\n        .sort({ timestamp: -1 })\n        .limit(10)\n        .populate('performedBy', 'name email')\n        .lean();\n\n    const allAssignments = await Assignment.find().sort({ createdAt: -1 })\n        .populate('assigned_staff_ids', 'name')\n        .populate('accepted_staff_ids', 'name');\n\n    const pendingReplacements = await ReplacementRequest.find({ status: 'Pending' })\n        .populate('team_id')\n        .populate('requested_by', 'name role')\n        .populate('original_staff_id', 'name')\n        .sort({ requested_at: -1 });\n\n    const recentSubmissions = await Attendance.find({ status: { $ne: 'Pending' } })\n        .sort({ clock_out: -1 })\n        .limit(5)\n        .populate('staff_id', 'name')\n        .populate('assignment_id', 'title date');\n\n    const activeTeams = await EventTeam.find({ status: 'Active' })\n        .populate('event_id', 'title date location')\n        .populate('supervisor_id', 'name phone')\n        .populate('member_ids', 'name availability_status role')\n        .lean();\n\n    for (let team of activeTeams) {\n        if (!team.event_id) continue;\n        const requiredStaff = await Assignment.findById(team.event_id._id).select('required_staff');\n        team.required_staff_count = requiredStaff ? requiredStaff.required_staff : 0;\n    }\n\n    return {\n        stats: {\n            totalStaff, availableStaff, busyStaff, activeAssignments,\n            clockedInStaff, pendingPayments,\n            revenueThisMonth, revenueLastMonth, overdueInvoices, unassignedBookings\n        },\n        recentAuditLogs, allAssignments, pendingReplacements, recentSubmissions, activeTeams\n    };\n};";

// Match from exports.getDashboardData to its closing };
const regex = /exports\.getDashboardData = async \(\) => \{[\s\S]*?^\};/m;
if (!regex.test(content)) {
    // Try multiline approach
    const start = content.indexOf('exports.getDashboardData = async () => {');
    if (start === -1) {
        console.error('Cannot find getDashboardData. Appending new version instead.');
        // Remove old version if different signature exists
        content = content + '\n\n// PATCHED\n' + NEW_FN;
    } else {
        // Find the matching closing brace
        let depth = 0, i = start, found = -1;
        while (i < content.length) {
            if (content[i] === '{') depth++;
            else if (content[i] === '}') { depth--; if (depth === 0) { found = i; break; } }
            i++;
        }
        if (found > -1) {
            // Include the semicolon after }
            const end = content[found+1] === ';' ? found+2 : found+1;
            content = content.substring(0, start) + NEW_FN + content.substring(end);
            console.log('Replaced getDashboardData successfully');
        }
    }
} else {
    content = content.replace(regex, NEW_FN);
    console.log('Replaced getDashboardData via regex');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done: adminViewService.js patched with revenue + overdue + unassigned metrics');
