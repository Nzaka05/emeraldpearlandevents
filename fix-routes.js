const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const oldRoutes = "const portalAuthRoutes = require('./staff-routes/auth');\nconst portalStaffRoutes = require('./staff-routes/staff');\nconst portalSupervisorRoutes = require('./staff-routes/supervisor');\nconst portalAdminStaffRoutes = require('./staff-routes/admin');\napp.use('/portal/auth', portalAuthRoutes);\napp.use('/portal/staff', portalStaffRoutes);\napp.use('/portal/supervisor', portalSupervisorRoutes);";

const newRoutes = "const portalAuthRoutes = require('./staff-system/routes/auth');\nconst portalStaffRoutes = require('./staff-system/routes/staff');\nconst portalSupervisorRoutes = require('./staff-system/routes/supervisor');\nconst adminDashboardRoutes = require('./staff-system/routes/adminDashboardRoutes');\nconst adminStaffRoutes = require('./staff-system/routes/adminStaffRoutes');\nconst adminEventsRoutes = require('./staff-system/routes/adminEventsRoutes');\nconst adminFinanceRoutes = require('./staff-system/routes/adminFinanceRoutes');\nconst adminReportsRoutes = require('./staff-system/routes/adminReportsRoutes');\nconst adminLegacyRoutes = require('./staff-system/routes/admin');\napp.use('/portal/auth', portalAuthRoutes);\napp.use('/portal/staff', portalStaffRoutes);\napp.use('/portal/supervisor', portalSupervisorRoutes);\napp.use('/portal/admin-staff', adminDashboardRoutes);\napp.use('/portal/admin-staff', adminStaffRoutes);\napp.use('/portal/admin-staff', adminEventsRoutes);\napp.use('/portal/admin-staff', adminFinanceRoutes);\napp.use('/portal/admin-staff', adminReportsRoutes);\napp.use('/portal/admin-staff', adminLegacyRoutes);";

if (content.includes(oldRoutes.split('\n')[0])) {
    content = content.replace(oldRoutes, newRoutes);
    fs.writeFileSync('server.js', content);
    console.log('Done - routes updated');
} else {
    console.log('Pattern not found - checking content...');
    console.log(content.substring(content.indexOf('portalAuthRoutes'), content.indexOf('portalAuthRoutes') + 200));
}
