// Portal de pagamento via PIX para locatários

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface DadosPIX {
  qrCode: string;
  copiaCola: string;
  urlQRCode: string;
  valor: number;
  expiracao: string;
}

interface FaturaDados {
  id: string;
  numero_fatura: string;
  valor_bruto: number;
  vencimento: string;
}

export default function PagamentoPIX() {
  const params = useParams();
  const faturaiId = params.id as string;

  const [fatura, setFatura] = useState<FaturaDados | null>(null);
  const [pix, setPix] = useState<DadosPIX | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [statusPagamento, setStatusPagamento] = useState<'pendente' | 'pago'>('pendente');
  const [tempoRestante, setTempoRestante] = useState<number>(0);

  const supabase = createClientComponentClient();

  useEffect(() => {
    carregarFaturaPIX();
  }, [faturaiId]);

  // Atualizar tempo restante
  useEffect(() => {
    if (!pix) return;

    const intervalo = setInterval(() => {
      const agora = new Date().getTime();
      const expiracao = new Date(pix.expiracao).getTime();
      const diferenca = expiracao - agora;

      if (diferenca <= 0) {
        setTempoRestante(0);
      } else {
        setTempoRestante(Math.floor(diferenca / 1000));
      }
    }, 1000);

    return () => clearInterval(intervalo);
  }, [pix]);

  // Poll status de pagamento
  useEffect(() => {
    if (statusPagamento === 'pago') return;

    const intervalo = setInterval(() => {
      verificarStatusPagamento();
    }, 5000); // verificar a cada 5 segundos

    return () => clearInterval(intervalo);
  }, [statusPagamento, pix]);

  async function carregarFaturaPIX() {
    try {
      setLoading(true);
      setError(null);

      // Recuperar dados da fatura
      const { data: faturaDados, error: errFatura } = await supabase
        .from('faturas')
        .select('id, numero_fatura, valor_bruto, vencimento')
        .eq('id', faturaiId)
        .single();

      if (errFatura) throw errFatura;

      setFatura(faturaDados);

      // Gerar QR code PIX
      const response = await fetch('/api/admin/pix/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faturasIds: [faturaiId],
          descricao: `Fatura ${faturaDados.numero_fatura}`,
          diaVencimento: 1,
        }),
      });

      if (!response.ok) {
        const erro = await response.json();
        throw new Error(erro.erro || 'Erro ao gerar PIX');
      }

      const { pix: pixData } = await response.json();
      setPix(pixData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function verificarStatusPagamento() {
    if (!fatura) return;

    try {
      const { data: faturaDados, error: err } = await supabase
        .from('faturas')
        .select('status')
        .eq('id', faturaiId)
        .single();

      if (err) return;

      if (faturaDados?.status === 'paga') {
        setStatusPagamento('pago');
      }
    } catch (err) {
      console.error('Erro ao verificar status:', err);
    }
  }

  function copiarCopiaCola() {
    if (!pix) return;

    navigator.clipboard.writeText(pix.copiaCola);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const minutos = Math.floor(tempoRestante / 60);
  const segundos = tempoRestante % 60;
  const tempoFormatado = `${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Gerando QR Code...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-8">
        {statusPagamento === 'pago' ? (
          <>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-green-600">Pagamento Recebido!</h1>
              <p className="text-gray-600 mt-2">Sua fatura foi paga com sucesso</p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-green-800">
                Fatura: <strong>{fatura?.numero_fatura}</strong>
              </p>
              <p className="text-sm text-green-800 mt-2">
                Valor: <strong>R$ {fatura?.valor_bruto.toFixed(2)}</strong>
              </p>
            </div>

            <button
              onClick={() => (window.location.href = '/portal/faturas')}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              Voltar às Faturas
            </button>
          </>
        ) : (
          <>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
                {error}
              </div>
            )}

            <h1 className="text-2xl font-bold mb-6 text-center">Pagamento via PIX</h1>

            {/* Informações da Fatura */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600">Fatura</p>
              <p className="text-lg font-bold text-blue-900">{fatura?.numero_fatura}</p>

              <p className="text-sm text-gray-600 mt-3">Valor a Pagar</p>
              <p className="text-2xl font-bold text-blue-600">
                R$ {pix?.valor.toFixed(2)}
              </p>

              <p className="text-sm text-gray-600 mt-3">Vencimento</p>
              <p className="text-sm text-gray-900">
                {fatura && new Date(fatura.vencimento).toLocaleDateString('pt-BR')}
              </p>
            </div>

            {/* QR Code */}
            {pix && (
              <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6 mb-6">
                <p className="text-sm text-gray-600 text-center mb-3">Escaneie com seu App Bancário</p>
                <div className="bg-white p-4 rounded-lg flex justify-center">
                  <img
                    src={pix.urlQRCode}
                    alt="QR Code PIX"
                    className="w-48 h-48"
                  />
                </div>
              </div>
            )}

            {/* Cópia e Cola */}
            {pix && (
              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-2">Cópia e Cola</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pix.copiaCola}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-xs font-mono"
                  />
                  <button
                    onClick={copiarCopiaCola}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      copiado
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {copiado ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}

            {/* Tempo Restante */}
            {tempoRestante > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-center">
                <p className="text-sm text-yellow-800">Tempo para expiração</p>
                <p className="text-3xl font-bold text-yellow-600 font-mono">{tempoFormatado}</p>
              </div>
            )}

            {tempoRestante === 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-center">
                <p className="text-sm text-red-800">QR Code expirado</p>
                <button
                  onClick={carregarFaturaPIX}
                  className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                >
                  Gerar Novo
                </button>
              </div>
            )}

            {/* Instruções */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-900 mb-2">Como Pagar?</p>
              <ol className="text-xs text-blue-800 space-y-1">
                <li>1. Abra seu app bancário</li>
                <li>2. Selecione "Pagar via PIX"</li>
                <li>3. Escaneie o QR code ou cole a chave</li>
                <li>4. Confirme o pagamento</li>
              </ol>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
