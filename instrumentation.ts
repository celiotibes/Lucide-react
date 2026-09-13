/**
 * Next.js Instrumentation Hook
 * Executa uma única vez quando o servidor Node.js inicia
 * Configurar em next.config.ts: experimental: { instrumentationHook: true }
 */

export async function register() {
  // Validar variáveis de ambiente em todos os runtimes (Node.js e Edge)
  const { logEnvironmentValidation } = await import('./server/integracao/validateEnv');
  logEnvironmentValidation();

  console.log('🚀 CRMT Gestão Imobiliária - Servidor iniciando...');
}
