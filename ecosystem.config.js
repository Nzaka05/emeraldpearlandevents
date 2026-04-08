module.exports = {
  apps: [
    {
      name: 'emerald-main',
      script: 'server-prod.js',        // Main booking + admin server (port 3000)
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: 'logs/main-error.log',
      out_file: 'logs/main-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'emerald-staff',
      script: 'staff-system/server.js', // Staff portal server (port 3001)
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: 'logs/staff-error.log',
      out_file: 'logs/staff-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
}
