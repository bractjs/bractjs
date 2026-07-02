module.exports = {
  apps: [
    {
      name: "cms-app",
      cwd: "./examples/cms",
      script: "./bin/cms-app",
      interpreter: "none",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 3200,
      },
    },
  ],
};
