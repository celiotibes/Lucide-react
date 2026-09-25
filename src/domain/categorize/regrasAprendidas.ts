import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { reclassificarTransacoesEmLote } from "../reclassificacao/reclassificarTransacao";

export interface RegraSalva {
  id: number;
  padrao: string;
  plano_conta_codigo: string;
  imovel_id: number | null;
  criado_em: string;
}

/** Escapa caracteres especiais de regex — usado como ponto de partida seguro
 * (match exato) para o usuário depois afrouxar se quiser generalizar. */
export function escaparParaRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function listarRegras(db: Database): RegraSalva[] {
  return consultar<RegraSalva>(db, "SELECT * FROM regras_categorizacao ORDER BY criado_em DESC");
}

export function salvarRegra(db: Database, padrao: string, planoContaCodigo: string, imovelId: number | null = null): void {
  executar(db, "INSERT INTO regras_categorizacao (padrao, plano_conta_codigo, imovel_id, criado_em) VALUES (?, ?, ?, ?)", [
    padrao,
    planoContaCodigo,
    imovelId,
    new Date().toISOString().slice(0, 10),
  ]);
}

export function excluirRegra(db: Database, id: number): void {
  executar(db, "DELETE FROM regras_categorizacao WHERE id = ?", [id]);
}

/** Aplica as regras salvas às transações ainda sem categoria. Retorna quantas
 * foram resolvidas — a mesma "memória de aprendizado" que os ERPs comerciais
 * (Domínio, Alterdata) usam para lançamentos repetitivos.
 *
 * A classificação em si (plano_conta_codigo) passa por reclassificarTransacoesEmLote —
 * nunca por UPDATE direto. Uma transação "sem categoria" aqui pode já estar no razão,
 * lançada contra a conta transitória de classificação pendente (1.9.99, ver
 * migracao-ledger.ts): sem passar pelo estorno, o razão continuaria mostrando pendente
 * depois da regra já ter classificado a transação na tela. O lote inteiro é tudo-ou-nada
 * (ver reclassificarTransacoesEmLote) — com centenas de transações candidatas, uma falha
 * isolada (ex: transação apagada entre o SELECT acima e a aplicação) não deixa a base
 * pela metade; a função devolve 0 e quem chamou decide se tenta de novo. */
export function aplicarRegrasSalvas(db: Database): number {
  const regras = listarRegras(db);
  const pendentes = consultar<{ id: number; descricao_original: string; imovel_id: number | null }>(
    db,
    "SELECT id, descricao_original, imovel_id FROM transacoes WHERE plano_conta_codigo IS NULL",
  );
  // aplicarRateio() zera transacoes.imovel_id quando o valor é dividido entre vários
  // imóveis (a divisão real fica em `rateios`) — checar só imovel_id === null não basta
  // pra saber se a transação já tem uma atribuição, senão uma regra com imóvel fixo
  // sobrescreveria um rateio manual já aplicado.
  const idsComRateio = new Set(consultar<{ transacao_id: number }>(db, "SELECT DISTINCT transacao_id FROM rateios").map((r) => r.transacao_id));

  const casamentos: Array<{ transacao_id: number; codigo: string; imovel_id: number | null }> = [];
  for (const transacao of pendentes) {
    for (const regra of regras) {
      let casa = false;
      try {
        casa = new RegExp(regra.padrao, "i").test(transacao.descricao_original);
      } catch {
        continue; // regex inválida cadastrada manualmente — ignora em vez de quebrar o lote
      }
      if (casa) {
        // Só aplica o imóvel da regra se a transação ainda não tiver um definido —
        // nunca sobrescreve uma atribuição manual ou rateio já existente.
        const aplicaImovel = regra.imovel_id !== null && transacao.imovel_id === null && !idsComRateio.has(transacao.id);
        casamentos.push({
          transacao_id: transacao.id,
          codigo: regra.plano_conta_codigo,
          imovel_id: aplicaImovel ? regra.imovel_id : null,
        });
        break;
      }
    }
  }

  if (casamentos.length === 0) return 0;

  const resultado = reclassificarTransacoesEmLote(
    db,
    casamentos.map((c) => ({ transacao_id: c.transacao_id, novo_codigo: c.codigo })),
    { categorizado_por: "regra", motivo: "Regra de categorização aprendida aplicada em lote" },
  );
  if (!resultado.sucesso) return 0; // nada foi persistido — o lote é tudo-ou-nada

  // imovel_id não é uma conta do razão — não faz parte da correção por estorno acima,
  // é só uma dimensão de transacoes. Aplicado à parte, só para quem tinha imóvel na regra.
  for (const c of casamentos) {
    if (c.imovel_id !== null) {
      executar(db, "UPDATE transacoes SET imovel_id = ? WHERE id = ?", [c.imovel_id, c.transacao_id]);
    }
  }

  return casamentos.length;
}
