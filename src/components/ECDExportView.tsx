import { useMemo, useState } from "react";
import { useDb } from "../db/useDb";
import { gerarExportacaoECD, exportarECDComoCsv, exportarECDComoTxt } from "../domain/erp/ecd-export";
import { CheckCircle, AlertTriangle, Download, FileText } from "lucide-react";
import { KpiTile } from "./KpiTile";

export function ECDExportView() {
  const { db } = useDb();
  const [nomeContador, setNomeContador] = useState("Contador Responsável");
  const [cpfContador, setCpfContador] = useState("000.000.000-00");

  const relatorioECD = useMemo(() => {
    if (!db) return null;
    return gerarExportacaoECD(db, 1, 1, nomeContador, cpfContador);
  }, [db, nomeContador, cpfContador]);

  const exportarArquivo = (formato: "csv" | "txt") => {
    if (!relatorioECD) return;

    const conteudo = formato === "csv" ? exportarECDComoCsv(relatorioECD) : exportarECDComoTxt(relatorioECD);

    const blob = new Blob([conteudo], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ECD_${relatorioECD.cnpj_contribuinte.replace(/[/.-]/g, "")}_${relatorioECD.periodo.replace("/", "")}.${formato}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!db || !relatorioECD) {
    return (
      <div className="p-4 text-center">
        <p>Carregando dados para exportação ECD...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Exportação ECD (Escrituração Contábil Digital)</h2>
        <span className="text-xs text-gray-500">Compliance fiscal SPED</span>
      </div>

      {/* Status de balanceamento */}
      <div
        className={`border rounded p-4 flex items-start gap-3 ${
          relatorioECD.balanceado
            ? "bg-green-50 border-green-200"
            : "bg-yellow-50 border-yellow-200"
        }`}
      >
        {relatorioECD.balanceado ? (
          <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
        )}
        <div>
          <p className={`font-bold ${relatorioECD.balanceado ? "text-green-900" : "text-yellow-900"}`}>
            {relatorioECD.balanceado ? "Diário Balanceado" : "Diário Desbalanceado"}
          </p>
          <p className={`text-sm mt-1 ${relatorioECD.balanceado ? "text-green-800" : "text-yellow-800"}`}>
            Débitos: R$ {relatorioECD.total_debitos.toFixed(2)} | Créditos: R$ {relatorioECD.total_creditos.toFixed(2)}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <KpiTile
          label="Total de Lançamentos"
          value={String(relatorioECD.total_lancamentos)}
        />
        <KpiTile
          label="Total Débitos"
          value={`R$ ${relatorioECD.total_debitos.toFixed(2)}`}
        />
        <KpiTile
          label="Total Créditos"
          value={`R$ ${relatorioECD.total_creditos.toFixed(2)}`}
        />
        <KpiTile
          label="Status"
          value={relatorioECD.balanceado ? "✓ OK" : "⚠️ Verificar"}
          variant={relatorioECD.balanceado ? "good" : "critical"}
        />
      </div>

      {/* Avisos e informações */}
      {relatorioECD.avisos.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
          <p className="font-bold text-yellow-900 mb-2">Avisos de Conformidade:</p>
          <ul className="space-y-1">
            {relatorioECD.avisos.map((aviso, idx) => (
              <li key={idx} className="text-sm text-yellow-800 flex items-start gap-2">
                <span className="text-yellow-600 mt-1">•</span>
                <span>{aviso}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Configuração de dados */}
      <div className="bg-white rounded border p-4">
        <p className="font-bold mb-4">Dados do Contador Responsável</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nome do Contador</label>
            <input
              type="text"
              value={nomeContador}
              onChange={(e) => setNomeContador(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm"
              placeholder="Nome completo"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">CPF do Contador</label>
            <input
              type="text"
              value={cpfContador}
              onChange={(e) => setCpfContador(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm"
              placeholder="000.000.000-00"
            />
          </div>
        </div>
      </div>

      {/* Opções de exportação */}
      <div className="bg-white rounded border p-4">
        <p className="font-bold mb-4">Exportar ECD para Compliance Fiscal</p>
        <div className="space-y-3">
          <div className="bg-gray-50 rounded p-3">
            <p className="text-sm font-medium mb-2">Período: {relatorioECD.periodo}</p>
            <p className="text-sm text-gray-600 mb-3">Contribuinte: {relatorioECD.nome_contribuinte}</p>
            <div className="space-y-2">
              <button
                onClick={() => exportarArquivo("csv")}
                className="w-full flex items-center justify-between px-4 py-2 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition"
              >
                <span className="flex items-center gap-2">
                  <Download size={16} />
                  Exportar como CSV
                </span>
                <span className="text-xs text-gray-500">Para Excel/Sheets</span>
              </button>
              <button
                onClick={() => exportarArquivo("txt")}
                className="w-full flex items-center justify-between px-4 py-2 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition"
              >
                <span className="flex items-center gap-2">
                  <FileText size={16} />
                  Exportar como TXT (SPED)
                </span>
                <span className="text-xs text-gray-500">Formato padrão SPED</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Resumo técnico */}
      <div className="bg-gray-50 rounded border p-3 text-xs space-y-2">
        <p className="font-semibold">Informações Técnicas:</p>
        <div className="grid grid-cols-2 gap-2 text-gray-700">
          <p>
            <span className="font-mono text-gray-600">CNPJ:</span> {relatorioECD.cnpj_contribuinte}
          </p>
          <p>
            <span className="font-mono text-gray-600">Período:</span> {relatorioECD.periodo}
          </p>
          <p>
            <span className="font-mono text-gray-600">Data Geração:</span> {relatorioECD.data_geracao}
          </p>
          <p>
            <span className="font-mono text-gray-600">Total Registros:</span> {relatorioECD.registros.length}
          </p>
          <p>
            <span className="font-mono text-gray-600">Lançamentos:</span> {relatorioECD.total_lancamentos}
          </p>
          <p>
            <span className="font-mono text-gray-600">Balanceado:</span> {relatorioECD.balanceado ? "Sim" : "Não"}
          </p>
        </div>
      </div>

      {/* Instruções de conformidade */}
      <div className="bg-blue-50 border border-blue-200 rounded p-4">
        <p className="font-bold text-blue-900 mb-2">Conformidade Fiscal</p>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>✓ Esta exportação segue o padrão SPED da Receita Federal</li>
          <li>✓ Verifique se o diário está balanceado antes de submeter</li>
          <li>✓ Mantenha assinada a documentação do contador responsável</li>
          <li>✓ Arquivo deve ser entregue conforme prazos definidos pela RFB</li>
          <li>✓ Recomenda-se manter backup de toda a documentação</li>
        </ul>
      </div>
    </div>
  );
}
