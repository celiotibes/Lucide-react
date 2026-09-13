'use client';

interface PrestadoresStatsProps {
  totalPrestadores: number;
  totalPago: number;
  totalPendente: number;
  fechamentosPendentes: number;
}

export function PrestadoresStats({
  totalPrestadores,
  totalPago,
  totalPendente,
  fechamentosPendentes,
}: PrestadoresStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Total Prestadores */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-gray-600 text-sm font-medium mb-2">Total de Prestadores</p>
            <p className="text-3xl font-bold">{totalPrestadores}</p>
          </div>
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <span className="text-blue-600 text-xl">👥</span>
          </div>
        </div>
      </div>

      {/* Total Pago Este Mês */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-gray-600 text-sm font-medium mb-2">Total Pago (Este Mês)</p>
            <p className="text-3xl font-bold text-green-600">R$ {totalPago.toFixed(2)}</p>
          </div>
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <span className="text-green-600 text-xl">✓</span>
          </div>
        </div>
      </div>

      {/* Total Pendente */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-gray-600 text-sm font-medium mb-2">Total Pendente</p>
            <p className="text-3xl font-bold text-yellow-600">R$ {totalPendente.toFixed(2)}</p>
          </div>
          <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
            <span className="text-yellow-600 text-xl">⏳</span>
          </div>
        </div>
      </div>

      {/* Fechamentos Pendentes */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-gray-600 text-sm font-medium mb-2">Aguardando Aprovação</p>
            <p className="text-3xl font-bold text-orange-600">{fechamentosPendentes}</p>
          </div>
          <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
            <span className="text-orange-600 text-xl">📋</span>
          </div>
        </div>
      </div>
    </div>
  );
}
