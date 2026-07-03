module.exports = {
  apps: [
    {
      name: "todo-app",
      cwd: "./examples/todo",
      script: "./bin/todo-app",
      interpreter: "none",
      exec_mode: "fork",
      instances: 2,
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 3100,
      },
    },
  ],
};
