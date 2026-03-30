const fs = require('fs');

let content = fs.readFileSync('staff-system/views/admin/teams.ejs', 'utf8');

const oldFn = `  async function disbandTeamFromList(teamId, eventTitle) {
      try {
          const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
          const check = await fetch(\`/portal/admin-staff/event-teams/\${teamId}/disband-check\`);
          const eligibility = await check.json();
          let msg = \`Terminate team mapping for [\${eventTitle}]?\`;
          if (eligibility.success) {
              if (!eligibility.eventCompleted) {
                  msg = \`WARNING: Event [\${eventTitle}] is not designated as "Completed".\\nOverride and terminate mapping regardless?\`;
              } else if (!eligibility.allPaymentsDone) {
                  msg = \`WARNING: Financial transfers pending for [\${eventTitle}].\\nOverride and terminate mapping regardless?\`;
              }
          }
          if (!confirm(msg)) return;
          const r = await fetch(\`/portal/admin-staff/event-teams/\${teamId}/disband\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrf }
          });
          const d = await r.json();
          if (d.success) {
              showToast('Matrix unlinked permanently', 'success');
              setTimeout(() => location.reload(), 1500);
          } else {
              showToast(d.error || 'Termination rejected', 'error');
          }
      } catch(err) {
          showToast('Connection failed', 'error');
      }
  }`;

const newFn = `  async function disbandTeamFromList(teamId, eventTitle) {
      try {
          const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
          const check = await fetch(\`/portal/admin-staff/event-teams/\${teamId}/disband-check\`);
          const eligibility = await check.json();

          if (eligibility.success && !eligibility.canDisband) {
              const unpaid = eligibility.unpaidStaff && eligibility.unpaidStaff.length
                  ? '\\n\\nUnpaid staff:\\n- ' + eligibility.unpaidStaff.join('\\n- ')
                  : '';
              showToast('Cannot disband: ' + (eligibility.reason || 'Some staff are unpaid') + unpaid, 'error');
              return;
          }

          if (!confirm('Disband team for [' + eventTitle + ']? This cannot be undone.')) return;

          const r = await fetch(\`/portal/admin-staff/event-teams/\${teamId}/disband\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrf }
          });
          const d = await r.json();
          if (d.success) {
              showToast('Team disbanded successfully.', 'success');
              setTimeout(() => location.reload(), 1500);
          } else {
              showToast(d.message || d.error || 'Could not disband team.', 'error');
          }
      } catch(err) {
          showToast('Connection failed — please try again.', 'error');
      }
  }`;

if (content.includes(oldFn)) {
    content = content.replace(oldFn, newFn);
    fs.writeFileSync('staff-system/views/admin/teams.ejs', content);
    console.log('Fixed - disband function updated');
} else {
    console.log('Pattern not found exactly - trying partial match...');
    // Try replacing just the error handling part
    content = content.replace(
        "showToast(d.error || 'Termination rejected', 'error');",
        "showToast(d.message || d.error || 'Could not disband team.', 'error');"
    );
    content = content.replace(
        "showToast('Matrix unlinked permanently', 'success');",
        "showToast('Team disbanded successfully.', 'success');"
    );
    // Fix the eligibility check
    content = content.replace(
        `if (eligibility.success) {
              if (!eligibility.eventCompleted) {
                  msg = \`WARNING: Event [\${eventTitle}] is not designated as "Completed".\\nOverride and terminate mapping regardless?\`;
              } else if (!eligibility.allPaymentsDone) {
                  msg = \`WARNING: Financial transfers pending for [\${eventTitle}].\\nOverride and terminate mapping regardless?\`;
              }
          }
          if (!confirm(msg)) return;`,
        `if (eligibility.success && !eligibility.canDisband) {
              const unpaid = eligibility.unpaidStaff && eligibility.unpaidStaff.length
                  ? '\\n\\nUnpaid: ' + eligibility.unpaidStaff.join(', ')
                  : '';
              showToast('Cannot disband: ' + (eligibility.reason || 'Some staff are unpaid') + unpaid, 'error');
              return;
          }
          if (!confirm('Disband team for [' + eventTitle + ']? This cannot be undone.')) return;`
    );
    fs.writeFileSync('staff-system/views/admin/teams.ejs', content);
    console.log('Applied partial fixes');
}
