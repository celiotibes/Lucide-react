'use client';

import { useState } from 'react';
import { exportarRelatorioBi } from '@/app/actions/bi/exportarRelatorios';
import { Download, FileText, BarChart3, AlertCircle } from 'lucide-react';

type FormatoRelatorio =
  | 'dashboard'
  | 'dre'
  | 'apontamentos'
  | 'despesas'
  | 'residenciais'
  | 'prestadores';

export default function PaginaRelatorios() {
  const [formato, setFormato] = useState<FormatoRelatorio>('dashboard');
  const [tipo, setTipo] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  const [dataInicio, setDataInicio] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState<string>(
    () => new Date().toISOString().split('T')[0]
  );
  const [processando, setProcessando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  async function gerarRelatorio() {
    setProcessando(true);
    setMensagem(null);

    try {
      const resultado = await exportarRelatorioBi({
        tipo,
        formato,
        dataInicio,
        dataFim,
      });

      if (resultado.sucesso && resultado.url) {
        // Criar link de download
        const link = document.createElement('a');
        link.href = resultado.url;
        link.download = resultado.nomeArquivo || `relatorio_${formato}_${Date.now()}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setMensagem({
          tipo: 'sucesso',
          texto: `Relatório ${formato} exportado com sucesso!`,
        });
      } else {
        setMensagem({
          tipo: 'erro',
          texto: resultado.erro || 'Erro ao gerar relatório',
        });
      }
    } finally {
      setProcessando(false);
    }
  }

  const descricoes: Record<FormatoRelatorio, string> = {
    dashboard: 'Dashboard executivo com KPIs principais',
    dre: 'Demonstração de Resultado do Exercício (Waterfall)',
    apontamentos: 'Detalhamento de horas apontadas',
    despesas: 'Análise de despesas e OCR',
    residenciais: 'Performance por residencial/imóvel',
    prestadores: 'Performance por prestador',
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Exportação de Relatórios</h1>
          <p className="text-gray-600">Gere e exporte relatórios em PDF, Excel ou CSV</p>
        </div>

        {/* Mensagem */}
        {mensagem && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
              mensagem.tipo === 'sucesso'
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <AlertCircle
              className={`w-5 h-5 flex-shrink-0 ${
                mensagem.tipo === 'sucesso' ? 'text-green-600' : 'text-red-600'
              }`}
            />
            <p
              className={mensagem.tipo === 'sucesso' ? 'text-green-700' : 'text-red-700'}
            >
              {mensagem.texto}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Painél de Configuração */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6 space-y-6">
              {/* Tipo de Relatório */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Tipo de Relatório
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(descricoes).map(([chave, descricao]) => (
                    <button
                      key={chave}
                      onClick={() => setFormato(chave as FormatoRelatorio)}
                      className={`p-4 rounded-lg border-2 transition text-left ${
                        formato === chave
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
                        <div>
                          <p className="font-semibold text-gray-900 capitalize">{chave}</p>
                          <p className="text-sm text-gray-600">{descricao}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Formato de Arquivo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Formato de Exportação
                </label>
                <div className="flex gap-3">
                  {(['pdf', 'excel', 'csv'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTipo(t)}
                      className={`px-4 py-2 rounded-lg border-2 transition font-medium ${
                        tipo === t
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-300 text-gray-700 hover:border-blue-600'
                      }`}
                    >
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Período */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Início
                  </label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data Fim
                  </label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Botão Gerar */}
              <button
                onClick={gerarRelatorio}
                disabled={processando}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                {processando ? 'Gerando...' : `Gerar e Baixar ${tipo.toUpperCase()}`}
              </button>
            </div>
          </div>

          {/* Informações */}
          <div className="space-y-6">
            {/* Card de Info */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow p-6 border border-blue-200">
              <div className="flex items-start gap-3 mb-4">
                <FileText className="w-6 h-6 text-blue-600 flex-shrink-0" />
                <h3 className="font-semibold text-gray-900">Formatos Suportados</h3>
              </div>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>
                  <strong>PDF</strong> - Pronto para impressão com tabelas formatadas
                </li>
                <li>
                  <strong>Excel</strong> - Compatível com Microsoft Excel e LibreOffice
                </li>
                <li>
                  <strong>CSV</strong> - Formato universal para processamento
                </li>
              </ul>
            </div>

            {/* Card de Relatórios Recentes */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Últimos Relatórios</h3>
              <p className="text-sm text-gray-600">
                Nenhum relatório gerado recentemente. Use o formulário ao lado para gerar um novo.
              </p>
            </div>

            {/* Card de Suporte */}
            <div className="bg-gray-100 rounded-lg p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Dicas</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>✓ Selecione o período desejado</li>
                <li>✓ Escolha o formato de saída</li>
                <li>✓ Clique em Gerar para baixar</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
