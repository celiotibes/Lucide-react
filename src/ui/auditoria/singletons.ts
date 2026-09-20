/**
 * Instâncias únicas dos módulos de auditoria/continuidade (Fase 7), compartilhadas por
 * todo o Painel de Auditoria.
 *
 * Atualização: a tabela `auditoria_log` passou a existir em
 * `contabilidade-reconstituicao/schema.sql`, e `gerenciadorAuditoria`
 * (`GerenciadorAuditLoggingImutavel`) agora persiste nela de verdade — ver
 * `definirBanco`/`hidratarDeBanco`/`validarIntegridadeDoBanco` em `audit-logging-imutavel.ts`
 * e o relatório da tarefa. `PainelAuditoria.tsx` liga essa instância ao `db` real (via
 * `useDb()`) assim que monta; a trilha de eventos e a verificação de integridade da cadeia
 * sobrevivem a um F5 a partir daí.
 *
 * `estrategiaBackup` (`strategy-backup.ts`) e `planoRecuperacaoDesastres`
 * (`plano-recuperacao-desastres.ts`) CONTINUAM só em memória — nenhuma das duas grava no
 * banco sql.js, e nada nesta tarefa mudou isso. O histórico de backups/testes de DRP
 * mostrado no Painel ainda some ao recarregar a página ou fechar a aba.
 *
 * `compliance-audit-log.ts` (a outra variante que também grava em `auditoria_log`, com
 * seu próprio conjunto de colunas) continua fora deste arquivo e sem uso por nenhuma tela:
 * é um módulo síncrono e ainda tem o bug do `crypto` do Node (import proibido no
 * navegador). Corrigi-lo para Web Crypto exigiria torná-lo assíncrono, o que quebraria o
 * teste síncrono que hoje o exercita (`__tests__/integracao-externa-completa.test.ts`).
 * Por isso a persistência da trilha foi dada a `GerenciadorAuditLoggingImutavel` (já
 * assíncrono, já corrigido para Web Crypto, e já é o motor que esta tela usa) escrevendo
 * direto na mesma tabela com sua própria série de colunas → hash, sem depender de
 * `compliance-audit-log.ts`. Ver o relatório da tarefa para o detalhe completo.
 *
 * Por causa disso, cada tela que usa estes módulos precisa reaproveitar a MESMA instância
 * entre re-renders (senão cada montagem do componente começaria do zero e, no caso da
 * trilha, re-hidrataria do banco a cada vez), o que este módulo garante ao criar os
 * objetos uma única vez, no escopo do módulo.
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
