import { useEffect, useMemo, useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Button,
  Badge,
  Input,
  Select,
  SelectItem,
} from "../ui";
import { BarChart3, RefreshCw, TrendingUp, Users, Wallet } from "lucide-react";
import { useDb } from "../../../db/useDb";
import { listarPrestadoresParaFiltro } from "../data/painelConferenciaRepo";
import {
  relatorioResumoApontamentos,
  relatorioDespesasRemuneracao,
  relatorioComparativoPrestadores,
  relatorioStatusPagamento,
  type FiltrosRelatorioApontamento,
  type ResumoApontamentos,
  type DespesasRemuneracao,
  type ComparativoPrestadores,
  type StatusPagamento,
} from "../../../domain/erp/relatorio-apontamento-real";
import { formatarMoeda } from "../../../domain/formatarMoeda";

const NOMES_RUBRICA: Record<string, string> = {
  diaria: "Diária",
  airbnb: "Airbnb",
  urgencia: "Urgência",
  deslocamento: "Deslocamento",
  materiais: "Busca de Materiais",
  extra: "Ajudante / Extra",
};

function primeiroDiaDoMes(): string {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
}

function ultimoDiaDoMes(): string {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
}

/** Aba de relatórios do Painel de Conferência, contra as tabelas reais do schema contábil
 * (apontamentos_diarios, itens_remuneraveis, movimentacoes_financeiras, fechamentos_semanais).
 * Substitui o antigo relatorios-apontamento.ts (removido — consultava tabelas fictícias, ver
 * docs/dominios-a-reconstruir.md seção 8). Self-contido: busca seu próprio recorte de dados via
 * useDb() em vez de depender do carregamento das outras abas do Painel, porque o filtro de
 * período de um relatório é tipicamente diferente do filtro de "apontamentos pendentes".
 */
const RelatoriosApontamentoTab: React.FC = () => {
  const { db, carregando: carregandoBanco } = useDb();

  const [filtros, setFiltros] = useState<FiltrosRelatorioApontamento>({
    data_inicio: primeiroDiaDoMes(),
    data_fim: ultimoDiaDoMes(),
  });
  const [prestadores, setPrestadores] = useState<{ id: number; nome: string }[]>([]);
  const [subAba, setSubAba] = useState("resumo");

  const [resumo, setResumo] = useState<ResumoApontamentos | null>(null);
  const [despesas, setDespesas] = useState<DespesasRemuneracao | null>(null);
  const [comparativo, setComparativo] = useState<ComparativoPrestadores | null>(null);
  const [statusPagamento, setStatusPagamento] = useState<StatusPagamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const gerarRelatorios = () => {
    if (!db) return;
    setErro(null);
    try {
      setPrestadores(listarPrestadoresParaFiltro(db));
      setResumo(relatorioResumoApontamentos(db, filtros));
      setDespesas(relatorioDespesasRemuneracao(db, filtros));
      setComparativo(relatorioComparativoPrestadores(db, filtros));
      setStatusPagamento(relatorioStatusPagamento(db, filtros));
    } catch (erroCapturado) {
      console.error("Erro ao gerar relatórios de apontamento:", erroCapturado);
      setErro(erroCapturado instanceof Error ? erroCapturado.message : "Erro ao gerar relatórios.");
    }
  };

  // Gera na primeira vez que o banco fica disponível; depois só sob demanda (botão), para não
  // recalcular a cada tecla digitada nos filtros de data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    gerarRelatorios();
  }, [db]);

  const rubricas = useMemo(() => (despesas ? (Object.keys(despesas.por_tipo) as (keyof typeof despesas.por_tipo)[]) : []), [despesas]);

  const carregando = carregandoBanco || !db;

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Data Início</label>
            <Input
              type="date"
              value={filtros.data_inicio || ""}
              onChange={(e) => setFiltros({ ...filtros, data_inicio: e.target.value || undefined })}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Data Fim</label>
            <Input
              type="date"
              value={filtros.data_fim || ""}
              onChange={(e) => setFiltros({ ...filtros, data_fim: e.target.value || undefined })}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Prestador</label>
            <Select
              value={filtros.prestador_id ? String(filtros.prestador_id) : ""}
              onValueChange={(valor) => setFiltros({ ...filtros, prestador_id: valor ? Number(valor) : undefined })}
            >
              <SelectItem value="">Todos os prestadores</SelectItem>
              {prestadores.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.nome}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={gerarRelatorios} disabled={carregando} className="flex items-center gap-2 w-full">
              <RefreshCw className={`w-4 h-4 ${carregando ? "animate-spin" : ""}`} />
              Gerar Relatórios
            </Button>
          </div>
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {erro}
        </div>
      )}

      <Tabs value={subAba} onValueChange={setSubAba}>
        <TabsList className="grid w-full grid-cols-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <TabsTrigger value="resumo">
            <span className="flex items-center gap-1 justify-center">
              <BarChart3 className="w-4 h-4" /> Resumo
            </span>
          </TabsTrigger>
          <TabsTrigger value="despesas">
            <span className="flex items-center gap-1 justify-center">
              <Wallet className="w-4 h-4" /> Despesas por Rubrica
            </span>
          </TabsTrigger>
          <TabsTrigger value="comparativo">
            <span className="flex items-center gap-1 justify-center">
              <Users className="w-4 h-4" /> Comparativo
            </span>
          </TabsTrigger>
          <TabsTrigger value="status_pagamento">
            <span className="flex items-center gap-1 justify-center">
              <TrendingUp className="w-4 h-4" /> Status de Pagamento
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Resumo de Apontamentos */}
        <TabsContent value="resumo" className="mt-6">
          {resumo && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <CardMetrica titulo="Prestadores Ativos" valor={String(resumo.prestadores_ativos)} />
                <CardMetrica titulo="Total de Apontamentos" valor={String(resumo.total_apontamentos)} />
                <CardMetrica titulo="Horas Apontadas" valor={`${resumo.horas_totais.toFixed(2)} h`} />
                <CardMetrica titulo="Valor Total" valor={formatarMoeda(resumo.valor_total_geral)} />
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-700/50">
                      <TableRow>
                        <TableHead>Prestador</TableHead>
                        <TableHead className="text-right">Apontamentos</TableHead>
                        <TableHead className="text-right">Horas</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {resumo.por_prestador.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-slate-600 dark:text-slate-400">
                            Nenhum apontamento no período selecionado
                          </TableCell>
                        </TableRow>
                      ) : (
                        resumo.por_prestador.map((p) => (
                          <TableRow key={p.prestador_id}>
                            <TableCell className="font-medium">{p.prestador_nome}</TableCell>
                            <TableCell className="text-right">{p.total_apontamentos}</TableCell>
                            <TableCell className="text-right">{p.horas_apontadas.toFixed(2)} h</TableCell>
                            <TableCell className="text-right font-semibold text-green-600 dark:text-green-400">
                              {formatarMoeda(p.valor_total)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {(Object.keys(p.por_status) as (keyof typeof p.por_status)[])
                                  .filter((s) => p.por_status[s] > 0)
                                  .map((s) => (
                                    <Badge key={s} variant="secondary">
                                      {s}: {p.por_status[s]}
                                    </Badge>
                                  ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Despesas de Remuneração */}
        <TabsContent value="despesas" className="mt-6">
          {despesas && (
            <div className="space-y-4">
              <CardMetrica titulo="Total Geral no Período" valor={formatarMoeda(despesas.total_geral)} />

              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-700/50">
                      <TableRow>
                        <TableHead>Rubrica</TableHead>
                        <TableHead className="text-right">Quantidade</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">% do Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rubricas.map((rubrica) => {
                        const dados = despesas.por_tipo[rubrica];
                        return (
                          <TableRow key={rubrica}>
                            <TableCell className="font-medium">{NOMES_RUBRICA[rubrica] ?? rubrica}</TableCell>
                            <TableCell className="text-right">{dados.quantidade}</TableCell>
                            <TableCell className="text-right">{formatarMoeda(dados.valor)}</TableCell>
                            <TableCell className="text-right">{dados.percentual.toFixed(1)}%</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Comparativo entre Prestadores */}
        <TabsContent value="comparativo" className="mt-6">
          {comparativo && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <CardMetrica titulo="Mais Ativo" valor={comparativo.agregados.prestador_mais_ativo?.nome ?? "—"} />
                <CardMetrica titulo="Maior Valor Total" valor={comparativo.agregados.prestador_maior_valor?.nome ?? "—"} />
                <CardMetrica titulo="Maior Valor/Hora" valor={comparativo.agregados.prestador_maior_valor_hora?.nome ?? "—"} />
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-700/50">
                      <TableRow>
                        <TableHead>Prestador</TableHead>
                        <TableHead className="text-right">Apontamentos</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                        <TableHead className="text-right">Valor Médio</TableHead>
                        <TableHead className="text-right">Valor/Hora</TableHead>
                        <TableHead className="text-right">% Retificado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparativo.prestadores.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center text-slate-600 dark:text-slate-400">
                            Nenhum prestador com apontamentos no período
                          </TableCell>
                        </TableRow>
                      ) : (
                        comparativo.prestadores.map((p) => (
                          <TableRow key={p.prestador_id}>
                            <TableCell className="font-medium">{p.prestador_nome}</TableCell>
                            <TableCell className="text-right">{p.total_apontamentos}</TableCell>
                            <TableCell className="text-right">{formatarMoeda(p.valor_total)}</TableCell>
                            <TableCell className="text-right">{formatarMoeda(p.valor_medio_apontamento)}</TableCell>
                            <TableCell className="text-right">
                              {p.valor_por_hora === null ? "—" : formatarMoeda(p.valor_por_hora)}
                            </TableCell>
                            <TableCell className="text-right">{p.taxa_retificacao.toFixed(1)}%</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Status de Pagamento (fechamentos + movimentações) */}
        <TabsContent value="status_pagamento" className="mt-6">
          {statusPagamento && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CardMetrica
                  titulo="Pendente de Pagamento (Fechamentos)"
                  valor={formatarMoeda(statusPagamento.totalizadores.valor_pendente_pagamento_total)}
                />
                <CardMetrica
                  titulo="Pendente de Aprovação (Movimentações)"
                  valor={formatarMoeda(statusPagamento.totalizadores.valor_pendente_aprovacao_total)}
                />
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-700/50">
                      <TableRow>
                        <TableHead>Prestador</TableHead>
                        <TableHead className="text-right">Valor Líquido (Fechamentos)</TableHead>
                        <TableHead className="text-right">Pendente de Pagamento</TableHead>
                        <TableHead className="text-right">Pendente de Aprovação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statusPagamento.prestadores.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="h-24 text-center text-slate-600 dark:text-slate-400">
                            Nenhum fechamento ou movimentação no período
                          </TableCell>
                        </TableRow>
                      ) : (
                        statusPagamento.prestadores.map((p) => (
                          <TableRow key={p.prestador_id}>
                            <TableCell className="font-medium">{p.prestador_nome}</TableCell>
                            <TableCell className="text-right">{formatarMoeda(p.fechamentos.valor_liquido_total)}</TableCell>
                            <TableCell className="text-right text-amber-600 dark:text-amber-400 font-semibold">
                              {formatarMoeda(p.fechamentos.valor_pendente_pagamento)}
                            </TableCell>
                            <TableCell className="text-right text-amber-600 dark:text-amber-400 font-semibold">
                              {formatarMoeda(p.movimentacoes.valor_pendente_aprovacao)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

function CardMetrica({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700">
      <p className="text-sm text-slate-600 dark:text-slate-400">{titulo}</p>
      <p className="text-xl font-bold text-slate-900 dark:text-white">{valor}</p>
    </div>
  );
}

export default RelatoriosApontamentoTab;
