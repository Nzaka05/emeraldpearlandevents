module.exports = {
  apps: [
    {
      name: 'emerald-admin',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production',
        PORT_ADMIN: 3000
      },
      error_file: 'logs/admin-error.log',
      out_file: 'logs/admin-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'emerald-staff',
      script: 'staff-system/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production',
        PORT_STAFF: 3001
      },
      error_file: 'logs/staff-error.log',
      out_file: 'logs/staff-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
}
