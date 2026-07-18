'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, AlertCircle, Save, X, ArrowLeft } from 'lucide-react';

interface DadosExtraidos {
  numero_contrato?: string;
  valor_aluguel?: number;
  valor_caucao?: number;
  valor_taxa_condominio?: number;
  valor_iptu?: number;
  valor_seguro?: number;
  valor_agua_esgoto?: number;
  valor_luz?: number;
  valor_outras_despesas?: number;
  indice_reajuste?: string;
  percentual_reajuste?: number;
  data_inicio?: string;
  data_fim?: string;
  periodo_reajuste?: string;
  nome_inquilino?: string;
  nome_proprietario?: string;
  endereco_imovel?: string;
  restricoes_importantes?: string[];
  multa_rescisoria?: number;
  taxa_adm?: number;
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
}

export default function PaginaValidarContrato() {
  const params = useParams();
  const router = useRouter();
  const contrato_id = params.id as string;

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAnalise | null>(null);
  const [dados_editados, setDadosEditados] = useState<DadosExtraidos>({});
  const [erro, setErro] = useState<string | null>(null);
  const [validacaoCompleta, setValidacaoCompleta] = useState(false);

  useEffect(() => {
    const carregarDados = async () => {
      try {
        const res = await fetch(`/api/contratos/${contrato_id}/dados`);
        if (!res.ok) {
          throw new Error('Erro ao carregar dados do contrato');
        }
        const data = await res.json();
        setResultado(data);
        setDadosEditados(data.analise.dados_extraidos);
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setCarregando(false);
      }
    };

    carregarDados();
  }, [contrato_id]);

  const handleAlterarCampo = (campo: keyof DadosExtraidos, valor: any) => {
    setDadosEditados({
      ...dados_editados,
      [campo]: valor,
    });
  };

  const handleSalvar = async () => {
    setSalvando(true);
    setErro(null);

    try {
      const res = await fetch(`/api/contratos/${contrato_id}/validar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dados_extraidos: dados_editados,
          validado_por: 'operador', // TODO: usar user_id real
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao salvar validação');
      }

      setValidacaoCompleta(true);
      setTimeout(() => {
        router.push('/painel-gestao/contratos');
      }, 2000);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando dados do contrato...</p>
        </div>
      </div>
    );
  }

  if (!resultado) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-900">{erro || 'Contrato não encontrado'}</p>
          </div>
          <Link href="/painel-gestao/contratos" className="text-blue-600 mt-4 inline-block">
            ← Voltar
          </Link>
        </div>
      </div>
    );
  }

  const campos_para_validar = resultado.analise.campos_incertos || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Cabeçalho */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Validação de Contrato</h1>
              <p className="text-gray-600 mt-2">
                Revise e corrija os dados extraídos pela IA
              </p>
            </div>
            <Link
              href="/painel-gestao/contratos"
              className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </Link>
          </div>
        </div>

        {/* Mensagem de sucesso */}
        {validacaoCompleta && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-900">Validação concluída com sucesso!</p>
              <p className="text-sm text-green-700">O contrato foi salvo e será redirecionado...</p>
            </div>
          </div>
        )}

        {/* Erro */}
        {erro && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-900">Erro ao salvar</p>
              <p className="text-sm text-red-700">{erro}</p>
            </div>
          </div>
        )}

        {/* Resumo */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Resumo da Análise</h2>
          <p className="text-gray-700 mb-4">{resultado.analise.resume_executivo}</p>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm font-medium text-gray-600">Confiança Geral</p>
              <p className="text-2xl font-bold text-gray-900">
                {Math.round(resultado.analise.confianca * 100)}%
              </p>
            </div>
            <div className="flex-1 bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full ${
                  resultado.analise.confianca >= 0.85
                    ? 'bg-green-500'
                    : resultado.analise.confianca >= 0.7
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${resultado.analise.confianca * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Campos para validar */}
        {campos_para_validar.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
              <AlertCircle className="w-5 h-5 mr-2 text-yellow-600" />
              Campos que Precisam Validação ({campos_para_validar.length})
            </h2>

            <div className="space-y-6">
              {/* Número do Contrato */}
              {campos_para_validar.includes('numero_contrato') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Número do Contrato
                  </label>
                  <input
                    type="text"
                    value={dados_editados.numero_contrato || ''}
                    onChange={(e) => handleAlterarCampo('numero_contrato', e.target.value)}
                    className="w-full px-4 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 bg-yellow-50"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Extraído com baixa confiança. Verifique no documento.
                  </p>
                </div>
              )}

              {/* Valor do Aluguel */}
              {campos_para_validar.includes('valor_aluguel') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Valor do Aluguel (R$)
                  </label>
                  <input
                    type="number"
                    value={dados_editados.valor_aluguel || ''}
                    onChange={(e) => handleAlterarCampo('valor_aluguel', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 bg-yellow-50"
                    step="0.01"
                  />
                </div>
              )}

              {/* Caução */}
              {campos_para_validar.includes('valor_caucao') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Valor da Caução (R$)
                  </label>
                  <input
                    type="number"
                    value={dados_editados.valor_caucao || ''}
                    onChange={(e) => handleAlterarCampo('valor_caucao', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 bg-yellow-50"
                    step="0.01"
                  />
                </div>
              )}

              {/* Índice de Reajuste */}
              {campos_para_validar.includes('indice_reajuste') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Índice de Reajuste
                  </label>
                  <select
                    value={dados_editados.indice_reajuste || ''}
                    onChange={(e) => handleAlterarCampo('indice_reajuste', e.target.value)}
                    className="w-full px-4 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 bg-yellow-50"
                  >
                    <option value="">Selecione...</option>
                    <option value="IPCA">IPCA</option>
                    <option value="INCC">INCC</option>
                    <option value="IGP-M">IGP-M</option>
                    <option value="IGPM">IGP-M (alternativo)</option>
                    <option value="TR">Taxa Referencial</option>
                    <option value="Sem reajuste">Sem reajuste</option>
                  </select>
                </div>
              )}

              {/* Datas */}
              {campos_para_validar.includes('data_inicio') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data de Início
                  </label>
                  <input
                    type="date"
                    value={dados_editados.data_inicio || ''}
                    onChange={(e) => handleAlterarCampo('data_inicio', e.target.value)}
                    className="w-full px-4 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 bg-yellow-50"
                  />
                </div>
              )}

              {campos_para_validar.includes('data_fim') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Data de Término
                  </label>
                  <input
                    type="date"
                    value={dados_editados.data_fim || ''}
                    onChange={(e) => handleAlterarCampo('data_fim', e.target.value)}
                    className="w-full px-4 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 bg-yellow-50"
                  />
                </div>
              )}

              {/* Nomes das partes */}
              {campos_para_validar.includes('nome_inquilino') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome do Inquilino
                  </label>
                  <input
                    type="text"
                    value={dados_editados.nome_inquilino || ''}
                    onChange={(e) => handleAlterarCampo('nome_inquilino', e.target.value)}
                    className="w-full px-4 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 bg-yellow-50"
                  />
                </div>
              )}

              {campos_para_validar.includes('nome_proprietario') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome do Proprietário
                  </label>
                  <input
                    type="text"
                    value={dados_editados.nome_proprietario || ''}
                    onChange={(e) => handleAlterarCampo('nome_proprietario', e.target.value)}
                    className="w-full px-4 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 bg-yellow-50"
                  />
                </div>
              )}

              {campos_para_validar.includes('endereco_imovel') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Endereço do Imóvel
                  </label>
                  <input
                    type="text"
                    value={dados_editados.endereco_imovel || ''}
                    onChange={(e) => handleAlterarCampo('endereco_imovel', e.target.value)}
                    className="w-full px-4 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 bg-yellow-50"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dados com alta confiança */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Dados Confirmados (Alta Confiança)</h2>

          <div className="grid grid-cols-2 gap-4">
            {dados_editados.numero_contrato && !campos_para_validar.includes('numero_contrato') && (
              <div className="p-3 bg-green-50 rounded border border-green-200">
                <p className="text-xs text-gray-600 font-medium">Número do Contrato</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">{dados_editados.numero_contrato}</p>
              </div>
            )}

            {dados_editados.valor_aluguel && !campos_para_validar.includes('valor_aluguel') && (
              <div className="p-3 bg-green-50 rounded border border-green-200">
                <p className="text-xs text-gray-600 font-medium">Valor do Aluguel</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  R$ {dados_editados.valor_aluguel.toFixed(2)}
                </p>
              </div>
            )}

            {dados_editados.valor_caucao && !campos_para_validar.includes('valor_caucao') && (
              <div className="p-3 bg-green-50 rounded border border-green-200">
                <p className="text-xs text-gray-600 font-medium">Caução</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  R$ {dados_editados.valor_caucao.toFixed(2)}
                </p>
              </div>
            )}

            {dados_editados.indice_reajuste && !campos_para_validar.includes('indice_reajuste') && (
              <div className="p-3 bg-green-50 rounded border border-green-200">
                <p className="text-xs text-gray-600 font-medium">Índice de Reajuste</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">{dados_editados.indice_reajuste}</p>
              </div>
            )}

            {dados_editados.data_inicio && !campos_para_validar.includes('data_inicio') && (
              <div className="p-3 bg-green-50 rounded border border-green-200">
                <p className="text-xs text-gray-600 font-medium">Início</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {new Date(dados_editados.data_inicio).toLocaleDateString('pt-BR')}
                </p>
              </div>
            )}

            {dados_editados.data_fim && !campos_para_validar.includes('data_fim') && (
              <div className="p-3 bg-green-50 rounded border border-green-200">
                <p className="text-xs text-gray-600 font-medium">Término</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {new Date(dados_editados.data_fim).toLocaleDateString('pt-BR')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Alertas e Recomendações */}
        {resultado.analise.alertas.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
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

        {resultado.analise.recomendacoes.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
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

        {/* Botões de Ação */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={handleSalvar}
            disabled={salvando || validacaoCompleta}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {salvando ? 'Salvando...' : '✓ Salvar Validação'}
          </button>
          <Link
            href="/painel-gestao/contratos"
            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-3 rounded-lg transition flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            Cancelar
          </Link>
        </div>
      </div>
    </div>
  );
}
