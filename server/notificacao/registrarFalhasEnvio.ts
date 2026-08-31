// O restante do sistema (Notificador.enviar) nunca lança em caso de falha
// de canal — devolve um array de resultados por canal, cada um com
// sucesso/erro. Até aqui, nenhum chamador olhava esse retorno: uma falha de
// e-mail/WhatsApp ficava completamente silenciosa. Esta função não resolve
// retry (o sistema não tem fila para isso ainda), só garante visibilidade
// mínima em log — suficiente para alguém notar em `vercel logs` que uma
// notificação não saiu.

import type { ResultadoNotificacao } from './Notificador';

export function registrarFalhasEnvio(resultados: ResultadoNotificacao[], contexto: string): void {
  for (const resultado of resultados) {
    if (!resultado.sucesso) {
      console.error(`[notificacao] Falha ao enviar por ${resultado.canal} (${contexto}): ${resultado.erro}`);
    }
  }
}
