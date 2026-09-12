/**
 * Next.js Instrumentation Hook
 * Executa uma única vez quando o servidor Node.js inicia
 * Configurar em next.config.ts: experimental: { instrumentationHook: true }
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Validar variáveis de ambiente no servidor
    const { logEnvironmentValidation } = await import('./server/integracao/validateEnv');
    logEnvironmentValidation();

    console.log('🚀 CRMT Gestão Imobiliária - Servidor iniciando...');
  }
}
