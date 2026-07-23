// Admin dashboard para gerenciar NFS-e (Nota Fiscal de Serviço Eletrônica)

'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface NfseData {
  numeroNFSe?: string;
  rpsNumero: string;
  dataEmissao: string;
  descricaoServico: string;
  valorServico: number;
  valorISS: number;
  valorLiquido: number;
  prestadorCNPJ: string;
  tomadorCPFCNPJ: string;
  status: string;
  codigoVerificacao?: string;
}

interface FaturaParaEmissao {
  id: string;
  numeroFatura: string;
  contratoId: string;
  valorBruto: number;
  descricao: string;
  tipo: string;
}

export default function NFSeDashboard() {
  const [nfses, setNfses] = useState<NfseData[]>([]);
  const [faturas, setFaturas] = useState<FaturaParaEmissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [emitindo, setEmitindo] = useState(false);

  const supabase = createClientComponentClient();

  useEffect(() => {
    carregarDados();
  }, [filtroStatus]);

  async function carregarDados() {
    try {
      setLoading(true);
      setError(null);

      // Carregar NFS-e já emitidas
      const responseNFSe = await fetch('/api/admin/nfse/listar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filtroStatus: filtroStatus === 'todos' ? null : filtroStatus,
        }),
      });

      if (responseNFSe.ok) {
        const dataNFSe = await responseNFSe.json();
        setNfses(dataNFSe.dados || []);
      }

      // Carregar faturas elegíveis para emissão (taxa_adm, multa, juros)
      const { data: faturasData, error: err } = await supabase
        .from('faturas')
        .select(
          `
          id,
          numero_fatura,
          contrato_id,
          valor_bruto,
          descricao,
          tipo
        `
        )
        .in('tipo', ['taxa_adm', 'multa', 'juros'])
        .neq('status', 'cancelada')
        .not('id', 'in', '(select fatura_ids::text from auditoria_nfse)');

      if (err) throw err;

      setFaturas(
        (faturasData || []).map((f: any) => ({
          id: f.id,
          numeroFatura: f.numero_fatura,
          contratoId: f.contrato_id,
          valorBruto: f.valor_bruto,
          descricao: f.descricao,
          tipo: f.tipo,
        }))
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEmitirNFSe() {
    if (selecionadas.length === 0) {
      setError('Selecione pelo menos uma fatura');
      return;
    }

    setEmitindo(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/nfse/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faturasIds: selecionadas,
          municipio: '3550308', // São Paulo (código IBGE)
          cnpjPrestador: '11222333000181', // seria do banco de dados
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.erro || 'Erro ao emitir NFS-e');
      }

      const resultado = await response.json();

      setNfses((prev) => [
        {
          numeroNFSe: resultado.numeroNFSe,
          rpsNumero: resultado.rpsNumero,
          dataEmissao: resultado.dataEmissao,
          descricaoServico: 'Serviço emitido',
          valorServico: 0,
          valorISS: 0,
          valorLiquido: 0,
          prestadorCNPJ: '11222333000181',
          tomadorCPFCNPJ: '',
          status: 'emitido',
          codigoVerificacao: resultado.codigoVerificacao,
        },
        ...prev,
      ]);

      setSelecionadas([]);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEmitindo(false);
    }
  }

  const toggleSelect = (id: string) => {
    setSelecionadas((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selecionadas.length === faturas.length) {
      setSelecionadas([]);
    } else {
      setSelecionadas(faturas.map((f) => f.id));
    }
  };

  if (loading) {
    return <div className="p-8">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">NFS-e (Nota Fiscal de Serviço)</h1>
          <p className="text-gray-600 mt-2">Gestão de emissão de notas fiscais eletrônicas</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Filtros */}
        <div className="mb-6 flex gap-2">
          {['todos', 'rps_criado', 'emitido', 'cancelado'].map((status) => (
            <button
              key={status}
              onClick={() => setFiltroStatus(status)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filtroStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {status === 'todos'
                ? 'Todos'
                : status === 'rps_criado'
                  ? 'RPS Criado'
                  : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Seção de Emissão */}
        {faturas.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Faturas Elegíveis para Emissão</h2>

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selecionadas.length === faturas.length && faturas.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Número</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Tipo</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Descrição</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {faturas.map((fatura) => (
                    <tr key={fatura.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selecionadas.includes(fatura.id)}
                          onChange={() => toggleSelect(fatura.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3">{fatura.numeroFatura}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                          {fatura.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{fatura.descricao}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        R$ {fatura.valorBruto.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={handleEmitirNFSe}
              disabled={emitindo || selecionadas.length === 0}
              className="px-6 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {emitindo ? 'Emitindo...' : `Emitir NFS-e (${selecionadas.length})`}
            </button>
          </div>
        )}

        {/* Histórico de NFS-e */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Histórico de NFS-e Emitidas</h2>

          {nfses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Nenhuma NFS-e emitida
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">NFS-e</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">RPS</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Data Emissão</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Descrição</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Valor</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Verificação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {nfses.map((nfse) => (
                    <tr key={nfse.rpsNumero} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{nfse.numeroNFSe || '—'}</td>
                      <td className="px-4 py-3">{nfse.rpsNumero}</td>
                      <td className="px-4 py-3">{new Date(nfse.dataEmissao).toLocaleDateString('pt-BR')}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                        {nfse.descricaoServico}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        R$ {nfse.valorLiquido.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                            nfse.status === 'emitido'
                              ? 'bg-green-100 text-green-800'
                              : nfse.status === 'cancelado'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {nfse.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-600">
                        {nfse.codigoVerificacao || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
