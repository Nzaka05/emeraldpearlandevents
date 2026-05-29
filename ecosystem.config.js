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
    },

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: BullMQ Workers (stateless, horizontally scalable)
    // ═══════════════════════════════════════════════════════════

    {
      name: 'emerald-payment-worker',
      script: 'queue/workers/payment.worker.js',
      instances: 2,                     // 2 instances for financial reliability
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/payment-worker-error.log',
      out_file: 'logs/payment-worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'emerald-notification-worker',
      script: 'queue/workers/notification.worker.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/notification-worker-error.log',
      out_file: 'logs/notification-worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'emerald-email-worker',
      script: 'queue/workers/email.worker.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/email-worker-error.log',
      out_file: 'logs/email-worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
}
