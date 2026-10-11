const path = require("path");

module.exports = {
  apps: [
    {
      name: "autopost",
      cwd: __dirname,
      script: path.join(__dirname, "node_modules/next/dist/bin/next"),
      args: "start",
      env: {
        PORT: 3100,
        NODE_ENV: "production",
        TZ: "Asia/Ho_Chi_Minh",
      },
    },
  ],
};
