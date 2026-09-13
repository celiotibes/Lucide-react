'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Imovel {
  id: string;
  identificacao: string;
  permite_temporada: boolean;
}

interface Comodo {
  id: string;
  identificacao: string;
}

export default function PaginaNovaHospedagem() {
  const router = useRouter();
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [comodos, setComodos] = useState<Comodo[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [formulario, setFormulario] = useState({
    imovelId: '',
    comodoDid: '',
    periodoInicio: '',
    periodoFim: '',
    diasHospedados: 1,
    valorDiaria: 0,
    plataforma: 'airbnb' as 'airbnb' | 'booking' | 'outro',
    platformaIdExterno: '',
  });

  useEffect(() => {
    buscarImoveis();
  }, []);

  async function buscarImoveis() {
    try {
      const res = await fetch('/api/imoveis?permite_temporada=true');
      if (res.ok) {
        setImoveis(await res.json());
      }
    } catch (e) {
      setErro('Erro ao carregar imóveis');
    }
  }

  async function buscarComodos(imovelId: string) {
    if (!imovelId) {
      setComodos([]);
      return;
    }
    try {
      const res = await fetch(`/api/imoveis/${imovelId}/comodos`);
      if (res.ok) {
        setComodos(await res.json());
      }
    } catch (e) {
      setComodos([]);
    }
  }

  function handleChangeImovel(imovelId: string) {
    setFormulario({ ...formulario, imovelId, comodoDid: '' });
    buscarComodos(imovelId);
  }

  function handleChangeData(campo: 'periodoInicio' | 'periodoFim', valor: string) {
    setFormulario({ ...formulario, [campo]: valor });

    // Calcular dias automaticamente
    if (formulario.periodoInicio && formulario.periodoFim) {
      const inicio = new Date(formulario.periodoInicio);
      const fim = new Date(formulario.periodoFim);
      const dias = Math.ceil((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
      if (dias > 0) {
        setFormulario((f) => ({ ...f, diasHospedados: dias }));
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro('');
    setSucesso('');

    if (!formulario.imovelId) {
      setErro('Selecione um imóvel');
      setLoading(false);
      return;
    }

    if (!formulario.periodoInicio || !formulario.periodoFim) {
      setErro('Informe período de início e fim');
      setLoading(false);
      return;
    }

    if (formulario.diasHospedados <= 0 || formulario.valorDiaria <= 0) {
      setErro('Dias e valor da diária devem ser maiores que zero');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/hospedagens/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imovelId: formulario.imovelId,
          comodoDid: formulario.comodoDid || null,
          periodoInicio: new Date(formulario.periodoInicio),
          periodoFim: new Date(formulario.periodoFim),
          diasHospedados: formulario.diasHospedados,
          valorDiaria: formulario.valorDiaria,
          plataforma: formulario.plataforma,
          platformaIdExterno: formulario.platformaIdExterno || null,
        }),
      });

      if (res.ok) {
        const resultado = await res.json();
        setSucesso(`Hospedagem registrada! Vistorias criadas automaticamente.`);
        setTimeout(() => {
          router.push(`/hospedagens/${resultado.hospedagemId}`);
        }, 2000);
      } else {
        const erro = await res.json();
        setErro(erro.erro || 'Erro ao registrar hospedagem');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  const imovelSelecionado = imoveis.find((i) => i.id === formulario.imovelId);
  const receita = formulario.diasHospedados * formulario.valorDiaria;

  return (
    <div className="container-nova-hospedagem">
      <div className="cabecalho-lista">
        <h2>Registrar nova hospedagem (Airbnb/Booking)</h2>
        <Link href="/hospedagens" className="botao-secundario">
          ← Voltar
        </Link>
      </div>

      {erro && <div className="mensagem-erro">{erro}</div>}
      {sucesso && <div className="mensagem-sucesso">{sucesso}</div>}

      <form onSubmit={handleSubmit} className="formulario-hospedagem">
        <section className="secao-formulario">
          <h3>Imóvel e período</h3>

          <div className="campo-formulario">
            <label htmlFor="imovel">Imóvel *</label>
            <select
              id="imovel"
              value={formulario.imovelId}
              onChange={(e) => handleChangeImovel(e.target.value)}
              required
            >
              <option value="">— Selecione um imóvel —</option>
              {imoveis.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.identificacao}
                </option>
              ))}
            </select>
          </div>

          {formulario.imovelId && comodos.length > 0 && (
            <div className="campo-formulario">
              <label htmlFor="comodo">
                Quarto específico (opcional — deixe em branco para imóvel inteiro)
              </label>
              <select
                id="comodo"
                value={formulario.comodoDid}
                onChange={(e) => setFormulario({ ...formulario, comodoDid: e.target.value })}
              >
                <option value="">— Imóvel inteiro —</option>
                {comodos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.identificacao}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="linha-campos">
            <div className="campo-formulario">
              <label htmlFor="inicio">Período - Início *</label>
              <input
                id="inicio"
                type="date"
                value={formulario.periodoInicio}
                onChange={(e) => handleChangeData('periodoInicio', e.target.value)}
                required
              />
            </div>
            <div className="campo-formulario">
              <label htmlFor="fim">Período - Fim *</label>
              <input
                id="fim"
                type="date"
                value={formulario.periodoFim}
                onChange={(e) => handleChangeData('periodoFim', e.target.value)}
                required
              />
            </div>
          </div>
        </section>

        <section className="secao-formulario">
          <h3>Valor e plataforma</h3>

          <div className="linha-campos">
            <div className="campo-formulario">
              <label htmlFor="dias">Dias hospedados *</label>
              <input
                id="dias"
                type="number"
                min="1"
                value={formulario.diasHospedados}
                onChange={(e) => setFormulario({ ...formulario, diasHospedados: parseInt(e.target.value) })}
                required
              />
            </div>
            <div className="campo-formulario">
              <label htmlFor="valor">Valor da diária (R$) *</label>
              <input
                id="valor"
                type="number"
                min="0"
                step="0.01"
                value={formulario.valorDiaria}
                onChange={(e) => setFormulario({ ...formulario, valorDiaria: parseFloat(e.target.value) })}
                required
              />
            </div>
          </div>

          {receita > 0 && (
            <div className="resumo-receita">
              <strong>Receita estimada:</strong> R$ {receita.toFixed(2)} ({formulario.diasHospedados} dias × R$ {formulario.valorDiaria.toFixed(2)})
            </div>
          )}

          <div className="linha-campos">
            <div className="campo-formulario">
              <label htmlFor="plataforma">Plataforma *</label>
              <select
                id="plataforma"
                value={formulario.plataforma}
                onChange={(e) => setFormulario({ ...formulario, plataforma: e.target.value as any })}
                required
              >
                <option value="airbnb">Airbnb</option>
                <option value="booking">Booking</option>
                <option value="outro">Outra</option>
              </select>
            </div>
            <div className="campo-formulario">
              <label htmlFor="id-externo">ID externo (ex: listing ID do Airbnb)</label>
              <input
                id="id-externo"
                type="text"
                value={formulario.platformaIdExterno}
                onChange={(e) => setFormulario({ ...formulario, platformaIdExterno: e.target.value })}
                placeholder="Opcional"
              />
            </div>
          </div>
        </section>

        <div className="info-automatica">
          <p>
            ℹ️ <strong>Automático:</strong> Ao registrar, o sistema criará automaticamente:
          </p>
          <ul>
            <li>Vistoria de entrada (marcada como concluída)</li>
            <li>Vistoria de saída (em andamento, para confirmar checkout)</li>
            <li>Registro de hospedagem temporária no banco de dados</li>
          </ul>
          {formulario.comodoDid && (
            <p>
              💡 A receita desta hospedagem <strong>reduzirá a cobrança de energia</strong> do colega que permanece no
              outro quarto.
            </p>
          )}
        </div>

        <div className="botoes-formulario">
          <Link href="/hospedagens" className="botao-cancelar">
            Cancelar
          </Link>
          <button
            type="submit"
            className="botao-enviar"
            disabled={loading || !formulario.imovelId}
          >
            {loading ? 'Registrando...' : '✓ Registrar hospedagem'}
          </button>
        </div>
      </form>

      <style jsx>{`
        .container-nova-hospedagem {
          max-width: 700px;
        }

        .formulario-hospedagem {
          background: white;
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .secao-formulario {
          margin-bottom: 30px;
        }

        .secao-formulario h3 {
          font-size: 1rem;
          margin-bottom: 15px;
          color: #333;
          padding-bottom: 10px;
          border-bottom: 2px solid #f0f0f0;
        }

        .campo-formulario {
          margin-bottom: 15px;
        }

        .campo-formulario label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: #555;
          font-size: 0.95rem;
        }

        .campo-formulario input,
        .campo-formulario select {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 0.95rem;
          font-family: inherit;
        }

        .campo-formulario input:focus,
        .campo-formulario select:focus {
          outline: none;
          border-color: #007bff;
          box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
        }

        .linha-campos {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
        }

        @media (max-width: 600px) {
          .linha-campos {
            grid-template-columns: 1fr;
          }
        }

        .resumo-receita {
          background: #f0f8ff;
          border-left: 4px solid #007bff;
          padding: 12px 15px;
          border-radius: 4px;
          margin: 15px 0;
          font-size: 0.95rem;
          color: #004085;
        }

        .info-automatica {
          background: #fff3cd;
          border: 1px solid #ffeaa7;
          border-radius: 4px;
          padding: 15px;
          margin: 25px 0;
          color: #856404;
        }

        .info-automatica p {
          margin: 0 0 10px 0;
          font-size: 0.95rem;
          font-weight: 500;
        }

        .info-automatica ul {
          margin: 0;
          padding-left: 20px;
          font-size: 0.9rem;
        }

        .info-automatica li {
          margin: 5px 0;
        }

        .botoes-formulario {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #eee;
        }

        .botao-cancelar,
        .botao-enviar {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.95rem;
          font-weight: 500;
          transition: all 0.2s;
        }

        .botao-cancelar {
          background: #f0f0f0;
          color: #333;
          text-decoration: none;
          display: inline-block;
          text-align: center;
        }

        .botao-cancelar:hover {
          background: #e0e0e0;
        }

        .botao-enviar {
          background: #28a745;
          color: white;
        }

        .botao-enviar:hover:not(:disabled) {
          background: #218838;
        }

        .botao-enviar:disabled {
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
      `}</style>
    </div>
  );
}
