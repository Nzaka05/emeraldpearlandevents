const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname);
const layoutPath = path.normalize(path.join(baseDir, 'staff-system', 'views', 'layout.ejs'));
if (!layoutPath.startsWith(baseDir + path.sep)) {
    throw new Error('Path traversal detected');
}
let content = fs.readFileSync(layoutPath, 'utf8');

// Replace ALL sidebar toggle functions with one clean version
const oldToggle = content.indexOf('function toggleSidebar()');
const oldClose = content.indexOf('function closeSidebar()');

// Find end of closeSidebar function
let endIdx = oldClose;
let depth = 0;
let started = false;
for (let i = oldClose; i < content.length; i++) {
    if (content.charAt(i) === '{') { depth++; started = true; }
    if (content.charAt(i) === '}') { depth--; }
    if (started && depth === 0) { endIdx = i + 1; break; }
}

const newFunctions = `function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  if (!sb) return;
  if (window.innerWidth <= 900) {
    const isHidden = sb.getAttribute('data-mobile-open') !== 'true';
    if (isHidden) {
      sb.setAttribute('data-mobile-open', 'true');
      sb.style.cssText = 'display:flex!important;position:fixed!important;top:0!important;left:0!important;bottom:0!important;width:280px!important;z-index:300!important;transform:translateX(0)!important;';
      if(ov){ ov.classList.remove('hidden'); ov.style.display='block'; }
    } else {
      closeSidebar();
    }
  } else {
    const main = document.getElementById('mainContent');
    const hdr = document.getElementById('topHeader');
    const isCollapsed = sb.classList.toggle('sidebar-collapsed');
    if (main) main.style.marginLeft = isCollapsed ? '64px' : '220px';
    if (hdr) hdr.style.left = isCollapsed ? '64px' : '220px';
    localStorage.setItem('sidebarCollapsed', isCollapsed);
  }
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  if (!sb) return;
  sb.setAttribute('data-mobile-open', 'false');
  sb.style.cssText = 'display:none!important;';
  if(ov){ ov.style.display='none'; ov.classList.add('hidden'); }
}`;

content = content.substring(0, oldToggle) + newFunctions + content.substring(endIdx);

// Also fix staff drawer with same approach
const oldStaffToggle = content.indexOf('function toggleStaffDrawer()');
const oldStaffClose = content.indexOf('function closeStaffDrawer()');

let staffEndIdx = oldStaffClose;
let staffDepth = 0;
let staffStarted = false;
for (let i = oldStaffClose; i < content.length; i++) {
    if (content.charAt(i) === '{') { staffDepth++; staffStarted = true; }
    if (content.charAt(i) === '}') { staffDepth--; }
    if (staffStarted && staffDepth === 0) { staffEndIdx = i + 1; break; }
}

const newStaffFunctions = `function toggleStaffDrawer() {
  const drawer = document.getElementById('staffDrawer');
  const overlay = document.getElementById('drawerOverlay');
  if (!drawer) return;
  const isOpen = drawer.getAttribute('data-open') === 'true';
  if (isOpen) {
    closeStaffDrawer();
  } else {
    drawer.setAttribute('data-open', 'true');
    drawer.style.transform = 'translateX(0)';
    if(overlay){ overlay.style.display='block'; overlay.style.opacity='1'; overlay.classList.remove('hidden'); }
    const icon = document.getElementById('drawerHamburgerIcon');
    if(icon){ icon.classList.remove('fa-bars'); icon.classList.add('fa-xmark'); }
  }
}
function closeStaffDrawer() {
  const drawer = document.getElementById('staffDrawer');
  const overlay = document.getElementById('drawerOverlay');
  if (!drawer) return;
  drawer.setAttribute('data-open', 'false');
  drawer.style.transform = 'translateX(-100%)';
  if(overlay){ overlay.style.opacity='0'; setTimeout(()=>{ overlay.style.display='none'; overlay.classList.add('hidden'); }, 300); }
  const icon = document.getElementById('drawerHamburgerIcon');
  if(icon){ icon.classList.remove('fa-xmark'); icon.classList.add('fa-bars'); }
}`;

content = content.substring(0, oldStaffToggle) + newStaffFunctions + content.substring(staffEndIdx);

// Initialize sidebar as hidden on mobile via script
content = content.replace(
    '</body>',
    `<script>
// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
  if (window.innerWidth <= 900) {
    const sb = document.getElementById('sidebar');
    if (sb) { sb.style.cssText = 'display:none!important;'; sb.setAttribute('data-mobile-open','false'); }
  }
  const drawer = document.getElementById('staffDrawer');
  if (drawer) { drawer.style.transform = 'translateX(-100%)'; drawer.setAttribute('data-open','false'); }
});
</script>
</body>`
);

fs.writeFileSync(layoutPath, content);
console.log('Done - rewrote mobile sidebar logic');
