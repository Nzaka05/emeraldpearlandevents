const fs = require('fs');
const filepath = 'staff-system/views/layout.ejs';
let content = fs.readFileSync(filepath, 'utf8');
const lines = content.split(/\r?\n/);

// Fix background image
let inBodyStyle = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('background-image: url(')) {
    lines[i] = lines[i].replace(/background-image:\s*url\([^)]+\);/, 'background-color: #f8fafc;'); // Clean light background
    console.log('Replaced background image at line', i + 1);
  }
}

// Locate PEARL Floating Button section and replace it entirely
let startIndex = -1;
let endIndex = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<!-- PEARL Floating Button -->')) {
    startIndex = i;
  }
  if (startIndex !== -1 && lines[i].includes('</body>')) {
    endIndex = i; // The line before </body>
    break;
  }
}

if (startIndex !== -1 && endIndex !== -1) {
    const newButtonHtml = `
<!-- PEARL Floating Button -->
<% if (typeof user !== 'undefined' && user) { %>
<button onclick="location.href='<%= user.role === \\'Admin\\' || user.role === \\'Super Admin\\' ? \\'/portal/admin-staff/ai/command-center\\' : \\'/portal/staff/ai\\' %>'" 
        id="pearlFloatBtn" 
        style="position:fixed; bottom:24px; right:20px; z-index:9999; width:56px; height:56px; border-radius:50%; background:linear-gradient(135deg, #059669, #0d9488); border:2px solid rgba(255,255,255,0.2); box-shadow:0 6px 20px rgba(5,150,105,0.4); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:transform 0.2s, box-shadow 0.2s;" 
        onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 8px 25px rgba(5,150,105,0.6)'" 
        onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 6px 20px rgba(5,150,105,0.4)'" 
        title="Ask PEARL">
  <span style="color:white; font-family:serif; font-size:24px; font-weight:bold; text-shadow:0 2px 4px rgba(0,0,0,0.3);">P</span>
</button>
<% } %>
`;
    lines.splice(startIndex, endIndex - startIndex, newButtonHtml);
    console.log('Replaced PEARL Floating Button section');
} else {
    console.log('PEARL Floating Button section not found', startIndex, endIndex);
}

fs.writeFileSync(filepath, lines.join('\n'));
console.log('Applied UI fixes successfully.');
