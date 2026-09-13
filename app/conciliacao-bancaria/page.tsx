'use client';

import { useState, useEffect } from 'react';
import { formatarData, formatarMoeda } from '@/lib/formatacao';
import { aprovarTransacao, ignorarTransacao } from './actions';
import { FormularioUploadOFX } from './FormularioUploadOFX';

interface LinhaTransacao {
  id: string;
  conta: string;
  data: string;
  valor: string;
  descricao: string | null;
  origem: string;
  categoria_sugerida: string | null;
}

interface OpcaoCategoria {
  id: string;
  nome: string;
}

interface ContaBancaria {
  id: string;
  instituicao: string;
}

export default function PaginaConciliacaoBancaria() {
  const [transacoes, setTransacoes] = useState<LinhaTransacao[]>([]);
  const [categorias, setCategorias] = useState<OpcaoCategoria[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        const [resTransacoes, resCategorias, resContas] = await Promise.all([
          fetch('/api/conciliacao-bancaria/transacoes').then((r) => r.json()),
          fetch('/api/conciliacao-bancaria/categorias').then((r) => r.json()),
          fetch('/api/contas-bancarias').then((r) => r.json()),
        ]);

        setTransacoes(resTransacoes);
        setCategorias(resCategorias);
        setContas(resContas);
      } catch {
        setErro('Não foi possível conectar ao banco (DATABASE_URL não configurada ou banco fora do ar).');
      } finally {
        setCarregando(false);
      }
    }

    carregar();
  }, []);

  async function handleUploadSucesso() {
    try {
      const res = await fetch('/api/conciliacao-bancaria/transacoes');
      const novasTransacoes = await res.json();
      setTransacoes(novasTransacoes);
    } catch {
      setErro('Erro ao recarregar transações após upload.');
    }
  }

  if (carregando) {
    return (
      <>
        <h2>Conciliação Bancária</h2>
        <p>Carregando...</p>
      </>
    );
  }

  if (erro) {
    return (
      <>
        <h2>Conciliação Bancária</h2>
        <p className="erro-conexao">{erro}</p>
      </>
    );
  }

  return (
    <>
      <h2>Conciliação Bancária ({transacoes.length} pendentes)</h2>
      <p>Transações importadas (OFX ou lançadas manualmente) que ainda não foram revisadas. Nenhuma vira DRE oficial sem aprovação humana.</p>

      <div className="secao-upload">
        <FormularioUploadOFX contas={contas} onUploadSucesso={handleUploadSucesso} />
      </div>

      {transacoes.length === 0 ? (
        <p className="vazio">Nenhuma transação pendente de conciliação.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Conta</th>
              <th>Data</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Origem</th>
              <th>Categoria</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {transacoes.map((t) => (
              <tr key={t.id}>
                <td>{t.conta}</td>
                <td>{formatarData(t.data)}</td>
                <td>{t.descricao ?? '—'}</td>
                <td className={Number(t.valor) < 0 ? 'valor-negativo' : undefined}>{formatarMoeda(t.valor)}</td>
                <td>{t.origem}</td>
                <td>
                  <form action={aprovarTransacao} className="formulario-linha">
                    <input type="hidden" name="id" value={t.id} />
                    <select name="categoria_final_id" defaultValue={t.categoria_sugerida ?? ''}>
                      <option value="">Sem categoria</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                    <button type="submit">Aprovar</button>
                  </form>
                </td>
                <td>
                  <form action={ignorarTransacao}>
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit" className="botao-secundario">
                      Ignorar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
