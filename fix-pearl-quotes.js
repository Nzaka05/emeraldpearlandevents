const fs = require('fs');
let content = fs.readFileSync('staff-system/views/admin/ai-command-center.ejs', 'utf8');

// Fix the broken addMessage function with proper escaping
const brokenMsg = `function addMessage(text, from) {
    const div = document.createElement('div');
    div.className = 'flex gap-3' + (from === 'user' ? ' flex-row-reverse' : '');
    div.innerHTML = from === 'user'
        ? '<div class="glass-card rounded-xl rounded-tr-none p-3 max-w-lg bg-emerald-900/30 border-emerald-500/20"><p class="text-sm text-tx-1">' + text + '</p></div>'
        : '<div class="w-8 h-8 rounded-xl flex-shrink-0 overflow-hidden"><img src="/images/pearl-logo.png" class="w-8 h-8 rounded-xl object-cover" alt="PEARL" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\'"><span style="display:none;color:white;font-size:10px;font-weight:bold;">P</span></div><div class="glass-card rounded-xl rounded-tl-none p-3 max-w-lg"><p class="text-sm text-tx-1">' + text + '</p></div>';
    document.getElementById('chatMessages').appendChild(div);
    document.getElementById('chatMessages').scrollTop = 999999;
    return div;
}`;

const fixedMsg = `function addMessage(text, from) {
    const div = document.createElement('div');
    div.className = 'flex gap-3' + (from === 'user' ? ' flex-row-reverse' : '');
    if (from === 'user') {
        div.innerHTML = '<div class="glass-card rounded-xl rounded-tr-none p-3 max-w-lg bg-emerald-900/30"><p class="text-sm text-tx-1">' + text + '</p></div>';
    } else {
        div.innerHTML = '<div class="w-8 h-8 rounded-xl flex-shrink-0 overflow-hidden bg-emerald-800 flex items-center justify-center"><img src="/images/pearl-logo.png" style="width:32px;height:32px;object-fit:contain;border-radius:8px;"></div><div class="glass-card rounded-xl rounded-tl-none p-3 max-w-lg"><p class="text-sm text-tx-1">' + text + '</p></div>';
    }
    document.getElementById('chatMessages').appendChild(div);
    document.getElementById('chatMessages').scrollTop = 999999;
    return div;
}`;

content = content.replace(brokenMsg, fixedMsg);
fs.writeFileSync('staff-system/views/admin/ai-command-center.ejs', content);
console.log('Done - fixed quotes');
