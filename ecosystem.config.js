module.exports = {
  apps: [
    {
      name: "autopost",
      script: "node_modules/.bin/next",
      args: "start --port 3000",
      cwd: "/var/www/autopost",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Restart policy
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      // Logs
      error_file: "/var/www/autopost/logs/error.log",
      out_file: "/var/www/autopost/logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      // Memory limit (restart if exceeds)
      max_memory_restart: "512M",
    },
  ],
};
