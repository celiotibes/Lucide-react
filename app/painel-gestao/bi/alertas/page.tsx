'use client';

import { useState, useEffect } from 'react';
import { configurarAlertas } from '@/app/actions/bi/gerenciarAlertas';
import { AlertCircle, Save, CheckCircle, TrendingDown, Zap, Clock, TrendingUp, UserX, X, Mail } from 'lucide-react';

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

  const alertCards = [
    {
      key: 'margemBaixa' as const,
      icon: <TrendingDown className="w-5 h-5" />,
      titulo: 'Alerta de Margem Baixa',
      descricao: 'Dispara quando a margem cai abaixo do limite mínimo',
      gradiente: 'from-rose-500 to-orange-500',
      borderColor: 'border-rose-500/30',
      campo: (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
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
            className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
          />
        </div>
      ),
    },
    {
      key: 'anomaliaCritica' as const,
      icon: <Zap className="w-5 h-5" />,
      titulo: 'Alerta de Anomalia Crítica',
      descricao: 'Dispara quando detecta apontamentos com comportamento fora do padrão (score > 80)',
      gradiente: 'from-purple-500 to-pink-500',
      borderColor: 'border-purple-500/30',
      campo: (
        <p className="text-xs text-slate-500">
          Verificação automática - sem parâmetros configuráveis
        </p>
      ),
    },
    {
      key: 'atrasoRecebimento' as const,
      icon: <Clock className="w-5 h-5" />,
      titulo: 'Alerta de Atraso em Recebimento',
      descricao: 'Dispara quando faturas estão vencidas e não foram recebidas',
      gradiente: 'from-amber-500 to-orange-500',
      borderColor: 'border-amber-500/30',
      campo: (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
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
            className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
          />
        </div>
      ),
    },
    {
      key: 'custoAlto' as const,
      icon: <TrendingUp className="w-5 h-5" />,
      titulo: 'Alerta de Custo Alto',
      descricao: 'Dispara quando custos excedem percentual do faturamento',
      gradiente: 'from-blue-500 to-cyan-500',
      borderColor: 'border-cyan-500/30',
      campo: (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
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
            className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
          />
        </div>
      ),
    },
    {
      key: 'nenhumApontamento' as const,
      icon: <UserX className="w-5 h-5" />,
      titulo: 'Alerta de Falta de Apontamento',
      descricao: 'Dispara quando prestador não registra horas por período configurado',
      gradiente: 'from-slate-500 to-slate-400',
      borderColor: 'border-slate-500/30',
      campo: (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
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
            className="w-full px-3 py-2 glass rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
          />
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Cabeçalho */}
        <div className="mb-8 animate-slideDown">
          <h1 className="text-4xl font-bold text-slate-100 mb-2">Configuração de Alertas</h1>
          <p className="text-slate-400">Defina os limites e critérios para disparo de alertas automáticos</p>
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
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            )}
            <p className={mensagem.tipo === 'sucesso' ? 'text-emerald-300' : 'text-rose-300'}>
              {mensagem.texto}
            </p>
          </div>
        )}

        <div className="space-y-6">
          {alertCards.map((card, idx) => (
            <div
              key={card.key}
              className={`glass rounded-xl p-6 border-2 ${card.borderColor} backdrop-blur-xl hover-lift stagger-item`}
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className={`p-2 rounded-lg bg-gradient-to-r ${card.gradiente} bg-opacity-20 text-white`}>
                  <span className="text-slate-100">{card.icon}</span>
                </span>
                <label className="flex items-center gap-3 cursor-pointer flex-1 group">
                  <input
                    type="checkbox"
                    checked={config[card.key]?.ativo || false}
                    onChange={(e) => atualizarConfig(card.key, 'ativo', e.target.checked)}
                    className="w-5 h-5 rounded accent-cyan-500 cursor-pointer"
                  />
                  <h3 className="text-lg font-semibold text-slate-100 group-hover:text-cyan-400 transition-colors">
                    {card.titulo}
                  </h3>
                </label>
              </div>
              <p className="text-sm text-slate-400 mb-4 ml-12">{card.descricao}</p>
              <div className="ml-12 border-l border-slate-700/50 pl-4">
                {card.campo}
              </div>
            </div>
          ))}

          {/* Emails de Destino */}
          <div className="glass rounded-xl p-6 border-2 border-slate-700/50 backdrop-blur-xl hover-lift stagger-item" style={{ animationDelay: '300ms' }}>
            <h3 className="text-lg font-semibold text-slate-100 mb-2 flex items-center gap-2">
              <Mail className="w-5 h-5 text-cyan-400" />
              Emails para Notificação
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Alertas críticos e avisos serão enviados para estes endereços
            </p>

            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="email"
                  value={novoEmail}
                  onChange={(e) => setNovoEmail(e.target.value)}
                  placeholder="novo@email.com"
                  className="flex-1 px-3 py-2 glass rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                />
                <button
                  onClick={adicionarEmail}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-medium transition-all hover:shadow-lg hover:shadow-cyan-500/20"
                >
                  Adicionar
                </button>
              </div>

              <div className="space-y-2">
                {emails.map((email) => (
                  <div
                    key={email}
                    className="flex items-center justify-between glass p-3 rounded-lg border border-slate-700/30"
                  >
                    <span className="text-sm text-slate-300">{email}</span>
                    <button
                      onClick={() => removerEmail(email)}
                      className="text-rose-400 hover:text-rose-300 transition-colors p-1 rounded hover:bg-rose-500/10"
                    >
                      <X className="w-4 h-4" />
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
            className="w-full px-4 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed stagger-item"
            style={{ animationDelay: '350ms' }}
          >
            <Save className="w-5 h-5" />
            {salvando ? 'Salvando...' : 'Salvar Configuração'}
          </button>
        </div>
      </div>
    </div>
  );
}
