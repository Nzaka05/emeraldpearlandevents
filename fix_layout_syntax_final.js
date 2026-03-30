const fs = require('fs');
const filepath = 'staff-system/views/layout.ejs';
let content = fs.readFileSync(filepath, 'utf8');

// The single quotes below are literal single quotes inside an EJS block.
// No backslashes are needed because we're just writing raw HTML text.
let newButtonHtml = "<!-- PEARL Floating Button -->\n";
newButtonHtml += "<% if (typeof user !== 'undefined' && user) { %>\n";
newButtonHtml += "<button onclick=\"location.href='<%= user.role === 'Admin' || user.role === 'Super Admin' ? '/portal/admin-staff/ai/command-center' : '/portal/staff/ai' %>'\" \n";
newButtonHtml += "        id=\"pearlFloatBtn\" \n";
newButtonHtml += "        style=\"position:fixed; bottom:24px; right:20px; z-index:9999; width:56px; height:56px; border-radius:50%; background:linear-gradient(135deg, #059669, #0d9488); border:2px solid rgba(255,255,255,0.2); box-shadow:0 6px 20px rgba(5,150,105,0.4); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:transform 0.2s, box-shadow 0.2s;\" \n";
newButtonHtml += "        onmouseover=\"this.style.transform='scale(1.1)'; this.style.boxShadow='0 8px 25px rgba(5,150,105,0.6)'\" \n";
newButtonHtml += "        onmouseout=\"this.style.transform='scale(1)'; this.style.boxShadow='0 6px 20px rgba(5,150,105,0.4)'\" \n";
newButtonHtml += "        title=\"Ask PEARL\">\n";
newButtonHtml += "  <span style=\"color:white; font-family:serif; font-size:24px; font-weight:bold; text-shadow:0 2px 4px rgba(0,0,0,0.3);\">P</span>\n";
newButtonHtml += "</button>\n";
newButtonHtml += "<% } %>";

const startIndex = content.indexOf('<!-- PEARL Floating Button -->');
const endIndex = content.indexOf('</body>');

if (startIndex !== -1 && endIndex !== -1) {
    content = content.substring(0, startIndex) + newButtonHtml + "\\n" + content.substring(endIndex);
    fs.writeFileSync(filepath, content);
    console.log('Fixed the PEARL button syntax error successfully with literal quotes.');
} else {
    console.log('Could not find the start or end index for the PEARL button block.');
}
