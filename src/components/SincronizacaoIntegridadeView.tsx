import { useMemo } from "react";
import { useDb } from "../db/useDb";
import { verificarIntegridade, reconciliarAlugueis } from "../domain/erp/sincronizacao-integridade";
import { AlertTriangle, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import { KpiTile } from "./KpiTile";

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

export function SincronizacaoIntegridadeView() {
  const { db } = useDb();

  // Verificar integridade
  const relatorioIntegridade = useMemo(() => {
    if (!db) return null;
    return verificarIntegridade(db);
  }, [db]);

  // Reconciliar aluguéis
  const reconciliacao = useMemo(() => {
    if (!db) return null;
    return reconciliarAlugueis(db);
  }, [db]);

  if (!db || !relatorioIntegridade || !reconciliacao) {
    return (
      <div className="p-4 text-center">
        <p>Carregando verificação de integridade...</p>
      </div>
    );
  }

  const statusIcon = {
    ok: <CheckCircle className="w-6 h-6 text-green-600" />,
    alerta: <AlertCircle className="w-6 h-6 text-yellow-600" />,
    erro: <XCircle className="w-6 h-6 text-red-600" />,
  };

  const statusColor = {
    ok: "bg-green-50 border-green-200",
    alerta: "bg-yellow-50 border-yellow-200",
    erro: "bg-red-50 border-red-200",
  };

  const statusText = {
    ok: "Sistema OK",
    alerta: "Alertas detectados",
    erro: "Erros críticos",
  };

  const divergenciaCores = {
    info: "bg-blue-50 border-blue-200",
    aviso: "bg-yellow-50 border-yellow-200",
    critico: "bg-red-50 border-red-200",
  };

  const divergenciaIcones = {
    info: <AlertCircle className="w-4 h-4 text-blue-600" />,
    aviso: <AlertTriangle className="w-4 h-4 text-yellow-600" />,
    critico: <XCircle className="w-4 h-4 text-red-600" />,
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Sincronização e Integridade</h2>

      {/* Status Geral */}
      <div
        className={`border rounded p-4 ${statusColor[relatorioIntegridade.status]} flex items-center gap-3`}
      >
        {statusIcon[relatorioIntegridade.status]}
        <div>
          <p className="font-bold text-lg">{statusText[relatorioIntegridade.status]}</p>
          <p className="text-sm">
            Verificação realizada em{" "}
            {new Date(relatorioIntegridade.data_verificacao).toLocaleString("pt-BR")}
          </p>
        </div>
      </div>

      {/* KPIs de Integridade */}
      <div className="kpi-grid">
        <KpiTile
          label="Períodos Abertos"
          value={String(relatorioIntegridade.periodos_abertos)}
          variant={relatorioIntegridade.periodos_abertos <= 1 ? "good" : "critical"}
        />
        <KpiTile
          label="Lançamentos Pendentes"
          value={String(relatorioIntegridade.transacoes_pendentes_auditoria)}
          variant={
            relatorioIntegridade.transacoes_pendentes_auditoria < 50
              ? "good"
              : "critical"
          }
        />
        <KpiTile
          label="Discrepâncias"
          value={String(relatorioIntegridade.discrepancias.length)}
          variant={
            relatorioIntegridade.discrepancias.length === 0 ? "good" : "critical"
          }
        />
      </div>

      {/* Discrepâncias */}
      <div className="bg-white rounded border">
        <div className="p-4 border-b font-bold">
          {relatorioIntegridade.discrepancias.length === 0
            ? "Nenhuma discrepância encontrada"
            : `${relatorioIntegridade.discrepancias.length} discrepância(s) encontrada(s)`}
        </div>
        {relatorioIntegridade.discrepancias.length > 0 && (
          <div className="space-y-2 p-4">
            {relatorioIntegridade.discrepancias.map((disc, idx) => (
              <div key={idx} className={`border rounded p-3 ${divergenciaCores[disc.severidade]}`}>
                <div className="flex items-start gap-2">
                  {divergenciaIcones[disc.severidade]}
                  <div className="flex-1">
                    <p className="font-semibold">{disc.descricao}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Módulo: {disc.modulo_afetado} | Tipo: {disc.tipo}
                    </p>
                    {Object.keys(disc.dados).length > 0 && (
                      <div className="text-xs mt-2 space-y-1">
                        {Object.entries(disc.dados).map(([key, value]) => (
                          <p key={key}>
                            <span className="font-mono text-gray-600">{key}:</span>{" "}
                            {typeof value === "number" && value > 100 && value < 1000000
                              ? formatarMoeda(value)
                              : String(value)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ações Recomendadas */}
      {relatorioIntegridade.resumo_acoes_recomendadas.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded p-4">
          <p className="font-bold text-blue-900 mb-2">Ações Recomendadas:</p>
          <ul className="space-y-1">
            {relatorioIntegridade.resumo_acoes_recomendadas.map((acao, idx) => (
              <li key={idx} className="text-sm text-blue-800 flex items-start gap-2">
                <span className="text-blue-600 mt-1">•</span>
                <span>{acao}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reconciliação de Aluguéis */}
      <div className="bg-white rounded border">
        <div className="p-4 border-b font-bold">Reconciliação de Aluguéis</div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="border rounded p-3">
              <p className="text-xs text-gray-600">Valor Esperado (Contratos)</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatarMoeda(reconciliacao.valor_esperado)}
              </p>
            </div>
            <div className="border rounded p-3">
              <p className="text-xs text-gray-600">Valor Recebido (Ledger)</p>
              <p className="text-2xl font-bold text-green-600">
                {formatarMoeda(reconciliacao.valor_recebido)}
              </p>
            </div>
          </div>

          <div
            className={`border rounded p-3 ${
              Math.abs(reconciliacao.valor_esperado - reconciliacao.valor_recebido) < 1
                ? "bg-green-50 border-green-200"
                : "bg-yellow-50 border-yellow-200"
            }`}
          >
            <p className="text-xs text-gray-600">Diferença Total</p>
            <p
              className={`text-2xl font-bold ${
                Math.abs(reconciliacao.valor_esperado - reconciliacao.valor_recebido) < 1
                  ? "text-green-600"
                  : "text-yellow-600"
              }`}
            >
              {formatarMoeda(reconciliacao.valor_esperado - reconciliacao.valor_recebido)}
            </p>
          </div>

          {reconciliacao.divergencias.length > 0 && (
            <div className="mt-4">
              <p className="font-semibold mb-2">Imóveis com Divergências:</p>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-left">Imóvel</th>
                    <th className="border p-2 text-right">Contrato</th>
                    <th className="border p-2 text-right">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliacao.divergencias.slice(0, 10).map((div, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? "bg-gray-50" : ""}>
                      <td className="border p-2">Imóvel {div.imovel_id}</td>
                      <td className="border p-2 text-right">{div.contrato_id}</td>
                      <td className="border p-2 text-right font-semibold text-red-600">
                        {formatarMoeda(div.diferenca)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reconciliacao.divergencias.length > 10 && (
                <p className="text-xs text-gray-600 mt-2">
                  ... e mais {reconciliacao.divergencias.length - 10} divergência(s)
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Informações Técnicas */}
      <div className="bg-gray-50 rounded border p-3 text-xs">
        <p className="font-semibold mb-2">Informações Técnicas:</p>
        <ul className="space-y-1 text-gray-700">
          <li>
            <span className="font-mono">Status da Verificação:</span> {relatorioIntegridade.status}
          </li>
          <li>
            <span className="font-mono">Períodos Abertos:</span>{" "}
            {relatorioIntegridade.periodos_abertos}
          </li>
          <li>
            <span className="font-mono">Lançamentos Pendentes Auditoria:</span>{" "}
            {relatorioIntegridade.transacoes_pendentes_auditoria}
          </li>
          <li>
            <span className="font-mono">Total de Discrepâncias:</span>{" "}
            {relatorioIntegridade.discrepancias.length}
          </li>
          <li>
            <span className="font-mono">Críticas:</span>{" "}
            {relatorioIntegridade.discrepancias.filter((d) => d.severidade === "critico").length}
          </li>
        </ul>
      </div>
    </div>
  );
}
