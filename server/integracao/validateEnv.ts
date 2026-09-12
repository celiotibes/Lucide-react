/**
 * Environment Variable Validation
 * Executa na inicialização do servidor para garantir que todas as variáveis
 * críticas estão configuradas. Evita falhas silenciosas em runtime.
 */

interface ValidacaoVar {
  nome: string;
  obrigatoria: boolean;
  descricao: string;
}

const VARIAVEIS_REQUERIDAS: ValidacaoVar[] = [
  {
    nome: 'DATABASE_URL',
    obrigatoria: true,
    descricao: 'PostgreSQL connection string',
  },
  {
    nome: 'NEXT_PUBLIC_SUPABASE_URL',
    obrigatoria: true,
    descricao: 'Supabase project URL',
  },
  {
    nome: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    obrigatoria: true,
    descricao: 'Supabase anonymous key',
  },
  {
    nome: 'SUPABASE_SERVICE_ROLE_KEY',
    obrigatoria: true,
    descricao: 'Supabase service role key (secret)',
  },
  {
    nome: 'ANTHROPIC_API_KEY',
    obrigatoria: true,
    descricao: 'Claude API key for document processing',
  },
  {
    nome: 'CRON_SECRET',
    obrigatoria: true,
    descricao: 'Secret token for cron job validation (openssl rand -base64 32)',
  },
  {
    nome: 'NEXT_PUBLIC_BASE_URL',
    obrigatoria: true,
    descricao: 'Base URL for notification links (http://localhost:3000 in dev)',
  },
];

const VARIAVEIS_OPCIONAIS: ValidacaoVar[] = [
  {
    nome: 'ASAAS_API_KEY',
    obrigatoria: false,
    descricao: 'Asaas payment gateway key (feature disabled if missing)',
  },
  {
    nome: 'TWILIO_ACCOUNT_SID',
    obrigatoria: false,
    descricao: 'Twilio SMS/WhatsApp account (feature disabled if missing)',
  },
  {
    nome: 'N8N_URL',
    obrigatoria: false,
    descricao: 'n8n workflow engine URL (feature disabled if missing)',
  },
  {
    nome: 'EMAIL_ADMIN_NOTIFICACOES',
    obrigatoria: false,
    descricao: 'Admin email for system notifications (defaults to admin@crmt.dev)',
  },
];

export function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required variables
  for (const varInfo of VARIAVEIS_REQUERIDAS) {
    const valor = process.env[varInfo.nome];
    if (!valor || valor.trim() === '') {
      errors.push(
        `❌ CRITICAL: ${varInfo.nome} is not configured\n` +
          `   Description: ${varInfo.descricao}\n` +
          `   Add to .env.local: ${varInfo.nome}=your-value`
      );
    }
  }

  // Warn about optional variables that might be needed
  for (const varInfo of VARIAVEIS_OPCIONAIS) {
    const valor = process.env[varInfo.nome];
    if (!valor || valor.trim() === '') {
      console.warn(
        `⚠️  OPTIONAL: ${varInfo.nome} not configured\n` +
          `   ${varInfo.descricao}\n` +
          `   Feature will be disabled. To enable, add to .env.local: ${varInfo.nome}=your-value`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function logEnvironmentValidation(): void {
  const { valid, errors } = validateEnvironment();

  if (!valid) {
    console.error('\n' + '='.repeat(80));
    console.error('⚠️  ENVIRONMENT CONFIGURATION ERROR');
    console.error('='.repeat(80));
    errors.forEach((error) => console.error(error));
    console.error('='.repeat(80) + '\n');

    if (process.env.NODE_ENV === 'production') {
      console.error('🛑 Server cannot start in production with missing configuration.');
      process.exit(1);
    } else {
      console.warn('⚠️  Development mode will continue, but some features may fail.');
    }
  } else {
    console.log('✅ Environment configuration validated successfully');
  }
}
