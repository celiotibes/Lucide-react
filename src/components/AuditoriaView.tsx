import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { CopyCheck, TrendingUp, CalendarX2, Link2Off, Search, ShieldCheck, ShieldAlert, FileDown } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import {
  detectarDuplicatas, detectarOutliers, detectarLacunasMensais, testeBenford,
  detectarCaucoesSemTransacao, detectarTransacoesCaucaoSemRegistro, detectarFinanciamentosSemLancamento,
  CATEGORIAS_BENFORD_VARIAVEIS, AMOSTRA_MINIMA_BENFORD_INDICATIVA,
} from "../domain/auditoria/auditoriaForense";
import { listarLogCompleto } from "../domain/auditoria/logAlteracoes";
import {
  verificarIntegridade, gerarRelatorioAuditoria, listarAcessosUsuario, exportarLogAuditoria,
  type VerificacaoIntegridade, type RelatorioAuditoria, type RegistroAuditoria,
} from "../domain/erp/compliance-audit-log";
import { formatarMoeda } from "../domain/formatarMoeda";
import { KpiTile } from "./KpiTile";
import type { FiltroTransacoesInicial } from "./TransacoesView";

const ROTULO_TABELA: Record<string, string> = {
  imoveis: "Imóvel", contratos_locacao: "Contrato de locação", financiamentos: "Financiamento", caucoes: "Depósito caução",
};
const ROTULO_OPERACAO: Record<string, string> = { criacao: "criado", edicao: "editado", exclusao: "excluído" };

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function BotaoVerTransacoes({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn" style={{ padding: "3px 8px", fontSize: 12, display: "inline-flex", gap: 4, alignItems: "center" }} onClick={onClick} title="Ver o(s) lançamento(s) na aba Transações">
      <Search size={11} /> Ver
    </button>
  );
}

export function AuditoriaView({ aoDrillDown }: { aoDrillDown?: (filtro: FiltroTransacoesInicial) => void }) {
  const { db, versao } = useDb();
  const hoje = hojeIso();
  const dataInicio36m = new Date(new Date(hoje).setMonth(new Date(hoje).getMonth() - 36)).toISOString().slice(0, 10);

  const duplicatas = useMemo(() => (db ? detectarDuplicatas(db) : []), [db, versao]);
  const outliers = useMemo(() => (db ? detectarOutliers(db, dataInicio36m, hoje) : []), [db, versao, dataInicio36m, hoje]);
  const lacunas = useMemo(
    () => (db ? detectarLacunasMensais(db, ["2.1.01", "2.1.05", "2.1.06"], dataInicio36m, hoje) : []),
    [db, versao, dataInicio36m, hoje],
  );

  const valoresVariaveis = useMemo(() => {
    if (!db) return [];
    return consultar<{ valor: number }>(
      db,
      `SELECT valor FROM transacoes WHERE plano_conta_codigo IN (${CATEGORIAS_BENFORD_VARIAVEIS.map(() => "?").join(",")}) OR plano_conta_codigo IS NULL`,
      CATEGORIAS_BENFORD_VARIAVEIS,
    ).map((r) => r.valor);
  }, [db, versao]);

  const benford = useMemo(() => testeBenford(valoresVariaveis), [valoresVariaveis]);
  const desvioBenfordMaximo = Math.max(0, ...benford.map((b) => Math.abs(b.frequenciaObservada - b.frequenciaEsperada)));

  const caucoesSemTransacao = useMemo(() => (db ? detectarCaucoesSemTransacao(db) : []), [db, versao]);
  const transacoesCaucaoSemRegistro = useMemo(() => (db ? detectarTransacoesCaucaoSemRegistro(db) : []), [db, versao]);
  const financiamentosSemLancamento = useMemo(() => (db ? detectarFinanciamentosSemLancamento(db, hoje) : []), [db, versao, hoje]);
  const logAlteracoes = useMemo(() => (db ? listarLogCompleto(db, 100) : []), [db, versao]);

  // Log de acesso e integridade (compliance-audit-log.ts) — trilha imutável de chamadas a
  // APIs externas, distinta do "Histórico de edições" acima (que audita os CADASTROS, não o
  // acesso). Reusa o mesmo período de 36 meses já calculado para o resto da tela.
  const [integridade, setIntegridade] = useState<VerificacaoIntegridade | null>(null);
  const [verificandoIntegridade, setVerificandoIntegridade] = useState(false);

  useEffect(() => {
    if (!db) return;
    let cancelado = false;
    setVerificandoIntegridade(true);
    verificarIntegridade(db, dataInicio36m, hoje)
      .then((resultado) => {
        if (!cancelado) setIntegridade(resultado);
      })
      .finally(() => {
        if (!cancelado) setVerificandoIntegridade(false);
      });
    return () => {
      cancelado = true;
    };
  }, [db, versao, dataInicio36m, hoje]);

  const relatorioAuditoria = useMemo<RelatorioAuditoria | null>(
    () => (db ? gerarRelatorioAuditoria(db, dataInicio36m, hoje) : null),
    [db, versao, dataInicio36m, hoje],
  );

  // Não há cadastro de usuários/login nesta tela (app local, sem sessão) — a lista de
  // usuários selecionáveis vem dos próprios registros do log, não de uma tabela à parte.
  const usuariosComAcesso = useMemo(() => {
    if (!db) return [];
    return consultar<{ usuario_id: number; usuario_nome: string | null }>(
      db,
      `SELECT DISTINCT usuario_id, usuario_nome FROM auditoria_log WHERE usuario_id IS NOT NULL ORDER BY usuario_nome`,
    );
  }, [db, versao]);

  const [usuarioSelecionado, setUsuarioSelecionado] = useState<number | "">("");

  const acessosUsuario = useMemo(
    () => (db && usuarioSelecionado !== "" ? listarAcessosUsuario(db, usuarioSelecionado, 50) : []),
    [db, versao, usuarioSelecionado],
  );

  // Sem usuário selecionado: consulta geral (últimas alterações do período, já trazidas pelo
  // relatório). Com usuário selecionado: histórico específico dele via listarAcessosUsuario.
  const registrosAuditoriaExibidos: RegistroAuditoria[] =
    usuarioSelecionado === "" ? relatorioAuditoria?.ultimas_alteracoes ?? [] : acessosUsuario;

  function exportarLog(formato: "json" | "csv") {
    if (!db) return;
    const conteudo = exportarLogAuditoria(db, dataInicio36m, hoje, formato);
    if (!conteudo) return;
    const tipoMime = formato === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8";
    const blob = new Blob([formato === "csv" ? "﻿" + conteudo : conteudo], { type: tipoMime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `log-auditoria_${dataInicio36m}_a_${hoje}.${formato}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h2 className="section-title">Auditoria forense local</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 20 }}>
        Verificações estatísticas que rodam inteiramente no navegador, sem IA paga — o mesmo tipo de teste que
        ferramentas de auditoria (IDEA/ACL) e perícia forense usam para achar padrão fora do esperado em centenas de
        lançamentos: duplicidade, valor fora da curva da própria categoria, mês sem lançamento numa despesa recorrente
        e aderência à Lei de Benford.
      </p>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="section-title"><CopyCheck size={14} /> Possíveis duplicidades ({duplicatas.length})</div>
          {duplicatas.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Nenhum par de lançamentos idênticos (mesma conta, data, valor e descrição) encontrado.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Data</th><th>Descrição</th><th className="num">Valor</th><th className="num">Ocorrências</th><th></th></tr></thead>
                <tbody>
                  {duplicatas.map((d, i) => (
                    <tr key={i}>
                      <td>{d.data}</td>
                      <td>{d.descricao_original}</td>
                      <td className="num">{formatarMoeda(d.valor)}</td>
                      <td className="num"><span className="pill critical">{d.ocorrencias}×</span></td>
                      <td>{aoDrillDown && <BotaoVerTransacoes onClick={() => aoDrillDown({ transacaoIds: d.transacaoIds })} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-title"><CalendarX2 size={14} /> Lacunas em despesas recorrentes ({lacunas.length})</div>
          {lacunas.length === 0 ? (
            <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Nenhum mês faltante em condomínio/IPTU ou financiamento dentro da janela de 36 meses.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflowY: "auto" }}>
              {lacunas.map((l, i) => (
                <div key={i} style={{ fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span><strong>{l.imovelApelido}</strong> · {l.planoContaCodigo} — faltam: {l.mesesFaltantes.join(", ")}</span>
                  {aoDrillDown && (
                    <BotaoVerTransacoes
                      onClick={() => aoDrillDown({ planoContaCodigo: l.planoContaCodigo, imovelId: l.imovelId, dataInicio: dataInicio36m, dataFim: hoje })}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title"><TrendingUp size={14} /> Outliers estatísticos por categoria ({outliers.length})</div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 10 }}>
          Lançamentos com valor a mais de 3 desvios-padrão da média da própria categoria (janela de 36 meses,
          categorias com pelo menos 11 lançamentos — abaixo disso o teste é matematicamente incapaz de sinalizar
          qualquer outlier, não importa o quão extremo seja o valor, então a categoria simplesmente não é testada).
        </p>
        {outliers.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>
            Nenhum outlier encontrado nas categorias com volume suficiente para o teste — categorias com menos
            lançamentos não foram testadas (não é o mesmo que "testadas e aprovadas").
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th className="num">Valor</th><th className="num">Média da categoria</th><th className="num">Z-score</th><th></th></tr></thead>
              <tbody>
                {outliers.map((o) => (
                  <tr key={o.transacaoId}>
                    <td>{o.data}</td>
                    <td>{o.descricao}</td>
                    <td>{o.planoContaCodigo}</td>
                    <td className="num">{formatarMoeda(o.valor)}</td>
                    <td className="num">{formatarMoeda(o.mediaCategoria)}</td>
                    <td className="num"><span className="pill warning">{o.zScore.toFixed(1)}</span></td>
                    <td>{aoDrillDown && <BotaoVerTransacoes onClick={() => aoDrillDown({ transacaoIds: [o.transacaoId] })} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title"><Link2Off size={14} /> Consistência entre módulos ({caucoesSemTransacao.length + transacoesCaucaoSemRegistro.length + financiamentosSemLancamento.length})</div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>
          Cruza o cadastro formal (caução, financiamento) contra a transação bancária real correspondente — o mesmo
          fato financeiro deveria aparecer nos dois lugares. Um sem o outro é sinal de documento perdido, extrato
          ainda não importado, ou cadastro que nunca foi de fato cumprido.
        </p>
        {caucoesSemTransacao.length === 0 && transacoesCaucaoSemRegistro.length === 0 && financiamentosSemLancamento.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Nenhuma inconsistência encontrada entre cadastros e transações.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {caucoesSemTransacao.length > 0 && (
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                  Cauções cadastradas sem depósito correspondente no extrato ({caucoesSemTransacao.length})
                </div>
                {caucoesSemTransacao.map((c) => (
                  <div key={c.caucaoId} style={{ fontSize: 13, marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span>
                      <strong>{c.imovelApelido}</strong> · {c.locatario} — {formatarMoeda(c.valorInicial)} em {c.dataDeposito}
                      <span className="pill warning" style={{ marginLeft: 8 }}>sem lançamento em ±30 dias</span>
                    </span>
                    {aoDrillDown && (
                      <BotaoVerTransacoes
                        // detectarCaucoesSemTransacao não tem filtro de data (escaneia cauções de qualquer
                        // época) — a busca aqui precisa cobrir pelo menos a data real do depósito, não só
                        // os últimos 36 meses, senão uma caução mais antiga vira "sem nada por perto" só
                        // porque a janela do drill-down nunca incluiu o período certo.
                        onClick={() => aoDrillDown({ planoContaCodigo: "9.0.02", imovelId: c.imovelId, dataInicio: c.dataDeposito < dataInicio36m ? c.dataDeposito : dataInicio36m, dataFim: hoje })}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            {transacoesCaucaoSemRegistro.length > 0 && (
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                  Transações de caução sem registro formal em Cadastros ({transacoesCaucaoSemRegistro.length})
                </div>
                {transacoesCaucaoSemRegistro.map((t) => (
                  <div key={t.transacaoId} style={{ fontSize: 13, marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span>
                      <strong>{t.imovelApelido}</strong> — {formatarMoeda(t.valor)} em {t.data}
                      <span className="pill warning" style={{ marginLeft: 8 }}>sem caução cadastrada em ±30 dias</span>
                    </span>
                    {aoDrillDown && <BotaoVerTransacoes onClick={() => aoDrillDown({ transacaoIds: [t.transacaoId] })} />}
                  </div>
                ))}
              </div>
            )}
            {financiamentosSemLancamento.length > 0 && (
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                  Financiamentos sem nenhuma parcela lançada nas transações ({financiamentosSemLancamento.length})
                </div>
                {financiamentosSemLancamento.map((f) => (
                  <div key={f.financiamentoId} style={{ fontSize: 13, marginBottom: 4 }}>
                    <strong>{f.imovelApelido}</strong> · {f.instituicao} — contrato de {f.dataContrato}
                    <span className="pill critical" style={{ marginLeft: 8 }}>lucro do imóvel pode estar superestimado no DRE</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">Lei de Benford — despesas de valor variável</div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 10 }}>
          Aplicado só a manutenção, obras, prestadores e lançamentos ainda sem categoria — <strong>nunca</strong> a
          aluguel ou financiamento, cujo valor é fixado em contrato e não tem por que seguir a distribuição natural.
          {valoresVariaveis.length > 0 && (
            <>
              {" "}Amostra: {valoresVariaveis.length} lançamento(s). Desvio máximo observado:{" "}
              {(desvioBenfordMaximo * 100).toFixed(1)} pontos percentuais.
            </>
          )}
        </p>
        {valoresVariaveis.length > 0 && valoresVariaveis.length < AMOSTRA_MINIMA_BENFORD_INDICATIVA && (
          <div className="aviso-caixa" style={{ marginBottom: 10 }}>
            Amostra pequena demais ({valoresVariaveis.length} lançamento(s)) para o teste de Benford ter qualquer
            poder estatístico — o desvio percentual mostrado abaixo <strong>não é um indício confiável</strong> de
            nada com uma base tão pequena. Literatura de auditoria forense recomenda centenas de observações;
            {" "}{AMOSTRA_MINIMA_BENFORD_INDICATIVA} é só o piso abaixo do qual nem vale considerar o resultado.
          </div>
        )}
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10 }}>
          <strong>Leitura correta do teste:</strong> Benford só é um sinal confiável quando os valores cobrem várias
          ordens de grandeza (dezenas a dezenas de milhares) <strong>e</strong> a amostra tem volume suficiente (ver
          aviso acima). Nos dados de demonstração as despesas variáveis ficam todas numa faixa estreita — o desvio
          acima é esperado nesse caso e não indica nada de errado; com seus documentos reais (recibos de R$ 15 a
          obras de R$ 20.000, por exemplo, em volume suficiente), o mesmo teste passa a ser útil.
        </p>
        {benford.length > 0 && (
          <div style={{ width: "100%", height: 260, background: "var(--viz-surface)", borderRadius: 6 }}>
            <ResponsiveContainer>
              <BarChart data={benford.map((b) => ({ digito: `${b.digito}`, Observado: b.frequenciaObservada, Esperado: b.frequenciaEsperada }))}>
                <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
                <XAxis dataKey="digito" tick={{ fontSize: 11.5, fill: "var(--viz-muted)" }} axisLine={{ stroke: "var(--viz-baseline)" }} tickLine={false} />
                <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11, fill: "var(--viz-muted)" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} />
                <Legend wrapperStyle={{ fontSize: 12.5 }} />
                <Bar dataKey="Observado" fill="var(--viz-receita)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Esperado" fill="var(--viz-muted)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {benford.length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Dados insuficientes para o teste.</p>}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="section-title">Histórico de edições ({logAlteracoes.length})</div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12, maxWidth: "68ch" }}>
          Trilha de auditoria dos próprios dados cadastrais (imóveis, contratos, financiamentos, cauções) — distinta
          da auditoria forense acima, que audita os dados financeiros em si. Cada linha é um snapshot completo do
          registro antes/depois, para provar que um campo não foi alterado depois do fato, se questionado.
        </p>
        {logAlteracoes.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Nenhuma edição registrada ainda nesta instalação.</p>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Quando</th><th>Registro</th><th>Operação</th><th>O que mudou</th></tr></thead>
              <tbody>
                {logAlteracoes.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.quando).toLocaleString("pt-BR")}</td>
                    <td>{ROTULO_TABELA[l.tabela] ?? l.tabela} #{l.registro_id}</td>
                    <td>{ROTULO_OPERACAO[l.operacao] ?? l.operacao}</td>
                    <td style={{ fontSize: 12 }}>{l.resumo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="section-title">
          {integridade && !integridade.integro ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
          Log de acesso e integridade
        </div>
        <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 16 }}>
          Trilha imutável de chamadas a APIs externas (banco, fisco, open banking, gateways de pagamento) —
          cadeia de hash SHA-256 encadeado registro a registro, com assinatura HMAC para não-repudiação
          (exigência de LGPD/segurança e retenção de 7 anos). Distinta do "Histórico de edições" acima, que
          audita os cadastros; esta seção audita o próprio acesso e a integridade do log. Período: {dataInicio36m}{" "}
          a {hoje}.
        </p>

        {integridade && !integridade.integro && (
          <div className="aviso-caixa" style={{ marginBottom: 16 }}>
            <strong>ALERTA:</strong> a cadeia de hash do log de auditoria apresenta{" "}
            {integridade.registros_corrompidos} registro(s) com hash ou assinatura divergente do esperado —
            sinal de adulteração do log ou de gravação feita fora deste módulo. Verificado em{" "}
            {new Date(integridade.data_verificacao).toLocaleString("pt-BR")}.
          </div>
        )}

        <div className="kpi-grid">
          <KpiTile
            label="Integridade da cadeia"
            value={!integridade ? (verificandoIntegridade ? "verificando…" : "—") : integridade.integro ? "Íntegra" : "COMPROMETIDA"}
            variant={integridade ? (integridade.integro ? "good" : "critical") : undefined}
          />
          <KpiTile label="Registros verificados" value={integridade?.registros_verificados ?? 0} />
          <KpiTile
            label="Registros corrompidos"
            value={integridade?.registros_corrompidos ?? 0}
            variant={integridade && integridade.registros_corrompidos > 0 ? "critical" : integridade ? "good" : undefined}
          />
          <KpiTile label="Total de registros no período" value={relatorioAuditoria?.total_registros ?? 0} />
          <KpiTile label="Usuários ativos" value={relatorioAuditoria?.usuarios_ativos ?? 0} />
          <KpiTile label="IPs diferentes" value={relatorioAuditoria?.ips_diferentes ?? 0} />
          <KpiTile
            label="Erros registrados"
            value={relatorioAuditoria?.erros_registrados ?? 0}
            variant={relatorioAuditoria && relatorioAuditoria.erros_registrados > 0 ? "critical" : relatorioAuditoria ? "good" : undefined}
          />
        </div>

        {relatorioAuditoria && (Object.keys(relatorioAuditoria.operacoes_por_tipo).length > 0 || Object.keys(relatorioAuditoria.operacoes_por_modulo).length > 0) && (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13, marginBottom: 18 }}>
            {Object.keys(relatorioAuditoria.operacoes_por_tipo).length > 0 && (
              <div>
                <strong>Por tipo de operação:</strong>{" "}
                {Object.entries(relatorioAuditoria.operacoes_por_tipo).map(([tipo, n]) => `${tipo}: ${n}`).join(" · ")}
              </div>
            )}
            {Object.keys(relatorioAuditoria.operacoes_por_modulo).length > 0 && (
              <div>
                <strong>Por módulo:</strong>{" "}
                {Object.entries(relatorioAuditoria.operacoes_por_modulo).map(([modulo, n]) => `${modulo}: ${n}`).join(" · ")}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
            Usuário:
            <select
              value={usuarioSelecionado}
              onChange={(e) => setUsuarioSelecionado(e.target.value === "" ? "" : Number(e.target.value))}
              style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "5px 8px", fontSize: 13 }}
            >
              <option value="">Todos (últimas alterações do período)</option>
              {usuariosComAcesso.map((u) => (
                <option key={u.usuario_id} value={u.usuario_id}>
                  {u.usuario_nome || `Usuário #${u.usuario_id}`}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => exportarLog("json")} title="Baixar o log do período em JSON">
              <FileDown size={14} /> Exportar JSON
            </button>
            <button className="btn" onClick={() => exportarLog("csv")} title="Baixar o log do período em CSV">
              <FileDown size={14} /> Exportar CSV
            </button>
          </div>
        </div>

        {registrosAuditoriaExibidos.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>
            Nenhum registro de auditoria encontrado {usuarioSelecionado === "" ? "no período" : "para este usuário"}.
          </p>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Usuário</th>
                  <th>Módulo</th>
                  <th>Operação</th>
                  <th>Entidade</th>
                  <th>Descrição</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {registrosAuditoriaExibidos.map((r) => (
                  <tr key={r.id ?? `${r.timestamp}-${r.hash_sha256}`}>
                    <td>{new Date(r.timestamp).toLocaleString("pt-BR")}</td>
                    <td>{r.usuario_nome || (r.usuario_id ? `#${r.usuario_id}` : "—")}</td>
                    <td>{r.modulo_chamador}</td>
                    <td>{r.tipo_operacao}</td>
                    <td>{r.entidade_afetada} #{r.id_entidade}</td>
                    <td style={{ fontSize: 12 }}>{r.descricao_alteracao}</td>
                    <td>
                      <span className={`pill ${r.status === "erro" ? "critical" : r.status === "pendente" ? "warning" : "good"}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
