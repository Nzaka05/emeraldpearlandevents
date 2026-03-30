const fs = require('fs');

// ── 1. Fix eventTeamService.js ────────────────────────────────────────────────
let svc = fs.readFileSync('staff-system/services/eventTeamService.js', 'utf8');

svc = svc.replace(
    `const allPaid = event.staff_payments.every(
        (p) => p.status === 'Received' || p.status === 'Disbursed'
    );

    return { canDisband: allPaid, reason: allPaid ? '' : 'Not all staff have been paid yet.' };`,
    `const unpaid = event.staff_payments.filter(
        p => p.status !== 'Received' && p.status !== 'Disbursed'
    );
    const canDisband = unpaid.length === 0;
    const unpaidNames = unpaid.map(p => p.staff_name || p.staff_id?.toString() || 'Unknown staff');
    const reason = canDisband ? '' : unpaid.length + ' staff member(s) still unpaid: ' + unpaidNames.join(', ');
    return { canDisband, reason, unpaidStaff: unpaidNames };`
);

fs.writeFileSync('staff-system/services/eventTeamService.js', svc);
console.log('Service updated:', svc.includes('unpaidNames'));

// ── 2. Fix adminEventsController.js ──────────────────────────────────────────
let ctrl = fs.readFileSync('staff-system/controllers/adminEventsController.js', 'utf8');

ctrl = ctrl.replace(
    `if (!result.canDisband)
            return res.json({ success: true, canDisband: false, reason: result.reason });`,
    `if (!result.canDisband)
            return res.json({ success: true, canDisband: false, reason: result.reason, unpaidStaff: result.unpaidStaff || [] });`
);

fs.writeFileSync('staff-system/controllers/adminEventsController.js', ctrl);
console.log('Controller updated:', ctrl.includes('unpaidStaff'));
