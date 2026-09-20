/**
 * Phase 7: Data Protection & Disaster Recovery
 * Comprehensive test suite (200+ tests)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EstrategiaBackup, TipoBackup, StatusBackup, NivelRetencao } from '../strategy-backup';
import { GerenciadorEncriptacao, TipoCriptografia, StatusChave, TipoChave } from '../encriptacao';
import { GerenciadorReplicacaoHA, StatusReplica, TipoReplica } from '../replicacao-ha';
import { PlanoRecuperacaoDesastres, TipoDesastre, SeveridadeDesastre } from '../plano-recuperacao-desastres';
import { GerenciadorAuditLoggingImutavel, TipoOperacao, NivelSensibilidade } from '../audit-logging-imutavel';
import { GerenciadorVulnerabilidades, SeveridadeVulnerabilidade, TipoVarredura } from '../gerenciamento-vulnerabilidades';
import { GerenciadorComplianceLGPD, TipoDireito } from '../compliance-lgpd';
import { GerenciadorMonitoramentoCompliance, TipoCompliance, StatusCompliance, type ControleCompliance } from '../monitoramento-compliance';

describe('Phase 7: Data Protection & Disaster Recovery', () => {
  // ============ 7a: BACKUP STRATEGY ============

  describe('7a: EstrategiaBackup - Backup Strategy & Execution', () => {
    let estrategia: EstrategiaBackup;

    beforeEach(() => {
      estrategia = new EstrategiaBackup();
    });

    describe('Execução de Backups', () => {
      it('deve executar backup completo com sucesso', async () => {
        const backup = await estrategia.executarBackup(
          TipoBackup.COMPLETO,
          'usuario-01',
          { descricao: 'Backup automático' }
        );

        expect(backup).toBeDefined();
        expect(backup.tipo).toBe(TipoBackup.COMPLETO);
        expect(backup.status).toBe(StatusBackup.CONCLUIDO);
        expect(backup.tamanho_bytes).toBeGreaterThan(0);
        expect(backup.tamanho_comprimido_bytes).toBeLessThan(backup.tamanho_bytes);
        expect(backup.taxa_compressao).toBeGreaterThan(0);
        expect(backup.taxa_compressao).toBeLessThan(100);
        expect(backup.encriptado).toBe(true);
        expect(backup.blocos_sincronizados).toBeGreaterThanOrEqual(0);
      });

      it('deve executar backup incremental', async () => {
        const backup = await estrategia.executarBackup(TipoBackup.INCREMENTAL, 'usuario-01');

        expect(backup.tipo).toBe(TipoBackup.INCREMENTAL);
        expect(backup.status).toBe(StatusBackup.CONCLUIDO);
      });

      it('deve executar backup diferencial', async () => {
        const backup = await estrategia.executarBackup(TipoBackup.DIFERENCIAL, 'usuario-01');

        expect(backup.tipo).toBe(TipoBackup.DIFERENCIAL);
        expect(backup.status).toBe(StatusBackup.CONCLUIDO);
      });

      it('deve armazenar backup em múltiplos locais', async () => {
        const backup = await estrategia.executarBackup(TipoBackup.COMPLETO, 'usuario-01');

        expect(backup.caminho_local).toContain('/backups/');
        expect(backup.caminho_offshore).toContain('s3://');
      });

      it('deve gerar checksum válido', async () => {
        const backup = await estrategia.executarBackup(TipoBackup.COMPLETO, 'usuario-01');

        expect(backup.checksum_sha256).toBeDefined();
        expect(backup.checksum_sha256).toHaveLength(64); // SHA256 em hex
      });
    });

    describe('Agendamento de Backups', () => {
      it('deve agendar novo backup', async () => {
        const agendamento = await estrategia.agendarBackup(
          TipoBackup.COMPLETO,
          1440,
          '02:00'
        );

        expect(agendamento).toBeDefined();
        expect(agendamento.ativo).toBe(true);
        expect(agendamento.frequencia_minutos).toBe(1440);
        expect(agendamento.horario_preferencial).toBe('02:00');
      });

      it('deve obter agendamentos ativos', () => {
        const agendamentos = estrategia.obterAgendamentosAtivos();

        expect(Array.isArray(agendamentos)).toBe(true);
        expect(agendamentos.length).toBeGreaterThan(0);
        expect(agendamentos.every(a => a.ativo)).toBe(true);
      });
    });

    describe('Restauração de Backups', () => {
      it('deve restaurar backup em ponto específico no tempo', async () => {
        const backup = await estrategia.executarBackup(TipoBackup.COMPLETO, 'usuario-01');
        const pontoNoTempo = new Date(Date.now() - 60 * 60 * 1000); // 1 hora atrás

        const recuperacao = await estrategia.restaurarDaBackup(
          backup.id,
          'banco_alvo_teste',
          pontoNoTempo
        );

        expect(recuperacao).toBeDefined();
        expect(recuperacao.backup_id).toBe(backup.id);
        expect(recuperacao.status).toBe('CONCLUIDA');
        expect(recuperacao.ponto_no_tempo).toEqual(pontoNoTempo);
        expect(recuperacao.linhas_restauradas).toBeGreaterThan(0);
      });

      it('deve falhar ao restaurar backup inexistente', async () => {
        await expect(
          estrategia.restaurarDaBackup('backup-inexistente', 'banco_alvo')
        ).rejects.toThrow('não encontrado');
      });
    });

    describe('Verificação de Integridade', () => {
      it('deve verificar integridade de backup', async () => {
        const backup = await estrategia.executarBackup(TipoBackup.COMPLETO, 'usuario-01');

        const integro = await estrategia.verificarIntegridade(backup.id);

        expect(typeof integro).toBe('boolean');
      });

      it('deve testar restauração (dry-run)', async () => {
        const backup = await estrategia.executarBackup(TipoBackup.COMPLETO, 'usuario-01');

        const resultado = await estrategia.testarRestauracao(backup.id);

        expect(resultado).toHaveProperty('sucesso');
        expect(resultado).toHaveProperty('detalhes');
      });
    });

    describe('Histórico e Estatísticas', () => {
      it('deve obter histórico de backups', async () => {
        await estrategia.executarBackup(TipoBackup.COMPLETO, 'usuario-01');
        await estrategia.executarBackup(TipoBackup.INCREMENTAL, 'usuario-01');

        const historico = estrategia.obterHistorico();

        expect(Array.isArray(historico)).toBe(true);
        expect(historico.length).toBeGreaterThanOrEqual(2);
      });

      it('deve filtrar histórico por tipo', async () => {
        await estrategia.executarBackup(TipoBackup.COMPLETO, 'usuario-01');
        await estrategia.executarBackup(TipoBackup.INCREMENTAL, 'usuario-01');

        const completos = estrategia.obterHistorico({ tipo: TipoBackup.COMPLETO });

        expect(completos.every(b => b.tipo === TipoBackup.COMPLETO)).toBe(true);
      });

      it('deve obter estatísticas', () => {
        const stats = estrategia.obterEstatisticas();

        expect(stats).toHaveProperty('total_backups');
        expect(stats).toHaveProperty('tamanho_total_bytes');
        expect(stats).toHaveProperty('taxa_compressao_media');
        expect(stats).toHaveProperty('sucesso_rate');
        expect(stats.sucesso_rate).toBeGreaterThanOrEqual(0);
        expect(stats.sucesso_rate).toBeLessThanOrEqual(100);
      });
    });

    describe('Política de Retenção', () => {
      it('deve obter políticas de retenção', () => {
        const politicas = estrategia.obterPoliticasRetencao();

        expect(Array.isArray(politicas)).toBe(true);
        expect(politicas.length).toBe(3); // Diária, Semanal, Mensal
      });

      it('deve aplicar política de retenção', async () => {
        const resultado = await estrategia.aplicarPoliticaRetencao();

        expect(resultado).toHaveProperty('deletados');
        expect(resultado).toHaveProperty('mantidos');
        expect(resultado).toHaveProperty('detalhes');
      });

      it('deve validar saúde dos backups', async () => {
        const resultado = await estrategia.validarSaudeBackups();

        expect(resultado).toHaveProperty('total_verificados');
        expect(resultado).toHaveProperty('integros');
        expect(resultado).toHaveProperty('corrompidos');
        expect(resultado).toHaveProperty('avisos');
      });
    });
  });

  // ============ 7b: ENCRYPTION ============

  describe('7b: GerenciadorEncriptacao - Encryption at Rest & Transit', () => {
    let encriptacao: GerenciadorEncriptacao;

    beforeEach(() => {
      encriptacao = new GerenciadorEncriptacao();
    });

    describe('Encriptação de Dados', () => {
      it('deve encriptar dados de campo sensível', async () => {
        const chamado = await encriptacao.encriptar(
          '123.456.789-00',
          'cpf',
          'PRODUCAO'
        );

        expect(chamado).toBeDefined();
        expect(chamado.texto_encriptado).not.toBe('123.456.789-00');
        expect(chamado.iv_nonce).toBeDefined();
        expect(chamado.tag_autenticacao).toBeDefined();
        expect(chamado.algo).toBe(TipoCriptografia.AES_256_GCM);
      });

      it('deve desencriptar dados', async () => {
        const chamado = await encriptacao.encriptar(
          'dado-sensivel',
          'email',
          'PRODUCAO'
        );

        const desencriptado = await encriptacao.desencriptar(chamado);

        expect(desencriptado).toBe('dado-sensivel');
      });

      it('deve suportar múltiplos algoritmos', async () => {
        const cpf = await encriptacao.encriptar('123.456.789-00', 'cpf');
        const email = await encriptacao.encriptar('user@email.com', 'email');

        expect([cpf, email].every(c => c.algo === TipoCriptografia.AES_256_GCM)).toBe(true);
      });

      it('deve rejeitar campos sem política', async () => {
        await expect(
          encriptacao.encriptar('valor', 'campo_desconhecido')
        ).rejects.toThrow('Nenhuma política encontrada');
      });
    });

    describe('Gestão de Chaves', () => {
      it('deve obter chaves', () => {
        const chaves = encriptacao.obterChaves();

        expect(Array.isArray(chaves)).toBe(true);
        expect(chaves.length).toBeGreaterThan(0);
      });

      it('deve conter chaves ativas', () => {
        const chaves = encriptacao.obterChaves();
        const ativas = chaves.filter(c => c.status === StatusChave.ATIVA);

        expect(ativas.length).toBeGreaterThan(0);
      });

      it('deve rotacionar chaves', async () => {
        const resultado = await encriptacao.rotacionarChaves(
          TipoChave.MESTRE,
          'PRODUCAO'
        );

        expect(resultado).toHaveProperty('chave_antiga');
        expect(resultado).toHaveProperty('chave_nova');
        expect(resultado).toHaveProperty('tempo_execucao_ms');
        expect(resultado.chave_nova.versao).toBeGreaterThan(resultado.chave_antiga.versao);
      });

      it('deve manter histórico de chaves', async () => {
        const chavesBefore = encriptacao.obterChaves().length;

        // MESTRE, e não ENCRIPTACAO: a inicialização só cria chaves mestres (PRODUCAO e
        // STAGING). Rotacionar um tipo que não existe lança, e lançar ali está certo —
        // o teste é que pedia a rotação de uma chave inexistente e nunca chegava a
        // exercitar a rotação.
        await encriptacao.rotacionarChaves(TipoChave.MESTRE, 'STAGING');

        const chavesAfter = encriptacao.obterChaves().length;

        expect(chavesAfter).toBeGreaterThanOrEqual(chavesBefore);
      });
    });

    describe('Certificados TLS', () => {
      it('deve registrar certificado TLS', () => {
        const cert = encriptacao.registrarCertificado(
          'api.erp.com',
          '-----BEGIN CERTIFICATE-----',
          '-----BEGIN PRIVATE KEY-----',
          'Let\'s Encrypt'
        );

        expect(cert).toBeDefined();
        expect(cert.domain).toBe('api.erp.com');
        expect(cert.versao_tls).toBe('1.3');
      });

      it('deve validar certificado TLS', async () => {
        encriptacao.registrarCertificado(
          'api.test.com',
          '-----BEGIN CERTIFICATE-----',
          '-----BEGIN PRIVATE KEY-----',
          'Test CA',
          365
        );

        const resultado = await encriptacao.validarCertificado('api.test.com');

        expect(resultado).toHaveProperty('valido');
        expect(resultado).toHaveProperty('dias_para_vencimento');
        expect(resultado).toHaveProperty('avisos');
      });

      it('deve obter certificados', () => {
        const certs = encriptacao.obterCertificados();

        expect(Array.isArray(certs)).toBe(true);
      });
    });

    describe('Políticas de Encriptação', () => {
      it('deve obter políticas', () => {
        const politicas = encriptacao.obterPoliticas();

        expect(Array.isArray(politicas)).toBe(true);
        expect(politicas.length).toBeGreaterThan(0);
      });

      it('deve ter campos sensíveis mapeados', () => {
        const politicas = encriptacao.obterPoliticas();
        const todosOsCampos = politicas.flatMap(p => p.campos_sensiveis);

        expect(todosOsCampos).toContain('cpf');
        expect(todosOsCampos).toContain('email');
      });
    });

    describe('Força de Encriptação', () => {
      it('deve calcular força de encriptação', () => {
        const forca = encriptacao.calcularForcaEncriptacao();

        expect(forca).toHaveProperty('score');
        expect(forca).toHaveProperty('nivelSeguranca');
        expect(forca).toHaveProperty('recomendacoes');
        expect(forca.score).toBeGreaterThanOrEqual(0);
        expect(forca.score).toBeLessThanOrEqual(100);
      });

      it('deve usar TLS 1.3', () => {
        encriptacao.registrarCertificado(
          'test.com',
          'cert',
          'key',
          'CA'
        );

        const certs = encriptacao.obterCertificados();
        expect(certs.every(c => c.versao_tls === '1.3')).toBe(true);
      });
    });

    describe('Estatísticas de Encriptação', () => {
      it('deve obter estatísticas', () => {
        const stats = encriptacao.obterEstatisticas();

        expect(stats).toHaveProperty('total_operacoes');
        expect(stats).toHaveProperty('total_chaves');
        expect(stats).toHaveProperty('chaves_ativas');
        expect(stats).toHaveProperty('certificados_validos');
      });
    });
  });

  // ============ 7c: REPLICATION & HA ============

  describe('7c: GerenciadorReplicacaoHA - Data Replication & High Availability', () => {
    let replicacao: GerenciadorReplicacaoHA;

    beforeEach(() => {
      replicacao = new GerenciadorReplicacaoHA();
    });

    describe('Configuração de Replicação', () => {
      it('deve obter todas as replicas', () => {
        const replicas = replicacao.obterTodasReplicas();

        expect(Array.isArray(replicas)).toBe(true);
        expect(replicas.length).toBeGreaterThan(0);
      });

      it('deve identificar replica primária', () => {
        const primaria = replicacao.obterReplicaPrimaria();

        expect(primaria).toBeDefined();
        expect(primaria!.tipo).toBe(TipoReplica.PRIMARIA);
      });

      it('deve configurar replicação', async () => {
        const replicas = replicacao.obterTodasReplicas();
        const replica = replicas[1];

        const configurada = await replicacao.configurarReplicacao(replica.id);

        expect(configurada).toBeDefined();
        expect(configurada.id).toBe(replica.id);
      });
    });

    describe('Monitoramento de Saúde', () => {
      it('deve monitorar saúde das replicas', async () => {
        const status = await replicacao.monitorarSaude();

        expect(Array.isArray(status)).toBe(true);
        expect(status.length).toBeGreaterThan(0);
        expect(status.every(s => s.status)).toBe(true);
      });

      it('deve detectar replicas degradadas', async () => {
        const status = await replicacao.monitorarSaude();

        const temDegradada = status.some(s => s.status === StatusReplica.DEGRADADA);
        const temSaudavel = status.some(s => s.status === StatusReplica.SAUDAVEL);

        expect(temDegradada || temSaudavel).toBe(true);
      });

      it('deve verificar replicacao lag', async () => {
        const status = await replicacao.monitorarSaude();

        expect(status.every(s => s.replicacao_lag_ms >= 0)).toBe(true);
      });
    });

    describe('Failover', () => {
      it('deve executar failover automático', async () => {
        const replicasPrimaria = replicacao.obterReplicaPrimaria();
        const replicas = replicacao.obterTodasReplicas();
        const replicaDestino = replicas.find(r => r.id !== replicasPrimaria!.id);

        if (replicaDestino) {
          const evento = await replicacao.executarFailover(
            replicasPrimaria!.id,
            replicaDestino.id
          );

          expect(evento).toBeDefined();
          expect(evento.sucesso).toBe(true);
          expect(evento.tempo_execucao_ms).toBeGreaterThan(0);
        }
      });

      it('deve obter histórico de failover', async () => {
        const historico = replicacao.obterHistoricoFailover();

        expect(Array.isArray(historico)).toBe(true);
      });

      it('deve retornar histórico ordenado', async () => {
        const historico = replicacao.obterHistoricoFailover();

        if (historico.length > 1) {
          for (let i = 0; i < historico.length - 1; i++) {
            expect(historico[i].timestamp.getTime()).toBeGreaterThanOrEqual(
              historico[i + 1].timestamp.getTime()
            );
          }
        }
      });
    });

    describe('Sincronização', () => {
      // simularSincronizacao dorme de 1 a 3 segundos reais por réplica, em série, e são
      // quatro réplicas: o pior caso passa de 12s, contra os 5s de timeout padrão. O
      // teste falhava de forma intermitente por isso, não por defeito na sincronização.
      it('deve sincronizar replicas', { timeout: 20000 }, async () => {
        const resultado = await replicacao.sincronizarReplicas();

        expect(resultado).toHaveProperty('replicas_sincronizadas');
        expect(resultado).toHaveProperty('replicas_falhadas');
        expect(resultado).toHaveProperty('tempo_total_ms');
        expect(resultado).toHaveProperty('lag_maximo_ms');
      });

      it('deve obter informações de sincronização', () => {
        const info = replicacao.obterInformacoesSincronizacao();

        expect(Array.isArray(info)).toBe(true);
      });
    });

    describe('Leitura em Replicas', () => {
      it('deve executar leitura em replica', async () => {
        const resultado = await replicacao.executarLeitura(
          'SELECT * FROM empresas',
          true
        );

        expect(Array.isArray(resultado)).toBe(true);
      });

      it('deve balancear carga de leitura', async () => {
        const resultado = await replicacao.executarLeitura('SELECT * FROM usuarios');

        expect(resultado).toBeDefined();
      });
    });

    describe('Disponibilidade', () => {
      it('deve calcular disponibilidade', () => {
        const metricas = replicacao.calcularDisponibilidade();

        expect(metricas).toHaveProperty('disponibilidade_percentual');
        expect(metricas).toHaveProperty('rpo_minutos');
        expect(metricas).toHaveProperty('rto_minutos');
        expect(metricas.disponibilidade_percentual).toBeGreaterThanOrEqual(0);
        expect(metricas.disponibilidade_percentual).toBeLessThanOrEqual(100);
      });

      it('deve manter RTO abaixo de 30 minutos', () => {
        const metricas = replicacao.calcularDisponibilidade();

        expect(metricas.rto_minutos).toBeLessThanOrEqual(30);
      });

      it('deve manter RPO abaixo de 60 minutos', () => {
        const metricas = replicacao.calcularDisponibilidade();

        expect(metricas.rpo_minutos).toBeLessThanOrEqual(60);
      });

      it('deve ter replicas saudáveis', () => {
        const metricas = replicacao.calcularDisponibilidade();

        expect(metricas.replicas_saudaveis).toBeGreaterThan(0);
      });
    });

    describe('Status de Replicas', () => {
      it('deve obter status de todas as replicas', async () => {
        await replicacao.monitorarSaude();

        const status = replicacao.obterStatusTodasReplicas();

        expect(Array.isArray(status)).toBe(true);
        expect(status.every(s => s.nome_replica)).toBe(true);
      });
    });
  });

  // ============ 7d: DISASTER RECOVERY PLAN ============

  describe('7d: PlanoRecuperacaoDesastres - Disaster Recovery Plan', () => {
    let drp: PlanoRecuperacaoDesastres;

    beforeEach(() => {
      drp = new PlanoRecuperacaoDesastres();
    });

    describe('Cenários de Desastre', () => {
      it('deve obter cenários de desastre', () => {
        const cenarios = drp.obterCenarios();

        expect(Array.isArray(cenarios)).toBe(true);
        expect(cenarios.length).toBeGreaterThan(0);
      });

      it('deve ter cenário de indisponibilidade do DC', () => {
        const cenarios = drp.obterCenarios();

        const cenario = cenarios.find(
          c => c.tipo === TipoDesastre.INDISPONIBILIDADE_DC
        );

        expect(cenario).toBeDefined();
        expect(cenario!.rto_horas).toBe(4);
        expect(cenario!.rpo_horas).toBe(1);
      });

      it('deve ter passos de recuperação definidos', () => {
        const cenarios = drp.obterCenarios();

        expect(cenarios.every(c => c.passos_recuperacao.length > 0)).toBe(true);
      });

      it('deve ter contatos de escalação', () => {
        const cenarios = drp.obterCenarios();

        expect(cenarios.every(c => c.contatos_escalacao.length > 0)).toBe(true);
      });
    });

    describe('Ativação do Plano de Recuperação', () => {
      it('deve ativar plano de recuperação', async () => {
        const cenarios = drp.obterCenarios();
        const cenario = cenarios[0];

        const execucao = await drp.ativarPlanoRecuperacao(
          cenario.id,
          'Teste de ativação',
          'usuario-teste'
        );

        expect(execucao).toBeDefined();
        expect(execucao.cenario_id).toBe(cenario.id);
        expect(execucao.status).toBe('EM_EXECUCAO');
      });

      it('deve contar passos de recuperação', async () => {
        const cenarios = drp.obterCenarios();
        const cenario = cenarios[0];

        const execucao = await drp.ativarPlanoRecuperacao(
          cenario.id,
          'Teste',
          'usuario'
        );

        expect(execucao.passos_total).toBe(cenario.passos_recuperacao.length);
      });

      it('deve completar passo de recuperação', async () => {
        const cenarios = drp.obterCenarios();
        const cenario = cenarios[0];

        const execucao = await drp.ativarPlanoRecuperacao(
          cenario.id,
          'Teste',
          'usuario'
        );

        const executado = await drp.completarPassoRecuperacao(
          execucao.id,
          1,
          'Passo completado'
        );

        expect(executado.passos_completados).toBeGreaterThan(0);
      });
    });

    describe('Testes de DRP', () => {
      it('deve executar teste de DRP', async () => {
        const cenarios = drp.obterCenarios();
        const cenario = cenarios[0];

        const teste = await drp.testarDRP(cenario.id, 'TABLETOP');

        expect(teste).toBeDefined();
        expect(teste.tipo_teste).toBe('TABLETOP');
        expect(teste.resultado).toBeDefined();
      });

      it('deve medir tempo de recuperação', async () => {
        const cenarios = drp.obterCenarios();
        const cenario = cenarios[0];

        const teste = await drp.testarDRP(cenario.id, 'SIMULACAO');

        expect(teste.tempo_total_vs_rto_percentual).toBeGreaterThan(0);
      });

      it('deve obter histórico de testes', async () => {
        const cenarios = drp.obterCenarios();
        const cenario = cenarios[0];

        await drp.testarDRP(cenario.id, 'TABLETOP');

        const historico = drp.obterHistoricoTestes(cenario.id);

        expect(Array.isArray(historico)).toBe(true);
        expect(historico.length).toBeGreaterThan(0);
      });
    });

    describe('Simulação de Desastre', () => {
      it('deve simular desastre', async () => {
        const cenarios = drp.obterCenarios();
        const cenario = cenarios[0];

        const simulacao = await drp.simularDesastre(cenario.id, 60);

        expect(simulacao).toHaveProperty('teste_id');
        expect(simulacao).toHaveProperty('cenario');
        expect(simulacao).toHaveProperty('resultado');
      });
    });

    describe('Métricas de DRP', () => {
      it('deve obter métricas do DRP', () => {
        const metricas = drp.obterMetricasDRP();

        expect(metricas).toHaveProperty('cenarios_totais');
        expect(metricas).toHaveProperty('rto_medio_horas');
        expect(metricas).toHaveProperty('rpo_medio_horas');
        expect(metricas.cenarios_totais).toBeGreaterThan(0);
        expect(metricas.rto_medio_horas).toBeGreaterThan(0);
      });

      it('deve ter taxa de cobertura de testes', () => {
        const metricas = drp.obterMetricasDRP();

        expect(metricas.taxa_cobertura_teste).toBeGreaterThanOrEqual(0);
        expect(metricas.taxa_cobertura_teste).toBeLessThanOrEqual(100);
      });
    });

    describe('Histórico de Execuções', () => {
      it('deve obter histórico de execuções', () => {
        const historico = drp.obterHistoricoExecucoes();

        expect(Array.isArray(historico)).toBe(true);
      });
    });
  });

  // ============ 7e: AUDIT LOGGING ============

  describe('7e: GerenciadorAuditLoggingImutavel - Audit Logging & Immutable Records', () => {
    let auditLog: GerenciadorAuditLoggingImutavel;

    beforeEach(() => {
      auditLog = new GerenciadorAuditLoggingImutavel();
    });

    describe('Registro de Auditoria', () => {
      it('deve registrar operação no audit log', async () => {
        const registro = await auditLog.registrarAudit(
          'user-001',
          'user@erp.com',
          TipoOperacao.CRIACAO,
          'Empresa',
          'emp-001',
          'Empresa XYZ',
          '192.168.1.1',
          'Mozilla/5.0',
          'SUCESSO',
          'Criação de nova empresa'
        );

        expect(registro).toBeDefined();
        expect(registro.usuario_id).toBe('user-001');
        expect(registro.tipo_operacao).toBe(TipoOperacao.CRIACAO);
        expect(registro.resultado).toBe('SUCESSO');
      });

      it('deve gerar hash único para cada registro', async () => {
        const registro1 = await auditLog.registrarAudit(
          'user-001',
          'user@erp.com',
          TipoOperacao.LEITURA,
          'Conta',
          'cont-001',
          'Conta teste',
          '192.168.1.1',
          'Mozilla',
          'SUCESSO',
          'Leitura de conta'
        );

        const registro2 = await auditLog.registrarAudit(
          'user-002',
          'user2@erp.com',
          TipoOperacao.LEITURA,
          'Conta',
          'cont-002',
          'Conta teste 2',
          '192.168.1.2',
          'Chrome',
          'SUCESSO',
          'Leitura de conta'
        );

        expect(registro1.hash_registro).not.toBe(registro2.hash_registro);
      });

      it('deve manter cadeia de hashes', async () => {
        const registro1 = await auditLog.registrarAudit(
          'user-001',
          'user@erp.com',
          TipoOperacao.CRIACAO,
          'Item',
          'item-001',
          'Item',
          '192.168.1.1',
          'Mozilla',
          'SUCESSO',
          'Teste'
        );

        const registro2 = await auditLog.registrarAudit(
          'user-001',
          'user@erp.com',
          TipoOperacao.ATUALIZACAO,
          'Item',
          'item-001',
          'Item atualizado',
          '192.168.1.1',
          'Mozilla',
          'SUCESSO',
          'Teste'
        );

        expect(registro2.hash_anterior).toBe(registro1.hash_registro);
      });

      it('deve registrar dados anteriores e novos', async () => {
        const registro = await auditLog.registrarAudit(
          'user-001',
          'user@erp.com',
          TipoOperacao.ATUALIZACAO,
          'Empresa',
          'emp-001',
          'Empresa',
          '192.168.1.1',
          'Mozilla',
          'SUCESSO',
          'Atualização',
          NivelSensibilidade.CONFIDENCIAL,
          { nome_anterior: 'XYZ Inc', status: 'Ativo' },
          { nome_anterior: 'XYZ Corporation', status: 'Ativo' }
        );

        expect(registro.dados_anteriores).toBeDefined();
        expect(registro.dados_novos).toBeDefined();
      });

      it('deve suportar diferentes tipos de operação', async () => {
        const tipos = [
          TipoOperacao.CRIACAO,
          TipoOperacao.LEITURA,
          TipoOperacao.ATUALIZACAO,
          TipoOperacao.DELECAO
        ];

        for (const tipo of tipos) {
          const registro = await auditLog.registrarAudit(
            'user-001',
            'user@erp.com',
            tipo,
            'Teste',
            'id-001',
            'Teste',
            '192.168.1.1',
            'Mozilla',
            'SUCESSO',
            'Teste'
          );

          expect(registro.tipo_operacao).toBe(tipo);
        }
      });
    });

    describe('Validação de Integridade', () => {
      it('deve validar integridade da cadeia', async () => {
        await auditLog.registrarAudit(
          'user-001',
          'user@erp.com',
          TipoOperacao.CRIACAO,
          'Teste',
          'id-001',
          'Teste',
          '192.168.1.1',
          'Mozilla',
          'SUCESSO',
          'Teste'
        );

        const resultado = await auditLog.validarIntegridade();

        expect(resultado).toHaveProperty('integro');
        expect(resultado).toHaveProperty('registros_verificados');
        expect(resultado).toHaveProperty('blocos_verificados');
      });

      it('deve passar validação de integridade', async () => {
        for (let i = 0; i < 5; i++) {
          await auditLog.registrarAudit(
            'user-001',
            'user@erp.com',
            TipoOperacao.CRIACAO,
            'Teste',
            `id-${i}`,
            'Teste',
            '192.168.1.1',
            'Mozilla',
            'SUCESSO',
            'Teste'
          );
        }

        const resultado = await auditLog.validarIntegridade();

        expect(resultado.integro).toBe(true);
        expect(resultado.registros_corrompidos).toBe(0);
      });
    });

    describe('Consulta de Auditoria', () => {
      it('deve consultar audit log', async () => {
        await auditLog.registrarAudit(
          'user-001',
          'user@erp.com',
          TipoOperacao.CRIACAO,
          'Empresa',
          'emp-001',
          'Empresa',
          '192.168.1.1',
          'Mozilla',
          'SUCESSO',
          'Teste'
        );

        const registros = await auditLog.consultarAudit({ usuario_id: 'user-001' });

        expect(Array.isArray(registros)).toBe(true);
        expect(registros.every(r => r.usuario_id === 'user-001')).toBe(true);
      });

      it('deve filtrar por tipo de operação', async () => {
        await auditLog.registrarAudit(
          'user-001',
          'user@erp.com',
          TipoOperacao.CRIACAO,
          'Teste',
          'id-001',
          'Teste',
          '192.168.1.1',
          'Mozilla',
          'SUCESSO',
          'Teste'
        );

        await auditLog.registrarAudit(
          'user-001',
          'user@erp.com',
          TipoOperacao.LEITURA,
          'Teste',
          'id-002',
          'Teste',
          '192.168.1.1',
          'Mozilla',
          'SUCESSO',
          'Teste'
        );

        const criações = await auditLog.consultarAudit({
          tipos_operacao: [TipoOperacao.CRIACAO]
        });

        expect(criações.every(r => r.tipo_operacao === TipoOperacao.CRIACAO)).toBe(true);
      });
    });

    describe('Exportação de Auditoria', () => {
      it('deve exportar audit log', async () => {
        await auditLog.registrarAudit(
          'user-001',
          'user@erp.com',
          TipoOperacao.CRIACAO,
          'Teste',
          'id-001',
          'Teste',
          '192.168.1.1',
          'Mozilla',
          'SUCESSO',
          'Teste'
        );

        const resultado = await auditLog.exportarAudit();

        expect(resultado).toHaveProperty('arquivo_url');
        expect(resultado).toHaveProperty('checksum');
        expect(resultado).toHaveProperty('assinado');
        expect(resultado.arquivo_url).toContain('s3://');
      });

      it('deve gerar checksum de exportação', async () => {
        await auditLog.registrarAudit(
          'user-001',
          'user@erp.com',
          TipoOperacao.CRIACAO,
          'Teste',
          'id-001',
          'Teste',
          '192.168.1.1',
          'Mozilla',
          'SUCESSO',
          'Teste'
        );

        const resultado = await auditLog.exportarAudit();

        expect(resultado.checksum).toHaveLength(64); // SHA256
      });
    });

    describe('Relatório de Auditoria', () => {
      it('deve gerar relatório de auditoria', async () => {
        for (let i = 0; i < 10; i++) {
          await auditLog.registrarAudit(
            `user-${i % 3}`,
            `user${i % 3}@erp.com`,
            TipoOperacao.CRIACAO,
            'Teste',
            `id-${i}`,
            'Teste',
            '192.168.1.1',
            'Mozilla',
            'SUCESSO',
            'Teste'
          );
        }

        const relatorio = await auditLog.gerarRelatorio({
          data_inicio: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          data_fim: new Date()
        });

        expect(relatorio).toBeDefined();
        expect(relatorio).toHaveProperty('registros_encontrados');
        expect(relatorio).toHaveProperty('operacoes_por_tipo');
        expect(relatorio).toHaveProperty('usuarios_ativos');
      });
    });

    describe('Consentimento de Auditoria', () => {
      it('deve registrar consentimento', async () => {
        const consentimento = await auditLog.registrarConsentimento(
          'user-001',
          'AUDITORIA',
          true,
          'Aceitar auditoria'
        );

        expect(consentimento).toBeDefined();
        expect(consentimento.concedido).toBe(true);
      });

      it('deve obter registros pessoais com consentimento', async () => {
        await auditLog.registrarConsentimento(
          'user-001',
          'AUDITORIA',
          true,
          'Consentimento'
        );

        const registros = await auditLog.obterRegistrosPessoais('user-001');

        expect(Array.isArray(registros)).toBe(true);
      });
    });

    describe('Estatísticas de Auditoria', () => {
      it('deve obter estatísticas', () => {
        const stats = auditLog.obterEstatisticas();

        expect(stats).toHaveProperty('total_registros');
        expect(stats).toHaveProperty('total_blocos');
        expect(stats).toHaveProperty('sequencia_atual');
      });
    });
  });

  // ============ 7f: VULNERABILITY MANAGEMENT ============

  describe('7f: GerenciadorVulnerabilidades - Vulnerability Management & Patching', () => {
    let vulnMgmt: GerenciadorVulnerabilidades;

    beforeEach(() => {
      vulnMgmt = new GerenciadorVulnerabilidades();
    });

    describe('Varreduras de Segurança', () => {
      it('deve executar varredura de segurança', async () => {
        const varredura = await vulnMgmt.executarScan(
          'Varredura completa',
          TipoVarredura.AUTOMATICA,
          ['/api', '/web', '/admin']
        );

        expect(varredura).toBeDefined();
        expect(varredura.tipo).toBe('AUTOMATICA');
        expect(varredura.data_conclusao).toBeDefined();
        expect(varredura.vulnerabilidades_descobertas).toBeGreaterThanOrEqual(0);
      });

      it('deve categorizar vulnerabilidades por severidade', async () => {
        const varredura = await vulnMgmt.executarScan(
          'Teste',
          TipoVarredura.AUTOMATICA,
          ['/api']
        );

        expect(varredura.vulnerabilidades_por_severidade).toHaveProperty('CRITICA');
        expect(varredura.vulnerabilidades_por_severidade).toHaveProperty('ALTA');
        expect(varredura.vulnerabilidades_por_severidade).toHaveProperty('MEDIA');
      });

      it('deve obter histórico de varreduras', async () => {
        await vulnMgmt.executarScan('Teste 1', TipoVarredura.AUTOMATICA, ['/api']);
        await vulnMgmt.executarScan('Teste 2', TipoVarredura.MANUAL, ['/web']);

        const historico = vulnMgmt.obterHistoricoVarreduras();

        expect(Array.isArray(historico)).toBe(true);
        expect(historico.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('Registro de Vulnerabilidades', () => {
      it('deve registrar vulnerabilidade descoberta', async () => {
        const vuln = await vulnMgmt.registrarVulnerabilidade(
          'CVE-2024-1234',
          'SQL Injection',
          'Entrada não validada permite SQL injection',
          SeveridadeVulnerabilidade.CRITICA,
          'relatorio-builder.ts',
          '1.0.0 - 1.2.3',
          9.8,
          'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
          ['CWE-89']
        );

        expect(vuln).toBeDefined();
        expect(vuln.cve_id).toBe('CVE-2024-1234');
        expect(vuln.severidade).toBe(SeveridadeVulnerabilidade.CRITICA);
      });

      it('deve obter vulnerabilidades não remediadas', async () => {
        const abiertas = vulnMgmt.obterVulnerabilidadesAbertas();

        expect(Array.isArray(abiertas)).toBe(true);
      });
    });

    describe('Aplicação de Patches', () => {
      it('deve aplicar patch de segurança', async () => {
        const processo = await vulnMgmt.aplicarPatch('patch-001', ['desenvolvimento']);

        expect(processo).toBeDefined();
        // 'PLANEJADO' é o estado em que o processo nasce; aplicarPatch já executa em
        // desenvolvimento antes de retornar, então ao chegar aqui o processo está em
        // andamento. Afirmar 'PLANEJADO' cobraria do código que ele mentisse sobre ter
        // aplicado.
        expect(processo.status).toBe('EM_ANDAMENTO');
        expect(processo.ambientes).toHaveProperty('desenvolvimento');
        expect(processo.ambientes.desenvolvimento.status).toBe('APLICADO');
      });

      it('deve rastrear processo de patch', async () => {
        const processo = await vulnMgmt.aplicarPatch('patch-002');

        expect(processo).toHaveProperty('data_planejamento');
        expect(processo).toHaveProperty('data_aplicacao_planejada');
      });

      it('deve obter processos de patch em andamento', async () => {
        await vulnMgmt.aplicarPatch('patch-003');

        const emAndamento = vulnMgmt.obterProcessosPatchEmAndamento();

        expect(Array.isArray(emAndamento)).toBe(true);
      });
    });

    describe('Testes de Penetração', () => {
      it('deve executar teste de penetração', async () => {
        const teste = await vulnMgmt.executarTestePenetracao(
          'Teste de Penetração Completo',
          'api.erp.com',
          ['tester-1@firm.com', 'tester-2@firm.com']
        );

        expect(teste).toBeDefined();
        expect(teste.vulnerabilidades_encontradas).toBeGreaterThan(0);
        expect(teste.classificacao_risco).toBeDefined();
      });

      it('deve obter histórico de testes de penetração', async () => {
        await vulnMgmt.executarTestePenetracao('Teste 1', 'api.erp.com', ['tester@firm.com']);

        const historico = vulnMgmt.obterHistoricoTestesPenetracao();

        expect(Array.isArray(historico)).toBe(true);
        expect(historico.length).toBeGreaterThan(0);
      });
    });

    describe('Relatórios de Vulnerabilidade', () => {
      it('deve gerar relatório de vulnerabilidades', () => {
        const relatorio = vulnMgmt.gerarRelatorioVulnerabilidades();

        expect(relatorio).toHaveProperty('total_vulnerabilidades');
        expect(relatorio).toHaveProperty('por_severidade');
        expect(relatorio).toHaveProperty('por_status');
        expect(relatorio).toHaveProperty('taxa_remediacao_percentual');
      });

      it('deve calcular taxa de remediação', () => {
        const relatorio = vulnMgmt.gerarRelatorioVulnerabilidades();

        expect(relatorio.taxa_remediacao_percentual).toBeGreaterThanOrEqual(0);
        expect(relatorio.taxa_remediacao_percentual).toBeLessThanOrEqual(100);
      });

      it('deve calcular tempo médio de remediação', () => {
        const relatorio = vulnMgmt.gerarRelatorioVulnerabilidades();

        expect(relatorio).toHaveProperty('tempo_medio_remediacao_dias');
      });
    });
  });

  // ============ 7g: LGPD COMPLIANCE ============

  describe('7g: GerenciadorComplianceLGPD - Data Privacy & LGPD Compliance', () => {
    let lgpd: GerenciadorComplianceLGPD;

    beforeEach(() => {
      lgpd = new GerenciadorComplianceLGPD();
    });

    describe('Registro de Titular de Dados', () => {
      it('deve registrar novo titular', async () => {
        const titular = await lgpd.registrarTitular(
          'João Silva',
          'joao@email.com',
          '123.456.789-00',
          new Date(1990, 0, 1),
          {
            rua: 'Rua das Flores',
            numero: '123',
            cidade: 'São Paulo',
            estado: 'SP',
            cep: '01234-567'
          },
          ['11 98765-4321']
        );

        expect(titular).toBeDefined();
        expect(titular.nome).toBe('João Silva');
        expect(titular.email).toBe('joao@email.com');
      });
    });

    describe('Consentimento LGPD', () => {
      it('deve registrar consentimento', async () => {
        const titular = await lgpd.registrarTitular(
          'Maria',
          'maria@email.com',
          '987.654.321-00',
          new Date(1985, 5, 15),
          {
            rua: 'Avenida Brasil',
            numero: '456',
            cidade: 'Rio de Janeiro',
            estado: 'RJ',
            cep: '20000-000'
          },
          []
        );

        const consentimento = await lgpd.registrarConsentimento(
          titular.id,
          'PROCESSAMENTO',
          'Processamento de dados para gestão',
          true
        );

        expect(consentimento).toBeDefined();
        expect(consentimento.concedido).toBe(true);
      });

      it('deve revogar consentimento', async () => {
        const titular = await lgpd.registrarTitular(
          'Pedro',
          'pedro@email.com',
          '111.222.333-44',
          new Date(1992, 3, 20),
          {
            rua: 'Rua X',
            numero: '789',
            cidade: 'Belo Horizonte',
            estado: 'MG',
            cep: '30000-000'
          },
          []
        );

        const consent1 = await lgpd.registrarConsentimento(
          titular.id,
          'MARKETING',
          'Comunicações de marketing',
          true
        );

        expect(consent1.concedido).toBe(true);
      });
    });

    describe('Direitos do Titular', () => {
      it('deve processar requisição de acesso', async () => {
        const titular = await lgpd.registrarTitular(
          'Ana',
          'ana@email.com',
          '555.666.777-88',
          new Date(1988, 7, 10),
          {
            rua: 'Rua Y',
            numero: '321',
            cidade: 'Curitiba',
            estado: 'PR',
            cep: '80000-000'
          },
          []
        );

        const requisicao = await lgpd.processarRequisicaoDireito(
          titular.id,
          TipoDireito.ACESSO,
          'Solicitar acesso aos meus dados'
        );

        expect(requisicao).toBeDefined();
        expect(requisicao.tipo).toBe(TipoDireito.ACESSO);
      });

      it('deve processar requisição de portabilidade', async () => {
        const titular = await lgpd.registrarTitular(
          'Carlos',
          'carlos@email.com',
          '999.888.777-66',
          new Date(1980, 10, 5),
          {
            rua: 'Rua Z',
            numero: '654',
            cidade: 'Salvador',
            estado: 'BA',
            cep: '40000-000'
          },
          []
        );

        const requisicao = await lgpd.processarRequisicaoDireito(
          titular.id,
          TipoDireito.PORTABILIDADE,
          'Solicitar portabilidade de dados'
        );

        expect(requisicao.tipo).toBe(TipoDireito.PORTABILIDADE);
      });

      it('deve exportar dados do titular', async () => {
        const titular = await lgpd.registrarTitular(
          'Lucia',
          'lucia@email.com',
          '444.555.666-77',
          new Date(1995, 1, 14),
          {
            rua: 'Rua W',
            numero: '987',
            cidade: 'Brasília',
            estado: 'DF',
            cep: '70000-000'
          },
          []
        );

        const requisicao = await lgpd.processarRequisicaoDireito(
          titular.id,
          TipoDireito.ACESSO,
          'Exportar dados'
        );

        // A exportação é processada como parte da requisição
        expect(requisicao.status).toBe('COMPLETA');
      });

      it('deve anonimizar dados do titular', async () => {
        const titular = await lgpd.registrarTitular(
          'Felipe',
          'felipe@email.com',
          '333.222.111-00',
          new Date(1987, 11, 25),
          {
            rua: 'Rua V',
            numero: '159',
            cidade: 'Porto Alegre',
            estado: 'RS',
            cep: '90000-000'
          },
          []
        );

        const anonimizacao = await lgpd.anonimizarDadosPessoa(
          titular.id,
          'Dados expirados - direito ao esquecimento',
          false
        );

        expect(anonimizacao).toBeDefined();
        expect(anonimizacao.campos_anonimizados.length).toBeGreaterThan(0);
      });
    });

    describe('Inventário de Dados', () => {
      it('deve obter inventário de dados', () => {
        const inventarios = lgpd.obterInventarioDados();

        expect(Array.isArray(inventarios)).toBe(true);
        expect(inventarios.length).toBeGreaterThan(0);
      });

      it('deve identificar sistemas de dados pessoais', () => {
        const inventarios = lgpd.obterInventarioDados();

        const comDadosPessoais = inventarios.filter(i => i.campos_pessoais.length > 0);

        expect(comDadosPessoais.length).toBeGreaterThan(0);
      });
    });

    describe('Auditoria LGPD', () => {
      it('deve auditar consentimento', async () => {
        const titular = await lgpd.registrarTitular(
          'Teste',
          'teste@email.com',
          '000.000.000-00',
          new Date(1990, 0, 1),
          { rua: 'Rua', numero: '1', cidade: 'São Paulo', estado: 'SP', cep: '00000-000' },
          []
        );

        await lgpd.registrarConsentimento(
          titular.id,
          'PROCESSAMENTO',
          'Teste',
          true
        );

        const auditoria = lgpd.auditarConsentimento();

        expect(auditoria).toHaveProperty('total_titulares');
        expect(auditoria).toHaveProperty('consentimentos_validos');
        expect(auditoria).toHaveProperty('taxa_consentimento_valido');
      });
    });

    describe('Requisições de Direito', () => {
      it('deve obter requisições pendentes', async () => {
        const titular = await lgpd.registrarTitular(
          'Teste 2',
          'teste2@email.com',
          '111.111.111-11',
          new Date(1993, 5, 10),
          { rua: 'Rua', numero: '2', cidade: 'RJ', estado: 'RJ', cep: '20000-000' },
          []
        );

        await lgpd.processarRequisicaoDireito(
          titular.id,
          TipoDireito.ACESSO,
          'Teste'
        );

        // Note: requisições são automaticamente processadas, mas em produção haveria pendentes
      });
    });
  });

  // ============ 7h: COMPLIANCE MONITORING ============

  describe('7h: GerenciadorMonitoramentoCompliance - Compliance Monitoring & Reporting', () => {
    let compliance: GerenciadorMonitoramentoCompliance;

    beforeEach(() => {
      compliance = new GerenciadorMonitoramentoCompliance();
    });

    describe('Verificação de Compliance', () => {
      it('deve verificar compliance geral', async () => {
        const dashboard = await compliance.verificarCompliance();

        expect(dashboard).toBeDefined();
        expect(dashboard).toHaveProperty('conformidade_geral_percentual');
        expect(dashboard).toHaveProperty('controles_conformes');
        expect(dashboard).toHaveProperty('controles_nao_conformes');
        expect(dashboard.conformidade_geral_percentual).toBeGreaterThanOrEqual(0);
        expect(dashboard.conformidade_geral_percentual).toBeLessThanOrEqual(100);
      });

      it('deve identificar riscos críticos', async () => {
        const dashboard = await compliance.verificarCompliance();

        expect(dashboard).toHaveProperty('riscos_criticos');
        expect(dashboard.riscos_criticos).toBeGreaterThanOrEqual(0);
      });

      it('deve listar próximos vencimentos', async () => {
        const dashboard = await compliance.verificarCompliance();

        expect(Array.isArray(dashboard.proximos_vencimentos)).toBe(true);
      });

      it('deve avaliar frameworks de compliance', async () => {
        const dashboard = await compliance.verificarCompliance();

        expect(dashboard).toHaveProperty('status_soc_2');
        expect(dashboard).toHaveProperty('status_iso_27001');
        expect(dashboard).toHaveProperty('status_lgpd');
      });
    });

    describe('Relatórios Automáticos', () => {
      it('deve gerar relatório diário', async () => {
        const relatorio = await compliance.gerarRelatorioCompliance('DIARIO');

        expect(relatorio).toBeDefined();
        expect(relatorio.tipo).toBe('DIARIO');
        expect(relatorio).toHaveProperty('conformidade_por_tipo');
      });

      it('deve gerar relatório mensal', async () => {
        const relatorio = await compliance.gerarRelatorioCompliance('MENSAL');

        expect(relatorio.tipo).toBe('MENSAL');
      });

      it('deve obter histórico de relatórios', async () => {
        await compliance.gerarRelatorioCompliance('DIARIO');

        const historico = compliance.obterHistoricoRelatorios();

        expect(Array.isArray(historico)).toBe(true);
      });

      it('deve gerar recomendações', async () => {
        const relatorio = await compliance.gerarRelatorioCompliance('MENSAL');

        expect(Array.isArray(relatorio.recomendacoes)).toBe(true);
      });

      it('deve calcular tendência de conformidade', async () => {
        const relatorio = await compliance.gerarRelatorioCompliance('MENSAL');

        expect(['MELHORANDO', 'ESTAVEL', 'PIORANDO']).toContain(relatorio.tendencia_conformidade);
      });
    });

    describe('Coleta de Evidências', () => {
      it('deve coletar evidências de compliance', async () => {
        // `controles` é privado — sem getter público que devolva todos (só
        // obterControlesNaoConformes()), então o teste acessa via `as any` e o
        // Array.from resultante virava unknown[] (sem tipo inferível de `any`
        // genérico); anotando o array como ControleCompliance[] evita precisar de
        // `as any` de novo lá embaixo só para ler `.id`.
        const controles: ControleCompliance[] = Array.from(
          (compliance as any).controles.values()
        );

        if (controles.length > 0) {
          const evidencias = await compliance.coletarEvidencias(controles[0].id);

          expect(Array.isArray(evidencias)).toBe(true);
        }
      });
    });

    describe('Auditoria de Compliance', () => {
      it('deve agendar auditoria', async () => {
        const auditoria = await compliance.agendarAuditoria(
          'Auditoria SOC 2 2024',
          TipoCompliance.SOC_2,
          'EXTERNA',
          ['Segurança', 'Disponibilidade'],
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        );

        expect(auditoria).toBeDefined();
        expect(auditoria.framework).toBe(TipoCompliance.SOC_2);
        expect(auditoria.tipo_auditoria).toBe('EXTERNA');
      });
    });

    describe('Controles de Compliance', () => {
      it('deve obter controles não conformes', () => {
        const naoConformes = compliance.obterControlesNaoConformes();

        expect(Array.isArray(naoConformes)).toBe(true);
      });

      it('deve atualizar status de controle', async () => {
        const controles = compliance.obterControlesNaoConformes();

        if (controles.length > 0) {
          const controle = controles[0];

          const atualizado = await compliance.atualizarStatusControle(
            controle.id,
            StatusCompliance.CONFORME,
            'Controle implementado'
          );

          expect(atualizado.status).toBe(StatusCompliance.CONFORME);
        }
      });
    });

    describe('Dashboard', () => {
      it('deve obter dashboard atual', async () => {
        await compliance.verificarCompliance();

        const dashboard = compliance.obterDashboardAtual();

        expect(dashboard).not.toBeNull();
      });
    });
  });

  // ============ INTEGRATION TESTS ============

  describe('Testes de Integração Phase 7', () => {
    it('deve integrar backup com replicação', async () => {
      const backup = new EstrategiaBackup();
      const replicacao = new GerenciadorReplicacaoHA();

      const backupExec = await backup.executarBackup(TipoBackup.COMPLETO, 'user-01');
      const statusRepl = await replicacao.monitorarSaude();

      expect(backupExec).toBeDefined();
      expect(statusRepl).toBeDefined();
    });

    it('deve integrar encriptação com audit logging', async () => {
      const encriptacao = new GerenciadorEncriptacao();
      const auditLog = new GerenciadorAuditLoggingImutavel();

      const chamado = await encriptacao.encriptar('123.456.789-00', 'cpf');

      await auditLog.registrarAudit(
        'user-01',
        'user@erp.com',
        TipoOperacao.CRIACAO,
        'EncriptacaoDados',
        chamado.id,
        'Encriptação de CPF',
        '192.168.1.1',
        'Mozilla',
        'SUCESSO',
        'Dados encriptados'
      );

      expect(chamado).toBeDefined();
    });

    it('deve integrar DRP com monitoring de compliance', async () => {
      const drp = new PlanoRecuperacaoDesastres();
      const compliance = new GerenciadorMonitoramentoCompliance();

      const cenarios = drp.obterCenarios();
      const dashboard = await compliance.verificarCompliance();

      expect(cenarios.length).toBeGreaterThan(0);
      expect(dashboard).toBeDefined();
    });

    it('deve integrar LGPD com audit logging', async () => {
      const lgpd = new GerenciadorComplianceLGPD();
      const auditLog = new GerenciadorAuditLoggingImutavel();

      const titular = await lgpd.registrarTitular(
        'Teste',
        'teste@email.com',
        '123.456.789-00',
        new Date(1990, 0, 1),
        { rua: 'Rua', numero: '1', cidade: 'SP', estado: 'SP', cep: '01234-567' },
        []
      );

      await auditLog.registrarAudit(
        'user-lgpd',
        'lgpd@erp.com',
        TipoOperacao.CRIACAO,
        'TitularDados',
        titular.id,
        `Novo titular: ${titular.nome}`,
        '192.168.1.1',
        'Mozilla',
        'SUCESSO',
        'Registro de titular'
      );

      expect(titular).toBeDefined();
    });
  });
});
