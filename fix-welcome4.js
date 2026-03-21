const fs = require('fs');
let lines = fs.readFileSync('staff-system/views/layout.ejs', 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Active Shift") && lines[i+1] && lines[i+1].includes("status-dot-muted")) {
        lines[i] = "            <span class=\"status-dot status-dot-active animate-pulse-dot\" style=\"width:6px;height:6px\"></span> Active Shift";
        lines[i+1] = "          </div>";
        lines[i+2] = "        <% } else { %>";
        lines[i+3] = "          <div class=\"flex items-center gap-1.5 text-[0.65rem] font-semibold text-tx-3\">";
        lines[i+4] = "            <span class=\"status-dot status-dot-muted\" style=\"width:6px;height:6px\"></span> Off Duty";
        lines[i+5] = "          </div>";
        lines[i+6] = "        <% } %>";
        break;
    }
}

fs.writeFileSync('staff-system/views/layout.ejs', lines.join('\n'));
console.log('Done');
