const fs = require('fs');

// Fix 1: AI page fetch URL
let aiPage = fs.readFileSync('staff-system/views/admin/ai-command-center.ejs', 'utf8');
aiPage = aiPage.replace(
    "fetch('/portal/ai/assistant'",
    "fetch('/portal/admin-staff/ai/assistant'"
);
fs.writeFileSync('staff-system/views/admin/ai-command-center.ejs', aiPage);
console.log('Fixed AI fetch URL');

// Fix 2 & 3: Layout - PEARL sidebar + smooth mobile transition
let layout = fs.readFileSync('staff-system/views/layout.ejs', 'utf8');

// Rename AI Assistant to PEARL in sidebar
layout = layout.replace(
    '<i class="fa-solid fa-robot" style="color:var(--emerald,#10b981);"></i><span>AI Assistant</span>',
    '<img src="/images/pearl-logo.png" style="width:18px;height:18px;object-fit:contain;border-radius:50%;" onerror="this.style.display=\'none\'"> <span>PEARL</span>'
);

// Fix mobile drawer smooth transition
layout = layout.replace(
    'transform -translate-x-full transition-transform duration-300 ease-out',
    'transform -translate-x-full transition-all duration-300 ease-in-out'
);

// Fix overlay backdrop
layout = layout.replace(
    '<div id="staffDrawer"',
    '<div id="drawerOverlay" onclick="closeStaffDrawer()" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[149] hidden transition-opacity duration-300 opacity-0"></div>\n  <div id="staffDrawer"'
);

fs.writeFileSync('staff-system/views/layout.ejs', layout);
console.log('Fixed sidebar and mobile transition');
