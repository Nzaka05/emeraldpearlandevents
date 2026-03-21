const fs = require('fs');
let lines = fs.readFileSync('staff-system/views/layout.ejs', 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("<% } %>") && lines[i+1] && lines[i+1].includes("status-dot-active")) {
        // Insert missing shift status opening tags
        lines[i] = "        <% } %>";
        lines[i+1] = "        <% if(locals.onShift) { %>";
        lines[i+2] = "          <div class=\"flex items-center gap-1.5 text-[0.65rem] font-semibold text-emerald-400\">";
        lines[i+3] = "            <span class=\"status-dot status-dot-active animate-pulse-dot\" style=\"width:6px;height:6px\"></span> Active Shift";
        break;
    }
}

fs.writeFileSync('staff-system/views/layout.ejs', lines.join('\n'));
console.log('Done');
