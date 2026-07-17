'use client';

import { useState, useEffect } from 'react';
import { configurarAlertas } from '@/app/actions/bi/gerenciarAlertas';
import { AlertCircle, Save, CheckCircle } from 'lucide-react';

interface ConfigAlertas {
  margemBaixa?: { ativo: boolean; limiteMinimo: number };
  anomaliaCritica?: { ativo: boolean };
  atrasoRecebimento?: { ativo: boolean; diasAtraso: number };
  custoAlto?: { ativo: boolean; percentualLimite: number };
  nenhumApontamento?: { ativo: boolean; diasSemApontamento: number };
}

export default function PaginaAlertasConfig() {
  const [config, setConfig] = useState<ConfigAlertas>({
    margemBaixa: { ativo: true, limiteMinimo: 25 },
    anomaliaCritica: { ativo: true },
    atrasoRecebimento: { ativo: true, diasAtraso: 15 },
    custoAlto: { ativo: true, percentualLimite: 70 },
    nenhumApontamento: { ativo: true, diasSemApontamento: 7 },
  });

  const [emails, setEmails] = useState<string[]>(['admin@projeto.local']);
  const [novoEmail, setNovoEmail] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  async function salvarConfiguracao() {
    setSalvando(true);
    setMensagem(null);

    try {
      const resultado = await configurarAlertas(config, emails);

      if (resultado.sucesso) {
        setMensagem({
          tipo: 'sucesso',
          texto: resultado.mensagem || 'Configuração salva com sucesso!',
        });
      } else {
        setMensagem({
          tipo: 'erro',
          texto: resultado.erro || 'Erro ao salvar configuração',
        });
      }
    } catch (erro) {
      setMensagem({
        tipo: 'erro',
        texto: erro instanceof Error ? erro.message : 'Erro desconhecido',
      });
    } finally {
      setSalvando(false);
    }
  }

  function adicionarEmail() {
    if (novoEmail && !emails.includes(novoEmail)) {
      setEmails([...emails, novoEmail]);
      setNovoEmail('');
    }
  }

  function removerEmail(email: string) {
    setEmails(emails.filter((e) => e !== email));
  }

  function atualizarConfig(
    chave: keyof ConfigAlertas,
    propriedade: string,
    valor: any
  ) {
    setConfig((prev) => ({
      ...prev,
      [chave]: {
        ...prev[chave],
        [propriedade]: valor,
      },
    }));
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Configuração de Alertas</h1>
          <p className="text-gray-600">Defina os limites e critérios para disparo de alertas automáticos</p>
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
            {mensagem.tipo === 'sucesso' ? (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-1" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-1" />
            )}
            <p
              className={mensagem.tipo === 'sucesso' ? 'text-green-700' : 'text-red-700'}
            >
              {mensagem.texto}
            </p>
          </div>
        )}

        <div className="space-y-6">
          {/* Margem Baixa */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={config.margemBaixa?.ativo || false}
                onChange={(e) =>
                  atualizarConfig('margemBaixa', 'ativo', e.target.checked)
                }
                className="w-5 h-5 rounded"
              />
              <h3 className="text-lg font-semibold text-gray-900">Alerta de Margem Baixa</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Dispara quando a margem cai abaixo do limite mínimo
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Limite Mínimo (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={config.margemBaixa?.limiteMinimo || 25}
                  onChange={(e) =>
                    atualizarConfig('margemBaixa', 'limiteMinimo', parseFloat(e.target.value))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Anomalia Crítica */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={config.anomaliaCritica?.ativo || false}
                onChange={(e) =>
                  atualizarConfig('anomaliaCritica', 'ativo', e.target.checked)
                }
                className="w-5 h-5 rounded"
              />
              <h3 className="text-lg font-semibold text-gray-900">Alerta de Anomalia Crítica</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Dispara quando detecta apontamentos com comportamento fora do padrão (score &gt; 80)
            </p>
            <p className="text-xs text-gray-500">
              Verificação automática - sem parâmetros configuráveis
            </p>
          </div>

          {/* Atraso em Recebimento */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={config.atrasoRecebimento?.ativo || false}
                onChange={(e) =>
                  atualizarConfig('atrasoRecebimento', 'ativo', e.target.checked)
                }
                className="w-5 h-5 rounded"
              />
              <h3 className="text-lg font-semibold text-gray-900">Alerta de Atraso em Recebimento</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Dispara quando faturas estão vencidas e não foram recebidas
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dias de Atraso Mínimo
                </label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={config.atrasoRecebimento?.diasAtraso || 15}
                  onChange={(e) =>
                    atualizarConfig('atrasoRecebimento', 'diasAtraso', parseInt(e.target.value))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Custo Alto */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={config.custoAlto?.ativo || false}
                onChange={(e) =>
                  atualizarConfig('custoAlto', 'ativo', e.target.checked)
                }
                className="w-5 h-5 rounded"
              />
              <h3 className="text-lg font-semibold text-gray-900">Alerta de Custo Alto</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Dispara quando custos excedem percentual do faturamento
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Percentual Limite (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={config.custoAlto?.percentualLimite || 70}
                  onChange={(e) =>
                    atualizarConfig('custoAlto', 'percentualLimite', parseFloat(e.target.value))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Nenhum Apontamento */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={config.nenhumApontamento?.ativo || false}
                onChange={(e) =>
                  atualizarConfig('nenhumApontamento', 'ativo', e.target.checked)
                }
                className="w-5 h-5 rounded"
              />
              <h3 className="text-lg font-semibold text-gray-900">Alerta de Falta de Apontamento</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Dispara quando prestador não registra horas por período configurado
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dias sem Apontamento
                </label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={config.nenhumApontamento?.diasSemApontamento || 7}
                  onChange={(e) =>
                    atualizarConfig('nenhumApontamento', 'diasSemApontamento', parseInt(e.target.value))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Emails de Destino */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Emails para Notificação</h3>
            <p className="text-sm text-gray-600 mb-4">
              Alertas críticos e avisos serão enviados para estes endereços
            </p>

            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="email"
                  value={novoEmail}
                  onChange={(e) => setNovoEmail(e.target.value)}
                  placeholder="novo@email.com"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={adicionarEmail}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Adicionar
                </button>
              </div>

              <div className="space-y-2">
                {emails.map((email) => (
                  <div
                    key={email}
                    className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"
                  >
                    <span className="text-sm text-gray-700">{email}</span>
                    <button
                      onClick={() => removerEmail(email)}
                      className="text-red-600 hover:text-red-700 text-sm font-medium"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Botão Salvar */}
          <button
            onClick={salvarConfiguracao}
            disabled={salvando}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            {salvando ? 'Salvando...' : 'Salvar Configuração'}
          </button>
        </div>
      </div>
    </div>
  );
}
