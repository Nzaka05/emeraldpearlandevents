const fs = require('fs');
let c = fs.readFileSync('staff-system/services/aiAssistantService.js', 'utf8');

// Remove the broken admin commands fragment and fix the portalData block
const broken = /\$\{portalData \? `\n- Admin Commands Available: email clients\/staff by name, look up contacts, list all staff\/customers\s*`\s*: ""\) \+ \(portalData \? `/;
c = c.replace(broken, '${portalData ? `');

fs.writeFileSync('staff-system/services/aiAssistantService.js', c);
console.log('Fixed');
