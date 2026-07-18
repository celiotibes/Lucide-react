'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatarMoeda } from '@/lib/formatacao';
import { atualizarFechamento } from '@/app/actions/vistorias/atualizarFechamento';

interface ItemFechamento {
  descricao: string;
  origem: 'previsto_em_contrato' | 'orcamento' | 'estimativa' | 'encargo_aberto' | 'multa' | 'caucao' | 'adiantamento' | 'saldo_a_favor';
  valor: number;
  tipo: 'debito' | 'credito';
}

interface Props {
  vistoriaSaidaId: string;
  fechamentoExistente?: {
    id: string;
    total_debitos: number;
    total_creditos: number;
    saldo_final: number;
    itens: ItemFechamento[];
  };
}

export default function FechamentoForm({ vistoriaSaidaId, fechamentoExistente }: Props) {
  const router = useRouter();
  const [itens, setItens] = useState<ItemFechamento[]>(fechamentoExistente?.itens || []);
  const [caucaoManual, setCaucaoManual] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const totalDebitos = itens
    .filter((i) => i.tipo === 'debito')
    .reduce((sum, i) => sum + i.valor, 0);

  const totalCreditos = itens
    .filter((i) => i.tipo === 'credito')
    .reduce((sum, i) => sum + i.valor, 0);

  const saldoFinal = totalCreditos - totalDebitos;

  const adicionarItem = () => {
    setItens([
      ...itens,
      {
        descricao: '',
        origem: 'estimativa',
        valor: 0,
        tipo: 'debito',
      },
    ]);
  };

  const removerItem = (indice: number) => {
    setItens(itens.filter((_, i) => i !== indice));
  };

  const atualizarItem = (indice: number, campo: keyof ItemFechamento, valor: any) => {
    const novoItens = [...itens];
    novoItens[indice] = { ...novoItens[indice], [campo]: valor };
    setItens(novoItens);
  };

  const handleSalvar = async () => {
    if (itens.length === 0) {
      setErro('Adicione pelo menos um item de débito ou crédito');
      return;
    }

    setSalvando(true);
    setErro('');

    try {
      const resultado = await atualizarFechamento({
        vistoriaSaidaId,
        itens,
        caucaoValorManual: caucaoManual ? parseFloat(caucaoManual) : undefined,
      });

      if (resultado.error) {
        setErro(resultado.error);
      } else {
        router.push(`/vistorias/${vistoriaSaidaId}`);
      }
    } catch (erro) {
      setErro(String(erro));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px' }}>
      {erro && <p className="erro-conexao">{erro}</p>}

      <div style={{ marginBottom: '20px' }}>
        <h3>Débitos</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th style={{ textAlign: 'left', padding: '8px' }}>Descrição</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Origem</th>
              <th style={{ textAlign: 'right', padding: '8px', width: '120px' }}>Valor</th>
              <th style={{ padding: '8px', width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {itens
              .map((item, idx) => ({ item, idx }))
              .filter(({ item }) => item.tipo === 'debito')
              .map(({ item, idx }) => (
                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="text"
                      value={item.descricao}
                      onChange={(e) => atualizarItem(idx, 'descricao', e.target.value)}
                      placeholder="Ex: Pintura de parede"
                      style={{
                        width: '100%',
                        padding: '6px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <select
                      value={item.origem}
                      onChange={(e) => atualizarItem(idx, 'origem', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                      }}
                    >
                      <option value="previsto_em_contrato">Previsto em contrato</option>
                      <option value="orcamento">Orçamento</option>
                      <option value="estimativa">Estimativa</option>
                      <option value="encargo_aberto">Encargo aberto</option>
                      <option value="multa">Multa</option>
                    </select>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <input
                      type="number"
                      value={item.valor}
                      onChange={(e) => atualizarItem(idx, 'valor', parseFloat(e.target.value) || 0)}
                      step="0.01"
                      min="0"
                      style={{
                        width: '100%',
                        padding: '6px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        textAlign: 'right',
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    <button
                      onClick={() => removerItem(idx)}
                      style={{
                        background: '#FF5252',
                        color: '#fff',
                        border: 'none',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <button
          onClick={() => {
            setItens([
              ...itens,
              {
                descricao: '',
                origem: 'estimativa',
                valor: 0,
                tipo: 'debito',
              },
            ]);
          }}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            backgroundColor: '#0066cc',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          + Adicionar débito
        </button>
        <p style={{ marginTop: '12px', fontWeight: 'bold' }}>
          Total de débitos: {formatarMoeda(totalDebitos)}
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Créditos</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd' }}>
              <th style={{ textAlign: 'left', padding: '8px' }}>Descrição</th>
              <th style={{ textAlign: 'right', padding: '8px', width: '120px' }}>Valor</th>
              <th style={{ padding: '8px', width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {itens
              .map((item, idx) => ({ item, idx }))
              .filter(({ item }) => item.tipo === 'credito')
              .map(({ item, idx }) => (
                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>
                    <input
                      type="text"
                      value={item.descricao}
                      onChange={(e) => atualizarItem(idx, 'descricao', e.target.value)}
                      placeholder="Ex: Adiantamento de aluguel"
                      style={{
                        width: '100%',
                        padding: '6px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right' }}>
                    <input
                      type="number"
                      value={item.valor}
                      onChange={(e) => atualizarItem(idx, 'valor', parseFloat(e.target.value) || 0)}
                      step="0.01"
                      min="0"
                      style={{
                        width: '100%',
                        padding: '6px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        textAlign: 'right',
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    <button
                      onClick={() => removerItem(idx)}
                      style={{
                        background: '#FF5252',
                        color: '#fff',
                        border: 'none',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        <button
          onClick={() => {
            setItens([
              ...itens,
              {
                descricao: '',
                origem: 'adiantamento',
                valor: 0,
                tipo: 'credito',
              },
            ]);
          }}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            backgroundColor: '#0066cc',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          + Adicionar crédito
        </button>

        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            <strong>Caução (valor manual / extrato bancário):</strong>
            <input
              type="number"
              value={caucaoManual}
              onChange={(e) => setCaucaoManual(e.target.value)}
              step="0.01"
              min="0"
              placeholder="0.00"
              style={{
                width: '200px',
                padding: '6px',
                marginLeft: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
            />
          </label>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
            Deixe em branco para usar o cálculo automático do índice da poupança
          </p>
        </div>

        <p style={{ marginTop: '12px', fontWeight: 'bold' }}>
          Total de créditos: {formatarMoeda(totalCreditos)}
        </p>
      </div>

      <div
        style={{
          padding: '16px',
          backgroundColor: saldoFinal >= 0 ? '#E8F5E9' : '#FFEBEE',
          borderRadius: '4px',
          marginBottom: '20px',
          borderLeft: `4px solid ${saldoFinal >= 0 ? '#4CAF50' : '#FF5252'}`,
        }}
      >
        <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>
          <strong>Saldo final:</strong>
        </p>
        <p style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: saldoFinal >= 0 ? '#4CAF50' : '#FF5252' }}>
          {saldoFinal >= 0
            ? `A devolver ao inquilino: ${formatarMoeda(saldoFinal)}`
            : `A cobrar do inquilino: ${formatarMoeda(Math.abs(saldoFinal))}`}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={handleSalvar}
          disabled={salvando}
          style={{
            padding: '12px 24px',
            backgroundColor: '#4CAF50',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: salvando ? 'not-allowed' : 'pointer',
            opacity: salvando ? 0.6 : 1,
          }}
        >
          {salvando ? 'Salvando...' : 'Salvar e gerar PDF'}
        </button>
        <button
          onClick={() => router.back()}
          style={{
            padding: '12px 24px',
            backgroundColor: '#999',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
