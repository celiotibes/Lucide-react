/**
 * PM2 Ecosystem Configuration
 *
 * Uso:
 *   pm2 start ecosystem.config.js          # Inicia todos os processos
 *   pm2 stop ecosystem.config.js           # Para todos
 *   pm2 restart ecosystem.config.js        # Reinicia todos
 *   pm2 delete ecosystem.config.js         # Remove da lista PM2
 *
 * Com watch habilitado, o PM2 monitora mudanças em arquivos e reinicia automaticamente.
 * Logs armazenados em ~/.pm2/logs/
 */

module.exports = {
  apps: [
    {
      name: "contabilidade-server",
      script: "./server/src/index.ts",
      interpreter: "tsx",

      // Ambiente
      env: {
        NODE_ENV: "production",
      },

      // Watch mode — monitora mudanças em arquivos
      watch: ["server/src"],
      ignore_watch: ["server/node_modules", "server/dist", "server/.env"],
      watch_delay: 1000,  // delay (ms) antes de reiniciar

      // Reinicio automático
      autorestart: true,
      max_memory_restart: "500M",  // reinicia se usar > 500MB RAM

      // Logging
      output: process.env.PM2_LOG_DIR ? `${process.env.PM2_LOG_DIR}/contabilidade-server-out.log` : null,
      error: process.env.PM2_LOG_DIR ? `${process.env.PM2_LOG_DIR}/contabilidade-server-err.log` : null,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // Graceful shutdown
      kill_timeout: 5000,  // tempo para shutdown gracioso (ms)
      listen_timeout: 10000,

      // Cluster mode (desabilitado para app single-instance, mas disponível se necessário)
      instances: 1,
      exec_mode: "fork",

      // Variáveis de ambiente
      env_production: {
        NODE_ENV: "production",
      },
      env_development: {
        NODE_ENV: "development",
      },
    },
  ],

  // Deploy configuration (opcional — para deployment automatizado)
  // deploy: {
  //   production: {
  //     user: "seu_usuario",
  //     host: "seu_servidor.com",
  //     ref: "origin/main",
  //     repo: "https://github.com/seu-user/seu-repo.git",
  //     path: "/var/www/contabilidade",
  //     "post-deploy": "npm install && npm run build && pm2 restart ecosystem.config.js",
  //   },
  // },
};
