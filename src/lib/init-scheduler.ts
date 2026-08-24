/**
 * Inicialização do Job Scheduler
 * Executado uma única vez durante o boot da aplicação
 */

import { supabase } from './supabase';
import { JobScheduler } from '../services/JobScheduler';

let schedulerInstance: JobScheduler | null = null;
let isInitialized = false;

/**
 * Inicializar o agendador de tarefas críticas
 * Deve ser chamado uma única vez durante o boot da aplicação
 */
export async function initializeScheduler(): Promise<void> {
  if (isInitialized) {
    console.log('[SCHEDULER INIT] Agendador já foi inicializado');
    return;
  }

  try {
    console.log('[SCHEDULER INIT] Inicializando Job Scheduler...');

    schedulerInstance = new JobScheduler(supabase);
    await schedulerInstance.startScheduler();

    isInitialized = true;

    console.log('[SCHEDULER INIT] ✅ Job Scheduler inicializado com sucesso');
  } catch (error) {
    console.error('[SCHEDULER INIT] ❌ Erro ao inicializar Job Scheduler:', error);
    throw error;
  }
}

/**
 * Parar o agendador (para quando a aplicação é encerrada)
 */
export async function stopScheduler(): Promise<void> {
  if (schedulerInstance) {
    await schedulerInstance.stopScheduler();
    schedulerInstance = null;
    isInitialized = false;
    console.log('[SCHEDULER INIT] Job Scheduler parado');
  }
}

/**
 * Obter instância do agendador (para testes/debug)
 */
export function getSchedulerInstance(): JobScheduler | null {
  return schedulerInstance;
}
