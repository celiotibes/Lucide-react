#!/usr/bin/env node

/**
 * CLI para Gestão de Políticas de Retenção LGPD
 *
 * Uso:
 *   npx ts-node server/src/cli/retention-policy-cli.ts --help
 *   npx ts-node server/src/cli/retention-policy-cli.ts execute --dry-run
 *   npx ts-node server/src/cli/retention-policy-cli.ts execute --real
 *   npx ts-node server/src/cli/retention-policy-cli.ts list-blocked
 *   npx ts-node server/src/cli/retention-policy-cli.ts report
 */

import Database from 'better-sqlite3';
import path from 'path';
import { RetentionPolicyExecutor } from '../services/retention-policy-executor';
import { LoggerService } from '../services/logger-service';

const args = process.argv.slice(2);
const command = args[0] || 'help';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/crmt.db');
const db = new Database(dbPath);
const logger = new LoggerService('retention-policy-cli');
const executor = new RetentionPolicyExecutor(db);

function printHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         LGPD Retention Policy Manager - CLI Tool             ║
╚══════════════════════════════════════════════════════════════╝

COMANDOS:

  execute         Executa limpeza de dados conforme políticas de retenção
  list-blocked    Lista registros bloqueados por litígio (litigation holds)
  list-forgotten  Lista registros marcados para esquecimento
  hold            Bloqueia registro por litígio
  release         Remove bloqueio de litígio
  forget          Marca registro para esquecimento (direito ao esquecimento)
  report          Gera relatório de retenção
  help            Mostra esta ajuda

OPÇÕES GLOBAIS:

  --dry-run                Testa mas não deleta (padrão para 'execute')
  --real                   Deleta dados reais (requer backup validado)
  --verbose                Exibe logs detalhados
  --db <path>              Caminho do banco de dados

EXEMPLOS:

  # Teste: mostrar o que seria deletado
  $ node retention-policy-cli.ts execute --dry-run

  # Deleção real: exigir backup validado
  $ node retention-policy-cli.ts execute --real --backup-validated

  # Listar bloqueios de litígio
  $ node retention-policy-cli.ts list-blocked

  # Bloquear registro por litígio
  $ node retention-policy-cli.ts hold test_dados 123 --reason "processo_judicial" --number "0001234/2026"

  # Desbloquear registro
  $ node retention-policy-cli.ts release test_dados 123

  # Marcar para esquecimento
  $ node retention-policy-cli.ts forget test_dados 456 --reason "solicitacao_usuario"

  # Gerar relatório
  $ node retention-policy-cli.ts report
`);
}

async function executeRetention(): Promise<void> {
  const isDryRun = args.includes('--dry-run') || !args.includes('--real');
  const isReal = args.includes('--real');
  const backupValidated = args.includes('--backup-validated');
  const isVerbose = args.includes('--verbose');

  if (isReal && !backupValidated) {
    console.error('❌ ERRO: Modo --real exige --backup-validated');
    console.error('   (Execute com --dry-run para testar primeiro)');
    process.exit(1);
  }

  try {
    console.log(
      `\n🔄 Iniciando limpeza de dados conforme políticas de retenção...`
    );
    console.log(`   Modo: ${isDryRun ? '📋 DRY-RUN (não deleta)' : '🗑️  REAL (deleta dados)'}`);
    console.log('');

    const resultados = await executor.executarRetencao({
      dryRun: isDryRun,
      executadoPor: 'retention-policy-cli',
      backupValidado: backupValidated,
      verbose: isVerbose,
    });

    // Exibir resultados
    console.log('\n📊 RESULTADOS:');
    console.log('━'.repeat(70));

    let totalTestados = 0;
    let totalDeletados = 0;
    let totalBloqueados = 0;

    for (const r of resultados) {
      totalTestados += r.registros_testados;
      totalDeletados += r.registros_deletados;
      totalBloqueados += r.registros_bloqueados_litigio;

      if (r.registros_testados > 0 || r.registros_deletados > 0) {
        console.log(
          `\n📋 ${r.tabela_nome.padEnd(30)} [${r.tempo_ms}ms]`
        );
        console.log(
          `   Testados:  ${r.registros_testados.toString().padStart(6)} registros`
        );
        if (r.registros_deletados > 0) {
          const emoji = isDryRun ? '📑' : '🗑️ ';
          console.log(
            `   ${emoji} Deletados: ${r.registros_deletados.toString().padStart(6)} registros`
          );
        }
        if (r.registros_bloqueados_litigio > 0) {
          console.log(
            `   ⚖️  Bloqueados: ${r.registros_bloqueados_litigio.toString().padStart(6)} registros (litígio)`
          );
        }
        if (r.registros_marcados_esquecimento > 0) {
          console.log(
            `   📝 Esquecimento: ${r.registros_marcados_esquecimento.toString().padStart(3)} registros`
          );
        }
        if (r.erros.length > 0) {
          console.log(`   ❌ Erros:`);
          for (const erro of r.erros) {
            console.log(`      - ${erro}`);
          }
        }
      }
    }

    console.log('\n' + '━'.repeat(70));
    console.log(`\n📈 RESUMO:`);
    console.log(`   Total testados:   ${totalTestados.toString().padStart(6)} registros`);
    if (totalDeletados > 0) {
      const msg = isDryRun
        ? `   Total a deletar: ${totalDeletados.toString().padStart(3)} registros (dry-run)`
        : `   Total deletados: ${totalDeletados.toString().padStart(3)} registros`;
      console.log(msg);
    }
    if (totalBloqueados > 0) {
      console.log(`   Bloqueados (litígio): ${totalBloqueados.toString().padStart(3)} registros`);
    }

    if (isDryRun) {
      console.log(
        '\n✅ DRY-RUN completo. Execute com --real --backup-validated para deletar dados.'
      );
    } else {
      console.log(
        '\n✅ Limpeza de dados concluída com sucesso.'
      );
    }

    console.log('');
  } catch {
    console.error('❌ ERRO ao executar retenção:', String(error));
    process.exit(1);
  }
}

function listBlocked(): void {
  try {
    const bloqueios = executor.listarRegistrosBloqueados();

    if (bloqueios.length === 0) {
      console.log('✅ Nenhum registro bloqueado por litígio.');
      return;
    }

    console.log(`\n⚖️  REGISTROS BLOQUEADOS POR LITÍGIO (${bloqueios.length}):`);
    console.log('━'.repeat(100));
    console.log(
      `${'Tabela'.padEnd(30)} | ${'ID'.padStart(6)} | ${'Motivo'.padEnd(25)} | ${'Processo'.padEnd(20)}`
    );
    console.log('─'.repeat(100));

    for (const b of bloqueios) {
      console.log(
        `${b.tabela_nome.padEnd(30)} | ${b.registro_id.toString().padStart(6)} | ${(b.motivo_litigio || '-').padEnd(25)} | ${(b.numero_processo || '-').padEnd(20)}`
      );
    }

    console.log('');
  } catch {
    console.error('❌ ERRO ao listar bloqueios:', String(error));
    process.exit(1);
  }
}

function listForgotten(): void {
  try {
    const esquecimentos = db.prepare(`
      SELECT * FROM marcacao_esquecimento
      WHERE status IN ('pendente', 'anonimizado')
      ORDER BY solicitado_em DESC
    `).all() as Array<{
      tabela_nome: string;
      registro_id: number;
      motivo: string;
      status: string;
      solicitado_em: string;
    }>;

    if (esquecimentos.length === 0) {
      console.log('✅ Nenhum registro marcado para esquecimento.');
      return;
    }

    console.log(`\n📝 REGISTROS MARCADOS PARA ESQUECIMENTO (${esquecimentos.length}):`);
    console.log('━'.repeat(90));
    console.log(
      `${'Tabela'.padEnd(30)} | ${'ID'.padStart(6)} | ${'Status'.padEnd(15)} | ${'Motivo'.padEnd(25)}`
    );
    console.log('─'.repeat(90));

    for (const e of esquecimentos) {
      console.log(
        `${e.tabela_nome.padEnd(30)} | ${e.registro_id.toString().padStart(6)} | ${e.status.padEnd(15)} | ${(e.motivo || '-').padEnd(25)}`
      );
    }

    console.log('');
  } catch {
    console.error('❌ ERRO ao listar esquecimentos:', String(error));
    process.exit(1);
  }
}

function holdRecord(): void {
  const tabelaNome = args[1];
  const registroId = parseInt(args[2]);
  const reasonIdx = args.indexOf('--reason');
  const numberIdx = args.indexOf('--number');

  if (!tabelaNome || !registroId || reasonIdx === -1) {
    console.error('❌ Uso: hold <tabela> <id> --reason <motivo> [--number <processo>]');
    process.exit(1);
  }

  const motivo = args[reasonIdx + 1];
  const numero = numberIdx !== -1 ? args[numberIdx + 1] : '';

  try {
    executor.bloquearPorLitigio(
      tabelaNome,
      registroId,
      motivo,
      numero,
      'admin'
    );
    console.log(
      `✅ Registro ${tabelaNome}:${registroId} bloqueado por litígio.`
    );
    console.log(`   Motivo: ${motivo}`);
    if (numero) {
      console.log(`   Processo: ${numero}`);
    }
    console.log('');
  } catch {
    console.error('❌ ERRO ao bloquear registro:', String(error));
    process.exit(1);
  }
}

function releaseRecord(): void {
  const tabelaNome = args[1];
  const registroId = parseInt(args[2]);

  if (!tabelaNome || !registroId) {
    console.error('❌ Uso: release <tabela> <id>');
    process.exit(1);
  }

  try {
    executor.desbloquearLitigio(tabelaNome, registroId, 'admin');
    console.log(
      `✅ Bloqueio removido de ${tabelaNome}:${registroId}.`
    );
    console.log('');
  } catch {
    console.error('❌ ERRO ao desbloquear registro:', String(error));
    process.exit(1);
  }
}

function forgetRecord(): void {
  const tabelaNome = args[1];
  const registroId = parseInt(args[2]);
  const reasonIdx = args.indexOf('--reason');

  if (!tabelaNome || !registroId) {
    console.error('❌ Uso: forget <tabela> <id> [--reason <motivo>]');
    process.exit(1);
  }

  const motivo = reasonIdx !== -1 ? args[reasonIdx + 1] : 'solicitacao_usuario';

  try {
    executor.marcarParaEsquecimento(
      tabelaNome,
      registroId,
      motivo,
      'usuario'
    );
    console.log(
      `✅ Registro ${tabelaNome}:${registroId} marcado para esquecimento.`
    );
    console.log(`   Motivo: ${motivo}`);
    console.log('');
  } catch {
    console.error('❌ ERRO ao marcar para esquecimento:', String(error));
    process.exit(1);
  }
}

function printReport(): void {
  try {
    const relatorio = executor.gerarRelatoriRetencao();

    console.log('\n📊 RELATÓRIO DE RETENÇÃO LGPD:');
    console.log('━'.repeat(70));
    console.log(`   Políticas Ativas: ${relatorio.politicas_ativas}`);
    console.log(`   Registros Bloqueados (Litígio): ${relatorio.registros_bloqueados_total}`);
    if (relatorio.ultima_execucao) {
      console.log(`   Última Execução: ${relatorio.ultima_execucao}`);
    } else {
      console.log('   Última Execução: Nenhuma');
    }
    console.log('');
  } catch {
    console.error('❌ ERRO ao gerar relatório:', String(error));
    process.exit(1);
  }
}

// Executar comando
switch (command) {
  case 'execute':
    executeRetention();
    break;
  case 'list-blocked':
    listBlocked();
    break;
  case 'list-forgotten':
    listForgotten();
    break;
  case 'hold':
    holdRecord();
    break;
  case 'release':
    releaseRecord();
    break;
  case 'forget':
    forgetRecord();
    break;
  case 'report':
    printReport();
    break;
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  default:
    console.error(`❌ Comando desconhecido: ${command}`);
    console.error('Use "help" para ver as opções disponíveis.');
    process.exit(1);
}

db.close();
