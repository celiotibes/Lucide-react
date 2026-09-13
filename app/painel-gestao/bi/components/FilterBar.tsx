'use client';

import { useFiltros } from './FilterContext';
import { X, Filter } from 'lucide-react';

interface FilterBarProps {
  mostrarResidencial?: boolean;
  mostrarPrestador?: boolean;
  mostrarCategoria?: boolean;
  residenciais?: Array<{ id: string; nome: string }>;
  prestadores?: Array<{ id: string; nome: string }>;
  categorias?: Array<{ id: string; nome: string }>;
}

export function FilterBar({
  mostrarResidencial = false,
  mostrarPrestador = false,
  mostrarCategoria = false,
  residenciais = [],
  prestadores = [],
  categorias = [],
}: FilterBarProps) {
  const { filtros, atualizarFiltro, limparFiltros } = useFiltros();

  const temFiltrosAtivos = !!(
    filtros.residencial ||
    filtros.prestador ||
    filtros.categoria ||
    filtros.severidade
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filtros</h3>
        {temFiltrosAtivos && (
          <button
            onClick={limparFiltros}
            className="ml-auto text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1"
          >
            <X className="w-4 h-4" />
            Limpar Filtros
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Data Início */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Data Início
          </label>
          <input
            type="date"
            value={filtros.dataInicio}
            onChange={(e) => atualizarFiltro('dataInicio', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Data Fim */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Data Fim
          </label>
          <input
            type="date"
            value={filtros.dataFim}
            onChange={(e) => atualizarFiltro('dataFim', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Residencial */}
        {mostrarResidencial && residenciais.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Residencial
            </label>
            <select
              value={filtros.residencial || ''}
              onChange={(e) => atualizarFiltro('residencial', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              {residenciais.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Prestador */}
        {mostrarPrestador && prestadores.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Prestador
            </label>
            <select
              value={filtros.prestador || ''}
              onChange={(e) => atualizarFiltro('prestador', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              {prestadores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Categoria */}
        {mostrarCategoria && categorias.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Categoria
            </label>
            <select
              value={filtros.categoria || ''}
              onChange={(e) => atualizarFiltro('categoria', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Filtros Ativos */}
      {temFiltrosAtivos && (
        <div className="mt-4 flex flex-wrap gap-2">
          {filtros.residencial && (
            <span className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full text-sm font-medium">
              Residencial selecionada
              <button
                onClick={() => atualizarFiltro('residencial', undefined)}
                className="hover:text-blue-600 dark:hover:text-blue-400"
              >
                ×
              </button>
            </span>
          )}
          {filtros.prestador && (
            <span className="inline-flex items-center gap-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-3 py-1 rounded-full text-sm font-medium">
              Prestador selecionado
              <button
                onClick={() => atualizarFiltro('prestador', undefined)}
                className="hover:text-green-600 dark:hover:text-green-400"
              >
                ×
              </button>
            </span>
          )}
          {filtros.categoria && (
            <span className="inline-flex items-center gap-2 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-3 py-1 rounded-full text-sm font-medium">
              Categoria selecionada
              <button
                onClick={() => atualizarFiltro('categoria', undefined)}
                className="hover:text-purple-600 dark:hover:text-purple-400"
              >
                ×
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
