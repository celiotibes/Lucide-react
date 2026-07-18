'use client';

import React from 'react';

export default function FechamentoForm({ vistoriaId }: { vistoriaId: string }) {
  return (
    <div className="p-4">
      <p className="text-gray-600">Formulário de Fechamento para: {vistoriaId}</p>
    </div>
  );
}
