/**
 * eventPredictionService.js
 * AI Event Operations Brain & Learning Integration
 */

const Assignment     = require('../models/Assignment');
const Booking        = require('../models/SharedBooking');
const ClientInvoice  = require('../models/ClientInvoice');
const PricingSettings   = require('../models/PricingSettings');
const StaffPerformanceProfile = require('../models/StaffPerformanceProfile');
const SupervisorRatingProfile = require('../models/SupervisorRatingProfile');
const performanceService = require('./performanceService');
const aiLearningService = require('../ai-learning/aiLearningService');

const KEYWORD_MAP = {
    'wedding':     'Wedding',
    'anniversary': 'Anniversary',
    'birthday':    'Birthday Party',
    'house party': 'Family & House Party',
    'family':      'Family & House Party',
    'traditional': 'Traditional Ceremony',
    'memorial':    'Memorial Service',
    'corporate':   'Corporate Event',
    'ambassador':  'Brand Ambassador Event',
    'product launch': 'Product Launch',
    'celebration': 'Private Celebration',
    'decor':       'Luxury Decor & Styling',
    'styling':     'Luxury Decor & Styling'
};

function parseHours(startTime, endTime) {
    if (!startTime || !endTime) return 6;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (isNaN(sh) || isNaN(eh)) return 6;
    let hours = (eh + em / 60) - (sh + sm / 60);
    if (hours <= 0) hours += 24;
    return Math.max(hours, 1);
}

function guessEventType(title) {
    if (!title) return null;
    const lower = title.toLowerCase();
    for (const [keyword, type] of Object.entries(KEYWORD_MAP)) {
        if (lower.includes(keyword)) return type;
    }
    return null;
}

async function generatePrediction(assignmentId) {
    const assignment = await Assignment.findById(assignmentId)
        .populate('accepted_staff_ids', '_id')
        .populate('assigned_staff_ids', '_id');

    if (!assignment) throw new Error('Assignment not found');

    const dataQuality = {
        hasBooking: false,
        hasInvoice: false,
        hasReviews: false,
        historicalEventsUsed: 0
    };
    const recommendations = [];
    const explanations = [];
    let baseConfidence = 1.0;

    let eventType = null;
    let booking = null;
    let guestCount = null;

    if (assignment.booking_ref) {
        booking = await Booking.findOne({ bookingReference: assignment.booking_ref })
            .setOptions({ _recursed: true });
        if (booking) {
            dataQuality.hasBooking = true;
            eventType = booking.eventType;
            guestCount = booking.guests;
        }
    }

    if (!eventType) {
        eventType = guessEventType(assignment.title);
        if (!dataQuality.hasBooking) {
            baseConfidence -= 0.15;
        }
    }

    // ── Pre-fetch A.I. Learning Insights ────────────────────────
    const staffIds = [
        ...(assignment.accepted_staff_ids || []).map(s => s._id || s),
        ...(assignment.assigned_staff_ids || []).map(s => s._id || s)
    ];

    const { merged: aiInsights, raw: rawInsights } = await aiLearningService.getInsights({
        eventType: eventType,
        clientId: assignment.client_id ? assignment.client_id.toString() : null,
        staffIds: staffIds.map(id => id.toString())
    });

    // ── Staffing Prediction ─────────────────────────────────────
    let predictedStaff;
    const historyQuery = { status: 'Completed', _id: { $ne: assignment._id } };

    if (eventType) {
        const allCompletedAssignments = await Assignment.find(historyQuery).select('booking_ref title accepted_staff_ids pay_rate start_time end_time usherCount clientPaymentAmount').lean();

        const matchedHistory = [];
        for (const hist of allCompletedAssignments) {
            let histType = null;
            if (hist.booking_ref) {
                const histBooking = await Booking.findOne({ bookingReference: hist.booking_ref })
                    .select('eventType')
                    .setOptions({ _recursed: true })
                    .lean();
                if (histBooking) histType = histBooking.eventType;
            }
            if (!histType) histType = guessEventType(hist.title);

            if (histType === eventType) {
                matchedHistory.push(hist);
            }
        }
        dataQuality.historicalEventsUsed = matchedHistory.length;

        if (matchedHistory.length === 0) {
            baseConfidence -= 0.4;
            recommendations.push('Limited historical data available — prediction based on defaults');
        } else if (matchedHistory.length < 3) {
            baseConfidence -= 0.15;
            recommendations.push('Only ' + matchedHistory.length + ' similar past event(s) found — prediction may be less accurate');
        }

        if (matchedHistory.length > 0) {
            const avgStaff = matchedHistory.reduce((sum, h) => sum + (h.accepted_staff_ids?.length || h.usherCount || 2), 0) / matchedHistory.length;
            predictedStaff = Math.max(Math.ceil(avgStaff), 1);
        } else {
            const base = guestCount || assignment.usherCount || 5;
            predictedStaff = Math.max(Math.ceil(base / 15), 2);
        }
    } else {
        const base = assignment.usherCount || 5;
        predictedStaff = Math.max(Math.ceil(base / 15), 2);
        baseConfidence -= 0.3;
        recommendations.push('Could not determine event type — using default staffing formula');
        dataQuality.historicalEventsUsed = 0;
    }

    // Apply AI Insight Adjustment for Staff
    if (aiInsights && aiInsights.staffCount) {
        if (Math.abs(aiInsights.staffCount - predictedStaff) >= 1) {
            predictedStaff = Math.ceil((predictedStaff + aiInsights.staffCount) / 2); // Blended
            explanations.push(`Adjusted predicted staff based on learned historical patterns (${aiInsights.staffCount.toFixed(1)} avg).`);
        }
    }

    // ── Cost & Profit Ranges ────────────────────────────────────
    const pricing = await PricingSettings.findOne().lean();
    const supervisorCost = pricing?.globalSupervisorRate || 5000;

    const hours = parseHours(assignment.start_time, assignment.end_time);
    const payRate = assignment.pay_rate || 1000;
    const staffCost = predictedStaff * payRate * hours;
    let estimatedCost = Math.round(staffCost + supervisorCost);

    if (aiInsights && aiInsights.cost) {
        estimatedCost = Math.round((estimatedCost + aiInsights.cost) / 2);
        explanations.push(`Cost prediction weighted by learned baseline (historical avg: KSh ${aiInsights.cost.toLocaleString()}).`);
    }

    // Generating variance for min/max range (+/- 15%)
    const estimatedCostRange = {
        min: Math.round(estimatedCost * 0.85),
        max: Math.round(estimatedCost * 1.15)
    };

    let estimatedProfit = null;
    let revenueSource = null;
    let estimatedProfitRange = null;

    const invoice = await ClientInvoice.findOne({ eventId: assignment._id }).lean();
    if (invoice && invoice.totalAmount > 0) {
        dataQuality.hasInvoice = true;
        estimatedProfit = Math.round(invoice.totalAmount - estimatedCost);
        revenueSource = invoice.totalAmount;
    } else if (assignment.clientPaymentAmount > 0) {
        estimatedProfit = Math.round(assignment.clientPaymentAmount - estimatedCost);
        revenueSource = assignment.clientPaymentAmount;
        baseConfidence -= 0.1;
    } else {
        baseConfidence -= 0.2;
        recommendations.push('No revenue data available — profit cannot be estimated');
    }

    if (!dataQuality.hasInvoice) {
        baseConfidence -= 0.05;
    }

    if (aiInsights && aiInsights.profit && revenueSource) {
        estimatedProfit = Math.round((estimatedProfit + aiInsights.profit) / 2);
        explanations.push('Profit adjusted to align with historical margin patterns.');
    }

    if (estimatedProfit !== null) {
        estimatedProfitRange = {
            min: Math.round(estimatedProfit * 0.8), // Wider margin for profit variance
            max: Math.round(estimatedProfit * 1.2)
        };
    }

    // ── Staff Reliability & Performance Intelligence ────────────
    let avgRating = 3.0;
    let avgAttendance = 100;
    let teamRebookPct = 100;
    let totalActiveFlags = 0;

    if (staffIds.length > 0) {
        const profiles = await StaffPerformanceProfile.find({ staff_id: { $in: staffIds } }).lean();
        if (profiles.length > 0) {
            dataQuality.hasReviews = true;
            avgRating = profiles.reduce((sum, p) => sum + (p.average_overall_score || 3.0), 0) / profiles.length;
            avgAttendance = profiles.reduce((sum, p) => sum + (p.attendance_rate !== null ? p.attendance_rate : 100), 0) / profiles.length;
            teamRebookPct = profiles.reduce((sum, p) => sum + (p.would_rebook_percentage || 100), 0) / profiles.length;
            
            profiles.forEach(p => {
                const activeFlags = (p.disciplinary_flags || []).length;
                totalActiveFlags += activeFlags;
            });
        }
    }

    let activeSupervisorRating = 3.0;
    let supervisorFraudHistory = 0;
    if (assignment.event_supervisor_id) {
        const supProfile = await SupervisorRatingProfile.findOne({ staff_id: assignment.event_supervisor_id }).lean();
        if (supProfile) {
            activeSupervisorRating = supProfile.supervisor_rating || 3.0;
            supervisorFraudHistory = supProfile.events_with_fraud_flags || 0;
        }
    }

    // ── Dynamic Confidence Score ────────────────────────────────
    // Combine base heuristic confidence with AI Model insight confidence
    let confidenceScore = Math.max(0, Math.min(100, Math.round(baseConfidence * 100)));
    if (rawInsights && rawInsights.global && rawInsights.global.confidence) {
        confidenceScore = Math.round((confidenceScore + rawInsights.global.confidence) / 2);
        explanations.push(`Confidence score factored strongly by learned model sample size (${rawInsights.global.sample_size} events).`);
    } else {
        explanations.push('Insights model lacks data for this event parameters; relying on heuristic defaults.');
        confidenceScore = Math.min(confidenceScore, 40); // Cap heavily if AI is untrained
    }

    // ── Upgraded Risk Model (0-100) ─────────────────────────────
    let riskScore = 0;

    const currentStaff = (assignment.accepted_staff_ids?.length || 0) + (assignment.assigned_staff_ids?.length || 0);
    const staffingGap = predictedStaff - currentStaff;

    // Base risk mapping
    if (staffingGap > 3) riskScore += 40;
    else if (staffingGap > 1) riskScore += 25;
    else if (staffingGap > 0) riskScore += 10;

    if (revenueSource && revenueSource > 0) {
        const ratio = estimatedCost / revenueSource;
        if (ratio > 0.9) riskScore += 30;
        else if (ratio > 0.7) riskScore += 20;
        else if (ratio > 0.5) riskScore += 10;
    } else {
        riskScore += 15;
    }

    if (avgRating < 3.0) riskScore += 20;
    if (avgRating > 4.5) riskScore -= 10;
    if (avgAttendance < 70) riskScore += 15;
    if (activeSupervisorRating < 3.5) riskScore += 10;
    if (activeSupervisorRating > 4.5) riskScore -= 10;
    if (teamRebookPct < 60) riskScore += 10;
    if (totalActiveFlags >= 3) riskScore += 15;
    else if (totalActiveFlags > 0) riskScore += 5;
    if (supervisorFraudHistory > 2) riskScore += 15;

    // Bounds check
    riskScore = Math.max(0, Math.min(100, riskScore));

    let riskLabel = 'LOW';
    if (riskScore >= 75) riskLabel = 'CRITICAL';
    else if (riskScore >= 50) riskLabel = 'HIGH';
    else if (riskScore >= 25) riskLabel = 'MEDIUM';


    // ── Generate recommendations ────────────────────────────────
    if (staffingGap > 0) recommendations.push(`Consider adding ${staffingGap} more staff member(s) — predicted need is ${predictedStaff}`);
    if (staffingGap > 3) recommendations.push('CRITICAL: Significant understaffing risk detected');
    if (revenueSource && estimatedCost / revenueSource > 0.8) recommendations.push('Cost margin is tight — review pricing or reduce operational costs');
    if (avgRating < 3.0 && dataQuality.hasReviews) recommendations.push('Average staff rating is below 3.0 — consider assigning higher-rated staff');
    if (avgAttendance < 70) recommendations.push('Team attendance rate is below 70% — increased risk of no-shows');
    if (activeSupervisorRating < 3.5) recommendations.push('Supervisor rating is below 3.5 — closer oversight recommended');
    if (teamRebookPct < 60) recommendations.push('Team rebook percentage is low — client satisfaction may be impacted');
    
    if (totalActiveFlags > 0) {
        recommendations.push(`${totalActiveFlags} assigned staff member(s) have active disciplinary flags. Risk score increased.`);
    }
    if (supervisorFraudHistory > 2) {
        recommendations.push('Assigned supervisor has a history of fraud flag incidents. Review assignment carefully.');
    }

    if (riskLabel === 'CRITICAL' || riskLabel === 'HIGH') {
        recommendations.push(`${riskLabel} risk event — recommend senior supervisor oversight`);
        if (global.io) {
            global.io.to('Admin').emit('cmd:risk_escalation', {
                event_id: assignmentId,
                event_name: assignment.title,
                risk_level: riskLabel,
                risk_score: riskScore,
                recommendations,
                timestamp: new Date()
            });
        }
    }

    // ── Generate Intelligence Recommendations (Supervisor & Team) ──
    const supervisorRecs = await performanceService.getBestSupervisors(eventType);
    let recommendedSupervisor = null;
    if (supervisorRecs.length > 0) {
        const top = supervisorRecs[0];
        recommendedSupervisor = {
            staff_id: top.staff_id._id,
            name: `${top.staff_id.firstname} ${top.staff_id.lastname}`,
            supervisor_rating: top.supervisor_rating,
            total_events_supervised: top.total_events_supervised,
            average_team_score: top.average_team_score
        };
    }

    const topStaff = await performanceService.getTopPerformers(5);
    const recommendedTeam = [];
    if (topStaff.length > 0) {
        const candidateIds = topStaff.map(s => s.staff_id._id);
        const compScore = null; // Removed heavy call
        
        for (const s of topStaff) {
            recommendedTeam.push({
                staff_id: s.staff_id._id,
                name: `${s.staff_id.firstname} ${s.staff_id.lastname}`,
                role: s.staff_id.role || 'Staff',
                average_score: s.average_overall_score,
                compatibility_score: compScore
            });
        }
    }

    return {
        predictedStaff,
        estimatedCost,
        estimatedCostRange,
        estimatedProfit,
        estimatedProfitRange,
        riskScore,
        riskLabel,
        confidenceScore,
        recommendations,
        explanations,
        dataQuality,
        recommendedSupervisor,
        recommendedTeam
    };
}

module.exports = { generatePrediction };
