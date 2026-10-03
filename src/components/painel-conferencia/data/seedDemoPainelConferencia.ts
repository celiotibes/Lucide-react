import type { Database } from "sql.js";
import { consultar, executar } from "../../../db/connection";
import { gerarDadosApontamentosDemonstracao } from "../../../domain/apontamentos/seedApontamentos";

/**
 * Dados de demonstração do Painel de Conferência.
 *
 * `gerarDadosApontamentosDemonstracao` (src/domain/apontamentos/seedApontamentos.ts) já existe
 * no repositório mas não está ligado a nenhum lugar do app — não é chamado pelo botão
 * "Carregar dados de demonstração" de src/App.tsx (fora do escopo desta correção) nem por
 * mais ninguém. Esta função reaproveita esse gerador (prestadores + apontamentos + itens
 * remuneráveis) e complementa com o que falta para as outras abas do Painel também terem
 * dados reais para mostrar: movimentações financeiras, um fechamento semanal, os parâmetros
 * de rubrica usados no reajuste IPCA e uma série de índices IPCA para o cálculo do acumulado.
 *
 * Idempotente (como o gerador que reaproveita): cada INSERT é protegido por try/catch para o
 * caso de já ter sido executado antes.
 */
export function gerarDadosDemonstracaoPainelConferencia(db: Database): void {
  gerarDadosApontamentosDemonstracao(db);

  const agora = new Date().toISOString();
  const hoje = agora.slice(0, 10);

  const [apt] = consultar<{ id: number }>(
    db,
    "SELECT id FROM apontamentos_diarios WHERE prestador_id = 1 ORDER BY id LIMIT 1",
  );
  if (apt?.id) {
    try {
      executar(
        db,
        `INSERT INTO movimentacoes_financeiras (apontamento_id, tipo, valor, data_solicitacao, motivo, status, criado_em)
         VALUES (?, 'vale', 150.00, ?, 'Vale alimentação', 'pendente', ?)`,
        [apt.id, hoje, agora],
      );
      executar(
        db,
        `INSERT INTO movimentacoes_financeiras (apontamento_id, tipo, valor, data_solicitacao, motivo, status, criado_em)
         VALUES (?, 'adiantamento', 300.00, ?, 'Adiantamento salarial', 'pendente', ?)`,
        [apt.id, hoje, agora],
      );
    } catch {
      // já existem (execução repetida do seed)
    }
  }

  const inicioSemana = new Date();
  inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
  const dataInicio = inicioSemana.toISOString().slice(0, 10);
  const fimSemana = new Date(inicioSemana);
  fimSemana.setDate(fimSemana.getDate() + 6);
  const dataFim = fimSemana.toISOString().slice(0, 10);

  try {
    executar(
      db,
      `INSERT INTO fechamentos_semanais (prestador_id, data_inicio, data_fim, valor_bruto, descontos_total, valor_liquido, status, criado_em)
       VALUES (1, ?, ?, 380.00, 0, 380.00, 'fechado', ?)`,
      [dataInicio, dataFim, agora],
    );
  } catch {
    // já existe
  }

  // Valores vigentes das rubricas reajustáveis por IPCA (aba "Reajuste IPCA").
  const rubricas: Array<[string, number]> = [
    ["urgencia_50", 50],
    ["urgencia_62_50", 62.5],
    ["airbnb_1q", 31.5],
    ["airbnb_2q", 37.8],
    ["deslocamento", 21],
    ["busca_materiais", 25],
    ["diaria_ajudante", 160],
  ];
  for (const [parametro, valor] of rubricas) {
    try {
      executar(db, `INSERT INTO parametros_operacionais (parametro, valor, vigencia_inicio, atualizado_em) VALUES (?, ?, '2025-01-01', ?)`, [
        parametro,
        valor,
        agora,
      ]);
    } catch {
      // já existe
    }
  }

  // Série de IPCA mensal dos últimos 6 meses, para o cálculo do acumulado do próximo reajuste.
  const taxasIpca = [0.52, 0.4, 0.36, 0.44, 0.3, 0.48];
  const mesReferenciaBase = new Date();
  mesReferenciaBase.setDate(1);
  for (let i = taxasIpca.length; i >= 1; i--) {
    const mes = new Date(mesReferenciaBase);
    mes.setMonth(mes.getMonth() - i);
    const mesIso = mes.toISOString().slice(0, 10);
    try {
      executar(db, `INSERT INTO indices_economicos (indice, mes_referencia, taxa_mensal) VALUES ('ipca', ?, ?)`, [
        mesIso,
        taxasIpca[taxasIpca.length - i],
      ]);
    } catch {
      // já existe
    }
  }
}
