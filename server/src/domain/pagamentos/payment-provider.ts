/** Contrato de código para iniciação de pagamento PIX via um PSP (Payment Service Provider)
 * de terceiro — NÃO uma integração real. Nenhuma implementação aqui fala com rede nenhuma.
 *
 * Este arquivo existe para ilustrar, no próprio PR, o desenho descrito em
 * docs/viabilidade-backend-pagamentos.md (seção 4 e 8): a interface `PaymentProvider` é o
 * que uma implementação real (contra o PSP escolhido, com credencial real, só em Fase 3)
 * precisaria satisfazer. `SandboxPaymentProvider` é um mock determinístico — útil para
 * desenvolver e testar o resto do fluxo (rota HTTP, guarda de idempotência, webhook) sem
 * depender de nenhum provedor externo nem de nenhuma credencial.
 *
 * O que este arquivo DELIBERADAMENTE não faz:
 * - Não expõe rota HTTP nenhuma (isso é trabalho de Fase 2, ver docs/viabilidade-backend-pagamentos.md).
 * - Não lê nenhuma variável de ambiente de credencial de PSP.
 * - Não faz nenhuma chamada de rede (fetch/axios) em nenhum caminho de código.
 * - Não decide qual PSP real o produto vai usar — isso é decisão de produto (mesma ressalva
 *   já registrada em docs/dominios-a-reconstruir.md §4).
 */

export type StatusPagamentoPix = "enviado" | "confirmado" | "falhou";

export interface PedidoPagamentoPix {
  /** Gerada pelo chamador (cliente ou rota HTTP), não pelo provider — é o que permite ao
   * backend recusar reenvio do mesmo pedido num retry de rede (guarda de idempotência
   * descrita em docs/viabilidade-backend-pagamentos.md §4), antes mesmo de chamar o provider. */
  chaveIdempotencia: string;
  valorCentavos: number;
  destinatarioChavePix: string;
  destinatarioDocumento: string;
}

export interface ResultadoPagamentoPix {
  status: StatusPagamentoPix;
  /** Identificador do pagamento no PSP — usado depois para conciliar o webhook de
   * confirmação com o pedido original. Em produção viria da resposta real do PSP. */
  idExternoPsp: string;
  motivoFalha?: string;
}

/** O que qualquer implementação real (Fase 2 sandbox, ou Fase 3 produção) precisa satisfazer.
 * Uma implementação de produção teria seu próprio arquivo (ex. `pluggy-payments-provider.ts`),
 * leria credencial de variável de ambiente, e faria a chamada HTTP real — nada disso pertence
 * a este arquivo de contrato. */
export interface PaymentProvider {
  /** Envia o pedido de PIX ao PSP. Numa implementação real, isto é uma chamada de rede que
   * pode demorar e pode falhar por motivo de rede (não confundir com o PIX em si ter sido
   * recusado pelo banco destinatário — isso normalmente chega depois, por webhook). */
  iniciarPagamentoPix(pedido: PedidoPagamentoPix): Promise<ResultadoPagamentoPix>;
}

/** Mock determinístico, só para desenvolvimento/teste. Nunca fala com rede — toda a "resposta
 * do PSP" é decidida localmente, na hora, com base no próprio pedido. Não deve ser usado como
 * caminho de produção sob nenhuma circunstância: não existe conceito de "sandbox real do PSP"
 * aqui, é só um simulador em memória. */
export class SandboxPaymentProvider implements PaymentProvider {
  private contador = 0;

  /** Regra de simulação, só para tornar o mock testável de forma previsível: uma chave PIX
   * que contenha "falha" simula recusa do PSP (ex.: chave inexistente, conta encerrada). Todo
   * o resto simula sucesso. Isso não reflete nenhuma regra real de PSP — é só um gancho para
   * os testes exercitarem os dois desfechos sem precisar de rede nem de um mock mais elaborado. */
  async iniciarPagamentoPix(pedido: PedidoPagamentoPix): Promise<ResultadoPagamentoPix> {
    if (!(pedido.valorCentavos > 0)) {
      throw new Error("valorCentavos precisa ser positivo.");
    }
    if (!pedido.chaveIdempotencia?.trim()) {
      throw new Error("chaveIdempotencia é obrigatória.");
    }

    this.contador += 1;
    const idExternoPsp = `sandbox_${this.contador}_${pedido.chaveIdempotencia}`;

    if (pedido.destinatarioChavePix.toLowerCase().includes("falha")) {
      return {
        status: "falhou",
        idExternoPsp,
        motivoFalha: "Chave PIX simulada como inválida pelo sandbox (contém 'falha').",
      };
    }

    return { status: "enviado", idExternoPsp };
  }
}
