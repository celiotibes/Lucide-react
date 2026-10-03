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
  RotateCcw,
  PlusCircle,
  PlayCircle,
  UserCheck,
  Upload,
  Ban,
  FileArchive,
} from "lucide-react";
import { useToast } from "./useToast";
import { KpiTile } from "../components/KpiTile";
import { useDb } from "../db/useDb";
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
import {
  planejarExercicio,
  iniciarExecucao,
  concluirExecucaoComSucesso,
  concluirExecucaoComFalha,
  revisarExercicio,
  listarExercicios,
  obterExercicioComExecucoes,
  relatorioConformidadeRestauracao,
  type StatusExercicio,
  type ExercicioRestauracao,
  type ExercicioComExecucoes,
  type AchadoConformidade,
} from "../domain/backup/exercicioRestauracao";
import {
  listarExportacoes,
  listarAcessosDeExportacao,
  revogarExportacao,
  type ExportacaoGerada,
  type ExportacaoAcesso,
} from "../domain/exportacao/exportacaoControlada";

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

/** `planejado_para` é uma data pura ("AAAA-MM-DD", o mesmo formato de `<input type="date">"),
 * não um timestamp — formata sem passar por `new Date()` para não sofrer o deslocamento de
 * fuso horário que empurraria a data exibida um dia para trás. */
function formatarDataCurta(isoData: string): string {
  const [ano, mes, dia] = isoData.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : isoData;
}

const ROTULO_STATUS_EXERCICIO: Record<StatusExercicio, { texto: string; pill: string }> = {
  planejado: { texto: "planejado", pill: "" },
  executado: { texto: "executado", pill: "warning" },
  revisado: { texto: "revisado", pill: "good" },
};

/** Painel de Auditoria e Continuidade — a tela que dá acesso real aos módulos de
 * segurança/auditoria que hoje existem no domínio (`src/domain/erp/`) mas não são
 * chamados por nenhuma outra tela do app:
 *
 * - `audit-logging-imutavel.ts` — log de auditoria encadeado por hash (trilha +
 *   verificação de integridade da cadeia). GRAVA na tabela `auditoria_log` do banco
 *   .sqlite do app (via `gerenciadorAuditoria.definirBanco(db)`, logo abaixo) — a trilha e
 *   a verificação de integridade sobrevivem a um F5 ou a fechar a aba.
 * - `strategy-backup.ts` — execução de backup com checksum SHA-256 real e políticas de
 *   retenção. Continua só em memória: não sobrevive a um reload.
 * - `plano-recuperacao-desastres.ts` — cenários de disaster recovery (RTO/RPO), testes e
 *   métricas de cobertura. Também só em memória: não sobrevive a um reload.
 *
 * E o backup executado aqui é o da "estratégia de backup" (motor de política/retenção/
 * checksum), não o export real do banco sql.js — esse já existe e fica no cabeçalho do
 * app (botão "Fazer backup"), gravando o hash de verdade do arquivo que foi baixado. As
 * duas coisas são complementares: uma prova o arquivo que saiu do navegador, a outra
 * demonstra o motor de agendamento/retenção/checksum descrito em `strategy-backup.ts`.
 *
 * `compliance-audit-log.ts` (a outra variante que também grava em `auditoria_log`, com seu
 * próprio conjunto de colunas) não é usada aqui — continua sem uso por nenhuma tela. Ver
 * `src/ui/auditoria/singletons.ts` e o relatório da tarefa para o porquê.
 */
export function PainelAuditoria() {
  const { avisar } = useToast();
  const { db, persistir } = useDb();

  const [tick, setTick] = useState(0);
  const forcarAtualizacao = useCallback(() => setTick((t) => t + 1), []);

  const [ultimaVerificacao, setUltimaVerificacao] = useState<ResultadoVerificacao | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [executandoBackup, setExecutandoBackup] = useState(false);
  const [testandoDrpId, setTestandoDrpId] = useState<string | null>(null);

  // ── Exercícios de restauração ──────────────────────────────────────────────────────────
  const [mostrarFormExercicio, setMostrarFormExercicio] = useState(false);
  const [descricaoExercicio, setDescricaoExercicio] = useState("");
  const [rpoAlvoInput, setRpoAlvoInput] = useState("");
  const [rtoAlvoInput, setRtoAlvoInput] = useState("");
  const [planejadoParaInput, setPlanejadoParaInput] = useState("");
  const [planejandoExercicio, setPlanejandoExercicio] = useState(false);

  const [exercicioAbertoId, setExercicioAbertoId] = useState<number | null>(null);
  const [iniciandoExecucaoId, setIniciandoExecucaoId] = useState<number | null>(null);
  const [revisandoExercicioId, setRevisandoExercicioId] = useState<number | null>(null);
  // Qual execução (id) está com o mini-formulário de "concluir com sucesso" aberto — só um
  // por vez, então um único id (em vez de um Set) já resolve.
  const [execucaoConcluindoId, setExecucaoConcluindoId] = useState<number | null>(null);
  const [arquivoRestauradoNome, setArquivoRestauradoNome] = useState<string | null>(null);
  const [arquivoRestauradoBytes, setArquivoRestauradoBytes] = useState<Uint8Array | null>(null);
  const [lendoArquivoRestaurado, setLendoArquivoRestaurado] = useState(false);
  const [dataUltimoBackupInput, setDataUltimoBackupInput] = useState("");
  // Token incrementado a cada seleção de arquivo E a cada troca de exercício/execução aberta —
  // `arquivo.arrayBuffer()` é assíncrono (arquivo .sqlite pode ser grande) e, sem isto, um
  // usuário que troca de execução/exercício enquanto a leitura anterior ainda está em voo
  // acabaria aplicando os bytes do arquivo ERRADO à execução agora aberta quando a promise
  // antiga resolvesse por último. Só o resultado cujo token ainda bate com o mais recente é
  // aplicado ao estado.
  const arquivoRestauradoTokenRef = useRef(0);
  // Cobre tanto "concluir com sucesso" quanto "marcar como falha" — as duas mutam a mesma
  // execução e nunca rodam ao mesmo tempo para o mesmo id.
  const [processandoExecucaoId, setProcessandoExecucaoId] = useState<number | null>(null);

  // ── Exportações controladas ────────────────────────────────────────────────────────────
  const [exportacaoAbertaId, setExportacaoAbertaId] = useState<number | null>(null);
  const [processandoExportacaoId, setProcessandoExportacaoId] = useState<number | null>(null);

  // Liga o gerenciador de auditoria ao banco real assim que ele estiver disponível (o App
  // só renderiza esta tela depois que `db` deixa de ser null, ver App.tsx). A partir daqui
  // todo `registrarAudit` grava também em `auditoria_log`, e a primeira chamada hidrata
  // `gerenciadorAuditoria` com o que já estava persistido de sessões anteriores — é o que
  // faz "Registros na trilha" e a tabela abaixo não começarem vazios depois de um F5.
  useEffect(() => {
    gerenciadorAuditoria.definirBanco(db);
    forcarAtualizacao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

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
      .then(async () => {
        await persistir();
        forcarAtualizacao();
      })
      .catch((erro) => {
        avisar("critical", `Falha ao registrar a abertura do painel na trilha de auditoria: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcarAtualizacao, persistir]);

  // Os três módulos guardam o próprio histórico em objetos mutáveis fora do React
  // (arrays/Maps dentro da instância da classe, ver singletons.ts) — `gerenciadorAuditoria`
  // agora espelha isso também em `auditoria_log` (ver o efeito de `definirBanco` acima),
  // mas o React continua sem visibilidade direta sobre a mutação em si. `tick` é o gatilho
  // manual que os callers (registrar, verificar, executar backup, testar DRP) incrementam
  // depois de cada ação, para reler o snapshot atual do módulo.
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

  // `exercicios_restauracao`/`exercicios_restauracao_execucoes` e `exportacoes_geradas`/
  // `exportacoes_acessos` vivem no mesmo banco .sqlite persistido que `auditoria_log` — por
  // isso essas leituras dependem de `db` e `tick`, igual ao resto do painel, e não de um
  // objeto singleton em memória como os três módulos acima.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exercicios: ExercicioRestauracao[] = useMemo(() => (db ? listarExercicios(db) : []), [db, tick]);
  const exercicioAberto: ExercicioComExecucoes | null = useMemo(
    () => (db && exercicioAbertoId !== null ? obterExercicioComExecucoes(db, exercicioAbertoId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, exercicioAbertoId, tick],
  );
  const achadosConformidade: AchadoConformidade[] = useMemo(
    () => (db ? relatorioConformidadeRestauracao(db) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, tick],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exportacoes: ExportacaoGerada[] = useMemo(() => (db ? listarExportacoes(db) : []), [db, tick]);
  const acessosExportacaoAberta: ExportacaoAcesso[] = useMemo(
    () => (db && exportacaoAbertaId !== null ? listarAcessosDeExportacao(db, exportacaoAbertaId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, exportacaoAbertaId, tick],
  );

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
      await persistir();

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
  }, [avisar, forcarAtualizacao, persistir]);

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
      await persistir();

      avisar("good", `Backup concluído. Checksum SHA-256: ${backup.checksum_sha256}`);
      forcarAtualizacao();
    } catch (erro) {
      avisar("critical", `Falha ao executar backup: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
    } finally {
      setExecutandoBackup(false);
    }
  }, [avisar, forcarAtualizacao, persistir]);

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
        await persistir();

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
    [avisar, forcarAtualizacao, persistir],
  );

  const planejarNovoExercicio = useCallback(async () => {
    if (!db) return;
    const descricao = descricaoExercicio.trim();
    const rpo = Number(rpoAlvoInput);
    const rto = Number(rtoAlvoInput);
    if (!descricao || !planejadoParaInput || !Number.isFinite(rpo) || rpo <= 0 || !Number.isFinite(rto) || rto <= 0) {
      avisar("warning", "Preencha descrição, RPO alvo (h), RTO alvo (h) e a data planejada — os dois alvos maiores que zero.");
      return;
    }
    setPlanejandoExercicio(true);
    try {
      const exercicio = planejarExercicio(db, {
        descricao,
        rpoHorasAlvo: rpo,
        rtoHorasAlvo: rto,
        planejadoPara: planejadoParaInput,
      });
      await persistir();
      avisar("good", `Exercício de restauração #${exercicio.id} planejado para ${formatarDataCurta(planejadoParaInput)}.`);
      setDescricaoExercicio("");
      setRpoAlvoInput("");
      setRtoAlvoInput("");
      setPlanejadoParaInput("");
      setMostrarFormExercicio(false);
      forcarAtualizacao();
    } catch (erro) {
      avisar("critical", `Falha ao planejar exercício de restauração: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
    } finally {
      setPlanejandoExercicio(false);
    }
  }, [db, descricaoExercicio, rpoAlvoInput, rtoAlvoInput, planejadoParaInput, persistir, avisar, forcarAtualizacao]);

  const iniciarNovaExecucao = useCallback(
    async (exercicioId: number) => {
      if (!db) return;
      setIniciandoExecucaoId(exercicioId);
      try {
        iniciarExecucao(db, exercicioId);
        await persistir();
        avisar("good", "Execução do exercício de restauração iniciada.");
        forcarAtualizacao();
      } catch (erro) {
        avisar("critical", `Falha ao iniciar execução: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
      } finally {
        setIniciandoExecucaoId(null);
      }
    },
    [db, avisar, forcarAtualizacao, persistir],
  );

  // Lê o arquivo .sqlite escolhido como bytes assim que ele é selecionado — evita segurar
  // uma referência ao `File`/input (que o navegador pode invalidar) até o momento de
  // confirmar, e deixa o botão de confirmar já saber se há conteúdo pronto para enviar.
  const selecionarArquivoRestaurado = useCallback(
    async (arquivo: File | null) => {
      const token = ++arquivoRestauradoTokenRef.current;
      if (!arquivo) {
        setArquivoRestauradoNome(null);
        setArquivoRestauradoBytes(null);
        setLendoArquivoRestaurado(false);
        return;
      }
      // Mostra o nome já ao selecionar (feedback imediato) e zera os bytes anteriores — o
      // arquivo pode ser grande, então a leitura abaixo não é instantânea.
      setArquivoRestauradoNome(arquivo.name);
      setArquivoRestauradoBytes(null);
      setLendoArquivoRestaurado(true);
      try {
        const buffer = await arquivo.arrayBuffer();
        if (arquivoRestauradoTokenRef.current !== token) return; // seleção obsoleta — descarta
        setArquivoRestauradoBytes(new Uint8Array(buffer));
      } catch {
        if (arquivoRestauradoTokenRef.current !== token) return;
        avisar("critical", "Não foi possível ler o arquivo selecionado.");
        setArquivoRestauradoNome(null);
      } finally {
        if (arquivoRestauradoTokenRef.current === token) setLendoArquivoRestaurado(false);
      }
    },
    [avisar],
  );

  const confirmarConclusaoComSucesso = useCallback(
    async (execucaoId: number) => {
      if (!db) return;
      if (lendoArquivoRestaurado) {
        avisar("warning", "Aguarde a leitura do arquivo terminar antes de confirmar.");
        return;
      }
      if (!arquivoRestauradoBytes) {
        avisar("warning", "Selecione o arquivo .sqlite restaurado antes de confirmar.");
        return;
      }
      if (!dataUltimoBackupInput) {
        avisar("warning", "Informe a data do último backup conhecido antes de confirmar.");
        return;
      }
      setProcessandoExecucaoId(execucaoId);
      try {
        // `concluirExecucaoComSucesso` RODA a verificação real do arquivo enviado — o
        // resultado gravado (sucesso ou falha) reflete o que a verificação encontrou, não a
        // intenção de quem clicou neste botão. Ver o aviso na própria tela.
        const execucao = await concluirExecucaoComSucesso(db, execucaoId, {
          conteudoSqliteRestaurado: arquivoRestauradoBytes,
          dataUltimoBackupConhecido: new Date(dataUltimoBackupInput).toISOString(),
        });
        await persistir();
        if (execucao.resultado === "sucesso") {
          avisar(
            "good",
            `Execução concluída com sucesso — RPO real ${execucao.rpo_horas_real?.toFixed(1)}h, RTO real ${execucao.rto_horas_real?.toFixed(1)}h.`,
          );
        } else {
          avisar(
            "critical",
            `A verificação do arquivo restaurado encontrou problema(s) — a execução foi registrada como FALHA, não sucesso. Veja as observações na execução.`,
          );
        }
        arquivoRestauradoTokenRef.current++; // invalida qualquer leitura de arquivo ainda em voo
        setExecucaoConcluindoId(null);
        setArquivoRestauradoBytes(null);
        setArquivoRestauradoNome(null);
        setDataUltimoBackupInput("");
        forcarAtualizacao();
      } catch (erro) {
        avisar("critical", `Falha ao concluir a execução: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
      } finally {
        setProcessandoExecucaoId(null);
      }
    },
    [db, arquivoRestauradoBytes, dataUltimoBackupInput, lendoArquivoRestaurado, persistir, avisar, forcarAtualizacao],
  );

  const marcarExecucaoComoFalha = useCallback(
    async (execucaoId: number) => {
      if (!db) return;
      const motivo = prompt(
        "Por que esta execução do exercício de restauração falhou?\n(Ex.: backup indisponível no armazenamento externo, arquivo corrompido antes mesmo de tentar abrir — a verificação nunca chegou a rodar.)",
      );
      if (motivo === null) return;
      if (!motivo.trim()) {
        avisar("warning", "Informe um motivo para registrar a falha.");
        return;
      }
      setProcessandoExecucaoId(execucaoId);
      try {
        concluirExecucaoComFalha(db, execucaoId, motivo.trim());
        await persistir();
        avisar("warning", "Execução registrada como falha, com o motivo informado.");
        forcarAtualizacao();
      } catch (erro) {
        avisar("critical", `Falha ao registrar a falha da execução: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
      } finally {
        setProcessandoExecucaoId(null);
      }
    },
    [db, avisar, forcarAtualizacao, persistir],
  );

  const revisarExercicioAtual = useCallback(
    async (exercicioId: number) => {
      if (!db) return;
      const revisadoPor = prompt("Quem está revisando este exercício de restauração?", OPERADOR_LOCAL_EMAIL);
      if (revisadoPor === null) return;
      if (!revisadoPor.trim()) {
        avisar("warning", "Informe quem está revisando.");
        return;
      }
      setRevisandoExercicioId(exercicioId);
      try {
        revisarExercicio(db, exercicioId, revisadoPor.trim());
        await persistir();
        avisar("good", "Exercício de restauração revisado.");
        forcarAtualizacao();
      } catch (erro) {
        avisar("critical", `Falha ao revisar exercício: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
      } finally {
        setRevisandoExercicioId(null);
      }
    },
    [db, avisar, forcarAtualizacao, persistir],
  );

  const revogarExportacaoAtual = useCallback(
    async (exportacaoId: number) => {
      if (!db) return;
      if (!confirm("Revogar esta exportação? Acessos futuros a ela serão bloqueados. O conteúdo já entregue antes não é apagado nem desfeito.")) {
        return;
      }
      setProcessandoExportacaoId(exportacaoId);
      try {
        revogarExportacao(db, exportacaoId);
        await persistir();
        avisar("good", "Exportação revogada.");
        forcarAtualizacao();
      } catch (erro) {
        avisar("critical", `Falha ao revogar exportação: ${erro instanceof Error ? erro.message : "erro desconhecido"}`);
      } finally {
        setProcessandoExportacaoId(null);
      }
    },
    [db, avisar, forcarAtualizacao, persistir],
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
        A trilha de auditoria abaixo (os eventos listados e a verificação de integridade da cadeia) é gravada na
        tabela <code>auditoria_log</code> do arquivo .sqlite do app e sobrevive a fechar a aba ou recarregar a
        página. Já os backups executados nesta tela (motor de política/checksum do <code>strategy-backup.ts</code>) e
        os testes de DRP continuam vivendo só na memória desta aba — recarregar a página zera esse histórico
        específico. O app não tem login por usuário na área contábil, então todo evento é atribuído ao identificador
        fixo "{OPERADOR_LOCAL_ID}".
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
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Nenhum evento registrado ainda.</p>
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

      {/* ── Exercícios de restauração ──────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div className="section-title" style={{ margin: 0 }}><RotateCcw size={14} /> Exercícios de restauração</div>
          <button className="btn primary" onClick={() => setMostrarFormExercicio((v) => !v)}>
            <PlusCircle size={14} /> {mostrarFormExercicio ? "Cancelar" : "Planejar novo exercício"}
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12, maxWidth: "72ch" }}>
          Formaliza como programa (planejado → executado → revisado, com RPO/RTO medidos de verdade) o que a
          verificação de backup já faz tecnicamente por trás — restaurar um <code>.sqlite</code> e conferir as
          invariantes contábeis. Sem isto, nunca fica registrado que o backup foi de fato EXERCITADO, com data,
          execução e revisão humana; só que o código de verificação existe e passa em teste.
        </p>

        {mostrarFormExercicio && (
          <div className="card" style={{ padding: 14, boxShadow: "none", marginBottom: 16 }}>
            <div className="form-grid">
              <label>
                <span>Descrição</span>
                <input
                  value={descricaoExercicio}
                  onChange={(e) => setDescricaoExercicio(e.target.value)}
                  placeholder="Ex.: Restauração do backup semanal completo"
                />
              </label>
              <label>
                <span>RPO alvo (horas)</span>
                <input type="number" min="0" step="0.5" value={rpoAlvoInput} onChange={(e) => setRpoAlvoInput(e.target.value)} placeholder="Ex.: 24" />
              </label>
              <label>
                <span>RTO alvo (horas)</span>
                <input type="number" min="0" step="0.5" value={rtoAlvoInput} onChange={(e) => setRtoAlvoInput(e.target.value)} placeholder="Ex.: 4" />
              </label>
              <label>
                <span>Planejado para</span>
                <input type="date" value={planejadoParaInput} onChange={(e) => setPlanejadoParaInput(e.target.value)} />
              </label>
            </div>
            <button className="btn primary" onClick={planejarNovoExercicio} disabled={planejandoExercicio}>
              <PlusCircle size={14} /> {planejandoExercicio ? "Planejando…" : "Confirmar planejamento"}
            </button>
          </div>
        )}

        {/* Achado de conformidade em destaque — o que este módulo existe para mostrar. */}
        <div style={{ marginBottom: 18 }}>
          <div className="kpi-grid" style={{ marginBottom: achadosConformidade.length > 0 ? 10 : 0 }}>
            <KpiTile label="Exercícios revisados e medidos" value={achadosConformidade.length} />
            <KpiTile
              label="Dentro da meta (RPO e RTO)"
              value={achadosConformidade.filter((a) => !a.nao_conformidade).length}
              variant={achadosConformidade.length > 0 ? "good" : undefined}
            />
            <KpiTile
              label="Fora da meta"
              value={achadosConformidade.filter((a) => a.nao_conformidade).length}
              variant={achadosConformidade.some((a) => a.nao_conformidade) ? "critical" : undefined}
            />
          </div>
          {achadosConformidade.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>
              Nenhum exercício revisado com execução de sucesso ainda — o relatório de conformidade aparece aqui
              assim que houver ao menos um exercício "Iniciar execução" → "Marcar como concluída com sucesso" →
              "Revisar".
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Exercício</th>
                    <th className="num">RPO alvo</th>
                    <th className="num">RPO real</th>
                    <th className="num">RTO alvo</th>
                    <th className="num">RTO real</th>
                    <th>Conformidade</th>
                  </tr>
                </thead>
                <tbody>
                  {achadosConformidade.map((a) => (
                    <tr key={a.exercicio_id}>
                      <td>#{a.exercicio_id} — {a.descricao}</td>
                      <td className="num">{a.rpo_horas_alvo}h</td>
                      <td className="num">{a.rpo_horas_real.toFixed(1)}h</td>
                      <td className="num">{a.rto_horas_alvo}h</td>
                      <td className="num">{a.rto_horas_real.toFixed(1)}h</td>
                      <td>
                        {a.nao_conformidade ? (
                          <span className="pill critical"><CircleX size={11} /> fora da meta</span>
                        ) : (
                          <span className="pill good"><CircleCheck size={11} /> dentro da meta</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {exercicios.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Nenhum exercício de restauração planejado ainda.</p>
        ) : (
          exercicios.map((ex) => {
            const aberto = exercicioAbertoId === ex.id;
            const rotulo = ROTULO_STATUS_EXERCICIO[ex.status];
            const detalhe = aberto && exercicioAberto?.id === ex.id ? exercicioAberto : null;
            const temExecucaoAberta = detalhe?.execucoes.some((e) => e.concluido_em === null) ?? false;
            return (
              <div key={ex.id} className="card" style={{ padding: 14, boxShadow: "none", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div>
                    <strong>#{ex.id} — {ex.descricao}</strong>{" "}
                    <span className={`pill ${rotulo.pill}`}>{rotulo.texto}</span>
                    <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>
                      RPO alvo {ex.rpo_horas_alvo}h · RTO alvo {ex.rto_horas_alvo}h · planejado para {formatarDataCurta(ex.planejado_para)}
                    </div>
                  </div>
                  <button
                    className="btn"
                    onClick={() => {
                      // Trocar de exercício invalida qualquer arquivo selecionado/em leitura
                      // para a execução que estava aberta antes — nunca aplicar os bytes de
                      // um arquivo escolhido para uma execução a outra execução/exercício.
                      arquivoRestauradoTokenRef.current++;
                      setExercicioAbertoId(aberto ? null : ex.id);
                      setExecucaoConcluindoId(null);
                      setArquivoRestauradoBytes(null);
                      setArquivoRestauradoNome(null);
                      setLendoArquivoRestaurado(false);
                      setDataUltimoBackupInput("");
                    }}
                  >
                    {aberto ? "Fechar execuções" : "Ver execuções"}
                  </button>
                </div>

                {aberto && (
                  <div style={{ marginTop: 14 }}>
                    <div className="toolbar-actions" style={{ marginBottom: 12 }}>
                      <button
                        className="btn primary"
                        onClick={() => iniciarNovaExecucao(ex.id)}
                        disabled={iniciandoExecucaoId === ex.id || temExecucaoAberta}
                        title={temExecucaoAberta ? "Já existe uma execução em andamento para este exercício" : undefined}
                      >
                        <PlayCircle size={14} /> {iniciandoExecucaoId === ex.id ? "Iniciando…" : "Iniciar execução"}
                      </button>
                      {ex.status === "executado" && (
                        <button className="btn" onClick={() => revisarExercicioAtual(ex.id)} disabled={revisandoExercicioId === ex.id}>
                          <UserCheck size={14} /> {revisandoExercicioId === ex.id ? "Revisando…" : "Revisar"}
                        </button>
                      )}
                    </div>

                    {!detalhe || detalhe.execucoes.length === 0 ? (
                      <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>Nenhuma execução registrada ainda.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {detalhe.execucoes.map((exec) => {
                          const emAndamento = exec.concluido_em === null;
                          const formSucessoAberto = execucaoConcluindoId === exec.id;
                          return (
                            <div key={exec.id} className="card" style={{ padding: 12, boxShadow: "none", background: "var(--surface-2)" }}>
                              <div style={{ fontSize: 12.5 }}>
                                iniciada em {formatarQuando(new Date(exec.iniciado_em))}
                                {exec.concluido_em && <> · concluída em {formatarQuando(new Date(exec.concluido_em))}</>}
                              </div>
                              {exec.resultado && (
                                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span className={`pill ${exec.resultado === "sucesso" ? "good" : "critical"}`}>{exec.resultado}</span>
                                  {exec.rpo_horas_real !== null && exec.rto_horas_real !== null && (
                                    <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                                      RPO real {exec.rpo_horas_real.toFixed(1)}h · RTO real {exec.rto_horas_real.toFixed(1)}h
                                    </span>
                                  )}
                                </div>
                              )}
                              {(exec.evidencia_hash || exec.evidencia_hash_arquivo) && (
                                <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "var(--ink-soft)" }}>
                                  {exec.evidencia_hash && (
                                    <span>
                                      Hash do relatório:{" "}
                                      <code title={exec.evidencia_hash} style={{ fontSize: 12 }}>{hashCurto(exec.evidencia_hash)}</code>
                                    </span>
                                  )}
                                  {exec.evidencia_hash_arquivo && (
                                    <span>
                                      Hash do arquivo:{" "}
                                      <code title={exec.evidencia_hash_arquivo} style={{ fontSize: 12 }}>{hashCurto(exec.evidencia_hash_arquivo)}</code>
                                    </span>
                                  )}
                                </div>
                              )}
                              {exec.observacoes && (
                                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4, whiteSpace: "pre-wrap" }}>{exec.observacoes}</div>
                              )}
                              {exec.revisado_por && (
                                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                                  revisado por {exec.revisado_por}{exec.revisado_em ? ` em ${formatarQuando(new Date(exec.revisado_em))}` : ""}
                                </div>
                              )}

                              {emAndamento && (
                                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                                  <div className="toolbar-actions">
                                    <button
                                      className="btn primary"
                                      onClick={() => {
                                        // Mesmo cuidado do botão "Ver execuções": trocar de
                                        // execução invalida um arquivo selecionado/em leitura
                                        // para a execução anterior.
                                        arquivoRestauradoTokenRef.current++;
                                        setExecucaoConcluindoId(formSucessoAberto ? null : exec.id);
                                        setArquivoRestauradoBytes(null);
                                        setArquivoRestauradoNome(null);
                                        setLendoArquivoRestaurado(false);
                                        setDataUltimoBackupInput("");
                                      }}
                                    >
                                      <CircleCheck size={13} /> Marcar como concluída com sucesso
                                    </button>
                                    <button
                                      className="btn danger"
                                      onClick={() => marcarExecucaoComoFalha(exec.id)}
                                      disabled={processandoExecucaoId === exec.id}
                                    >
                                      <CircleX size={13} /> Marcar como falha
                                    </button>
                                  </div>

                                  {formSucessoAberto && (
                                    <div className="card" style={{ padding: 12, boxShadow: "none" }}>
                                      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 0, marginBottom: 10, maxWidth: "60ch" }}>
                                        Como esta tela não restaura um <code>.sqlite</code> de verdade sozinha (isso é feito
                                        fora dela, pelo operador testando manualmente), a conclusão precisa do arquivo
                                        restaurado e roda sobre ele a mesma verificação real usada no backup do
                                        cabeçalho do app. Se a verificação encontrar qualquer problema, a execução é
                                        registrada como <strong>falha</strong> automaticamente, mesmo confirmando aqui — o
                                        resultado reflete o que foi de fato verificado, não a intenção de quem clicou.
                                      </p>
                                      <div className="form-grid">
                                        <label>
                                          <span>Arquivo .sqlite restaurado</span>
                                          <input
                                            type="file"
                                            accept=".sqlite,.db"
                                            onChange={(e) => selecionarArquivoRestaurado(e.target.files?.[0] ?? null)}
                                          />
                                        </label>
                                        <label>
                                          <span>Data do último backup conhecido</span>
                                          <input type="date" value={dataUltimoBackupInput} onChange={(e) => setDataUltimoBackupInput(e.target.value)} />
                                        </label>
                                      </div>
                                      {arquivoRestauradoNome && (
                                        <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: -6, marginBottom: 10 }}>
                                          {lendoArquivoRestaurado
                                            ? `Lendo ${arquivoRestauradoNome}… (arquivo pode ser grande, aguarde)`
                                            : `Selecionado: ${arquivoRestauradoNome}`}
                                        </p>
                                      )}
                                      <button
                                        className="btn primary"
                                        onClick={() => confirmarConclusaoComSucesso(exec.id)}
                                        disabled={processandoExecucaoId === exec.id || lendoArquivoRestaurado}
                                      >
                                        <Upload size={13} />{" "}
                                        {processandoExecucaoId === exec.id
                                          ? "Verificando…"
                                          : lendoArquivoRestaurado
                                          ? "Lendo arquivo…"
                                          : "Confirmar e verificar"}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Exportações controladas ────────────────────────────────────────────── */}
      <div className="card">
        <div className="section-title"><FileArchive size={14} /> Exportações controladas</div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12, maxWidth: "72ch" }}>
          Envelope de controle das exportações já geradas pelo laudo pericial, RAD e ECD: hash SHA-256 do conteúdo
          exato entregue, quem gerou, validade opcional e uma trilha append-only de cada acesso. Gerar uma
          exportação nova acontece nas telas de origem (laudo, RAD, ECD) — aqui só se gerencia o que já existe.
        </p>
        {exportacoes.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Nenhuma exportação registrada ainda.</p>
        ) : (
          exportacoes.map((exp) => {
            const aberta = exportacaoAbertaId === exp.id;
            const expirada = exp.expira_em !== null && exp.expira_em < new Date().toISOString();
            return (
              <div key={exp.id} className="card" style={{ padding: 14, boxShadow: "none", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <strong>#{exp.id} — {exp.tipo}</strong>{" "}
                    <span className="pill">{exp.formato.toUpperCase()}</span>{" "}
                    {exp.revogado === 1 && <span className="pill critical">revogada</span>}
                    {exp.revogado !== 1 && expirada && <span className="pill warning">expirada</span>}
                    <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>
                      gerado por {exp.gerado_por} em {formatarQuando(new Date(exp.gerado_em))}
                      {exp.expira_em && <> · expira em {formatarQuando(new Date(exp.expira_em))}</>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                      <code title={exp.arquivo_hash} style={{ fontSize: 11 }}>{hashCurto(exp.arquivo_hash)}</code>
                    </div>
                  </div>
                  <div className="toolbar-actions">
                    <button className="btn" onClick={() => setExportacaoAbertaId(aberta ? null : exp.id)}>
                      {aberta ? "Fechar acessos" : "Ver acessos"}
                    </button>
                    {exp.revogado !== 1 && (
                      <button
                        className="btn danger"
                        onClick={() => revogarExportacaoAtual(exp.id)}
                        disabled={processandoExportacaoId === exp.id}
                      >
                        <Ban size={13} /> {processandoExportacaoId === exp.id ? "Revogando…" : "Revogar"}
                      </button>
                    )}
                  </div>
                </div>

                {aberta && (
                  <div style={{ marginTop: 12 }}>
                    {acessosExportacaoAberta.length === 0 ? (
                      <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>Nenhum acesso registrado ainda.</p>
                    ) : (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Quando</th>
                              <th>Quem</th>
                            </tr>
                          </thead>
                          <tbody>
                            {acessosExportacaoAberta.map((a) => (
                              <tr key={a.id}>
                                <td>{formatarQuando(new Date(a.acessado_em))}</td>
                                <td>{a.ator}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
