import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

export interface RegraCategorizacao {
  padrao: RegExp;
  planoContaCodigo: string;
  contratoId?: number;
  imovelId?: number;
  prestadorId?: number;
}

/** Regras vivem em `data/regras_categorizacao.csv` no módulo Python-espelho;
 * aqui aceitamos a mesma estrutura carregada de um array em memória (a UI
 * edita essas regras e o usuário pode exportar/importar como CSV). */
export function carregarRegrasDoCsv(conteudoCsv: string): RegraCategorizacao[] {
  const linhas = conteudoCsv.trim().split("\n").slice(1); // pula cabeçalho
  return linhas
    .filter((linha) => linha.trim())
    .map((linha) => {
      const [padrao, planoContaCodigo, contratoId, imovelId, prestadorId] = linha.split(",");
      return {
        padrao: new RegExp(padrao, "i"),
        planoContaCodigo,
        contratoId: contratoId ? Number(contratoId) : undefined,
        imovelId: imovelId ? Number(imovelId) : undefined,
        prestadorId: prestadorId ? Number(prestadorId) : undefined,
      };
    });
}

/** Aplica as regras determinísticas às transações ainda sem categoria.
 * Retorna quantas foram resolvidas — o restante segue para IA ou revisão manual. */
export function aplicarRegras(db: Database, regras: RegraCategorizacao[]): number {
  const pendentes = consultar<{ id: number; descricao_original: string }>(
    db,
    "SELECT id, descricao_original FROM transacoes WHERE plano_conta_codigo IS NULL",
  );

  let resolvidas = 0;
  for (const transacao of pendentes) {
    const regra = regras.find((r) => r.padrao.test(transacao.descricao_original));
    if (!regra) continue;

    executar(
      db,
      `UPDATE transacoes
       SET plano_conta_codigo = ?, contrato_id = ?, imovel_id = ?, prestador_id = ?, categorizado_por = 'regra'
       WHERE id = ?`,
      [regra.planoContaCodigo, regra.contratoId ?? null, regra.imovelId ?? null, regra.prestadorId ?? null, transacao.id],
    );
    resolvidas += 1;
  }
  return resolvidas;
}
