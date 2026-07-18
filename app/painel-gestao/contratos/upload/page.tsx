'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Upload, AlertCircle, CheckCircle, Clock, X } from 'lucide-react';

interface DadosExtraidos {
  numero_contrato?: string;
  valor_aluguel?: number;
  valor_caucao?: number;
  valor_taxa_condominio?: number;
  valor_iptu?: number;
  indice_reajuste?: string;
  data_inicio?: string;
  data_fim?: string;
  nome_inquilino?: string;
  nome_proprietario?: string;
  endereco_imovel?: string;
  restricoes_importantes?: string[];
  observacoes?: string;
}

interface ResultadoAnalise {
  contrato_id: string;
  arquivo_id: string;
  analise: {
    confianca: number;
    dados_extraidos: DadosExtraidos;
    alertas: string[];
    recomendacoes: string[];
    campos_incertos: string[];
    resume_executivo: string;
  };
  conversao: {
    tipo_arquivo_original: string;
    tempo_processamento_ms: number;
  };
}

export default function PaginaUploadContrato() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imoveId, setImoveId] = useState('');
  const [numeroContrato, setNumeroContrato] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState('contrato_principal');
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAnalise | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null);

  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setArquivoSelecionado(e.target.files[0]);
      setErro(null);
    }
  };

  const handleUpload = async () => {
    if (!arquivoSelecionado || !imoveId) {
      setErro('Selecione um arquivo e um imóvel');
      return;
    }

    setCarregando(true);
    setErro(null);

    try {
      const formData = new FormData();
      formData.append('arquivo', arquivoSelecionado);
      formData.append('imovel_id', imoveId);
      formData.append('tipo_documento', tipoDocumento);
      if (numeroContrato) {
        formData.append('numero_contrato', numeroContrato);
      }

      const res = await fetch('/api/contratos/upload-analise', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao processar contrato');
      }

      const data = await res.json();
      setResultado(data);
      setArquivoSelecionado(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (erro) {
      setErro(erro instanceof Error ? erro.message : 'Erro desconhecido');
    } finally {
      setCarregando(false);
    }
  };

  const obterCorConfianca = (confianca: number) => {
    if (confianca >= 0.85) return 'bg-green-100 border-green-300';
    if (confianca >= 0.7) return 'bg-yellow-100 border-yellow-300';
    return 'bg-red-100 border-red-300';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Cabeçalho */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Upload de Contratos</h1>
              <p className="text-gray-600 mt-2">
                Envie contratos de aluguel para análise automática por IA
              </p>
            </div>
            <Link
              href="/painel-gestao/contratos"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              ← Voltar
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Formulário de Upload */}
          {!resultado && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="space-y-6">
                {/* Seleção de Imóvel */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Imóvel *
                  </label>
                  <input
                    type="text"
                    value={imoveId}
                    onChange={(e) => setImoveId(e.target.value)}
                    placeholder="ID do imóvel"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Você pode selecionar um imóvel da lista de propriedades
                  </p>
                </div>

                {/* Número do Contrato (opcional) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Número do Contrato (opcional)
                  </label>
                  <input
                    type="text"
                    value={numeroContrato}
                    onChange={(e) => setNumeroContrato(e.target.value)}
                    placeholder="Ex: 2024/001"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Tipo de Documento */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de Documento
                  </label>
                  <select
                    value={tipoDocumento}
                    onChange={(e) => setTipoDocumento(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="contrato_principal">Contrato Principal</option>
                    <option value="aditivo">Aditivo</option>
                    <option value="anexo">Anexo</option>
                    <option value="recibo">Recibo</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>

                {/* Área de Upload */}
                <div className="relative">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleSelecionarArquivo}
                    accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.txt"
                    className="hidden"
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full px-6 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition text-center cursor-pointer"
                  >
                    <Upload className="mx-auto mb-2 w-8 h-8 text-gray-400" />
                    <p className="font-medium text-gray-700">
                      {arquivoSelecionado
                        ? `✓ ${arquivoSelecionado.name}`
                        : 'Clique para selecionar ou arraste um arquivo'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      PDF, DOCX, JPG, PNG ou TXT (máx. 50MB)
                    </p>
                  </button>
                </div>

                {/* Erro */}
                {erro && (
                  <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-900">{erro}</p>
                    </div>
                  </div>
                )}

                {/* Botão Enviar */}
                <button
                  onClick={handleUpload}
                  disabled={!arquivoSelecionado || carregando}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition"
                >
                  {carregando ? (
                    <>
                      <Clock className="inline w-4 h-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    '📤 Enviar e Analisar'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Resultado da Análise */}
          {resultado && (
            <div className="space-y-6">
              {/* Resumo Executivo */}
              <div className={`rounded-lg border-2 p-6 ${obterCorConfianca(resultado.analise.confianca)}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Confiança da Análise</p>
                    <p className="text-2xl font-bold mt-1">
                      {Math.round(resultado.analise.confianca * 100)}%
                    </p>
                  </div>
                  {resultado.analise.confianca >= 0.85 ? (
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  ) : (
                    <AlertCircle className="w-8 h-8 text-yellow-600" />
                  )}
                </div>
                <p className="text-gray-700">{resultado.analise.resume_executivo}</p>
              </div>

              {/* Dados Extraídos */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Dados Extraídos</h2>

                <div className="grid grid-cols-2 gap-4">
                  {resultado.analise.dados_extraidos.numero_contrato && (
                    <div className="p-3 bg-gray-50 rounded">
                      <p className="text-xs text-gray-600 font-medium">Número do Contrato</p>
                      <p className="text-lg font-semibold text-gray-900 mt-1">
                        {resultado.analise.dados_extraidos.numero_contrato}
                      </p>
                    </div>
                  )}

                  {resultado.analise.dados_extraidos.valor_aluguel && (
                    <div className="p-3 bg-gray-50 rounded">
                      <p className="text-xs text-gray-600 font-medium">Valor do Aluguel</p>
                      <p className="text-lg font-semibold text-gray-900 mt-1">
                        R$ {resultado.analise.dados_extraidos.valor_aluguel.toFixed(2)}
                      </p>
                    </div>
                  )}

                  {resultado.analise.dados_extraidos.valor_caucao && (
                    <div className="p-3 bg-gray-50 rounded">
                      <p className="text-xs text-gray-600 font-medium">Caução</p>
                      <p className="text-lg font-semibold text-gray-900 mt-1">
                        R$ {resultado.analise.dados_extraidos.valor_caucao.toFixed(2)}
                      </p>
                    </div>
                  )}

                  {resultado.analise.dados_extraidos.indice_reajuste && (
                    <div className="p-3 bg-gray-50 rounded">
                      <p className="text-xs text-gray-600 font-medium">Índice de Reajuste</p>
                      <p className="text-lg font-semibold text-gray-900 mt-1">
                        {resultado.analise.dados_extraidos.indice_reajuste}
                      </p>
                    </div>
                  )}

                  {resultado.analise.dados_extraidos.data_inicio && (
                    <div className="p-3 bg-gray-50 rounded">
                      <p className="text-xs text-gray-600 font-medium">Início</p>
                      <p className="text-lg font-semibold text-gray-900 mt-1">
                        {new Date(resultado.analise.dados_extraidos.data_inicio).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  )}

                  {resultado.analise.dados_extraidos.data_fim && (
                    <div className="p-3 bg-gray-50 rounded">
                      <p className="text-xs text-gray-600 font-medium">Término</p>
                      <p className="text-lg font-semibold text-gray-900 mt-1">
                        {new Date(resultado.analise.dados_extraidos.data_fim).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Alertas */}
              {resultado.analise.alertas.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2 text-yellow-600" />
                    Alertas
                  </h2>
                  <ul className="space-y-2">
                    {resultado.analise.alertas.map((alerta, idx) => (
                      <li key={idx} className="flex items-start text-sm text-gray-700">
                        <span className="text-yellow-600 mr-2">⚠️</span>
                        {alerta}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recomendações */}
              {resultado.analise.recomendacoes.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                    <CheckCircle className="w-5 h-5 mr-2 text-blue-600" />
                    Recomendações
                  </h2>
                  <ul className="space-y-2">
                    {resultado.analise.recomendacoes.map((rec, idx) => (
                      <li key={idx} className="flex items-start text-sm text-gray-700">
                        <span className="text-blue-600 mr-2">💡</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Campos com Baixa Confiança */}
              {resultado.analise.campos_incertos.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Campos Que Precisam Validação</h2>
                  <p className="text-sm text-gray-600 mb-3">
                    Os seguintes campos foram detectados com baixa confiança e precisam ser validados manualmente:
                  </p>
                  <ul className="space-y-2">
                    {resultado.analise.campos_incertos.map((campo, idx) => (
                      <li key={idx} className="flex items-center text-sm text-gray-700">
                        <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                        {campo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="flex gap-3">
                <Link
                  href={`/painel-gestao/contratos/${resultado.contrato_id}/validar`}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg transition text-center"
                >
                  ✓ Validar e Salvar
                </Link>
                <button
                  onClick={() => setResultado(null)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-3 rounded-lg transition"
                >
                  + Enviar Outro Contrato
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
