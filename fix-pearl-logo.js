const fs = require('fs');
let content = fs.readFileSync('staff-system/views/admin/ai-command-center.ejs', 'utf8');

// Replace robot icon with PEARL logo
content = content.replace(
    /<i class="fa-solid fa-robot text-white text-sm"><\/i>/g,
    '<img src="/images/pearl-logo.png" class="w-8 h-8 rounded-xl object-cover" alt="PEARL" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\'"><span style="display:none;color:white;font-size:10px;font-weight:bold;">P</span>'
);

// Update avatar bubble style
content = content.replace(
    /class="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0"/g,
    'class="w-8 h-8 rounded-xl flex-shrink-0 overflow-hidden"'
);

fs.writeFileSync('staff-system/views/admin/ai-command-center.ejs', content);
console.log('Done');
