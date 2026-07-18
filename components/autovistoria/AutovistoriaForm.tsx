'use client';

import React from 'react';

export default function AutovistoriaForm({ vistoriaId }: { vistoriaId: string }) {
  return (
    <div className="p-4">
      <p className="text-gray-600">Formulário de Autovistoria para: {vistoriaId}</p>
    </div>
  );
}
