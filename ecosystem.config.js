module.exports = {
  apps: [
    {
      name: 'autopost',
      script: 'npm',
      args: 'run start', // Hoặc file chạy chính của bạn, ví dụ: 'dist/index.js'
      env: {
        PORT: 3100,
        TZ: 'Asia/Ho_Chi_Minh',
        NODE_ENV: 'production',
      },
    },
  ],
};
