const fs = require('fs');
let lines = fs.readFileSync('staff-system/views/layout.ejs', 'utf8').split('\n');

// Find the broken welcome block and replace it
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Welcome back, <%= _userName.split(' ')[0] === 'Gideon'")) {
        // Replace lines i through i+2 with proper EJS block
        lines[i] = "            Welcome back, <%= _userName.split(' ')[0] === 'Gideon' ? 'Co-CEO' : _userName.split(' ')[0] === 'David' ? 'Director' : 'CEO' %>";
        lines[i+1] = "        <% } else if (_role === 'Admin' || _role === 'Supervisor') { %>";
        lines[i+2] = "            Welcome back, <%= _userName.split(' ')[0] %>";
        lines[i+3] = "        <% } else { %>";
        lines[i+4] = "            Welcome to Emerald, <%= _userName.split(' ')[0] %>";
        lines[i+5] = "        <% } %>";
        break;
    }
}

fs.writeFileSync('staff-system/views/layout.ejs', lines.join('\n'));
console.log('Done');
