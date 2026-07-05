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

  // TRF4
  trf4_api_url: process.env.TRF4_API_URL || 'https://portal-eproc.trf4.jus.br/eprocV2/',
  trf4_login: process.env.TRF4_LOGIN,
  trf4_password: process.env.TRF4_PASSWORD,

  // JFPR
  jfpr_api_url: process.env.JFPR_API_URL || 'https://eproc.jfpr.jus.br/api',
  jfpr_login: process.env.JFPR_LOGIN,
  jfpr_password: process.env.JFPR_PASSWORD,

  // JUST (PDPJ-Br)
  just_api_url: process.env.JUST_API_URL || 'https://api.datajud.cnj.jus.br/api/v1',
  just_api_key: process.env.JUST_API_KEY,

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

  // AI / LLM
  ai_primary_model: process.env.AI_PRIMARY_MODEL || 'gemini',
  ai_fallback_models: process.env.AI_FALLBACK_MODELS || 'ollama',
  ai_offline_mode: process.env.AI_OFFLINE_MODE || 'true',
  ai_cache_ttl: process.env.AI_CACHE_TTL || '604800',
  ai_max_retries: parseInt(process.env.AI_MAX_RETRIES || '3', 10),
  ai_timeout_ms: parseInt(process.env.AI_TIMEOUT_MS || '30000', 10),
  ai_enable_rag: process.env.AI_ENABLE_RAG === 'true',

  // Gemini
  gemini_api_key: process.env.GEMINI_API_KEY,
  gemini_model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',

  // Grok
  grok_api_key: process.env.GROK_API_KEY,
  grok_model: process.env.GROK_MODEL || 'grok-4.1-fast',

  // Ollama
  ollama_base_url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollama_model: process.env.OLLAMA_MODEL || 'initium/law_model',

  // OpenAI (opcional)
  openai_api_key: process.env.OPENAI_API_KEY,
  openai_model: process.env.OPENAI_MODEL || 'gpt-4-turbo',

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
