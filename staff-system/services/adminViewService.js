const Staff = require('../models/Staff');
const Assignment = require('../models/Assignment');
const EventTeam = require('../models/EventTeam');
const Attendance = require('../models/Attendance');
const AuditLog = require('../models/AuditLog');
const ReplacementRequest = require('../models/ReplacementRequest');
const PerformanceReview = require('../models/PerformanceReview');
const TeamActionsLog = require('../models/TeamActionsLog');
const StaffCategorySettings = require('../models/StaffCategorySettings');
const CategorySetting = require('../models/StaffCategorySettings');
const mongoose = require('mongoose');

exports.getAllTeamsData = async () => {
    const teams = await EventTeam.find()
        .populate('event_id', 'title date location status')
        .populate('supervisor_id', 'name role phone')
        .populate('member_ids', 'name role phone status')
        .sort({ createdAt: -1 });

    const recruitingCount = teams.filter(t => t.status === 'Forming').length;
    const avgReadiness = teams.length > 0
        ? Math.round(teams.reduce((acc, t) => acc + (t.team_readiness || 0), 0) / teams.length)
        : 0;
    return { teams, recruitingCount, avgReadiness };
};

exports.getTeamCreateData = async () => {
    const teams = await EventTeam.find().select('event_id');
    const teamEventIds = teams.map(t => t.event_id);

    const assignments = await Assignment.find({
        _id: { $nin: teamEventIds },
        status: 'Active'
    }).select('_id title date location');

    const supervisors = await Staff.find({ status: 'Active' }).select('_id name specific_role role');
    const availableStaff = await Staff.find({ role: 'Staff', status: 'Active' }).select('_id name');

    return { assignments, supervisors, staff: availableStaff };
};

exports.getDashboardData = async () => {
    const totalStaff = await Staff.countDocuments();
    const availableStaff = await Staff.countDocuments({ availability_status: 'Available' });
    const busyStaff = await Staff.countDocuments({ availability_status: 'Busy' });
    const activeAssignments = await Assignment.countDocuments({ status: 'Active' });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const clockedInStaff = await Attendance.countDocuments({
        clock_in: { $gte: today },
        clock_out: null
    });

    const pendingPayments = await Assignment.countDocuments({ payment_status: 'Pending' });

    const recentAuditLogs = await AuditLog.find()
        .sort({ timestamp: -1 })
        .limit(10)
        .populate('performedBy', 'name email')
        .lean();

    const allAssignments = await Assignment.find().sort({ createdAt: -1 })
        .populate('assigned_staff_ids', 'name')
        .populate('accepted_staff_ids', 'name');

    const pendingReplacements = await ReplacementRequest.find({ status: 'Pending' })
        .populate('team_id')
        .populate('requested_by', 'name role')
        .populate('original_staff_id', 'name')
        .sort({ requested_at: -1 });

    const recentSubmissions = await Attendance.find({ status: { $ne: 'Pending' } })
        .sort({ clock_out: -1 })
        .limit(5)
        .populate('staff_id', 'name')
        .populate('assignment_id', 'title date');

    const activeTeams = await EventTeam.find({ status: 'Active' })
        .populate('event_id', 'title date location')
        .populate('supervisor_id', 'name phone')
        .populate('member_ids', 'name availability_status role')
        .lean();

    for (let team of activeTeams) {
        if (!team.event_id) continue;
        const requiredStaff = await Assignment.findById(team.event_id._id).select('required_staff');
        team.required_staff_count = requiredStaff ? requiredStaff.required_staff : 0;
    }

    return {
        stats: { totalStaff, availableStaff, busyStaff, activeAssignments, clockedInStaff, pendingPayments },
        recentAuditLogs, allAssignments, pendingReplacements, recentSubmissions, activeTeams
    };
};

exports.getStaffManagementPageData = async (queryFilters) => {
    const { search, role: filterRole, status: filterStatus } = queryFilters;
    const query = {};
    if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
    if (filterRole) query.role = filterRole;
    if (filterStatus) query.status = filterStatus;

    const staffList = await Staff.find(query).select('-password').populate('supervisor_id', 'name email').sort({ createdAt: -1 });
    const all = await Staff.find().select('role status');
    const stats = {
        total: all.length,
        active: all.filter(s => s.status === 'Active').length,
        suspended: all.filter(s => s.status === 'Suspended').length,
        supervisors: all.filter(s => s.role === 'Supervisor').length
    };

    let enabledCategories = [];
    try {
        const CategorySetting = require('../models/StaffCategorySettings');
        enabledCategories = await CategorySetting.find({ is_enabled: true }).select('category').lean();
    } catch (e) {
        enabledCategories = ['Usher', 'Brand Ambassador', 'Supervisor', 'Event Planner', 'Organiser', 'Wedding Planner', 'Ticketing Agent'].map(c => ({ category: c }));
    }

    return { staffList, stats, enabledCategories, filters: { search, role: filterRole, status: filterStatus } };
};

exports.getEventsPageData = async (queryFilters) => {
    const { search, status: filterStatus, vip } = queryFilters;
    const query = {};
    if (filterStatus) query.status = filterStatus;
    if (vip === 'true') query.vip_flag = true;
    if (search) query.title = { $regex: search, $options: 'i' };

    const assignmentsDocs = await Assignment.find(query)
        .populate('assigned_staff_ids', 'name')
        .populate('accepted_staff_ids', 'name')
        .populate('applicant_ids', 'name')
        .populate('supervisor_id', 'name')
        .sort({ createdAt: -1 });

    const allAsn = await Assignment.find();

    const ClientETR = require('../../server/models/ClientETR');
    const assignmentIds = assignmentsDocs.map(a => a._id);
    const etrs = await ClientETR.find({ event_id: { $in: assignmentIds } }).sort({ version: 1 }).lean();
    const etrMap = {};
    for (const etr of etrs) {
        etrMap[etr.event_id.toString()] = etr;
    }

    const assignments = assignmentsDocs.map(a => {
        const obj = typeof a.toObject === 'function' ? a.toObject() : a;
        obj.etr = etrMap[a._id.toString()] || null;
        return obj;
    });

    const stats = {
        active: allAsn.filter(a => a.status === 'Active').length,
        completed: allAsn.filter(a => a.status === 'Completed').length,
        vip: allAsn.filter(a => a.vip_flag).length,
        totalStaffAssigned: new Set(allAsn.flatMap(a => (a.assigned_staff_ids || []).map(id => id.toString()))).size
    };

    return { assignments, stats, filters: { search, status: filterStatus, vip } };
};

exports.getAttendancePageData = async (queryFilters) => {
    const { status: filterStatus, date: filterDate, page = 1 } = queryFilters;
    const limit = 50;
    const skip = (parseInt(page) - 1) * limit;
    const query = {};
    if (filterStatus) query.status = filterStatus;
    if (filterDate) {
        const d = new Date(filterDate);
        const next = new Date(d); next.setDate(next.getDate() + 1);
        query.clock_in = { $gte: d, $lt: next };
    }

    const total = await Attendance.countDocuments(query);
    const attendance = await Attendance.find(query)
        .populate({ path: 'staff_id', select: 'name email role', options: { strictPopulate: false } })
        .populate({ path: 'assignment_id', select: 'title date location', options: { strictPopulate: false } })
        .sort({ clock_in: -1 }).skip(skip).limit(limit);

    const lateCount = await Attendance.countDocuments({ status: 'Late' });
    const onTimeCount = await Attendance.countDocuments({ status: 'On Time' });
    const proximityDenied = await Attendance.countDocuments({ proximity_denied: true });
    
    const hoursAgg = await Attendance.aggregate([{ $group: { _id: null, total: { $sum: '$total_hours' } } }]);
    const allHours = hoursAgg[0] ? hoursAgg[0].total : 0;
    
    const assignments = await Assignment.find().select('_id title').sort({ date: -1 });
    const staffList = await Staff.find({ status: 'Active' }).select('_id name');

    return {
        attendance, assignments, staffList, lateCount, onTimeCount, allHours, proximityDenied,
        pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total },
        filter: { status: filterStatus, date: filterDate }
    };
};

exports.getPaymentsPageData = async (queryFilters) => {
    const { payment_status, page = 1 } = queryFilters;
    const limit = 30;
    const skip = (parseInt(page) - 1) * limit;
    const filter = {};
    if (payment_status) filter.payment_status = payment_status;

    const total = await Assignment.countDocuments(filter);
    const rawAssignments = await Assignment.find(filter)
        .populate('accepted_staff_ids', 'name email phone')
        .sort({ date: -1 }).skip(skip).limit(limit);

    const assignments = [];
    rawAssignments.forEach(a => {
        const obj = a.toObject();
        const staffCount = obj.staff_payments?.length || obj.accepted_staff_ids?.length || 0;
        const paidCount = obj.staff_payments?.filter(sp => sp.status === 'Received' || sp.status === 'Disbursed').length || 0;
        let overallStatus = 'Pending';
        if (staffCount > 0 && paidCount === staffCount) overallStatus = 'Received';
        else if (paidCount > 0) overallStatus = 'Partial';
        else if (obj.payment_status === 'Sent') overallStatus = 'Sent';
        assignments.push({
            _id: obj._id,
            title: obj.title,
            date: obj.date,
            pay_rate: obj.pay_rate,
            payment_status: overallStatus,
            status: obj.status,
            staff_count: staffCount,
            paid_count: paidCount
        });
    });

    const stats = {
        pending: await Assignment.countDocuments({ payment_status: 'Pending' }),
        sent: await Assignment.countDocuments({ payment_status: 'Sent' }),
        received: await Assignment.countDocuments({ payment_status: 'Received' }),
        disputed: await Assignment.countDocuments({ payment_status: 'Disputed' })
    };

    const allPaid = await Assignment.find({ payment_status: { $in: ['Sent', 'Received'] } }).select('pay_rate');
    stats.total_kes = allPaid.reduce((acc, a) => acc + (a.pay_rate || 0), 0);

    const rawMaps = rawAssignments.map(a => {
        const obj = a.toObject(); 
        return { 
            _id: obj._id, title: obj.title, date: obj.date, pay_rate: obj.pay_rate, 
            payment_status: obj.payment_status, status: obj.status, booking_ref: obj.booking_ref, 
            accepted_staff_ids: obj.accepted_staff_ids, staff_payments: obj.staff_payments || [] 
        }; 
    });

    return {
        assignments, rawAssignments: rawMaps, stats,
        pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total },
        filters: { payment_status }
    };
};

exports.getReportsPageData = async () => {
    const assignments = await Assignment.find()
        .select('_id title date location status payment_status')
        .sort({ createdAt: -1 });
    return { assignments };
};

exports.getAuditLogsPageData = async (queryFilters) => {
    const { actionType, page = 1 } = queryFilters;
    const limit = 50;
    const skip = (parseInt(page) - 1) * limit;
    const filter = {};
    if (actionType) filter.actionType = actionType;

    const total = await AuditLog.countDocuments(filter);
    const logs = await AuditLog.find(filter)
        .populate('performedBy', 'name role')
        .sort({ timestamp: -1 }).skip(skip).limit(limit);
    const actionTypes = await AuditLog.distinct('actionType');

    return {
        logs, actionTypes,
        pagination: { page: parseInt(page), totalPages: Math.ceil(total / limit), total },
        filters: { actionType }
    };
};

exports.getSecurityPageData = async () => {
    const proximityDenied = await AuditLog.find({ actionType: 'CLOCK_IN_DENIED' })
        .populate('performedBy', 'name role').sort({ timestamp: -1 }).limit(20);
    const overrides = await AuditLog.find({ actionType: 'PROXIMITY_OVERRIDE' })
        .populate('performedBy', 'name role').sort({ timestamp: -1 }).limit(20);
    const spoofAttempts = await AuditLog.find({ actionType: 'GPS_SPOOF_DETECTED' })
        .populate('performedBy', 'name role').sort({ timestamp: -1 }).limit(20);
    const passwordResets = await AuditLog.find({ actionType: 'PASSWORD_RESET' })
        .populate('performedBy', 'name role').sort({ timestamp: -1 }).limit(20);
    const suspendedStaff = await Staff.find({ status: 'Suspended' }).select('name email role');

    return { proximityDenied, overrides, spoofAttempts, passwordResets, suspendedStaff };
};

exports.getLeaderboardPageData = async () => {
    const leaderboard = await PerformanceReview.aggregate([
        {
            $group: {
                _id:          '$staff_id',
                avg_rating:   { $avg: '$rating' },
                total_reviews:{ $sum: 1 },
                latest_review:{ $max: '$createdAt' }
            }
        },
        { $sort: { avg_rating: -1, total_reviews: -1 } },
        { $limit: 20 },
        {
            $lookup: {
                from:         'staffs',
                localField:   '_id',
                foreignField: '_id',
                as:           'staff'
            }
        },
        { $unwind: '$staff' },
        {
            $project: {
                staff_id:    '$_id',
                name:        '$staff.name',
                photo_url:   '$staff.photo_url',
                category:    '$staff.category',
                status:      '$staff.status',
                avg_rating:  { $round: ['$avg_rating', 1] },
                total_reviews: 1,
                latest_review: 1
            }
        }
    ]);

    const enriched = await Promise.all(leaderboard.map(async (entry, idx) => {
        const eventCount = await Assignment.countDocuments({ accepted_staff_ids: entry.staff_id });
        return { ...entry, events_worked: eventCount, rank: idx + 1 };
    }));

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyTrend = await PerformanceReview.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        {
            $group: {
                _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
                avg_rating: { $avg: '$rating' },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    return { leaderboard: enriched, monthlyTrend };
};

exports.getCategorySettingsPageData = async () => {
    const DEFAULT_CATEGORIES = [
        { category: 'Usher',            icon: 'fa-user-tie',        color: '#10b981', description: 'Event ushers and hosts' },
        { category: 'Brand Ambassador', icon: 'fa-bullhorn',         color: '#3b82f6', description: 'Promotional and brand reps' },
        { category: 'Supervisor',       icon: 'fa-user-shield',      color: '#f59e0b', description: 'Team supervisors' },
        { category: 'Event Planner',    icon: 'fa-calendar-check',   color: '#8b5cf6', description: 'Event planning staff' },
        { category: 'Organiser',        icon: 'fa-clipboard-list',   color: '#ec4899', description: 'Event organisers' },
        { category: 'Wedding Planner',  icon: 'fa-heart',            color: '#f43f5e', description: 'Wedding specialisation' },
        { category: 'Ticketing Agent',  icon: 'fa-ticket',           color: '#06b6d4', description: 'Ticketing and gate agents' },
        { category: 'Event Coordinator',icon: 'fa-sitemap',          color: '#14b8a6', description: 'Coordination leads' },
        { category: 'Technical Crew',   icon: 'fa-screwdriver-wrench',color: '#64748b', description: 'Technical and AV crew' },
        { category: 'Security',         icon: 'fa-shield-halved',    color: '#ef4444', description: 'Security personnel' },
    ];

    for (const cat of DEFAULT_CATEGORIES) {
        await StaffCategorySettings.findOneAndUpdate(
            { category: cat.category },
            { $setOnInsert: cat },
            { upsert: true, new: false }
        );
    }

    const settings = await StaffCategorySettings.find().sort({ category: 1 }).lean();

    const staffCounts = await Staff.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    staffCounts.forEach(s => { countMap[s._id] = s.count; });

    return { settings, countMap };
};