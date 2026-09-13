'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatarData, formatarMoeda } from '@/lib/formatacao';

interface ContratoDetalhes {
  id: string;
  tipo: string;
  status: string;
  data_inicio: string;
  data_fim: string | null;
  valor_aluguel: string;
  dia_vencimento: number;
  imovel_identificacao: string;
  imovel_id: string;
  comodo_id: string | null;
  comodo_identificacao: string | null;
  locatario_nome: string | null;
  locatario_cpf_cnpj: string | null;
}

interface Contrato {
  id: string;
  tipo: string;
  status: string;
}

export default function PaginaDetalhesContrato({ params }: { params: Promise<{ id: string }> }) {
  const [contratoId, setContratoId] = useState('');
  const [contrato, setContrato] = useState<ContratoDetalhes | null>(null);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [showModalSubstituicao, setShowModalSubstituicao] = useState(false);
  const [novoContratoSelecionado, setNovoContratoSelecionado] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucessoMensagem, setSucessoMensagem] = useState('');

  useEffect(() => {
    params.then(({ id }) => {
      setContratoId(id);
      buscarDetalhes(id);
      buscarContratosCandidatos(id);
    });
  }, [params]);

  async function buscarDetalhes(id: string) {
    try {
      const res = await fetch(`/api/contratos/${id}`);
      if (res.ok) {
        setContrato(await res.json());
      } else {
        setErro('Não foi possível carregar os detalhes do contrato');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    }
  }

  async function buscarContratosCandidatos(id: string) {
    try {
      const res = await fetch(`/api/contratos/${id}/candidatos-substituicao`);
      if (res.ok) {
        setContratos(await res.json());
      }
    } catch (e) {
      // Silenciosamente ignora se a rota não existir
    }
  }

  async function executarSubstituicao() {
    if (!novoContratoSelecionado) {
      setErro('Selecione um novo contrato');
      return;
    }

    setLoading(true);
    setErro('');
    setSucessoMensagem('');

    try {
      const res = await fetch('/api/contratos/encerrar-substituicao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contratoAntigoId: contratoId,
          novoContratoCandidatoId: novoContratoSelecionado,
          motivoEncerramento: 'substituicao',
        }),
      });

      if (res.ok) {
        const resultado = await res.json();
        setSucessoMensagem(`Contrato encerrado. Vistoria de saída criada: ${resultado.vistoriaIdCriada}`);
        setShowModalSubstituicao(false);
        // Recarregar dados
        setTimeout(() => buscarDetalhes(contratoId), 1500);
      } else {
        const erro = await res.json();
        setErro(erro.erro || 'Erro ao encerrar contrato');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  if (!contrato) {
    return <p>Carregando...</p>;
  }

  const ativo = contrato.status === 'ativo';
  const ehColiving = contrato.comodo_id != null;

  return (
    <div className="container-detalhes-contrato">
      <div className="cabecalho-lista">
        <h2>Detalhes do Contrato</h2>
        <Link href="/contratos" className="botao-secundario">
          ← Voltar
        </Link>
      </div>

      {erro && <div className="mensagem-erro">{erro}</div>}
      {sucessoMensagem && <div className="mensagem-sucesso">{sucessoMensagem}</div>}

      <div className="bloco-informacoes">
        <div className="linha-info">
          <label>Imóvel</label>
          <span>
            {contrato.imovel_identificacao}
            {ehColiving && contrato.comodo_identificacao && ` — Quarto: ${contrato.comodo_identificacao}`}
          </span>
        </div>
        <div className="linha-info">
          <label>Locatário</label>
          <span>{contrato.locatario_nome ?? '—'}</span>
        </div>
        <div className="linha-info">
          <label>Período</label>
          <span>
            {formatarData(contrato.data_inicio)}
            {contrato.data_fim ? ` a ${formatarData(contrato.data_fim)}` : ' (indefinido)'}
          </span>
        </div>
        <div className="linha-info">
          <label>Aluguel</label>
          <span>{formatarMoeda(contrato.valor_aluguel)} (vencimento dia {contrato.dia_vencimento})</span>
        </div>
        <div className="linha-info">
          <label>Status</label>
          <span className="tag">{contrato.status}</span>
        </div>
      </div>

      <div className="secoes-contrato">
        <h3>Seções</h3>
        <ul className="lista-secoes">
          <li>
            <Link href={`/contratos/${contratoId}/contrato`}>📄 Ver/gerar contrato (HTML)</Link>
          </li>
          <li>
            <Link href={`/contratos/${contratoId}/documentos`}>📎 Documentos anexados</Link>
          </li>
          <li>
            <Link href={`/contratos/${contratoId}/vistorias`}>🔍 Vistorias</Link>
          </li>
          <li>
            <Link href={`/contratos/${contratoId}/reajustes`}>📊 Reajustes</Link>
          </li>
          {contrato.data_inicio && (
            <li>
              <Link href={`/contratos/${contratoId}/reequilibrio`}>⚖️ Reequilíbrio</Link>
            </li>
          )}
        </ul>
      </div>

      {ativo && ehColiving && (
        <div className="acoes-contrato">
          <h3>Ações</h3>
          <button
            className="botao-acao botao-encerramento"
            onClick={() => setShowModalSubstituicao(true)}
          >
            🚪 Encerrar por substituição de morador
          </button>
        </div>
      )}

      {showModalSubstituicao && (
        <div className="modal-backdrop" onClick={() => setShowModalSubstituicao(false)}>
          <div className="modal-conteudo" onClick={(e) => e.stopPropagation()}>
            <h3>Encerrar contrato por substituição</h3>
            <p>
              Ao encerrar este contrato, uma vistoria de saída será criada automaticamente. O novo morador deve ter um
              contrato já ativo no mesmo quarto.
            </p>

            <div className="formulario-modal">
              <label htmlFor="novo-contrato">Novo contrato (mesmo quarto):</label>
              <select
                id="novo-contrato"
                value={novoContratoSelecionado}
                onChange={(e) => setNovoContratoSelecionado(e.target.value)}
                disabled={contratos.length === 0}
              >
                <option value="">— Selecione um contrato —</option>
                {contratos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id}
                  </option>
                ))}
              </select>
              {contratos.length === 0 && (
                <p className="dica">
                  Nenhum contrato candidato encontrado no mesmo quarto. Crie um novo contrato primeiro.
                </p>
              )}
            </div>

            <div className="botoes-modal">
              <button
                className="botao-cancelar"
                onClick={() => setShowModalSubstituicao(false)}
                disabled={loading}
              >
                Cancelar
              </button>
              <button
                className="botao-confirmar"
                onClick={executarSubstituicao}
                disabled={loading || !novoContratoSelecionado}
              >
                {loading ? 'Processando...' : 'Encerrar e criar vistoria'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .container-detalhes-contrato {
          max-width: 900px;
        }

        .bloco-informacoes {
          background: #f5f5f5;
          border-radius: 6px;
          padding: 20px;
          margin: 20px 0;
          border-left: 4px solid #007bff;
        }

        .linha-info {
          display: grid;
          grid-template-columns: 150px 1fr;
          gap: 15px;
          padding: 10px 0;
          border-bottom: 1px solid #ddd;
        }

        .linha-info:last-child {
          border-bottom: none;
        }

        .linha-info label {
          font-weight: 600;
          color: #555;
        }

        .secoes-contrato,
        .acoes-contrato {
          margin-top: 30px;
        }

        .secoes-contrato h3,
        .acoes-contrato h3 {
          font-size: 1.1rem;
          margin-bottom: 15px;
          color: #333;
        }

        .lista-secoes {
          list-style: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .lista-secoes li a {
          display: block;
          padding: 10px 15px;
          background: #f9f9f9;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          text-decoration: none;
          color: #007bff;
          transition: all 0.2s;
        }

        .lista-secoes li a:hover {
          background: #f0f5ff;
          border-color: #007bff;
        }

        .botao-acao {
          padding: 12px 20px;
          border: none;
          border-radius: 4px;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .botao-encerramento {
          background: #dc3545;
          color: white;
        }

        .botao-encerramento:hover:not(:disabled) {
          background: #c82333;
        }

        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-conteudo {
          background: white;
          border-radius: 8px;
          padding: 30px;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .modal-conteudo h3 {
          margin-top: 0;
          margin-bottom: 15px;
          color: #333;
        }

        .modal-conteudo p {
          color: #666;
          font-size: 0.95rem;
          margin-bottom: 20px;
        }

        .formulario-modal {
          margin: 20px 0;
        }

        .formulario-modal label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #555;
        }

        .formulario-modal select {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 0.95rem;
          font-family: inherit;
        }

        .formulario-modal select:disabled {
          background: #f5f5f5;
          color: #999;
        }

        .dica {
          color: #999;
          font-size: 0.85rem;
          margin-top: 8px;
          font-style: italic;
        }

        .botoes-modal {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 25px;
          padding-top: 20px;
          border-top: 1px solid #eee;
        }

        .botao-cancelar,
        .botao-confirmar {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.95rem;
          transition: all 0.2s;
        }

        .botao-cancelar {
          background: #f0f0f0;
          color: #333;
        }

        .botao-cancelar:hover:not(:disabled) {
          background: #e0e0e0;
        }

        .botao-confirmar {
          background: #dc3545;
          color: white;
        }

        .botao-confirmar:hover:not(:disabled) {
          background: #c82333;
        }

        .botao-cancelar:disabled,
        .botao-confirmar:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .mensagem-erro {
          background: #f8d7da;
          color: #721c24;
          padding: 12px 15px;
          border-radius: 4px;
          margin-bottom: 15px;
          border: 1px solid #f5c6cb;
        }

        .mensagem-sucesso {
          background: #d4edda;
          color: #155724;
          padding: 12px 15px;
          border-radius: 4px;
          margin-bottom: 15px;
          border: 1px solid #c3e6cb;
        }

        .tag {
          display: inline-block;
          padding: 4px 12px;
          background: #007bff;
          color: white;
          border-radius: 3px;
          font-size: 0.85rem;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
