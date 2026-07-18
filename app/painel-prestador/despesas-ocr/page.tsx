'use client';

import { useState } from 'react';
import { registrarDespesaComOCR } from '@/app/actions/prestador/registrarDespesaOCR';
import { Upload, FileCheck, AlertCircle, Loader } from 'lucide-react';

interface ExtracaoDados {
  valor?: number;
  data?: string;
  confianca: number;
  campos: string[];
}

type TipoDespesa = 'combustivel' | 'alimentacao' | 'manutencao' | 'outro';

export default function PaginaDespesasOCR() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [tipo, setTipo] = useState<TipoDespesa>('combustivel');
  const [processando, setProcessando] = useState(false);
  const [extracao, setExtracao] = useState<ExtracaoDados | null>(null);
  const [edicaoManual, setEdicaoManual] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [contratoId, setContratoId] = useState('');

  const [dadosEditados, setDadosEditados] = useState({
    valor: '',
    data: '',
    descricao: '',
  });

  function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setArquivo(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function procesarComprovante() {
    if (!arquivo || !contratoId) {
      setMensagem({ tipo: 'erro', texto: 'Selecione um arquivo e um contrato' });
      return;
    }

    setProcessando(true);
    try {
      // Upload arquivo para storage (em produção)
      // Por enquanto usando URL local encoded
      const imagemUrl = preview;

      const resultado = await registrarDespesaComOCR({
        contratoId,
        imagemUrl,
        tipo,
        valor: dadosEditados.valor ? parseFloat(dadosEditados.valor) : undefined,
        data: dadosEditados.data || undefined,
        descricao: dadosEditados.descricao || undefined,
      });

      if (resultado.sucesso && resultado.dadosExtraidos) {
        setExtracao({
          valor: resultado.dadosExtraidos.valor,
          data: resultado.dadosExtraidos.data,
          confianca: resultado.dadosExtraidos.confianca,
          campos: resultado.dadosExtraidos.campos,
        });
        setMensagem({
          tipo: 'sucesso',
          texto: `Despesa registrada com sucesso! ID: ${resultado.despesaId}`,
        });
        // Reset
        setTimeout(() => {
          setArquivo(null);
          setPreview('');
          setDadosEditados({ valor: '', data: '', descricao: '' });
          setExtracao(null);
        }, 2000);
      } else {
        setMensagem({ tipo: 'erro', texto: resultado.erro || 'Erro ao processar' });
      }
    } catch (erro) {
      setMensagem({
        tipo: 'erro',
        texto: erro instanceof Error ? erro.message : 'Erro desconhecido',
      });
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Registrar Despesa com OCR</h1>
          <p className="text-gray-600">Faça upload de comprovante para extração automática de dados</p>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload e Preview */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Comprovante</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Contrato</label>
              <input
                type="text"
                value={contratoId}
                onChange={(e) => setContratoId(e.target.value)}
                placeholder="UUID do contrato"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Despesa</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoDespesa)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="combustivel">Combustível</option>
                <option value="alimentacao">Alimentação</option>
                <option value="manutencao">Manutenção</option>
                <option value="outro">Outro</option>
              </select>
            </div>

            {/* Área de upload */}
            <label className="block mb-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition">
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Clique ou arraste imagem do comprovante</p>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleArquivo}
                  className="hidden"
                />
              </div>
            </label>

            {/* Preview */}
            {preview && (
              <div className="mb-4">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-64 object-cover rounded-lg border border-gray-200"
                />
              </div>
            )}
          </div>

          {/* Edição Manual e Extração */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Dados Extraídos</h2>

            {extracao && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <FileCheck className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-900">Confiança: {extracao.confianca}%</span>
                </div>
                <p className="text-sm text-blue-700">
                  Campos detectados: {extracao.campos.join(', ')}
                </p>
              </div>
            )}

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={dadosEditados.valor}
                  onChange={(e) =>
                    setDadosEditados({ ...dadosEditados, valor: e.target.value })
                  }
                  placeholder={extracao?.valor?.toFixed(2) || '0.00'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <input
                  type="date"
                  value={dadosEditados.data}
                  onChange={(e) =>
                    setDadosEditados({ ...dadosEditados, data: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input
                  type="text"
                  value={dadosEditados.descricao}
                  onChange={(e) =>
                    setDadosEditados({ ...dadosEditados, descricao: e.target.value })
                  }
                  placeholder="Ex: Combustível - Promoção"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              onClick={procesarComprovante}
              disabled={!arquivo || processando || !contratoId}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {processando ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Processando...
                </>
              ) : (
                'Registrar Despesa'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
