const fs = require('fs');
let content = fs.readFileSync('staff-system/views/layout.ejs', 'utf8');

// Fix 1: Move drawerOverlay and staffDrawer inside the else block (Staff layout)
// They currently appear after the bottom nav but need to be inside <% } else { %> block

// Fix 2: Close missing divs in staff header
content = content.replace(
    `        <% } %>
    <div class="flex items-center gap-2">`,
    `        <% } %>
      </div>
    </div>
    <div class="flex items-center gap-2">`
);

fs.writeFileSync('staff-system/views/layout.ejs', content);
console.log('Fixed header divs');
