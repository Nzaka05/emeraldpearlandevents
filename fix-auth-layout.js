const fs = require('fs');

// Fix authController - add layout:false to all auth/login renders
let ctrl = fs.readFileSync('staff-system/controllers/authController.js', 'utf8');
ctrl = ctrl.replace(/res\.render\('auth\/login', \{/g, "res.render('auth/login', { layout: false,");
ctrl = ctrl.replace(/res\.render\('auth\/forgot-password', \{/g, "res.render('auth/forgot-password', { layout: false,");
ctrl = ctrl.replace(/res\.render\('auth\/reset-password', \{/g, "res.render('auth/reset-password', { layout: false,");
ctrl = ctrl.replace(/res\.render\('auth\/change-password', \{/g, "res.render('auth/change-password', { layout: false,");
ctrl = ctrl.replace(/res\.render\('auth\/portal-choice', \{/g, "res.render('auth/portal-choice', { layout: false,");
fs.writeFileSync('staff-system/controllers/authController.js', ctrl);

// Fix auth routes file
let routes = fs.readFileSync('staff-system/routes/auth.js', 'utf8');
routes = routes.replace(/res\.render\('auth\/login', \{/g, "res.render('auth/login', { layout: false,");
routes = routes.replace(/res\.render\('auth\/forgot-password', \{/g, "res.render('auth/forgot-password', { layout: false,");
routes = routes.replace(/res\.render\('auth\/reset-password', \{/g, "res.render('auth/reset-password', { layout: false,");
routes = routes.replace(/res\.render\('auth\/change-password', \{/g, "res.render('auth/change-password', { layout: false,");
fs.writeFileSync('staff-system/routes/auth.js', routes);

console.log('Done');
