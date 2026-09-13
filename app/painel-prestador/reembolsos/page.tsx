'use client';

import { useState } from 'react';
import { criarRequisicaoReembolso } from '@/app/actions/prestador/gerenciarReembolsoInsumos';
import { Plus, X, AlertCircle, Loader } from 'lucide-react';

interface ItemReembolso {
  descricao: string;
  valor: string;
  dataCompra: string;
  categoriaMaterial: 'limpeza' | 'manutencao' | 'ferramentas' | 'outro';
  comprovante_url?: string;
}

export default function PaginaReembolsos() {
  const [contratoId, setContratoId] = useState('');
  const [itens, setItens] = useState<ItemReembolso[]>([]);
  const [novoItem, setNovoItem] = useState<ItemReembolso>({
    descricao: '',
    valor: '',
    dataCompra: new Date().toISOString().split('T')[0],
    categoriaMaterial: 'manutencao',
  });
  const [observacoes, setObservacoes] = useState('');
  const [processando, setProcessando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  function adicionarItem() {
    if (!novoItem.descricao || !novoItem.valor || !novoItem.dataCompra) {
      setMensagem({ tipo: 'erro', texto: 'Preencha todos os campos obrigatórios' });
      return;
    }

    setItens([...itens, { ...novoItem }]);
    setNovoItem({
      descricao: '',
      valor: '',
      dataCompra: new Date().toISOString().split('T')[0],
      categoriaMaterial: 'manutencao',
    });
  }

  function removerItem(index: number) {
    setItens(itens.filter((_, i) => i !== index));
  }

  async function submeterRequisicao() {
    if (!contratoId || itens.length === 0) {
      setMensagem({ tipo: 'erro', texto: 'Preencha contrato e adicione itens' });
      return;
    }

    setProcessando(true);
    try {
      const resultado = await criarRequisicaoReembolso({
        contratoId,
        itens: itens.map((item) => ({
          descricao: item.descricao,
          valor: parseFloat(item.valor),
          dataCompra: item.dataCompra,
          categoriaMaterial: item.categoriaMaterial,
          comprovante_url: item.comprovante_url,
        })),
        observacoes,
      });

      if (resultado.sucesso) {
        setMensagem({
          tipo: 'sucesso',
          texto: `Requisição criada! Total: R$ ${resultado.totalReembolso}`,
        });
        setTimeout(() => {
          setContratoId('');
          setItens([]);
          setObservacoes('');
          setMensagem(null);
        }, 2000);
      } else {
        setMensagem({ tipo: 'erro', texto: resultado.erro || 'Erro ao criar requisição' });
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

  const total = itens.reduce((sum, item) => sum + parseFloat(item.valor || '0'), 0);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Reembolso de Insumos</h1>
          <p className="text-gray-600">Crie uma requisição de reembolso para seus gastos</p>
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

        <div className="space-y-6">
          {/* Dados Gerais */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Dados da Requisição</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contrato</label>
                <input
                  type="text"
                  value={contratoId}
                  onChange={(e) => setContratoId(e.target.value)}
                  placeholder="UUID do contrato"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Informações adicionais sobre o reembolso"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Adicionar Itens */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Adicionar Item</h2>
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input
                  type="text"
                  value={novoItem.descricao}
                  onChange={(e) =>
                    setNovoItem({ ...novoItem, descricao: e.target.value })
                  }
                  placeholder="Ex: Luvas de segurança"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={novoItem.valor}
                    onChange={(e) =>
                      setNovoItem({ ...novoItem, valor: e.target.value })
                    }
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data Compra</label>
                  <input
                    type="date"
                    value={novoItem.dataCompra}
                    onChange={(e) =>
                      setNovoItem({ ...novoItem, dataCompra: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select
                  value={novoItem.categoriaMaterial}
                  onChange={(e) =>
                    setNovoItem({
                      ...novoItem,
                      categoriaMaterial: e.target.value as ItemReembolso['categoriaMaterial'],
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="limpeza">Limpeza</option>
                  <option value="manutencao">Manutenção</option>
                  <option value="ferramentas">Ferramentas</option>
                  <option value="outro">Outro</option>
                </select>
              </div>

              <button
                onClick={adicionarItem}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Adicionar Item
              </button>
            </div>
          </div>

          {/* Lista de Itens */}
          {itens.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Itens da Requisição</h2>
              <div className="space-y-2 mb-4">
                {itens.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.descricao}</p>
                      <p className="text-sm text-gray-600">
                        {new Date(item.dataCompra).toLocaleDateString('pt-BR')} •{' '}
                        <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                          {item.categoriaMaterial}
                        </span>
                      </p>
                    </div>
                    <div className="text-right mr-4">
                      <p className="font-semibold text-gray-900">
                        R$ {parseFloat(item.valor).toFixed(2)}
                      </p>
                    </div>
                    <button
                      onClick={() => removerItem(idx)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="pt-4 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-gray-900">Total:</span>
                  <span className="text-2xl font-bold text-blue-600">
                    R$ {total.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Botão Submit */}
              <button
                onClick={submeterRequisicao}
                disabled={!contratoId || itens.length === 0 || processando}
                className="w-full mt-6 px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {processando ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar Requisição de Reembolso'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
