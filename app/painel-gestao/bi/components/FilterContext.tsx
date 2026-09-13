'use client';

import { createContext, useContext, useState, useCallback } from 'react';

export interface Filtros {
  dataInicio: string;
  dataFim: string;
  residencial?: string;
  prestador?: string;
  categoria?: string;
  severidade?: 'critico' | 'alerta' | 'info' | 'todas';
}

interface FilterContextType {
  filtros: Filtros;
  atualizarFiltro: <K extends keyof Filtros>(chave: K, valor: Filtros[K]) => void;
  atualizarFiltros: (novosFiltros: Partial<Filtros>) => void;
  limparFiltros: () => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

const FILTROS_PADRAO: Filtros = {
  dataInicio: (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  })(),
  dataFim: new Date().toISOString().split('T')[0],
};

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_PADRAO);

  const atualizarFiltro = useCallback(<K extends keyof Filtros>(chave: K, valor: Filtros[K]) => {
    setFiltros((prev) => ({
      ...prev,
      [chave]: valor,
    }));
  }, []);

  const atualizarFiltros = useCallback((novosFiltros: Partial<Filtros>) => {
    setFiltros((prev) => ({
      ...prev,
      ...novosFiltros,
    }));
  }, []);

  const limparFiltros = useCallback(() => {
    setFiltros(FILTROS_PADRAO);
  }, []);

  return (
    <FilterContext.Provider value={{ filtros, atualizarFiltro, atualizarFiltros, limparFiltros }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFiltros() {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error('useFiltros must be used within FilterProvider');
  }
  return context;
}
