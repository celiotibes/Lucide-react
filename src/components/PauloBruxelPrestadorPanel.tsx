import React, { useState, useEffect } from "react";
import {
  inicializarParametros,
  processarMes,
  validarApontamentos,
  RegistroAcesso,
  ParametrosContrato,
  ComponentesPagamento,
} from "../domain/erp/paulo-bruxel-contrato";

interface DiaTrabalho {
  id: string;
  data: string;
  tipo_dia: "dia_util" | "sabado" | "domingo" | "feriado";
  horas_trabalhadas: number;
  km_percorridos: number;
  descricao: string;
  ativo: boolean; // Checkbox para incluir/excluir do cálculo
}

/**
 * Valida e normaliza valores numéricos com range checking
 */
function validarNumero(
  valor: string | number,
  min: number = 0,
  max: number = Infinity,
  padrao: number = 0
): { valor: number; valido: boolean; aviso?: string } {
  const num = typeof valor === "string" ? parseFloat(valor) : valor;

  // Verificar NaN
  if (isNaN(num)) {
    return { valor: padrao, valido: false, aviso: "Valor inválido (não é número)" };
  }

  // Verificar ranges
  if (num < min) {
    return { valor: min, valido: false, aviso: `Valor abaixo do mínimo (${min})` };
  }
  if (num > max) {
    return { valor: max, valido: false, aviso: `Valor acima do máximo (${max})` };
  }

  return { valor: num, valido: true };
}

export function PauloBruxelPrestadorPanel() {
  const [mesReferencia, setMesReferencia] = useState("2026-08");
  const [diasTrabalho, setDiasTrabalho] = useState<DiaTrabalho[]>([
    {
      id: "1",
      data: "2026-08-01",
      tipo_dia: "dia_util",
      horas_trabalhadas: 0,
      km_percorridos: 0,
      descricao: "",
      ativo: false,
    },
  ]);
  const [reembolsoCartao, setReembolsoCartao] = useState(0);
  const [reembolsoPix, setReembolsoPix] = useState(0);
  const [parametros, setParametros] = useState<ParametrosContrato | null>(null);
  const [componentes, setComponentes] = useState<ComponentesPagamento | null>(null);
  const [errosValidacao, setErrosValidacao] = useState<string[]>([]);
  const [avisosValidacao, setAvisosValidacao] = useState<string[]>([]);

  // Carregar parâmetros quando mês muda
  useEffect(() => {
    try {
      const params = inicializarParametros(mesReferencia);
      setParametros(params);
      setErrosValidacao([]);
    } catch (erro) {
      setErrosValidacao([(erro as Error).message]);
    }
  }, [mesReferencia]);

  // Atualizar cálculos quando dados mudam
  useEffect(() => {
    if (!parametros) return;

    const registrosFiltrados: RegistroAcesso[] = diasTrabalho
      .filter((d) => d.ativo)
      .map((d) => ({
        data: d.data,
        tipo_dia: d.tipo_dia,
        horas_trabalhadas: d.horas_trabalhadas,
        km_percorridos: d.km_percorridos,
        descricao: d.descricao,
      }));

    // Validar apontamentos
    const validacao = validarApontamentos(registrosFiltrados);
    setErrosValidacao(validacao.erros);
    setAvisosValidacao(validacao.avisos);

    // Processar cálculos se válido
    if (validacao.valido && registrosFiltrados.length > 0) {
      const comp = processarMes(
        parametros,
        registrosFiltrados,
        reembolsoCartao,
        reembolsoPix
      );
      setComponentes(comp);
    } else {
      setComponentes(null);
    }
  }, [diasTrabalho, reembolsoCartao, reembolsoPix, parametros]);

  const adicionarDia = () => {
    const novoId = String(Math.max(...diasTrabalho.map((d) => parseInt(d.id)), 0) + 1);
    const dataAtual = diasTrabalho[diasTrabalho.length - 1]?.data || mesReferencia + "-01";
    const proxData = new Date(dataAtual);
    proxData.setDate(proxData.getDate() + 1);

    setDiasTrabalho([
      ...diasTrabalho,
      {
        id: novoId,
        data: proxData.toISOString().split("T")[0],
        tipo_dia: "dia_util",
        horas_trabalhadas: 0,
        km_percorridos: 0,
        descricao: "",
        ativo: false,
      },
    ]);
  };

  const removerDia = (id: string) => {
    setDiasTrabalho(diasTrabalho.filter((d) => d.id !== id));
  };

  const atualizarDia = (id: string, campo: keyof DiaTrabalho, valor: any) => {
    let valorFinal = valor;

    // Validar campos numéricos com ranges específicos
    if (campo === "horas_trabalhadas") {
      const validacao = validarNumero(valor, 0, 24, 0);
      valorFinal = validacao.valor;
      if (!validacao.valido && validacao.aviso) {
        setAvisosValidacao((prev) => [...prev, `Horas: ${validacao.aviso}`]);
      }
    } else if (campo === "km_percorridos") {
      const validacao = validarNumero(valor, 0, Infinity, 0);
      valorFinal = Math.floor(validacao.valor); // km sempre inteiro
      if (validacao.valor > 500 && validacao.valido) {
        setAvisosValidacao((prev) => [...prev, `Km: Valor alto (${validacao.valor}km) - verificar digitação`]);
      }
    }

    setDiasTrabalho(
      diasTrabalho.map((d) =>
        d.id === id ? { ...d, [campo]: valorFinal } : d
      )
    );
  };

  const obterDiaSemana = (data: string): string => {
    const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
    return dias[new Date(data + "T00:00:00").getDay()];
  };

  if (!parametros) {
    return <div className="p-4 text-red-600">Erro ao carregar parâmetros do contrato</div>;
  }

  return (
    <div className="w-full max-w-7xl mx-auto p-4 bg-gray-50 rounded-lg">
      <div className="bg-white rounded-lg shadow-md p-6">
        {/* Cabeçalho */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Prestação de Serviços - Paulo Bruxel
          </h1>
          <p className="text-gray-600">
            Contrato com características complexas: diárias, deslocamento, combustível e reajustes
          </p>
        </div>

        {/* Seleção de Mês */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mês de Referência
          </label>
          <select
            value={mesReferencia}
            onChange={(e) => setMesReferencia(e.target.value)}
            className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="2026-07">Julho 2026 (R$ {parametros.diaria_base}/dia)</option>
            <option value="2026-08">Agosto 2026 (R$ {parametros.diaria_base}/dia)</option>
          </select>

          {/* Parâmetros do Mês */}
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div className="bg-white p-3 rounded border border-blue-100">
              <p className="text-gray-600">Diária Base</p>
              <p className="font-bold text-lg text-blue-600">R$ {parametros.diaria_base.toFixed(2)}</p>
            </div>
            <div className="bg-white p-3 rounded border border-blue-100">
              <p className="text-gray-600">Hora Adicional</p>
              <p className="font-bold text-lg text-blue-600">R$ {parametros.hora_adicional.toFixed(2)}</p>
            </div>
            <div className="bg-white p-3 rounded border border-blue-100">
              <p className="text-gray-600">Deslocamento/km</p>
              <p className="font-bold text-lg text-blue-600">R$ {parametros.deslocamento_km.toFixed(2)}</p>
            </div>
            <div className="bg-white p-3 rounded border border-blue-100">
              <p className="text-gray-600">Combustível/litro</p>
              <p className="font-bold text-lg text-blue-600">R$ {parametros.combustivel_litro.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Erros e Avisos */}
        {errosValidacao.length > 0 && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <h3 className="font-semibold text-red-800 mb-2">⚠️ Erros de Validação</h3>
            <ul className="list-disc list-inside text-red-700 text-sm">
              {errosValidacao.map((erro, i) => (
                <li key={i}>{erro}</li>
              ))}
            </ul>
          </div>
        )}

        {avisosValidacao.length > 0 && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-yellow-800 mb-2">⚡ Avisos</h3>
            <ul className="list-disc list-inside text-yellow-700 text-sm">
              {avisosValidacao.map((aviso, i) => (
                <li key={i}>{aviso}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Tabela de Dias Trabalhados */}
        <div className="mb-6 overflow-x-auto">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Apontamento de Dias</h2>
          <table className="w-full border-collapse bg-white rounded-lg overflow-hidden shadow">
            <thead className="bg-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">✓</th>
                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Data</th>
                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Tipo de Dia</th>
                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Horas</th>
                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">km</th>
                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Descrição</th>
                <th className="px-3 py-2 text-center text-sm font-semibold text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {diasTrabalho.map((dia) => (
                <tr key={dia.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={dia.ativo}
                      onChange={(e) => atualizarDia(dia.id, "ativo", e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={dia.data}
                        onChange={(e) => atualizarDia(dia.id, "data", e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-500 font-semibold">
                        ({obterDiaSemana(dia.data)})
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={dia.tipo_dia}
                      onChange={(e) =>
                        atualizarDia(
                          dia.id,
                          "tipo_dia",
                          e.target.value as RegistroAcesso["tipo_dia"]
                        )
                      }
                      className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="dia_util">Dia Útil</option>
                      <option value="sabado">Sábado</option>
                      <option value="domingo">Domingo</option>
                      <option value="feriado">Feriado</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      value={dia.horas_trabalhadas || ""}
                      onChange={(e) =>
                        atualizarDia(dia.id, "horas_trabalhadas", e.target.value)
                      }
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      value={dia.km_percorridos || ""}
                      onChange={(e) =>
                        atualizarDia(dia.id, "km_percorridos", e.target.value)
                      }
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={dia.descricao}
                      onChange={(e) => atualizarDia(dia.id, "descricao", e.target.value)}
                      className="w-full max-w-xs px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Descrição do trabalho"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => removerDia(dia.id)}
                      className="px-2 py-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded font-medium text-sm"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={adicionarDia}
            className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            + Adicionar Dia
          </button>
        </div>

        {/* Reembolsos */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reembolso Cartão de Crédito
            </label>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-gray-700">R$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={reembolsoCartao || ""}
                onChange={(e) => {
                  const validacao = validarNumero(e.target.value, 0, 100000, 0);
                  setReembolsoCartao(validacao.valor);
                  if (!validacao.valido && validacao.aviso) {
                    setAvisosValidacao((prev) => [...prev, `Reembolso Cartão: ${validacao.aviso}`]);
                  }
                }}
                className="flex-1 px-3 py-2 border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reembolso PIX
            </label>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-gray-700">R$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={reembolsoPix || ""}
                onChange={(e) => {
                  const validacao = validarNumero(e.target.value, 0, 100000, 0);
                  setReembolsoPix(validacao.valor);
                  if (!validacao.valido && validacao.aviso) {
                    setAvisosValidacao((prev) => [...prev, `Reembolso PIX: ${validacao.aviso}`]);
                  }
                }}
                className="flex-1 px-3 py-2 border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* Resumo de Cálculos */}
        {componentes && (
          <div className="mb-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-300">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">📊 Resumo de Pagamento</h2>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Diárias Normais</p>
                <p className="text-lg font-bold text-gray-800">
                  R$ {componentes.diarias_normais.toFixed(2)}
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Diárias F.S./Feriado</p>
                <p className="text-lg font-bold text-gray-800">
                  R$ {componentes.diarias_fim_semana.toFixed(2)}
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Horas Extras Normais</p>
                <p className="text-lg font-bold text-gray-800">
                  R$ {componentes.horas_extras_normais.toFixed(2)}
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Horas Extras F.S.</p>
                <p className="text-lg font-bold text-gray-800">
                  R$ {componentes.horas_extras_fim_semana.toFixed(2)}
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Deslocamento</p>
                <p className="text-lg font-bold text-gray-800">
                  R$ {componentes.deslocamento.toFixed(2)}
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Combustível</p>
                <p className="text-lg font-bold text-gray-800">
                  R$ {componentes.combustivel.toFixed(2)}
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Reembolso Cartão</p>
                <p className="text-lg font-bold text-gray-800">
                  R$ {componentes.reembolso_cartao.toFixed(2)}
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Reembolso PIX</p>
                <p className="text-lg font-bold text-gray-800">
                  R$ {componentes.reembolso_pix.toFixed(2)}
                </p>
              </div>
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Comunicação</p>
                <p className="text-lg font-bold text-gray-800">
                  R$ {componentes.comunicacao.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Total */}
            <div className="p-4 bg-white rounded-lg border-2 border-blue-400 shadow-md">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-800">TOTAL A PAGAR</h3>
                <p className="text-3xl font-bold text-blue-600">
                  R$ {componentes.total.toFixed(2)}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Calculado em: {componentes.data_calculo}
              </p>
            </div>

            {/* Memória de Cálculo */}
            <details className="mt-4">
              <summary className="cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
                📝 Memória de Cálculo
              </summary>
              <pre className="mt-2 p-3 bg-gray-800 text-gray-100 rounded-lg text-xs overflow-x-auto font-mono">
                {componentes.memoria_calculo}
              </pre>
            </details>
          </div>
        )}

        {/* Botões de Ação */}
        <div className="flex gap-3 justify-end">
          <button className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
            Limpar
          </button>
          <button
            disabled={errosValidacao.length > 0 || !componentes}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Enviar para Aprovação
          </button>
        </div>
      </div>
    </div>
  );
}
