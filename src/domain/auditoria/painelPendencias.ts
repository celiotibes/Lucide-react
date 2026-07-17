import type { Database } from "sql.js";
import { consultar } from "../../db/connection";
import { detectarDuplicatas, detectarLacunasMensais, detectarCaucoesSemTransacao, detectarTransacoesCaucaoSemRegistro, detectarFinanciamentosSemLancamento } from "./auditoriaForense";
import { gerarCompetencias, conciliar } from "../reconcile/contratos";
import { calcularInadimplencia } from "../reconcile/inadimplencia";
import { calcularPatrimonioLiquido } from "../patrimonio/balancoPatrimonial";
import { compararDeclaradoXReconstituido } from "../reports/comparativoFiscal";
import { calcularStatusBackup } from "../backupIntegridade";
import { formatarMoeda } from "../formatarMoeda";

export type SeveridadePendencia = "critica" | "atencao" | "info";

export interface ItemPendencia {
  id: string;
  titulo: string;
  descricao: string;
  severidade: SeveridadePendencia;
  /** id de uma aba em App.tsx para o botão "ver" navegar até lá; null quando a ação não é
   * uma navegação de aba (ex.: exportar backup, que é um botão no cabeçalho). */
  aba: string | null;
}

const CODIGOS_DESPESA_RECORRENTE = ["2.1.01", "2.1.05", "2.1.06"]; // condomínio/IPTU, juros e amortização de financiamento

function somarAnos(dataIso: string, anos: number): string {
  const data = new Date(dataIso + "T00:00:00");
  data.setFullYear(data.getFullYear() + anos);
  return data.toISOString().slice(0, 10);
}

/** Consolida, num único lugar, os itens acionáveis já detectados espalhados pelas telas de
 * Transações, Contratos, Auditoria forense, Patrimônio e Renda tributável — o mesmo papel que
 * uma "fila de trabalho" (worklist) cumpre em ferramentas de auditoria/compliance: em vez de o
 * usuário visitar aba por aba para descobrir o que está pendente, a lista chega pronta, já
 * ordenada por severidade. Não introduz nenhuma lógica de detecção nova — só agrega funções que
 * já existem e já foram validadas nas suas próprias telas, para não duplicar (e arriscar
 * divergir) nenhuma regra de negócio. */
export function gerarPainelPendencias(db: Database, hoje: string): ItemPendencia[] {
  const itens: ItemPendencia[] = [];

  const totalTransacoes = consultar<{ total: number }>(db, "SELECT COUNT(*) as total FROM transacoes")[0]?.total ?? 0;
  if (totalTransacoes === 0) return itens; // banco vazio — nenhuma pendência a reportar ainda

  const naoCategorizadas = consultar<{ total: number }>(db, "SELECT COUNT(*) as total FROM transacoes WHERE plano_conta_codigo IS NULL")[0]?.total ?? 0;
  if (naoCategorizadas > 0) {
    itens.push({
      id: "transacoes-sem-categoria",
      titulo: `${naoCategorizadas} transação(ões) sem categoria`,
      descricao: "Lançamentos importados que ainda não foram vinculados a um código do plano de contas — ficam de fora do DRE, da renda tributável e de qualquer relatório até serem revisados.",
      severidade: "atencao",
      aba: "transacoes",
    });
  }

  const competencias = gerarCompetencias(db, hoje);
  const excecoes = conciliar(db, competencias);
  const statusInadimplencia = calcularInadimplencia(db, excecoes, hoje).filter((s) => s.diasAtraso > 0);
  if (statusInadimplencia.length > 0) {
    const totalDevido = statusInadimplencia.reduce((acc, s) => acc + s.totalDevido, 0);
    const maiorAtraso = Math.max(...statusInadimplencia.map((s) => s.diasAtraso));
    const algumaInadimplente = statusInadimplencia.some((s) => s.situacao === "inadimplente");
    itens.push({
      id: "inadimplencia-aberta",
      titulo: `${statusInadimplencia.length} competência(s) em atraso — ${formatarMoeda(totalDevido)} devido`,
      descricao: `Soma de multa, juros, correção monetária e honorários em aberto em todos os contratos. Maior atraso: ${maiorAtraso} dia(s).`,
      severidade: algumaInadimplente ? "critica" : "atencao",
      aba: "contratos",
    });
  }

  const duplicatas = detectarDuplicatas(db);
  if (duplicatas.length > 0) {
    itens.push({
      id: "transacoes-duplicadas",
      titulo: `${duplicatas.length} possível(is) lançamento(s) duplicado(s)`,
      descricao: "Mesma conta, data, valor e descrição aparecem mais de uma vez nas transações — pode ser um extrato importado duas vezes, inflando receita ou despesa.",
      severidade: "atencao",
      aba: "auditoria",
    });
  }

  const dataInicio36m = new Date(new Date(hoje).setMonth(new Date(hoje).getMonth() - 36)).toISOString().slice(0, 10);
  const lacunas = detectarLacunasMensais(db, CODIGOS_DESPESA_RECORRENTE, dataInicio36m, hoje);
  if (lacunas.length > 0) {
    itens.push({
      id: "lacunas-despesa-recorrente",
      titulo: `${lacunas.length} imóvel/categoria com mês faltante em despesa recorrente`,
      descricao: "Condomínio/IPTU ou financiamento sem lançamento em algum mês dos últimos 36 — documento perdido ou extrato ainda não importado para esse período.",
      severidade: "atencao",
      aba: "auditoria",
    });
  }

  const caucoesSemTransacao = detectarCaucoesSemTransacao(db);
  if (caucoesSemTransacao.length > 0) {
    itens.push({
      id: "caucoes-sem-transacao",
      titulo: `${caucoesSemTransacao.length} caução(ões) cadastrada(s) sem depósito no extrato`,
      descricao: "Caução registrada em Cadastros sem nenhuma transação bancária correspondente em ±30 dias — o passivo de caução pode estar contando um valor nunca de fato recebido.",
      severidade: "atencao",
      aba: "auditoria",
    });
  }

  const transacoesCaucaoSemRegistro = detectarTransacoesCaucaoSemRegistro(db);
  if (transacoesCaucaoSemRegistro.length > 0) {
    itens.push({
      id: "transacoes-caucao-sem-registro",
      titulo: `${transacoesCaucaoSemRegistro.length} transação(ões) de caução sem registro formal`,
      descricao: "Transação categorizada como caução no extrato sem nenhum registro correspondente em Cadastros em ±30 dias — falta formalizar o cadastro dessa caução.",
      severidade: "atencao",
      aba: "auditoria",
    });
  }

  const financiamentosSemLancamento = detectarFinanciamentosSemLancamento(db, hoje);
  if (financiamentosSemLancamento.length > 0) {
    itens.push({
      id: "financiamentos-sem-lancamento",
      titulo: `${financiamentosSemLancamento.length} financiamento(s) sem nenhuma parcela lançada`,
      descricao: "Financiamento cadastrado (SAC/Price) sem nenhuma transação de juros/amortização nas transações — o lucro do imóvel no DRE pode estar superestimado por falta desse lançamento.",
      severidade: "critica",
      aba: "financiamentos",
    });
  }

  const patrimonioLiquido = calcularPatrimonioLiquido(db, hoje);
  if (patrimonioLiquido.financiamentosSemSaldoDevedor.length > 0) {
    itens.push({
      id: "financiamentos-outro-sem-saldo",
      titulo: `${patrimonioLiquido.financiamentosSemSaldoDevedor.length} financiamento(s) "Outro" sem saldo devedor informado`,
      descricao: `Consórcio ou outro financiamento sem cronograma teórico precisa de saldo devedor manual para entrar no passivo: ${patrimonioLiquido.financiamentosSemSaldoDevedor.join(", ")}.`,
      severidade: "critica",
      aba: "patrimonio",
    });
  }

  // Checagem direta por SQL (em vez de calcularComprometimentoRenda, que depende do salário
  // mensal digitado à mão na tela de Patrimônio, um dado que não fica salvo no banco) — mesma
  // condição de "não informado" que a própria tela de Financiamentos já sinaliza por imóvel.
  const financiamentosOutroSemParcela = consultar<{ instituicao: string; apelido: string }>(
    db,
    `SELECT f.instituicao, COALESCE(i.apelido, 'imóvel ' || f.imovel_id) AS apelido
     FROM financiamentos f
     JOIN imoveis i ON i.id = f.imovel_id
     WHERE f.sistema = 'OUTRO' AND f.parcela_mensal_manual IS NULL`,
  );
  if (financiamentosOutroSemParcela.length > 0) {
    itens.push({
      id: "financiamentos-outro-sem-parcela",
      titulo: `${financiamentosOutroSemParcela.length} financiamento(s) "Outro" sem parcela mensal informada`,
      descricao: `Consórcio ou outro financiamento sem cronograma teórico precisa de parcela mensal manual para entrar no comprometimento de renda: ${financiamentosOutroSemParcela.map((f) => `${f.apelido} · ${f.instituicao}`).join(", ")}.`,
      severidade: "critica",
      aba: "financiamentos",
    });
  }

  const inicioHistoricoFiscal = somarAnos(`${hoje.slice(0, 4)}-01-01`, -6);
  const comparativoFiscal = compararDeclaradoXReconstituido(db, inicioHistoricoFiscal, hoje);
  for (const linha of comparativoFiscal) {
    if (linha.percentualNaoDeclarado === null) continue;
    if (linha.percentualNaoDeclarado > 20) {
      itens.push({
        id: `comparativo-fiscal-${linha.anoCalendario}`,
        titulo: `${linha.anoCalendario}: ${linha.percentualNaoDeclarado.toFixed(1)}% da renda reconstituída não declarada`,
        descricao: `Renda reconstituída dos extratos (${formatarMoeda(linha.rendaReconstituida)}) muito acima do declarado (${formatarMoeda(linha.rendaDeclarada ?? 0)}, via ${linha.origemDeclarado.replace("_", " ")}).`,
        severidade: "critica",
        aba: "renda",
      });
    } else if (linha.percentualNaoDeclarado > 0.5) {
      itens.push({
        id: `comparativo-fiscal-${linha.anoCalendario}`,
        titulo: `${linha.anoCalendario}: ${linha.percentualNaoDeclarado.toFixed(1)}% de diferença entre declarado e reconstituído`,
        descricao: `Pequena diferença entre renda reconstituída (${formatarMoeda(linha.rendaReconstituida)}) e declarada (${formatarMoeda(linha.rendaDeclarada ?? 0)}) — pode ser arredondamento ou lançamento fora do período.`,
        severidade: "atencao",
        aba: "renda",
      });
    }
  }

  const statusBackup = calcularStatusBackup();
  if (statusBackup.ultimoBackupEm === null) {
    itens.push({
      id: "backup-nunca-feito",
      titulo: "Nenhum backup exportado ainda",
      descricao: "Os dados existem só neste navegador. Exporte um backup (botão no cabeçalho) para ter uma cópia com hash de integridade fora deste dispositivo.",
      severidade: "atencao",
      aba: null,
    });
  } else if (statusBackup.existeAlteracaoNaoBackupeada) {
    itens.push({
      id: "backup-desatualizado",
      titulo: `Backup desatualizado${statusBackup.diasDesdeUltimoBackup !== null ? ` (${statusBackup.diasDesdeUltimoBackup}d)` : ""}`,
      descricao: "Há alterações feitas depois do último backup exportado. Exporte um novo backup (botão no cabeçalho) para não perder o que mudou desde então.",
      severidade: statusBackup.diasDesdeUltimoBackup !== null && statusBackup.diasDesdeUltimoBackup > 7 ? "critica" : "atencao",
      aba: null,
    });
  }

  const ordemSeveridade: Record<SeveridadePendencia, number> = { critica: 0, atencao: 1, info: 2 };
  return itens.sort((a, b) => ordemSeveridade[a.severidade] - ordemSeveridade[b.severidade]);
}
