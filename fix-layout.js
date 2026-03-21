const fs = require('fs');
let content = fs.readFileSync('staff-system/views/layout.ejs', 'utf8');

// Fix 1: Welcome message with role-based greeting
content = content.replace(
    '<div class="text-sm font-bold text-tx-1">Welcome, <%= _userName.split(\' \')[0] %>!</div>',
    `<div class="text-sm font-bold text-tx-1">
        <% if (_role === 'Admin' && ['Gideon Nzaka','David Charles Abuor','Joshua Nzaka'].includes(_userName)) { %>
            Welcome back, <%= _userName.split(' ')[0] === 'Gideon' ? 'Co-CEO' : _userName.split(' ')[0] === 'David' ? 'Director' : 'CEO' %>!
        <% } else if (_role === 'Admin' || _role === 'Supervisor') { %>
            Welcome back, <%= _userName.split(' ')[0] %>!
        <% } else { %>
            Welcome to Emerald, <%= _userName.split(' ')[0] %>!
        <% } %>
    </div>`
);

// Fix 2: Remove hamburger toggle button
content = content.replace(
    `  <!-- Hamburger toggle button -->
  <button onclick="toggleStaffDrawer()" class="fixed bottom-5 right-5 z-[200] w-14 h-14 rounded-full bg-emerald-600 shadow-glow-emerald text-white flex items-center justify-center text-xl hover:bg-emerald-500 transition-colors">      
      <i class="fa-solid fa-bars" id="drawerHamburgerIcon"></i>
  </button>`,
    '<!-- Hamburger removed -->'
);

// Fix 3: Add Emerald logo to staff mobile header
content = content.replace(
    '<div class="flex items-center gap-3">\n      <div class="avatar avatar-sm overflow-hidden">',
    '<div class="flex items-center gap-3">\n      <img src="/logo2.png" class="h-7 w-auto object-contain mr-1" alt="Emerald">\n      <div class="avatar avatar-sm overflow-hidden">'
);

fs.writeFileSync('staff-system/views/layout.ejs', content);
console.log('Done');
