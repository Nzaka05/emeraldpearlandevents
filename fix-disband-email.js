const fs = require('fs');
let svc = fs.readFileSync('staff-system/services/eventTeamService.js', 'utf8');

// Fix 1: Remove the redundant allPaid check in disbandTeam (already checked in checkDisbandEligibility)
svc = svc.replace(
    `    const allPaid = event.staff_payments.every(p => p.status === 'Received' || p.status === 'Disbursed');
    if (!allPaid) throw new Error('Cannot disband team. Some staff have unpaid balances.');`,
    `    // Payment check done in checkDisbandEligibility before reaching here`
);

// Fix 2: Fix email service call - it expects array format not plain string
svc = svc.replace(
    `        if (staff.email) {
            await emailService.sendEmail({
                to: staff.email,
                subject: 'Team Disbanded - Event Completed',
                html: \`<p>Hello \${staff.name || 'Team Member'},</p>
                     <p>Your team for event <strong>\${event.client_name || event.title || 'Event'}</strong> has now been officially disbanded.</p>\`
            });
        }`,
    `        if (staff.email) {
            await emailService.sendEmail({
                to: [{ email: staff.email, name: staff.name || 'Team Member' }],
                subject: 'Team Disbanded - Event Completed',
                htmlContent: \`<p>Hello \${staff.name || 'Team Member'},</p>
                     <p>Your team for event <strong>\${event.client_name || event.title || 'Event'}</strong> has now been officially disbanded.</p>\`
            }).catch(e => console.warn('[Disband Email]', e.message));
        }`
);

fs.writeFileSync('staff-system/services/eventTeamService.js', svc);
console.log('disbandTeam fixed:', svc.includes('Payment check done'));
console.log('email format fixed:', svc.includes('htmlContent'));

// Fix 3: Fix admin Pearl - the duplicate const issue from layout conflict
// The layout.ejs has a notification fetch that calls sendMessage - let's check
let layout = fs.readFileSync('staff-system/views/layout.ejs', 'utf8');
console.log('Layout has sendMessage:', layout.includes('sendMessage'));
