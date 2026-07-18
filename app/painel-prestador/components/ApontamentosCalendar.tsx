'use client';

import { useState, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { criarApontamento, editarApontamento } from '@/app/actions/prestador/apontamentos';
import type { CriarApontamentoInput } from '@/app/actions/prestador/apontamentos';

interface Apontamento {
  id: string;
  data: Date;
  horaInicio?: string;
  horaSaida?: string;
  horasTrabalhadas: number;
  status: string;
  valorTotal: number;
}

interface ApontamentosCalendarProps {
  contratoId: string;
  apontamentos: Apontamento[];
  onRefresh?: () => void;
}

export function ApontamentosCalendar({
  contratoId,
  apontamentos,
  onRefresh,
}: ApontamentosCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<CriarApontamentoInput>>({
    intervaloAlmocoMinutos: 60,
    ehEmergencia: false,
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getApontamentoForDay = (day: Date) => {
    return apontamentos.find(
      (apt) =>
        format(apt.data, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
    );
  };

  const handleSelectDay = useCallback((day: Date) => {
    setSelectedDay(day);
    setShowModal(true);
    setFormData({
      intervaloAlmocoMinutos: 60,
      ehEmergencia: false,
    });
    setError(null);
    setSuccess(null);

    const existing = getApontamentoForDay(day);
    if (existing) {
      setFormData((prev) => ({
        ...prev,
        horaInicio: existing.horaInicio,
        horaSaida: existing.horaSaida,
      }));
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDay) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const input: CriarApontamentoInput = {
        contratoId,
        data: selectedDay,
        horaInicio: formData.horaInicio,
        horaSaida: formData.horaSaida,
        intervaloAlmocoMinutos: formData.intervaloAlmocoMinutos || 60,
        descricaoAtividades: formData.descricaoAtividades,
        quilometragemExtra: formData.quilometragemExtra,
        tipoDeslocamento: formData.tipoDeslocamento,
        quantidadeKitsDentroHorario: formData.quantidadeKitsDentroHorario,
        quantidadeKitsPosHospedagem: formData.quantidadeKitsPosHospedagem,
        ehEmergencia: formData.ehEmergencia,
        residenciaisIds: formData.residenciaisIds,
        residencialHoras: formData.residencialHoras,
      };

      const result = await criarApontamento(input);

      if ('error' in result) {
        setError(result.error || 'Erro ao salvar apontamento');
      } else {
        setSuccess('Apontamento salvo com sucesso');
        setShowModal(false);
        onRefresh?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar apontamento');
    } finally {
      setIsLoading(false);
    }
  }, [contratoId, selectedDay, formData, onRefresh]);

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
            className="px-3 py-1 rounded border hover:bg-gray-100"
          >
            ← Anterior
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1 rounded border hover:bg-gray-100"
          >
            Hoje
          </button>
          <button
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
            className="px-3 py-1 rounded border hover:bg-gray-100"
          >
            Próximo →
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="border rounded-lg overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 bg-gray-50 border-b">
          {weekDays.map((day) => (
            <div key={day} className="p-2 text-center font-semibold text-sm">
              {day}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const apt = getApontamentoForDay(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

            return (
              <div
                key={format(day, 'yyyy-MM-dd')}
                className={`
                  min-h-24 p-2 border-b border-r cursor-pointer transition
                  ${!isCurrentMonth ? 'bg-gray-50 text-gray-400' : ''}
                  ${isToday ? 'bg-blue-50' : ''}
                  ${apt ? 'bg-green-50' : ''}
                  hover:bg-blue-100
                `}
                onClick={() => isCurrentMonth && handleSelectDay(day)}
              >
                <div className="text-sm font-semibold mb-1">
                  {format(day, 'd')}
                </div>
                {apt && (
                  <div className="text-xs bg-green-200 rounded p-1">
                    <div>{apt.horasTrabalhadas}h</div>
                    <div>R$ {apt.valorTotal.toFixed(2)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      {showModal && selectedDay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-96 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              Apontamento - {format(selectedDay, 'dd/MM/yyyy')}
            </h3>

            {error && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-100 text-green-700 rounded text-sm">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Hora Início
                  </label>
                  <input
                    type="time"
                    value={formData.horaInicio || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        horaInicio: e.target.value,
                      }))
                    }
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Hora Saída
                  </label>
                  <input
                    type="time"
                    value={formData.horaSaida || ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        horaSaida: e.target.value,
                      }))
                    }
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Intervalo Almoço (minutos)
                </label>
                <input
                  type="number"
                  value={formData.intervaloAlmocoMinutos || 60}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      intervaloAlmocoMinutos: parseInt(e.target.value),
                    }))
                  }
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Descrição de Atividades
                </label>
                <textarea
                  value={formData.descricaoAtividades || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      descricaoAtividades: e.target.value,
                    }))
                  }
                  className="w-full px-2 py-1 border rounded text-sm"
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="emergencia"
                  checked={formData.ehEmergencia || false}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      ehEmergencia: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                <label htmlFor="emergencia" className="text-sm font-medium">
                  Emergência (+20%)
                </label>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border rounded font-medium hover:bg-gray-100"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
