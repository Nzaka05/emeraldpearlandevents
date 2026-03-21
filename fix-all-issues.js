const fs = require('fs');

// Fix 1: PEARL send button - add CSRF fix and better error handling
let aiPage = fs.readFileSync('staff-system/views/admin/ai-command-center.ejs', 'utf8');
aiPage = aiPage.replace(
    "const csrf = document.querySelector('meta[name=\"csrf-token\"]')?.content || '';",
    "const csrf = document.querySelector('meta[name=\"csrf-token\"]')?.content || document.querySelector('[name=\"_csrf\"]')?.value || '';"
);
// Fix fetch to handle CSRF properly
aiPage = aiPage.replace(
    "headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrf },",
    "headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrf, 'X-CSRF-Token': csrf },"
);
fs.writeFileSync('staff-system/views/admin/ai-command-center.ejs', aiPage);
console.log('Fixed PEARL send button');

// Fix 2: Layout - move drawer inside staff section and fix sidebar toggle
let layout = fs.readFileSync('staff-system/views/layout.ejs', 'utf8');

// Fix mobile sidebar for Admin - add proper toggle
layout = layout.replace(
    '<!-- Mobile sidebar overlay -->',
    `<!-- Mobile sidebar overlay -->
  <script>
  function toggleSidebarMobile() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebarOverlay');
    if (!sb) return;
    const isOpen = sb.style.display === 'flex';
    if (isOpen) { sb.style.display = 'none'; if(ov) ov.classList.add('hidden'); }
    else { sb.style.display = 'flex'; if(ov) ov.classList.remove('hidden'); }
  }
  </script>`
);

fs.writeFileSync('staff-system/views/layout.ejs', layout);
console.log('Fixed sidebar toggle');
