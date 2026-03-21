const fs = require('fs');
let lines = fs.readFileSync('staff-system/views/layout.ejs', 'utf8').split('\n');

// Find and fix the welcome block - remove duplicates and exclamation marks
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Welcome back,") && lines[i].includes("Co-CEO")) {
        if (lines[i].includes("!")) lines[i] = lines[i].replace("!", "");
    }
    if (lines[i].includes("Welcome back,") && lines[i].includes("_userName.split(' ')[0] %>!")) {
        lines[i] = lines[i].replace("_userName.split(' ')[0] %>!", "_userName.split(' ')[0] %>");
    }
    if (lines[i].includes("Welcome to Emerald,") && lines[i].includes("!")) {
        lines[i] = lines[i].replace("!", "");
    }
}

// Remove duplicate lines
const seen = new Set();
lines = lines.filter(line => {
    const trimmed = line.trim();
    if ((trimmed.includes("Welcome back,") || trimmed.includes("Welcome to Emerald,")) && trimmed.startsWith("Welcome")) {
        if (seen.has(trimmed)) return false;
        seen.add(trimmed);
    }
    return true;
});

fs.writeFileSync('staff-system/views/layout.ejs', lines.join('\n'));
console.log('Done');
