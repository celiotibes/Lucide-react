import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  History,
  DatabaseBackup,
  RefreshCw,
  Link2,
  FlaskConical,
  CircleCheck,
  CircleX,
} from "lucide-react";
import { useToast } from "./useToast";
import { KpiTile } from "../components/KpiTile";
import {
  gerenciadorAuditoria,
  estrategiaBackup,
  planoRecuperacaoDesastres,
  OPERADOR_LOCAL_ID,
  OPERADOR_LOCAL_EMAIL,
} from "./auditoria/singletons";
import {
  TipoOperacao,
  type RegistroAudit,
  type ResultadoVerificacao,
} from "../domain/erp/audit-logging-imutavel";
import { TipoBackup, type BackupExecution } from "../domain/erp/strategy-backup";
import type { CenarioDesastre, TestedrpRegistro } from "../domain/erp/plano-recuperacao-desastres";

const ROTULO_OPERACAO: Record<TipoOperacao, string> = {
  [TipoOperacao.LEITURA]: "Leitura",
  [TipoOperacao.CRIACAO]: "Criação",
  [TipoOperacao.ATUALIZACAO]: "Atualização",
  [TipoOperacao.DELECAO]: "Deleção",
  [TipoOperacao.EXPORTACAO]: "Exportação",
  [TipoOperacao.IMPORTACAO]: "Importação",
  [TipoOperacao.AUTENTICACAO]: "Autenticação",
  [TipoOperacao.AUTORIZACAO]: "Autorização",
  [TipoOperacao.CONFIGURACAO]: "Configuração",
};

const ROTULO_SEVERIDADE: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  CRITICA: "Crítica",
};

const CLASSE_SEVERIDADE: Record<string, string> = {
  BAIXA: "good",
  MEDIA: "warning",
  ALTA: "warning",
  CRITICA: "critical",
};

function formatarQuando(data: Date): string {
  return data.toLocaleString("pt-BR");
}

function formatarBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** Mostra só os 16 primeiros caracteres de um hash na tabela (o valor inteiro cabe no
 * atributo title, para copiar/conferir sem precisar alargar a coluna). */
function hashCurto(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 16)}…` : hash;
}

/** Painel de Auditoria e Continuidade — a tela que dá acesso real aos módulos de
 * segurança/auditoria que hoje existem no domínio (`src/domain/erp/`) mas não são
 * chamados por nenhuma outra tela do app:
 *
 * - `audit-logging-imutavel.ts` — log de auditoria encadeado por hash (trilha +
 *   verificação de integridade da cadeia).
 * - `strategy-backup.ts` — execução de backup com checksum SHA-256 real e políticas de
 *   retenção.
 * - `plano-recuperacao-desastres.ts` — cenários de disaster recovery (RTO/RPO), testes e
 *   métricas de cobertura.
 *
 * Aviso importante e deliberado: os três módulos acima guardam o próprio histórico em
 * memória (não no banco sql.js do app), então esse histórico não sobrevive a um reload da
 * página — ver `src/ui/auditoria/singletons.ts`. E o backup executado aqui é o da
 * "estratégia de backup" (motor de política/retenção/checksum), não o export real do
 * banco sql.js — esse já existe e fica no cabeçalho do app (botão "Fazer backup"),
 * gravando o hash de verdade do arquivo que foi baixado. As duas coisas são
 * complementares: uma prova o arquivo que saiu do navegador, a outra demonstra o motor de
 * agendamento/retenção/checksum descrito em `strategy-backup.ts`.
 *
 * `compliance-audit-log.ts` (a variante que grava a auditoria na tabela `auditoria_log`
 * do sql.js) não é usada aqui: essa tabela não existe em
 * `contabilidade-reconstituicao/schema.sql` — ver o relatório da tarefa.
 */
export function PainelAuditoria() {
  const { avisar } = useToast();

  const [tick, setTick] = useState(0);
  const forcarAtualizacao = useCallback(() => setTick((t) => t + 1), []);

  const [ultimaVerificacao, setUltimaVerificacao] = useState<ResultadoVerificacao | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [executandoBackup, setExecutandoBackup] = useState(false);
  const [testandoDrpId, setTestandoDrpId] = useState<string | null>(null);

  // StrictMode roda todo efeito duas vezes em desenvolvimento — sem essa trava, a
  // primeira visita ao painel registraria duas leituras idênticas na trilha.
  const jaRegistrouVisita = useRef(false);
  useEffect(() => {
    if (jaRegistrouVisita.current) return;
    jaRegistrouVisita.current = true;
    gerenciadorAuditoria
      .registrarAudit(
        OPERADOR_LOCAL_ID,
        OPERADOR_LOCAL_EMAIL,
        TipoOperacao.LEITURA,
        "PainelAuditoria",
        "painel-auditoria",
        "Abertura do Painel de Auditoria",
        "127.0.0.1",
        navigator.userAgent,
        "SUCESSO",
        "Visualização da trilha de auditoria pelo operador",
      )
      .then(() => forcarAtualizacao());
  }, [forcarAtualizacao]);

  // Sem estado de banco aqui — os três módulos guardam o próprio histórico em objetos
  // mutáveis fora do React (arrays/Maps dentro da instância da classe, ver
  // singletons.ts), então não há como o React observar mudança neles sozinho. `tick` é o
  // gatilho manual que os callers (registrar, verificar, executar backup, testar DRP)
  // incrementam depois de cada ação, para reler o snapshot atual do módulo.
  //
  // `consultarAudit` é assíncrona (a classe trata toda operação como potencialmente
  // I/O, mesmo hoje sendo só memória) — por isso é estado + efeito, e não useMemo como
  // as leituras síncronas abaixo.
  const [registros, setRegistros] = useState<RegistroAudit[]>([]);
  useEffect(() => {
    let cancelado = false;
    gerenciadorAuditoria.consultarAudit({ limite: 200 }).then((r) => {
      if (!cancelado) setRegistros(r);
    });
    return () => {
      cancelado = true;
    };
  }, [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const estatisticasAuditoria = useMemo(() => gerenciadorAuditoria.obterEstatisticas(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const historicoBackups: BackupExecution[] = useMemo(() => estrategiaBackup.obterHistorico(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const estatisticasBackup = useMemo(() => estrategiaBackup.obterEstatisticas(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cenariosDrp: CenarioDesastre[] = useMemo(() => planoRecuperacaoDesastres.obterCenarios(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const testesDrp: TestedrpRegistro[] = useMemo(() => planoRecuperacaoDesastres.obterHistoricoTestes(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const metricasDrp = useMemo(() => planoRecuperacaoDesastres.obterMetricasDRP(), [tick]);

  const verificarCadeia = useCallback(async () => {
    setVerificando(true);
    try {
      const resultado = await gerenciadorAuditoria.validarIntegridade();
      setUltimaVerificacao(resultado);

      await gerenciadorAuditoria.registrarAudit(
        OPERADOR_LOCAL_ID,
        OPERADOR_LOCAL_EMAIL,
        TipoOperacao.CONFIGURACAO,
        "CadeiaAuditoria",
        "verificacao-integridade",
        `Verificação de integridade da cadeia de hash — ${resultado.registros_verificados} registro(s)`,
        "127.0.0.1",
        navigator.userAgent,
        resultado.integro ? "SUCESSO" : "FALHA",
        resultado.integro
          ? "Cadeia íntegra: hash e assinatura de todos os registros conferem"
          : `Cadeia quebrada a partir do registro de índice ${resultado.primeiro_erro_sequencia}`,
      );

      if (resultado.integro) {
        avisar("good", `Cadeia íntegra: ${resultado.registros_verificados} registro(s) e ${resultado.blocos_verificados} bloco(s) conferidos, nenhuma corrupção.`);
      } else {
        avisar("critical", `Cadeia de auditoria quebrada: ${resultado.registros_corrompidos} registro(s) corrompido(s) (primeiro no índice ${resultado.primeiro_erro_sequencia}). Veja os detalhes no painel.`);
      }
      forcarAtualizacao();
    } catch (erro) {
      avisar("critical", `Falha ao verificar a cadeia de auditoria: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
    } finally {
      setVerificando(false);
    }
  }, [avisar, forcarAtualizacao]);

  const executarBackup = useCallback(async () => {
    setExecutandoBackup(true);
    try {
      const backup = await estrategiaBackup.executarBackup(TipoBackup.COMPLETO, OPERADOR_LOCAL_ID, {
        origem: "PainelAuditoria",
      });

      await gerenciadorAuditoria.registrarAudit(
        OPERADOR_LOCAL_ID,
        OPERADOR_LOCAL_EMAIL,
        TipoOperacao.CRIACAO,
        "BackupExecution",
        backup.id,
        `Backup ${backup.tipo} executado — checksum ${backup.checksum_sha256}`,
        "127.0.0.1",
        navigator.userAgent,
        backup.status === "CONCLUIDO" ? "SUCESSO" : "FALHA",
        "Backup acionado manualmente pelo operador a partir do Painel de Auditoria",
        undefined,
        undefined,
        { checksum_sha256: backup.checksum_sha256 },
      );

      avisar("good", `Backup concluído. Checksum SHA-256: ${backup.checksum_sha256}`);
      forcarAtualizacao();
    } catch (erro) {
      avisar("critical", `Falha ao executar backup: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
    } finally {
      setExecutandoBackup(false);
    }
  }, [avisar, forcarAtualizacao]);

  const testarCenarioDrp = useCallback(
    async (cenario: CenarioDesastre) => {
      setTestandoDrpId(cenario.id);
      try {
        const teste = await planoRecuperacaoDesastres.testarDRP(cenario.id, "TABLETOP");

        await gerenciadorAuditoria.registrarAudit(
          OPERADOR_LOCAL_ID,
          OPERADOR_LOCAL_EMAIL,
          TipoOperacao.CONFIGURACAO,
          "PlanoRecuperacaoDesastres",
          teste.id,
          `Teste tabletop do cenário "${cenario.nome}" — resultado ${teste.resultado}`,
          "127.0.0.1",
          navigator.userAgent,
          teste.resultado === "PASSOU" ? "SUCESSO" : "PARCIAL",
          `Teste de DRP acionado manualmente pelo operador (${teste.passos_completados}/${cenario.passos_recuperacao.length} passos)`,
        );

        avisar(
          teste.resultado === "PASSOU" ? "good" : "warning",
          `Teste "${cenario.nome}": ${teste.resultado} — ${teste.duracao_minutos} min simulados (${teste.tempo_total_vs_rto_percentual.toFixed(0)}% do RTO).`,
        );
        forcarAtualizacao();
      } catch (erro) {
        avisar("critical", `Falha ao testar o cenário: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
      } finally {
        setTestandoDrpId(null);
      }
    },
    [avisar, forcarAtualizacao],
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <h2 className="section-title"><ShieldCheck size={14} /> Auditoria e continuidade</h2>
          <p style={{ maxWidth: "72ch", color: "var(--ink-soft)", fontSize: 13.5 }}>
            Trilha de auditoria imutável encadeada por hash, verificação de integridade da cadeia, execução de backup
            com checksum e estado do plano de recuperação de desastres (RTO/RPO). Para qualquer evento abaixo dá para
            responder quem fez, quando, o que mudou e se a cadeia de registros que prova isso ainda está intacta.
          </p>
        </div>
        <div className="toolbar-actions">
          <button className="btn" onClick={forcarAtualizacao} title="Reler o estado atual dos três módulos">
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      <div className="aviso-caixa" style={{ marginTop: 0, marginBottom: 20 }}>
        Os dados desta tela vivem na memória da aba aberta (não no arquivo .sqlite do app) — fechar ou recarregar a
        página zera a trilha, os backups e os testes de DRP registrados aqui. O app não tem login por usuário na área
        contábil, então todo evento é atribuído ao identificador fixo "{OPERADOR_LOCAL_ID}".
      </div>

      <div className="bento-grid">
        <div data-span="1"><KpiTile label="Registros na trilha" value={estatisticasAuditoria.total_registros} /></div>
        <div data-span="1"><KpiTile label="Blocos da cadeia" value={estatisticasAuditoria.total_blocos} /></div>
        <div data-span="2">
          <KpiTile
            label="Última verificação da cadeia"
            value={ultimaVerificacao ? formatarQuando(ultimaVerificacao.timestamp_verificacao) : "Nunca verificada"}
            variant={ultimaVerificacao ? (ultimaVerificacao.integro ? "good" : "critical") : undefined}
          />
        </div>
        <div data-span="2">
          <KpiTile
            label="Backups executados"
            value={`${estatisticasBackup.total_backups} (${estatisticasBackup.sucesso_rate.toFixed(0)}% concluídos)`}
          />
        </div>
        <div data-span="2"><KpiTile label="Cenários de DRP cadastrados" value={metricasDrp.cenarios_totais} /></div>
        <div data-span="2">
          <KpiTile
            label="Cobertura de teste DRP (30 dias)"
            value={`${metricasDrp.taxa_cobertura_teste.toFixed(0)}%`}
            variant={metricasDrp.taxa_cobertura_teste >= 100 ? "good" : metricasDrp.taxa_cobertura_teste === 0 ? "critical" : undefined}
          />
        </div>
        <div data-span="2"><KpiTile label="RTO médio / RPO médio" value={`${metricasDrp.rto_medio_horas.toFixed(1)}h / ${metricasDrp.rpo_medio_horas.toFixed(1)}h`} /></div>
      </div>

      {/* ── Verificação de integridade da cadeia de hash ──────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div className="section-title" style={{ margin: 0 }}><Link2 size={14} /> Verificação da cadeia de hash</div>
          <button className="btn primary" onClick={verificarCadeia} disabled={verificando}>
            <ShieldCheck size={14} /> {verificando ? "Verificando…" : "Revalidar cadeia agora"}
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12, maxWidth: "72ch" }}>
          Recalcula o hash de cada registro da trilha, confere contra o hash do registro anterior (a cadeia) e valida
          a assinatura digital de cada um. Se algum registro foi alterado depois de gravado, a cadeia quebra a partir
          dele — o índice exato aparece abaixo, sem ambiguidade.
        </p>
        {!ultimaVerificacao ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Ainda não verificada nesta sessão. Clique em "Revalidar cadeia agora".</p>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              {ultimaVerificacao.integro ? (
                <span className="pill good"><CircleCheck size={13} /> Cadeia íntegra</span>
              ) : (
                <span className="pill critical"><CircleX size={13} /> Cadeia quebrada</span>
              )}
              <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                verificado em {formatarQuando(ultimaVerificacao.timestamp_verificacao)}
              </span>
            </div>
            <div className="kpi-grid" style={{ marginBottom: ultimaVerificacao.detalhes.length > 0 ? 14 : 0 }}>
              <KpiTile label="Registros verificados" value={ultimaVerificacao.registros_verificados} />
              <KpiTile label="Registros corrompidos" value={ultimaVerificacao.registros_corrompidos} variant={ultimaVerificacao.registros_corrompidos > 0 ? "critical" : "good"} />
              <KpiTile label="Blocos verificados" value={ultimaVerificacao.blocos_verificados} />
              <KpiTile label="Blocos corrompidos" value={ultimaVerificacao.blocos_corrompidos} variant={ultimaVerificacao.blocos_corrompidos > 0 ? "critical" : "good"} />
              {ultimaVerificacao.primeiro_erro_sequencia !== undefined && (
                <KpiTile label="Primeiro erro (índice)" value={ultimaVerificacao.primeiro_erro_sequencia} variant="critical" />
              )}
            </div>
            {ultimaVerificacao.detalhes.length > 0 && (
              <ul style={{ fontSize: 12.5, color: "var(--warn)", paddingLeft: 18, margin: 0 }}>
                {ultimaVerificacao.detalhes.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ── Trilha de auditoria ────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title"><History size={14} /> Trilha de auditoria ({registros.length}{registros.length === 200 ? "+" : ""})</div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12, maxWidth: "72ch" }}>
          Mais recentes primeiro. Cada linha é um elo da cadeia (hash do próprio registro + hash do anterior), então
          qualquer alteração depois do fato é detectável pela verificação acima.
        </p>
        {registros.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Nenhum evento registrado ainda nesta sessão.</p>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 360, overflowY: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>Operação</th>
                  <th>Entidade</th>
                  <th>Resultado</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{r.sequencia}</td>
                    <td>{formatarQuando(r.timestamp)}</td>
                    <td>{r.usuario_email}</td>
                    <td>{ROTULO_OPERACAO[r.tipo_operacao] ?? r.tipo_operacao}</td>
                    <td>{r.entidade_tipo} #{r.entidade_id}</td>
                    <td>
                      <span className={`pill ${r.resultado === "SUCESSO" ? "good" : r.resultado === "FALHA" ? "critical" : "warning"}`}>
                        {r.resultado}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "normal", fontSize: 12 }}>{r.entidade_descricao}{r.motivo ? ` — ${r.motivo}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Backup ─────────────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div className="section-title" style={{ margin: 0 }}><DatabaseBackup size={14} /> Backup (motor de política e checksum)</div>
          <button className="btn primary" onClick={executarBackup} disabled={executandoBackup}>
            <DatabaseBackup size={14} /> {executandoBackup ? "Executando…" : "Executar backup completo"}
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12, maxWidth: "72ch" }}>
          Aciona a rotina de backup completo do módulo <code>strategy-backup.ts</code> (checksum SHA-256 real,
          políticas de retenção por 30 dias/1 ano/7 anos e agendamento). Não substitui o botão "Fazer backup" do
          cabeçalho do app — aquele exporta e faz o hash do arquivo .sqlite de verdade; este demonstra o motor de
          política/checksum que o módulo de auditoria oferece.
        </p>
        {historicoBackups.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Nenhum backup executado ainda nesta sessão.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th className="num">Tamanho comprimido</th>
                  <th className="num">Duração</th>
                  <th>Checksum SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {historicoBackups.map((b) => (
                  <tr key={b.id}>
                    <td>{formatarQuando(b.timestamp)}</td>
                    <td>{b.tipo}</td>
                    <td>
                      <span className={`pill ${b.status === "CONCLUIDO" ? "good" : b.status === "FALHA" ? "critical" : "warning"}`}>{b.status}</span>
                    </td>
                    <td className="num">{formatarBytes(b.tamanho_comprimido_bytes)}</td>
                    <td className="num">{b.duracao_segundos}s</td>
                    <td>
                      <code title={b.checksum_sha256} style={{ fontSize: 12 }}>{hashCurto(b.checksum_sha256)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Recuperação de desastres ───────────────────────────────────────────── */}
      <div className="card">
        <div className="section-title"><ShieldAlert size={14} /> Plano de recuperação de desastres</div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 14, maxWidth: "72ch" }}>
          Cenários cadastrados, com objetivo de tempo de recuperação (RTO) e de ponto de recuperação (RPO). "Testar"
          roda uma simulação tabletop (sem impacto real) e registra o resultado na trilha de auditoria acima.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: testesDrp.length > 0 ? 18 : 0 }}>
          {cenariosDrp.map((c) => (
            <div key={c.id} className="card" style={{ padding: 14, boxShadow: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <strong>{c.nome}</strong>{" "}
                  <span className={`pill ${CLASSE_SEVERIDADE[c.severidade] ?? ""}`}>{ROTULO_SEVERIDADE[c.severidade] ?? c.severidade}</span>
                  <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>
                    RTO {c.rto_horas}h · RPO {c.rpo_horas}h · última teste:{" "}
                    {c.ultima_teste ? formatarQuando(c.ultima_teste) : "nunca testado"}
                  </div>
                </div>
                <button className="btn" onClick={() => testarCenarioDrp(c)} disabled={testandoDrpId === c.id}>
                  <FlaskConical size={13} /> {testandoDrpId === c.id ? "Testando…" : "Testar (tabletop)"}
                </button>
              </div>
            </div>
          ))}
        </div>
        {testesDrp.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Cenário</th>
                  <th>Tipo de teste</th>
                  <th>Resultado</th>
                  <th className="num">Passos completados</th>
                  <th className="num">% do RTO</th>
                </tr>
              </thead>
              <tbody>
                {testesDrp.map((t) => {
                  const cenario = cenariosDrp.find((c) => c.id === t.cenario_id);
                  return (
                    <tr key={t.id}>
                      <td>{formatarQuando(t.data_teste)}</td>
                      <td>{cenario?.nome ?? t.cenario_id}</td>
                      <td>{t.tipo_teste}</td>
                      <td>
                        <span className={`pill ${t.resultado === "PASSOU" ? "good" : t.resultado === "FALHOU_TOTAL" ? "critical" : "warning"}`}>{t.resultado}</span>
                      </td>
                      <td className="num">{t.passos_completados}/{cenario?.passos_recuperacao.length ?? "?"}</td>
                      <td className="num">{t.tempo_total_vs_rto_percentual.toFixed(0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
