/**
 * Instâncias únicas dos módulos de auditoria/continuidade (Fase 7), compartilhadas por
 * todo o Painel de Auditoria.
 *
 * Os três módulos abaixo (`audit-logging-imutavel`, `strategy-backup`,
 * `plano-recuperacao-desastres`) guardam o próprio estado em memória — arrays e Maps
 * dentro da instância da classe, não no banco sql.js. Isso é uma limitação real, não um
 * detalhe de implementação escondido: o histórico deles some ao recarregar a página ou
 * fechar a aba. Por isso cada tela que os usa precisa reaproveitar a MESMA instância
 * entre re-renders (senão cada montagem do componente começaria do zero), o que este
 * módulo garante ao criar os objetos uma única vez, no escopo do módulo.
 *
 * `compliance-audit-log.ts` (a variante que grava na tabela `auditoria_log` do sql.js)
 * fica de fora deste arquivo de propósito: essa tabela não existe em
 * `contabilidade-reconstituicao/schema.sql`, então chamar aquelas funções contra o banco
 * real do app resultaria em "no such table" (as funções engolem o erro e devolvem zero
 * registros, o que seria mais enganoso do que simplesmente não oferecer a tela ainda).
 * Ver o relatório da tarefa para o detalhe.
 */

import { GerenciadorAuditLoggingImutavel } from "../../domain/erp/audit-logging-imutavel";
import { EstrategiaBackup } from "../../domain/erp/strategy-backup";
import { PlanoRecuperacaoDesastres } from "../../domain/erp/plano-recuperacao-desastres";

export const gerenciadorAuditoria = new GerenciadorAuditLoggingImutavel();
export const estrategiaBackup = new EstrategiaBackup();
export const planoRecuperacaoDesastres = new PlanoRecuperacaoDesastres();

/** Identidade do operador local. O app hoje não tem login por usuário na área contábil
 * (é um sql.js local, de uso individual) — então, diferente de um ERP multiusuário real,
 * não existe "quem" distinto por sessão para preencher usuario_id/usuario_email do log de
 * auditoria. Usar um identificador fixo e explícito é mais honesto do que fingir uma
 * autenticação que não existe. */
export const OPERADOR_LOCAL_ID = "operador-local";
export const OPERADOR_LOCAL_EMAIL = "operador@local";
