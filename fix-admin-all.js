const fs = require('fs');
const path = require('path');

// Fix 1: Update mobile-sidebar CSS to use 'active' class and fix z-index
const sidebarCss = `
<style>
@media(max-width:768px){
    #menu-toggle{
        display:flex!important;
        position:fixed;
        top:12px;
        left:12px;
        z-index:2001;
        background:var(--primary,#0a2f1c);
        border:1px solid var(--gold,#c9a84c);
        color:var(--gold,#c9a84c);
        width:38px;height:38px;
        align-items:center;justify-content:center;
        border-radius:8px;cursor:pointer;
        font-size:18px;
    }
    .sidebar{
        display:none!important;
        z-index:2000!important;
        position:fixed!important;
        top:0!important;left:0!important;
        height:100vh!important;
        width:260px!important;
        overflow-y:auto!important;
    }
    .sidebar.active{display:flex!important;flex-direction:column;}
    .main{margin-left:0!important;}
    #sidebarOverlay{z-index:1999!important;}
}
@media(min-width:769px){#menu-toggle{display:none!important;}}
</style>`;

// Fix 2: Update all admin HTML files
const adminDir = 'admin';
const skip = ['403.html','404.html','500.html','login.html'];
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html') && !skip.includes(f));

files.forEach(file => {
    const filePath = path.join(adminDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove old mobile CSS if exists
    content = content.replace(/<style>\s*@media\(max-width:768px\)\{[\s\S]*?#menu-toggle[\s\S]*?\}\s*<\/style>/g, '');
    
    // Add correct CSS before </head>
    if (!content.includes('sidebar.active')) {
        content = content.replace('</head>', sidebarCss + '\n</head>');
    }
    
    // Add hamburger button after <body> if missing
    if (!content.includes('id="menu-toggle"')) {
        content = content.replace('<div class="layout">', 
            '<button id="menu-toggle" title="Menu">&#9776;</button>\n<div id="sidebarOverlay"></div>\n<div class="layout">');
    }
    
    // Add overlay if missing
    if (!content.includes('id="sidebarOverlay"')) {
        content = content.replace('<div class="layout">', 
            '<div id="sidebarOverlay"></div>\n<div class="layout">');
    }

    fs.writeFileSync(filePath, content);
    console.log('Fixed: ' + file);
});

console.log('Done fixing admin pages');
