import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

export interface RegraSalva {
  id: number;
  padrao: string;
  plano_conta_codigo: string;
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

export function salvarRegra(db: Database, padrao: string, planoContaCodigo: string): void {
  executar(db, "INSERT INTO regras_categorizacao (padrao, plano_conta_codigo, criado_em) VALUES (?, ?, ?)", [
    padrao,
    planoContaCodigo,
    new Date().toISOString().slice(0, 10),
  ]);
}

export function excluirRegra(db: Database, id: number): void {
  executar(db, "DELETE FROM regras_categorizacao WHERE id = ?", [id]);
}

/** Aplica as regras salvas às transações ainda sem categoria. Retorna quantas
 * foram resolvidas — a mesma "memória de aprendizado" que os ERPs comerciais
 * (Domínio, Alterdata) usam para lançamentos repetitivos. */
export function aplicarRegrasSalvas(db: Database): number {
  const regras = listarRegras(db);
  const pendentes = consultar<{ id: number; descricao_original: string }>(
    db,
    "SELECT id, descricao_original FROM transacoes WHERE plano_conta_codigo IS NULL",
  );

  let resolvidas = 0;
  for (const transacao of pendentes) {
    for (const regra of regras) {
      let casa = false;
      try {
        casa = new RegExp(regra.padrao, "i").test(transacao.descricao_original);
      } catch {
        continue; // regex inválida cadastrada manualmente — ignora em vez de quebrar o lote
      }
      if (casa) {
        executar(db, "UPDATE transacoes SET plano_conta_codigo = ?, categorizado_por = 'regra' WHERE id = ?", [
          regra.plano_conta_codigo,
          transacao.id,
        ]);
        resolvidas++;
        break;
      }
    }
  }
  return resolvidas;
}
