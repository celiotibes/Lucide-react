import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLog, resumirDiferenca } from "../auditoria/logAlteracoes";
import type { Transacao } from "../types";

export interface DadosTransacaoManual {
  contaId: number;
  data: string;
  valor: number;
  descricaoOriginal: string;
  planoContaCodigo?: string | null;
  imovelId?: number | null;
}

const TOLERANCIA_CENTAVOS = 0.01;

function inserirTransacao(db: Database, dados: DadosTransacaoManual): number {
  executar(
    db,
    `INSERT INTO transacoes (conta_id, data, valor, descricao_original, plano_conta_codigo, imovel_id, categorizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      dados.contaId,
      dados.data,
      dados.valor,
      dados.descricaoOriginal,
      dados.planoContaCodigo ?? null,
      dados.imovelId ?? null,
      dados.planoContaCodigo ? "manual" : null,
    ],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id");
  return id;
}

/** Cria um lançamento que não veio de nenhum arquivo importado (ex.: pagamento em dinheiro,
 * correção de algo esquecido na importação) ou uma das partes de uma divisão de transação
 * (ver dividirTransacao). Sempre grava no log de alterações — mesma trilha de auditoria de
 * qualquer outro cadastro criado manualmente. */
export function criarTransacaoManual(db: Database, dados: DadosTransacaoManual): number {
  const id = inserirTransacao(db, dados);
  const [transacaoCriada] = consultar<Record<string, unknown>>(db, "SELECT * FROM transacoes WHERE id = ?", [id]);
  registrarLog(db, "transacoes", id, "criacao", resumirDiferenca(null, transacaoCriada), null, transacaoCriada);
  return id;
}

/** Exclui um lançamento. Limpa rateio e vínculo de documento ANTES de apagar a transação em
 * si — com PRAGMA foreign_keys = ON (schema.sql), o DELETE falharia com violação de
 * integridade referencial se sobrasse algum rateio ou documento_transacoes apontando para um
 * id que não existe mais (mesmo padrão já usado em documentos.ts::excluirDocumento). */
export function excluirTransacao(db: Database, transacaoId: number): void {
  const [anterior] = consultar<Record<string, unknown>>(db, "SELECT * FROM transacoes WHERE id = ?", [transacaoId]);
  if (!anterior) throw new Error(`Transação ${transacaoId} não encontrada.`);

  executar(db, "DELETE FROM rateios WHERE transacao_id = ?", [transacaoId]);
  executar(db, "DELETE FROM documento_transacoes WHERE transacao_id = ?", [transacaoId]);
  executar(db, "DELETE FROM transacoes WHERE id = ?", [transacaoId]);

  // resumirDiferenca() é feita para diff de EDIÇÃO (anterior → novo) — usada como está aqui
  // (novo = {}) listaria todo campo da transação como "→ —", um resumo ilegível para uma
  // exclusão. Um resumo direto com os campos que identificam o lançamento é mais útil.
  const resumo = `lançamento excluído: ${anterior.data} · ${anterior.valor} · ${anterior.descricao_original}`;
  registrarLog(db, "transacoes", transacaoId, "exclusao", resumo, anterior, null);
}

export interface ParteDivisao {
  valor: number;
  descricaoComplemento?: string;
  planoContaCodigo?: string | null;
  imovelId?: number | null;
}

/** Divide UM lançamento bancário em vários — o caso real de um pagamento único cobrindo mais
 * de uma coisa (ex.: um PIX que é aluguel + reembolso de água avulso, cada parte com
 * categoria diferente). O modelo deste sistema é "uma categoria por transação"; em vez de
 * introduzir uma sub-tabela de itens de lançamento — o que exigiria tocar em toda consulta de
 * relatório que já lê transacoes.valor/plano_conta_codigo direto (dezenas de módulos: DRE,
 * renda tributável, fluxo de caixa, auditoria forense...) — a divisão substitui a transação
 * original por N transações novas, cada uma já uma transação comum do ponto de vista de
 * qualquer relatório existente. Nenhum relatório precisa saber que a divisão aconteceu.
 *
 * A soma das partes precisa reconciliar com o valor original dentro de 1 centavo (mesma
 * tolerância usada em toda validação de conciliação/rateio deste sistema) — nunca aceita uma
 * divisão que perderia ou criaria dinheiro. Exige pelo menos 2 partes: uma parte só não é
 * divisão, é só reclassificar a transação original (use categorizar/atribuirImovel para isso). */
export function dividirTransacao(db: Database, transacaoId: number, partes: ParteDivisao[]): number[] {
  if (partes.length < 2) {
    throw new Error("Uma divisão precisa de pelo menos 2 partes — para só reclassificar, edite a transação diretamente, sem dividir.");
  }

  const [original] = consultar<Transacao>(db, "SELECT * FROM transacoes WHERE id = ?", [transacaoId]);
  if (!original) throw new Error(`Transação ${transacaoId} não encontrada.`);

  const somaPartes = partes.reduce((acc, p) => acc + p.valor, 0);
  if (Math.abs(somaPartes - original.valor) > TOLERANCIA_CENTAVOS) {
    throw new Error(
      `A soma das partes (${somaPartes.toFixed(2)}) não bate com o valor original da transação (${original.valor.toFixed(2)}) — dividir só reparte entre categorias, nunca muda o total.`,
    );
  }

  excluirTransacao(db, transacaoId);

  return partes.map((parte, indice) =>
    criarTransacaoManual(db, {
      contaId: original.conta_id,
      data: original.data,
      valor: parte.valor,
      descricaoOriginal: parte.descricaoComplemento
        ? `${original.descricao_original} (${parte.descricaoComplemento})`
        : `${original.descricao_original} (parte ${indice + 1}/${partes.length})`,
      planoContaCodigo: parte.planoContaCodigo,
      imovelId: parte.imovelId,
    }),
  );
}
