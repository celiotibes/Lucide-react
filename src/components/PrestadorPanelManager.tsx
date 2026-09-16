import React, { useState } from "react";
import { PauloBruxelPrestadorPanel } from "./PauloBruxelPrestadorPanel";

type TipoPrestador = "paulo_bruxel" | "cristiano";

interface TabPrestador {
  id: TipoPrestador;
  nome: string;
  descricao: string;
  ativo: boolean;
}

/**
 * Gerenciador de Painel de Prestadores
 * Organiza os diferentes prestadores em abas separadas
 *
 * Fase 1: Implementação de Paulo Bruxel e Cristiano (realidades separadas)
 * Fase 2: Sincronização com banco de dados SQLite
 * Fase 3: Importação de dados históricos das planilhas
 * Fase 4: Workflow de aprovação do gestor
 */
export function PrestadorPanelManager() {
  const [abaSelecionada, setAbaSelecionada] = useState<TipoPrestador>("paulo_bruxel");

  const abas: TabPrestador[] = [
    {
      id: "paulo_bruxel",
      nome: "Paulo Bruxel",
      descricao: "Contrato com diárias, deslocamento e combustível - Pagamento 10º/mês",
      ativo: true,
    },
    {
      id: "cristiano",
      nome: "Cristiano",
      descricao: "Contrato (em desenvolvimento)",
      ativo: false,
    },
  ];

  return (
    <div className="w-full min-h-screen bg-gray-50">
      {/* Cabeçalho */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Painel de Prestadores de Serviço
          </h1>
          <p className="text-gray-600 mt-2">
            Gerenciamento de contratos, pagamentos e históricos de atividades
          </p>
        </div>
      </div>

      {/* Abas */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          {/* Cabeçalho de Abas */}
          <div className="flex border-b border-gray-200">
            {abas.map((aba) => (
              <button
                key={aba.id}
                onClick={() => setAbaSelecionada(aba.id)}
                disabled={!aba.ativo}
                className={`flex-1 px-6 py-4 text-center font-medium transition-colors ${
                  abaSelecionada === aba.id
                    ? "border-b-2 border-blue-600 text-blue-600 bg-blue-50"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                } ${!aba.ativo ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex flex-col items-center gap-1">
                  <span>{aba.nome}</span>
                  <span className="text-xs text-gray-500 font-normal">
                    {aba.descricao}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Conteúdo das Abas */}
          <div className="p-6">
            {abaSelecionada === "paulo_bruxel" && (
              <div>
                <PauloBruxelPrestadorPanel />
              </div>
            )}

            {abaSelecionada === "cristiano" && (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-100 mb-4">
                  <span className="text-2xl">🚧</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Contrato de Cristiano
                </h3>
                <p className="text-gray-600 mb-4">
                  Este contrato está em desenvolvimento. Será implementado na próxima fase.
                </p>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                  Ver Detalhes do Contrato
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Informações Gerais */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">📋 Contratos Ativos</h3>
            <p className="text-2xl font-bold text-gray-900">2</p>
            <p className="text-xs text-gray-500 mt-2">Paulo Bruxel (Ativo), Cristiano (Planejado)</p>
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">💰 Próximo Pagamento</h3>
            <p className="text-2xl font-bold text-gray-900">09/10/2026</p>
            <p className="text-xs text-gray-500 mt-2">Paulo Bruxel - Dia 10 de cada mês</p>
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">📊 Período Atual</h3>
            <p className="text-2xl font-bold text-gray-900">08/2026</p>
            <p className="text-xs text-gray-500 mt-2">Agosto de 2026 em processamento</p>
          </div>
        </div>

        {/* Fases de Desenvolvimento */}
        <div className="mt-6 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📅 Fases de Desenvolvimento</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <span className="text-green-600 font-bold">✓</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Fase 1: Painel de Dados e Cálculos</p>
                <p className="text-sm text-gray-600">
                  ✓ Módulo de contrato Paulo Bruxel com lógica de cálculo
                  <br />✓ Painel de entrada de dados com validação automática
                  <br />✓ Testes unitários (25 testes passando)
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-600 font-bold">2</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Fase 2: Sincronização com Banco de Dados</p>
                <p className="text-sm text-gray-600">
                  • Criar schema SQLite para prestadores_contratos
                  <br />• Criar schema para prestadores_apontamentos_mensais
                  <br />• Integração com tabela contas_plano_contas para lançamento contábil
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-600 font-bold">3</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Fase 3: Importação de Dados Históricos</p>
                <p className="text-sm text-gray-600">
                  • Importar dados de junho 2026 (R$ 1.870,15 em serviços)
                  <br />• Importar dados de julho 2026
                  <br />• Análise retroativa de meses anteriores com IPCA
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-600 font-bold">4</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Fase 4: Workflow de Aprovação do Gestor</p>
                <p className="text-sm text-gray-600">
                  • Revisão de cálculos pela gerência
                  <br />• Aprovação com assinatura digital
                  <br />• Lançamento automático no ledger contábil
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                <span className="text-gray-600 font-bold">5</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">Fase 5: Contrato Cristiano</p>
                <p className="text-sm text-gray-600">
                  • Análise de características contratosintrínsecas
                  <br />• Implementação de módulo específico para Cristiano
                  <br />• Integração no painel unificado
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
