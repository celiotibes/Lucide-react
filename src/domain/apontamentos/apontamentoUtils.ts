import type { Database } from "sql.js";
import { executar, consultar } from "../../db/connection";
import type { ApontamentoDiario, ItemRemunerable, Retificacao } from "../types";

/**
 * Cria um novo apontamento diário para um prestador
 */
export function criarApontamento(db: Database, prestadorId: number, data: string): ApontamentoDiario {
  const agora = new Date().toISOString();
  executar(
    db,
    `INSERT INTO apontamentos_diarios
     (prestador_id, data, entrada, saida_final, status, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, 'rascunho', ?, ?)`,
    [prestadorId, data, "", "", agora, agora]
  );

  const [apt] = consultar<ApontamentoDiario>(
    db,
    "SELECT * FROM apontamentos_diarios WHERE prestador_id = ? AND data = ? ORDER BY id DESC LIMIT 1",
    [prestadorId, data]
  );

  return apt;
}

/**
 * Registra um evento de horário (chegada, saída intervalo, retorno, saída final)
 */
export function registrarEventoHorario(
  db: Database,
  apontamentoId: number,
  tipoEvento: "chegada" | "saida_intervalo" | "retorno" | "saida",
  horario: string
): void {
  const agora = new Date().toISOString();

  // Atualizar apontamento com o horário
  const campoUpdate = {
    chegada: "entrada",
    saida_intervalo: "saida_intervalo",
    retorno: "retorno_intervalo",
    saida: "saida_final",
  }[tipoEvento];

  executar(db, `UPDATE apontamentos_diarios SET ${campoUpdate} = ?, atualizado_em = ? WHERE id = ?`, [horario, agora, apontamentoId]);

  // Registrar no histórico
  executar(
    db,
    `INSERT INTO historico_horarios (apontamento_id, tipo_evento, horario, criado_em) VALUES (?, ?, ?, ?)`,
    [apontamentoId, tipoEvento, horario, agora]
  );
}

/**
 * Calcula horas entre dois horários (HH:MM:SS format)
 */
export function calcularHoras(entrada: string, saida: string, saidaIntervalo?: string, retornoIntervalo?: string): number {
  const parseTime = (time: string): number => {
    const [h, m, s] = time.split(":").map(Number);
    return h * 3600 + m * 60 + (s || 0);
  };

  let segundosTrabalho = parseTime(saida) - parseTime(entrada);

  if (saidaIntervalo && retornoIntervalo) {
    const segundosIntervalo = parseTime(retornoIntervalo) - parseTime(saidaIntervalo);
    segundosTrabalho -= segundosIntervalo;
  }

  return Math.round((segundosTrabalho / 3600) * 4) / 4; // Arredonda para 0.25h
}

/**
 * Adiciona uma atividade remunerável (rubrica) a um apontamento
 */
export function adicionarAtividade(
  db: Database,
  apontamentoId: number,
  tipo: string,
  rubrica: string,
  valorBase: number,
  adicionalPercentual: number = 0
): ItemRemunerable {
  const valorFinal = valorBase * (1 + adicionalPercentual / 100);
  const agora = new Date().toISOString();

  executar(
    db,
    `INSERT INTO itens_remuneraveis
     (apontamento_id, tipo, rubrica, valor_base, adicional_percentual, valor_final, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [apontamentoId, tipo, rubrica, valorBase, adicionalPercentual, valorFinal, agora]
  );

  const [ativ] = consultar<ItemRemunerable>(db, "SELECT * FROM itens_remuneraveis WHERE apontamento_id = ? ORDER BY id DESC LIMIT 1", [apontamentoId]);

  return ativ;
}

/**
 * Cria uma retificação de horário (corrigir horário com justificativa)
 */
export function criarRetificacao(
  db: Database,
  apontamentoId: number,
  campoAlterado: string,
  valorAnterior: string,
  valorNovo: string,
  motivo?: string
): Retificacao {
  const agora = new Date().toISOString();
  const hoje = new Date().toISOString().split("T")[0];

  executar(
    db,
    `INSERT INTO retificacoes
     (apontamento_id, campo_alterado, valor_anterior, valor_novo, motivo, data_retificacao, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [apontamentoId, campoAlterado, valorAnterior, valorNovo, motivo || null, hoje, agora]
  );

  const [retif] = consultar<Retificacao>(db, "SELECT * FROM retificacoes WHERE apontamento_id = ? ORDER BY id DESC LIMIT 1", [apontamentoId]);

  return retif;
}

/**
 * Obtém um apontamento e todas as suas atividades relacionadas
 */
export function obterApontamentoCompleto(db: Database, apontamentoId: number) {
  const [apt] = consultar<ApontamentoDiario>(db, "SELECT * FROM apontamentos_diarios WHERE id = ?", [apontamentoId]);

  if (!apt) return null;

  const atividades = consultar<ItemRemunerable>(db, "SELECT * FROM itens_remuneraveis WHERE apontamento_id = ? ORDER BY criado_em", [apontamentoId]);

  const historico = consultar(db, "SELECT * FROM historico_horarios WHERE apontamento_id = ? ORDER BY criado_em", [apontamentoId]);

  const retificacoes = consultar<Retificacao>(db, "SELECT * FROM retificacoes WHERE apontamento_id = ? ORDER BY criado_em", [apontamentoId]);

  return {
    apontamento: apt,
    atividades,
    historico,
    retificacoes,
  };
}

/**
 * Cria um fechamento semanal (consolidação de apontamentos)
 */
export function criarFechamentoSemanal(
  db: Database,
  prestadorId: number,
  dataInicio: string,
  dataFim: string,
  valorBruto: number,
  descontos: number = 0
) {
  const agora = new Date().toISOString();
  const valorLiquido = valorBruto - descontos;

  executar(
    db,
    `INSERT INTO fechamentos_semanais
     (prestador_id, data_inicio, data_fim, valor_bruto, descontos_total, valor_liquido, status, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, 'aberto', ?)`,
    [prestadorId, dataInicio, dataFim, valorBruto, descontos, valorLiquido, agora]
  );
}

/**
 * Obtém apontamentos de um período (por exemplo, uma semana)
 */
export function obterApontamentosPeriodo(
  db: Database,
  prestadorId: number,
  dataInicio: string,
  dataFim: string
): ApontamentoDiario[] {
  return consultar<ApontamentoDiario>(
    db,
    "SELECT * FROM apontamentos_diarios WHERE prestador_id = ? AND data BETWEEN ? AND ? ORDER BY data",
    [prestadorId, dataInicio, dataFim]
  );
}

/**
 * Valida se um apontamento pode avançar para o próximo estágio
 */
export function validarProgressaoApontamento(apt: ApontamentoDiario): { valido: boolean; mensagem?: string } {
  if (!apt.entrada) {
    return { valido: false, mensagem: "Registre a entrada primeiro" };
  }

  if (apt.saida_intervalo && !apt.retorno_intervalo) {
    return { valido: false, mensagem: "Registre o retorno do intervalo antes de encerrar" };
  }

  if (!apt.saida_final) {
    return { valido: false, mensagem: "Registre a saída final do dia" };
  }

  return { valido: true };
}

/**
 * Calcula o total de horas efetivas de trabalho em um dia
 */
export function calcularHorasEfetivas(apt: ApontamentoDiario): number {
  if (!apt.entrada || !apt.saida_final) return 0;
  return calcularHoras(apt.entrada, apt.saida_final, apt.saida_intervalo, apt.retorno_intervalo);
}

/**
 * Permite retificação apenas se for no mesmo dia ou dia seguinte
 */
export function podeRetificar(dataApontamento: string): { permite: boolean; motivo?: string } {
  const hoje = new Date();
  const dataParsed = new Date(dataApontamento);
  const diferenca = Math.floor((hoje.getTime() - dataParsed.getTime()) / (1000 * 60 * 60 * 24));

  if (diferenca > 1) {
    return { permite: false, motivo: "Retificações permitidas apenas até o dia seguinte. Solicite aprovação do gestor." };
  }

  return { permite: true };
}
