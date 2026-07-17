'use client';

import { useEffect, useState } from 'react';
import { executarVerificacaoAlertas } from '@/app/actions/bi/gerenciarAlertas';
import { AlertCircle, Bell, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface ResultadoAlerta {
  alertaId: string;
  tipo: string;
  severidade: 'info' | 'alerta' | 'critico';
  titulo: string;
  descricao: string;
  dados: Record<string, any>;
  timestamp: Date;
  residencialId?: string;
  prestadorId?: string;
}

interface AlertasWidgetProps {
  autoRefresh?: boolean;
  refreshInterval?: number; // ms
}

export function AlertasWidget({ autoRefresh = true, refreshInterval = 60000 }: AlertasWidgetProps) {
  const [alertas, setAlertas] = useState<ResultadoAlerta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [resultado, setResultado] = useState<{
    sucesso: boolean;
    totalAlertas?: number;
    alertasCriticos?: number;
    alertasAlerta?: number;
    mensagem?: string;
  } | null>(null);

  async function carregarAlertas() {
    try {
      const res = await executarVerificacaoAlertas();
      setResultado(res);
    } catch (erro) {
      console.error('Erro ao carregar alertas:', erro);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarAlertas();

    if (!autoRefresh) return;

    const interval = setInterval(carregarAlertas, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const totalAlertas = (resultado?.alertasCriticos || 0) + (resultado?.alertasAlerta || 0);
  const temAlertas = totalAlertas > 0;
  const temCriticos = (resultado?.alertasCriticos || 0) > 0;

  return (
    <div className={`rounded-lg shadow p-6 border-l-4 ${
      temCriticos
        ? 'bg-red-50 border-red-500'
        : temAlertas
        ? 'bg-yellow-50 border-yellow-500'
        : 'bg-green-50 border-green-500'
    }`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {temCriticos ? (
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 animate-pulse">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
          ) : (
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              temAlertas ? 'bg-yellow-100' : 'bg-green-100'
            }`}>
              <Bell className={`w-6 h-6 ${
                temAlertas ? 'text-yellow-600' : 'text-green-600'
              }`} />
            </div>
          )}

          <div>
            <h3 className={`text-lg font-semibold ${
              temCriticos
                ? 'text-red-900'
                : temAlertas
                ? 'text-yellow-900'
                : 'text-green-900'
            }`}>
              Alertas do Sistema
            </h3>
            <p className={`text-sm ${
              temCriticos
                ? 'text-red-700'
                : temAlertas
                ? 'text-yellow-700'
                : 'text-green-700'
            }`}>
              {carregando ? 'Verificando...' : resultado?.mensagem || 'Sistema normal'}
            </p>
          </div>
        </div>

        {temAlertas && (
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
            temCriticos
              ? 'bg-red-200 text-red-900'
              : 'bg-yellow-200 text-yellow-900'
          }`}>
            {totalAlertas} alerta{totalAlertas !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {resultado && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          {resultado.alertasCriticos !== undefined && (
            <div className="bg-white bg-opacity-50 rounded p-3">
              <p className="text-xs text-gray-600 mb-1">Críticos</p>
              <p className="text-2xl font-bold text-red-600">
                {resultado.alertasCriticos}
              </p>
            </div>
          )}
          {resultado.alertasAlerta !== undefined && (
            <div className="bg-white bg-opacity-50 rounded p-3">
              <p className="text-xs text-gray-600 mb-1">Avisos</p>
              <p className="text-2xl font-bold text-yellow-600">
                {resultado.alertasAlerta}
              </p>
            </div>
          )}
        </div>
      )}

      <Link
        href="/painel-gestao/bi/alertas/historico"
        className={`inline-flex items-center gap-2 text-sm font-medium hover:gap-3 transition-all ${
          temCriticos
            ? 'text-red-600 hover:text-red-700'
            : temAlertas
            ? 'text-yellow-600 hover:text-yellow-700'
            : 'text-green-600 hover:text-green-700'
        }`}
      >
        Ver Histórico
        <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
