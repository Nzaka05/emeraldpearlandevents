const fs = require('fs');
let content = fs.readFileSync('staff-system/views/layout.ejs', 'utf8');

// Fix 1: Remove bottom nav header (fixed bottom-0)
content = content.replace(/\s*<!-- Hamburger button for staff drawer -->[\s\S]*?<\/header>\s*(?=<!-- Slide-out drawer|<div id="drawerOverlay)/, '\n');

// Fix 2: Replace old staff header with clean version (logo left, bell+avatar right, classy hamburger)
const oldHeader = content.match(/<!-- Staff mobile header -->\s*<header[\s\S]*?<\/header>/)?.[0];
if (oldHeader) {
    const newHeader = `<!-- Staff mobile header -->
  <header class="fixed top-0 left-0 right-0 h-14 glass-strong flex items-center justify-between px-4 z-[100] border-b border-cyan-500/10 shadow-lg">
    <!-- Left: Classy Hamburger + Logo -->
    <div class="flex items-center gap-3">
      <button onclick="toggleStaffDrawer()" class="group relative w-9 h-9 rounded-xl flex flex-col items-center justify-center gap-[5px] text-tx-2 hover:text-emerald-400 transition-all duration-300 bg-white/5 border border-white/8 hover:border-emerald-500/40 hover:bg-emerald-500/10">
        <span class="block w-4 h-[1.5px] bg-current rounded-full transition-all duration-300 group-hover:w-5"></span>
        <span class="block w-5 h-[1.5px] bg-current rounded-full transition-all duration-300"></span>
        <span class="block w-3 h-[1.5px] bg-current rounded-full transition-all duration-300 group-hover:w-5"></span>
      </button>
      <img src="/logo2.png" class="h-7 w-auto object-contain" alt="Emerald">
    </div>
    <!-- Right: Bell + Profile Avatar -->
    <div class="flex items-center gap-2">
      <button onclick="window.location.href='/portal/staff/notifications'" class="w-8 h-8 rounded-lg bg-cosmos-600 border border-white/5 text-tx-2 flex items-center justify-center hover:text-tx-1 transition-colors text-sm relative">
        <i class="fa-regular fa-bell"></i>
        <span id="hdr-notif-badge" class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[0.5rem] font-bold flex items-center justify-center hidden">0</span>
      </button>
      <a href="/portal/staff/profile" class="relative group block">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-500 flex items-center justify-center text-xs font-bold text-white overflow-hidden border border-emerald-500/30 transition-transform group-hover:scale-105">
          <% if (_photo) { %>
            <img src="<%= _photo %>" class="w-full h-full object-cover" alt="">
          <% } else { %>
            <%= _initials %>
          <% } %>
        </div>
      </a>
    </div>
  </header>`;
    content = content.replace(oldHeader, newHeader);
}

// Fix 3: Update main padding (no bottom nav so no pb-24)
content = content.replace('class="pt-[72px] px-4 pb-24 min-h-screen"', 'class="pt-[72px] px-4 pb-10 min-h-screen"');

fs.writeFileSync('staff-system/views/layout.ejs', content);
console.log('Done - layout cleaned and fixed');
