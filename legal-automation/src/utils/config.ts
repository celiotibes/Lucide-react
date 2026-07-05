import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  node_env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  api_base_url: process.env.API_BASE_URL || 'http://localhost:3000',

  // JWT
  jwt_secret: process.env.JWT_SECRET || 'your_secret_key',
  jwt_expires_in: process.env.JWT_EXPIRES_IN || '24h',

  // DataJud API
  datajud_api_key: process.env.DATAJUD_API_KEY,
  datajud_api_url: process.env.DATAJUD_API_URL || 'https://apipublica.cnj.jus.br/api/v2',

  // Projudi TJPR
  projudi_wsdl_url: process.env.PROJUDI_WSDL_URL || 'https://tst.tjpr.jus.br/projudi/webservices/projudiIntercomunicacaoWebService222?wsdl',
  projudi_username: process.env.PROJUDI_USERNAME,
  projudi_password: process.env.PROJUDI_PASSWORD,

  // eProc TJSC
  eproc_api_url: process.env.EPROC_API_URL || 'https://eproc.tjsc.jus.br/api',
  eproc_2fa_timeout: parseInt(process.env.EPROC_2FA_TIMEOUT || '300', 10),

  // Certificado Digital
  cert_storage_path: process.env.CERT_STORAGE_PATH || './certs',
  cert_encryption_key: process.env.CERT_ENCRYPTION_KEY || 'default_encryption_key',

  // Database
  database_url: process.env.DATABASE_URL,

  // Redis
  redis_url: process.env.REDIS_URL,

  // Logging
  log_level: process.env.LOG_LEVEL || 'info',
  log_file: process.env.LOG_FILE || './logs/app.log',

  // 2FA
  twilio_account_sid: process.env.TWILIO_ACCOUNT_SID,
  twilio_auth_token: process.env.TWILIO_AUTH_TOKEN,
  twilio_phone_number: process.env.TWILIO_PHONE_NUMBER,

  // SMTP
  smtp_host: process.env.SMTP_HOST,
  smtp_port: parseInt(process.env.SMTP_PORT || '587', 10),
  smtp_user: process.env.SMTP_USER,
  smtp_pass: process.env.SMTP_PASS,
  smtp_from: process.env.SMTP_FROM,

  // Rate Limiting
  rate_limit_window_ms: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rate_limit_max_requests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

  // CORS
  cors_origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),

  // File Upload
  max_file_size: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10),
  upload_dir: process.env.UPLOAD_DIR || './uploads',

  // Validators
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
};

export function validateConfig(): void {
  const requiredKeys = ['jwt_secret', 'cert_encryption_key'];
  const missing = requiredKeys.filter(key => !config[key as keyof typeof config]);

  if (missing.length > 0) {
    console.warn(`⚠️  Missing required config keys: ${missing.join(', ')}`);
  }
}
