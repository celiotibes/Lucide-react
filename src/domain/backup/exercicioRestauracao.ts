/**
 * Exercício de restauração — formaliza como PROGRAMA (planejado → executado → revisado,
 * com RPO/RTO medidos) o que `verificarBackup.ts` já faz tecnicamente.
 *
 * `verificarBackup.ts` restaura um `.sqlite` em memória e confere as invariantes contábeis,
 * mas isso nunca ficou registrado como exercício EXERCITADO de verdade — auditoria
 * comparativa com ERP de referência: eles têm `restore_exercise_plans/_executions/
 * _evidence/_reviews` justamente para provar isso, não só que o código de verificação
 * existe e passa em teste unitário.
 *
 * Este módulo é a camada de registro/orquestração em cima de `verificarBackup`: ele CHAMA
 * a verificação real, nunca reimplementa nenhuma checagem contábil.
 *
 * RPO x RTO (definições usadas nos cálculos abaixo):
 * - RPO (Recovery Point Objective) real = quanto dado poderia ter sido perdido — a
 *   distância entre o último backup CONHECIDO como bom (`dataUltimoBackupConhecido`) e o
 *   momento em que o exercício de restauração começou (`iniciado_em` da execução). Não é
 *   "quanto tempo a restauração levou": é "se o desastre tivesse sido agora, quanto ficaria
 *   para trás".
 * - RTO (Recovery Time Objective) real = quanto tempo levou para restaurar e confirmar que
 *   o backup presta — a distância entre `iniciado_em` e o momento em que a verificação
 *   concluiu (agora, dentro de `concluirExecucaoComSucesso`).
 *
 * Cadeia de custódia: DOIS hashes de evidência são gravados por execução bem-sucedida.
 * - `evidencia_hash`: SHA-256 do RELATÓRIO retornado por `verificarBackup` (serializado como
 *   JSON) — cobre o resultado da checagem (quais invariantes passaram, contagens por
 *   tabela). Duas pessoas com o mesmo arquivo mas relatórios diferentes (ex: checagem rodada
 *   em versões diferentes deste módulo) teriam evidências diferentes, que é o comportamento
 *   certo para uma evidência pericial: ela atesta "o que foi verificado e o que se
 *   encontrou", não só "qual arquivo foi aberto".
 * - `evidencia_hash_arquivo`: SHA-256 do conteúdo `.sqlite` restaurado em si — reaproveitado de
 *   `relatorio.hashSha256`, que `verificarBackup` já calcula sobre os MESMOS bytes de
 *   `conteudoSqliteRestaurado` recebidos aqui (evita hashear o arquivo duas vezes). Permite
 *   conferir "este era exatamente o arquivo aberto" independente do relatório JSON.
 */
import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { verificarBackup, type RelatorioVerificacao } from "./verificarBackup";

/** SHA-256 pela Web Crypto API — mesmo padrão de `verificarBackup.ts`/`erp/ledger.ts`. */
async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type StatusExercicio = "planejado" | "executado" | "revisado";
export type ResultadoExecucao = "sucesso" | "falha";

export interface ExercicioRestauracao {
  id: number;
  descricao: string;
  rpo_horas_alvo: number;
  rto_horas_alvo: number;
  planejado_para: string;
  status: StatusExercicio;
  criado_em: string;
}

export interface ExecucaoExercicio {
  id: number;
  exercicio_id: number;
  iniciado_em: string;
  concluido_em: string | null;
  rpo_horas_real: number | null;
  rto_horas_real: number | null;
  resultado: ResultadoExecucao | null;
  evidencia_hash: string | null;
  /** SHA-256 do conteúdo `.sqlite` restaurado (bytes brutos), separado de `evidencia_hash`
   * (hash do RELATÓRIO de `verificarBackup`) — cadeia de custódia mais forte: um hash atesta
   * "este era o arquivo aberto", o outro "isto foi verificado e encontrado". */
  evidencia_hash_arquivo: string | null;
  observacoes: string | null;
  revisado_por: string | null;
  revisado_em: string | null;
}

export interface ExercicioComExecucoes extends ExercicioRestauracao {
  execucoes: ExecucaoExercicio[];
}

export interface AchadoConformidade {
  exercicio_id: number;
  descricao: string;
  rpo_horas_alvo: number;
  rpo_horas_real: number;
  rpo_dentro_da_meta: boolean;
  rto_horas_alvo: number;
  rto_horas_real: number;
  rto_dentro_da_meta: boolean;
  /** true se QUALQUER uma das duas (RPO ou RTO) ficou fora da meta — o "achado" que deveria
   * acender um alerta num painel de conformidade. */
  nao_conformidade: boolean;
}

function agoraISO(): string {
  return new Date().toISOString();
}

function buscarExercicio(db: Database, exercicioId: number): ExercicioRestauracao | null {
  const [ex] = consultar<ExercicioRestauracao>(
    db,
    "SELECT * FROM exercicios_restauracao WHERE id = ?",
    [exercicioId],
  );
  return ex ?? null;
}

function buscarExecucao(db: Database, execucaoId: number): ExecucaoExercicio | null {
  const [exec] = consultar<ExecucaoExercicio>(
    db,
    "SELECT * FROM exercicios_restauracao_execucoes WHERE id = ?",
    [execucaoId],
  );
  return exec ?? null;
}

/** Diferença em horas entre duas datas (isoInicio → isoFim), sempre >= 0 (o chamador é
 * responsável por passar as datas na ordem certa; um exercício com timestamps
 * inconsistentes é um problema de dado, não algo para este módulo mascarar arredondando
 * pra zero). */
function diferencaEmHoras(isoInicio: string, isoFim: string): number {
  const ms = new Date(isoFim).getTime() - new Date(isoInicio).getTime();
  return ms / (3600 * 1000);
}

/** 1. Planeja um novo exercício de restauração — status inicial sempre 'planejado'. */
export function planejarExercicio(
  db: Database,
  dados: { descricao: string; rpoHorasAlvo: number; rtoHorasAlvo: number; planejadoPara: string },
): ExercicioRestauracao {
  executar(
    db,
    `INSERT INTO exercicios_restauracao (descricao, rpo_horas_alvo, rto_horas_alvo, planejado_para, status)
     VALUES (?, ?, ?, ?, 'planejado')`,
    [dados.descricao, dados.rpoHorasAlvo, dados.rtoHorasAlvo, dados.planejadoPara],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id");
  const exercicio = buscarExercicio(db, id);
  if (!exercicio) throw new Error("Falha ao criar exercício de restauração.");
  return exercicio;
}

/** 2. Inicia uma execução de um exercício existente. Rejeita se o exercício não existir —
 * não faz sentido registrar tempo de restauração de um exercício fantasma. */
export function iniciarExecucao(db: Database, exercicioId: number): ExecucaoExercicio {
  const exercicio = buscarExercicio(db, exercicioId);
  if (!exercicio) throw new Error(`Exercício de restauração ${exercicioId} não encontrado.`);

  executar(
    db,
    "INSERT INTO exercicios_restauracao_execucoes (exercicio_id, iniciado_em) VALUES (?, ?)",
    [exercicioId, agoraISO()],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id");
  const execucao = buscarExecucao(db, id);
  if (!execucao) throw new Error("Falha ao registrar início de execução.");
  return execucao;
}

/** Serializa os achados de `verificarBackup` (checagens com problema) em texto legível
 * para `observacoes` — usado tanto no caminho de falha de `concluirExecucaoComSucesso`
 * quanto disponível para quem quiser reaproveitar o formato. */
function formatarProblemas(relatorio: RelatorioVerificacao): string {
  const problemas = relatorio.checagens.filter((c) => c.gravidade !== "ok");
  if (problemas.length === 0) return "Verificação sem problemas registrados (estado inesperado).";
  return problemas
    .map((c) => `[${c.gravidade.toUpperCase()}] ${c.nome}: ${c.detalhe}`)
    .join("\n");
}

/** Depois de concluir uma execução (sucesso ou falha), atualiza o status do exercício para
 * 'executado' — TODA vez que uma execução é concluída, não só na primeira. DECISÃO: um
 * exercício pode ser re-executado (ex: primeira tentativa falhou, corrige e roda de novo);
 * cada conclusão reafirma que o exercício SAIU do estado "planejado" e tem pelo menos uma
 * execução concluída para revisar. `revisarExercicio` sempre revisa a ÚLTIMA execução
 * concluída, então manter o status em 'executado' a cada conclusão (em vez de travá-lo na
 * primeira) reflete corretamente "há uma execução concluída pronta para revisão" mesmo após
 * reexecuções. Não regride um exercício já 'revisado' de volta para 'executado': uma
 * execução nova após a revisão é registrada, mas a revisão anterior não é desfeita
 * silenciosamente — quem quiser revisar a execução nova chama `revisarExercicio` de novo,
 * que sempre revisa a mais recente. */
function marcarExecutado(db: Database, exercicioId: number): void {
  executar(
    db,
    "UPDATE exercicios_restauracao SET status = 'executado' WHERE id = ? AND status != 'revisado'",
    [exercicioId],
  );
}

/** 3. Conclui uma execução RODANDO a verificação real de `verificarBackup.ts` contra o
 * conteúdo restaurado.
 *
 * - Verificação OK (`contabilidadeIntegra === true`): grava sucesso, calcula RPO/RTO reais
 *   e a evidência (hash do relatório).
 * - Verificação com QUALQUER falha: grava 'falha', observações com os achados, e NÃO
 *   calcula RPO/RTO como se a restauração tivesse dado certo (ficam `null`) — um RPO/RTO
 *   numérico ao lado de resultado='falha' induziria a interpretar a medição como válida. */
export async function concluirExecucaoComSucesso(
  db: Database,
  execucaoId: number,
  dados: { conteudoSqliteRestaurado: Uint8Array; dataUltimoBackupConhecido: string },
  /** Repassado direto para `verificarBackup` — existe aqui pelo mesmo motivo que existe lá:
   * o WASM do sql.js vem de `/sql-wasm.wasm` no navegador e de node_modules no Node/teste. */
  localizarWasm?: (arquivo: string) => string,
): Promise<ExecucaoExercicio> {
  const execucao = buscarExecucao(db, execucaoId);
  if (!execucao) throw new Error(`Execução ${execucaoId} não encontrada.`);

  const relatorio = await verificarBackup(dados.conteudoSqliteRestaurado, localizarWasm);
  const concluidoEm = agoraISO();

  if (!relatorio.contabilidadeIntegra) {
    executar(
      db,
      `UPDATE exercicios_restauracao_execucoes
       SET concluido_em = ?, resultado = 'falha', observacoes = ?
       WHERE id = ?`,
      [concluidoEm, formatarProblemas(relatorio), execucaoId],
    );
    marcarExecutado(db, execucao.exercicio_id);
    return buscarExecucao(db, execucaoId)!;
  }

  const evidenciaHash = await sha256Hex(JSON.stringify(relatorio));
  const evidenciaHashArquivo = relatorio.hashSha256;
  const rpoHorasReal = diferencaEmHoras(dados.dataUltimoBackupConhecido, execucao.iniciado_em);
  const rtoHorasReal = diferencaEmHoras(execucao.iniciado_em, concluidoEm);

  executar(
    db,
    `UPDATE exercicios_restauracao_execucoes
     SET concluido_em = ?, rpo_horas_real = ?, rto_horas_real = ?, resultado = 'sucesso',
         evidencia_hash = ?, evidencia_hash_arquivo = ?
     WHERE id = ?`,
    [concluidoEm, rpoHorasReal, rtoHorasReal, evidenciaHash, evidenciaHashArquivo, execucaoId],
  );
  marcarExecutado(db, execucao.exercicio_id);
  return buscarExecucao(db, execucaoId)!;
}

/** 4. Atalho explícito para quando a restauração nem chegou a rodar `verificarBackup`
 * (ex: arquivo corrompido antes mesmo de tentar abrir, backup indisponível no armazenamento
 * externo). Diferente de `concluirExecucaoComSucesso` encontrar falha DENTRO da verificação
 * — aqui a verificação nunca rodou. */
export function concluirExecucaoComFalha(db: Database, execucaoId: number, motivo: string): ExecucaoExercicio {
  const execucao = buscarExecucao(db, execucaoId);
  if (!execucao) throw new Error(`Execução ${execucaoId} não encontrada.`);

  executar(
    db,
    `UPDATE exercicios_restauracao_execucoes
     SET concluido_em = ?, resultado = 'falha', observacoes = ?
     WHERE id = ?`,
    [agoraISO(), motivo, execucaoId],
  );
  marcarExecutado(db, execucao.exercicio_id);
  return buscarExecucao(db, execucaoId)!;
}

/** 5. Revisa um exercício — só permite se `status = 'executado'` (não é possível revisar
 * um exercício que nunca rodou nenhuma execução, nem um já revisado sem nova execução).
 * Marca a ÚLTIMA execução concluída (maior `concluido_em`) com `revisado_por`/`revisado_em`
 * e promove o exercício para 'revisado'. */
export function revisarExercicio(db: Database, exercicioId: number, revisadoPor: string): ExercicioComExecucoes {
  const exercicio = buscarExercicio(db, exercicioId);
  if (!exercicio) throw new Error(`Exercício de restauração ${exercicioId} não encontrado.`);
  if (exercicio.status !== "executado") {
    throw new Error(
      `Exercício ${exercicioId} está com status '${exercicio.status}' — só é possível revisar um exercício ` +
        `com status 'executado' (ou seja, que já teve ao menos uma execução concluída).`,
    );
  }

  const [ultimaExecucao] = consultar<ExecucaoExercicio>(
    db,
    `SELECT * FROM exercicios_restauracao_execucoes
     WHERE exercicio_id = ? AND concluido_em IS NOT NULL
     ORDER BY concluido_em DESC, id DESC
     LIMIT 1`,
    [exercicioId],
  );
  if (!ultimaExecucao) {
    // Não deveria acontecer se o status é 'executado' (marcarExecutado só roda depois de
    // uma conclusão), mas não deixa a revisão silenciosamente sem execução para apontar.
    throw new Error(`Exercício ${exercicioId} está 'executado' mas não tem execução concluída para revisar.`);
  }

  const revisadoEm = agoraISO();
  executar(
    db,
    "UPDATE exercicios_restauracao_execucoes SET revisado_por = ?, revisado_em = ? WHERE id = ?",
    [revisadoPor, revisadoEm, ultimaExecucao.id],
  );
  executar(db, "UPDATE exercicios_restauracao SET status = 'revisado' WHERE id = ?", [exercicioId]);

  return obterExercicioComExecucoes(db, exercicioId)!;
}

/** 6a. Lista exercícios, opcionalmente filtrados por status. */
export function listarExercicios(db: Database, filtros?: { status?: StatusExercicio }): ExercicioRestauracao[] {
  if (filtros?.status) {
    return consultar<ExercicioRestauracao>(
      db,
      "SELECT * FROM exercicios_restauracao WHERE status = ? ORDER BY planejado_para DESC, id DESC",
      [filtros.status],
    );
  }
  return consultar<ExercicioRestauracao>(db, "SELECT * FROM exercicios_restauracao ORDER BY planejado_para DESC, id DESC");
}

/** 6b. Um exercício com todas as suas execuções (mais recente primeiro). */
export function obterExercicioComExecucoes(db: Database, exercicioId: number): ExercicioComExecucoes | null {
  const exercicio = buscarExercicio(db, exercicioId);
  if (!exercicio) return null;

  const execucoes = consultar<ExecucaoExercicio>(
    db,
    "SELECT * FROM exercicios_restauracao_execucoes WHERE exercicio_id = ? ORDER BY iniciado_em DESC, id DESC",
    [exercicioId],
  );
  return { ...exercicio, execucoes };
}

/** 7. Relatório de conformidade: para cada exercício REVISADO com pelo menos uma execução
 * de SUCESSO, compara RPO/RTO real (da execução de sucesso mais recente) contra a meta do
 * exercício. RPO/RTO real PIOR (maior) que o alvo é a não-conformidade — o achado que deve
 * aparecer destacado num painel.
 *
 * Exercícios sem execução de sucesso nenhuma (só falharam, ou ainda não foram revisados)
 * ficam de fora deste relatório — comparar RPO/RTO "real" de uma execução que falhou não
 * faz sentido (não houve restauração válida para medir), e um exercício não revisado ainda
 * não passou pelo controle humano que confirma que a medição vale. */
export function relatorioConformidadeRestauracao(db: Database): AchadoConformidade[] {
  const revisados = listarExercicios(db, { status: "revisado" });
  const achados: AchadoConformidade[] = [];

  for (const exercicio of revisados) {
    const [execucaoSucesso] = consultar<ExecucaoExercicio>(
      db,
      `SELECT * FROM exercicios_restauracao_execucoes
       WHERE exercicio_id = ? AND resultado = 'sucesso'
       ORDER BY concluido_em DESC, id DESC
       LIMIT 1`,
      [exercicio.id],
    );
    if (!execucaoSucesso || execucaoSucesso.rpo_horas_real === null || execucaoSucesso.rto_horas_real === null) {
      continue;
    }

    const rpoDentro = execucaoSucesso.rpo_horas_real <= exercicio.rpo_horas_alvo;
    const rtoDentro = execucaoSucesso.rto_horas_real <= exercicio.rto_horas_alvo;

    achados.push({
      exercicio_id: exercicio.id,
      descricao: exercicio.descricao,
      rpo_horas_alvo: exercicio.rpo_horas_alvo,
      rpo_horas_real: execucaoSucesso.rpo_horas_real,
      rpo_dentro_da_meta: rpoDentro,
      rto_horas_alvo: exercicio.rto_horas_alvo,
      rto_horas_real: execucaoSucesso.rto_horas_real,
      rto_dentro_da_meta: rtoDentro,
      nao_conformidade: !rpoDentro || !rtoDentro,
    });
  }

  return achados;
}
