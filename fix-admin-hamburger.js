const fs = require('fs');
const path = require('path');

const adminDir = path.resolve(__dirname, 'admin');
const skip = ['403.html','404.html','500.html','login.html'];
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html') && !skip.includes(f));

files.forEach(file => {
    const filePath = path.normalize(path.join(adminDir, file));
    if (!filePath.startsWith(adminDir + path.sep)) {
        throw new Error('Path traversal detected');
    }
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Add overlay if missing
    if (!content.includes('sidebarOverlay')) {
        content = content.replace(
            '<div class="main"',
            '<div id="sidebarOverlay" style="display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.55);z-index:998;" onclick="this.style.display=\'none\';document.querySelector(\'.sidebar\').classList.remove(\'open\');"></div>\n<div class="main"'
        );
        console.log('Added overlay to: ' + file);
    }
    
    // Add hamburger button if missing
    if (!content.includes('menu-toggle') && !content.includes('hamburger')) {
        content = content.replace(
            '<div class="main"',
            '<button id="menu-toggle" onclick="var s=document.querySelector(\'.sidebar\'),o=document.getElementById(\'sidebarOverlay\');s.classList.toggle(\'open\');o.style.display=s.classList.contains(\'open\')?\'block\':\'none\';" style="display:none;position:fixed;top:12px;left:12px;z-index:999;background:#1a2235;border:none;color:#c9a84c;font-size:20px;cursor:pointer;padding:8px;border-radius:8px;">&#9776;</button>\n<div class="main"'
        );
        console.log('Added hamburger to: ' + file);
    }
    
    fs.writeFileSync(filePath, content);
});

// Add CSS to show hamburger on mobile
const cssToAdd = `
<style>
@media(max-width:768px){
    #menu-toggle{display:block!important;}
    .sidebar.open{display:block!important;z-index:997;position:fixed;top:0;left:0;height:100vh;}
}
</style>`;

files.forEach(file => {
    const filePath = path.normalize(path.join(adminDir, file));
    if (!filePath.startsWith(adminDir + path.sep)) {
        throw new Error('Path traversal detected');
    }
    let content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('menu-toggle{display:block')) {
        content = content.replace('</head>', cssToAdd + '\n</head>');
        fs.writeFileSync(filePath, content);
    }
});

console.log('Done');
