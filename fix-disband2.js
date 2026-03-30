const fs = require('fs');
let c = fs.readFileSync('staff-system/views/admin/teams.ejs', 'utf8');

c = c.replace(
    `          let msg = \`Terminate team mapping for [\${eventTitle}]?\`;
          if (eligibility.success) {
              if (!eligibility.eventCompleted) {
                  msg = \`WARNING: Event [\${eventTitle}] is not designated as "Completed".\\nOverride and terminate mapping regardless?\`;
              } else if (!eligibility.allPaymentsDone) {
                  msg = \`WARNING: Financial transfers pending for [\${eventTitle}].\\nOverride and terminate mapping regardless?\`;
              }
          }
          if (!confirm(msg)) return;`,
    `          if (eligibility.success && !eligibility.canDisband) {
              const unpaid = eligibility.unpaidStaff && eligibility.unpaidStaff.length
                  ? '\\n\\nUnpaid staff: ' + eligibility.unpaidStaff.join(', ')
                  : '';
              showToast('Cannot disband — ' + (eligibility.reason || 'some staff are unpaid') + unpaid, 'error');
              return;
          }
          if (!confirm('Disband team for [' + eventTitle + ']? This cannot be undone.')) return;`
);

fs.writeFileSync('staff-system/views/admin/teams.ejs', c);

// Verify
const v = fs.readFileSync('staff-system/views/admin/teams.ejs', 'utf8');
console.log('canDisband check exists:', v.includes('canDisband'));
console.log('unpaidStaff shown:', v.includes('unpaidStaff'));
console.log('old check removed:', !v.includes('eventCompleted'));
