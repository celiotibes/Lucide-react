'use client';

import { useState } from 'react';
import { exportarRelatorioBi } from '@/app/actions/bi/exportarRelatorios';
import { Download, FileText, BarChart3, AlertCircle, CheckCircle2 } from 'lucide-react';

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

  const icones: Record<FormatoRelatorio, string> = {
    dashboard: '📊',
    dre: '📈',
    apontamentos: '⏱️',
    despesas: '💰',
    residenciais: '🏠',
    prestadores: '👨‍💼',
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8 animate-slideDown">
          <h1 className="text-4xl font-bold text-slate-100 mb-2">Exportação de Relatórios</h1>
          <p className="text-slate-400">Gere e exporte relatórios em PDF, Excel ou CSV com dados em tempo real</p>
        </div>

        {/* Mensagem */}
        {mensagem && (
          <div
            className={`mb-6 p-4 rounded-xl glass border-2 flex items-start gap-3 animate-slideDown ${
              mensagem.tipo === 'sucesso'
                ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10'
                : 'border-rose-500/30 bg-gradient-to-r from-rose-500/10 to-orange-500/10'
            }`}
          >
            {mensagem.tipo === 'sucesso' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400 mt-0.5" />
            )}
            <p
              className={
                mensagem.tipo === 'sucesso' ? 'text-emerald-300' : 'text-rose-300'
              }
            >
              {mensagem.texto}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Painel de Configuração */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tipo de Relatório */}
            <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl animate-slideDown" style={{animationDelay: '100ms'}}>
              <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
                <span className="w-1 h-6 bg-gradient-to-b from-cyan-500 to-blue-500 rounded-full" />
                Tipo de Relatório
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(descricoes).map(([chave, descricao], idx) => (
                  <button
                    key={chave}
                    onClick={() => setFormato(chave as FormatoRelatorio)}
                    className={`p-4 rounded-lg border-2 transition-all duration-300 text-left group stagger-item ${
                      formato === chave
                        ? 'glass border-cyan-500/50 bg-gradient-to-r from-cyan-500/10 to-blue-500/10'
                        : 'border-slate-700/50 hover:border-cyan-500/30 bg-slate-800/20'
                    }`}
                    style={{animationDelay: `${idx * 50}ms`}}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{icones[chave as FormatoRelatorio]}</span>
                      <div>
                        <p className="font-semibold text-slate-100 capitalize group-hover:text-cyan-400 transition-colors">{chave}</p>
                        <p className="text-xs text-slate-400 mt-1">{descricao}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Formato de Arquivo */}
            <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl animate-slideDown" style={{animationDelay: '150ms'}}>
              <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
                <span className="w-1 h-6 bg-gradient-to-b from-purple-500 to-pink-500 rounded-full" />
                Formato de Exportação
              </h2>
              <div className="flex gap-3 flex-wrap">
                {(['pdf', 'excel', 'csv'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTipo(t)}
                    className={`px-6 py-2 rounded-lg border-2 transition-all font-medium ${
                      tipo === t
                        ? 'glass border-cyan-500/50 bg-gradient-to-r from-cyan-600 to-blue-600 text-white'
                        : 'border-slate-700/50 text-slate-300 hover:border-cyan-500/30 hover:bg-slate-800/30'
                    }`}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Período */}
            <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl animate-slideDown" style={{animationDelay: '200ms'}}>
              <h2 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
                <span className="w-1 h-6 bg-gradient-to-b from-emerald-500 to-cyan-500 rounded-full" />
                Período
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Data Início
                  </label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Data Fim
                  </label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Botão Gerar */}
            <button
              onClick={gerarRelatorio}
              disabled={processando}
              className="w-full px-6 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed animate-slideDown"
              style={{animationDelay: '250ms'}}
            >
              <Download className="w-5 h-5" />
              {processando ? 'Gerando...' : `Gerar e Baixar ${tipo.toUpperCase()}`}
            </button>
          </div>

          {/* Informações */}
          <div className="space-y-6">
            {/* Card de Formatos */}
            <div className="glass rounded-xl p-6 border-2 border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 backdrop-blur-xl hover-lift animate-slideDown" style={{animationDelay: '300ms'}}>
              <div className="flex items-start gap-3 mb-4">
                <FileText className="w-6 h-6 text-cyan-400 flex-shrink-0" />
                <h3 className="font-semibold text-slate-100">Formatos Suportados</h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">✓</span>
                  <span><strong>PDF</strong> - Pronto para impressão com tabelas formatadas</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">✓</span>
                  <span><strong>Excel</strong> - Compatível com Microsoft Excel e LibreOffice</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">✓</span>
                  <span><strong>CSV</strong> - Formato universal para processamento</span>
                </li>
              </ul>
            </div>

            {/* Card de Últimos Relatórios */}
            <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift animate-slideDown" style={{animationDelay: '350ms'}}>
              <h3 className="font-semibold text-slate-100 mb-3">Últimos Relatórios</h3>
              <p className="text-sm text-slate-400">
                Nenhum relatório gerado recentemente. Use o formulário ao lado para gerar um novo.
              </p>
            </div>

            {/* Card de Dicas */}
            <div className="glass rounded-xl p-6 border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/10 backdrop-blur-xl animate-slideDown" style={{animationDelay: '400ms'}}>
              <h3 className="font-semibold text-slate-100 mb-3">Dicas</h3>
              <ul className="text-sm text-slate-300 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400">→</span>
                  <span>Selecione o período desejado</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400">→</span>
                  <span>Escolha o formato de saída</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400">→</span>
                  <span>Clique em Gerar para baixar</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
