import { useState, useMemo } from "react";
import { Clock, Calendar, BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { useDb } from "../../db/useDb";
import { consultar, executar } from "../../db/connection";
import type { ApontamentoDiario, Prestador, ItemRemunerable } from "../../domain/types";
import { TabAgenda } from "./TabAgenda";
import { TabApontamentos } from "./TabApontamentos";
import { TabPreviaSemanal } from "./TabPreviaSemanal";

type Tab = "agenda" | "apontamentos" | "previa";

interface Props {
  aoNavegar?: (aba: string) => void;
}

export function PortalPrestador({ aoNavegar }: Props) {
  const { db, versao, persistir } = useDb();
  const [abaAtiva, setAbaAtiva] = useState<Tab>("agenda");
  const [prestadorSelecionado, setPrestadorSelecionado] = useState<number | null>(null);
  const [apontamentoEmEdicao, setApontamentoEmEdicao] = useState<ApontamentoDiario | null>(null);
  const [dataSelecionada, setDataSelecionada] = useState<string>(new Date().toISOString().split("T")[0]);

  const prestadores = useMemo<Prestador[]>(
    () => (db ? consultar<Prestador>(db, "SELECT id, nome, cpf_cnpj, servico FROM prestadores ORDER BY nome") : []),
    [db, versao]
  );

  const apontamentosDoMes = useMemo<ApontamentoDiario[]>(() => {
    if (!db || !prestadorSelecionado) return [];
    const mesAno = dataSelecionada.slice(0, 7); // YYYY-MM
    const inicio = `${mesAno}-01`;
    const fim = `${mesAno}-31`;
    return consultar<ApontamentoDiario>(
      db,
      "SELECT * FROM apontamentos_diarios WHERE prestador_id = ? AND data BETWEEN ? AND ? ORDER BY data DESC",
      [prestadorSelecionado, inicio, fim]
    );
  }, [db, versao, prestadorSelecionado, dataSelecionada]);

  const apontamentoHoje = useMemo<ApontamentoDiario | null>(
    () => apontamentosDoMes.find((a) => a.data === dataSelecionada) || null,
    [apontamentosDoMes, dataSelecionada]
  );

  async function criarOuAtualizarApontamento(dados: Partial<ApontamentoDiario>) {
    if (!db || !prestadorSelecionado) return;
    const agora = new Date().toISOString();

    if (apontamentoHoje) {
      executar(
        db,
        "UPDATE apontamentos_diarios SET entrada = ?, saida_intervalo = ?, retorno_intervalo = ?, saida_final = ?, status = ?, observacoes = ?, atualizado_em = ? WHERE id = ?",
        [
          dados.entrada ?? apontamentoHoje.entrada,
          dados.saida_intervalo ?? apontamentoHoje.saida_intervalo,
          dados.retorno_intervalo ?? apontamentoHoje.retorno_intervalo,
          dados.saida_final ?? apontamentoHoje.saida_final,
          dados.status ?? apontamentoHoje.status,
          dados.observacoes ?? apontamentoHoje.observacoes,
          agora,
          apontamentoHoje.id,
        ]
      );
    } else {
      executar(
        db,
        "INSERT INTO apontamentos_diarios (prestador_id, data, entrada, saida_intervalo, retorno_intervalo, saida_final, status, observacoes, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          prestadorSelecionado,
          dataSelecionada,
          dados.entrada || "",
          dados.saida_intervalo || null,
          dados.retorno_intervalo || null,
          dados.saida_final || "",
          dados.status || "rascunho",
          dados.observacoes || null,
          agora,
          agora,
        ]
      );
    }
    await persistir();
  }

  const handleMesAnterior = () => {
    const [ano, mes] = dataSelecionada.split("-");
    let novoMes = parseInt(mes) - 1;
    let novoAno = parseInt(ano);
    if (novoMes < 1) {
      novoMes = 12;
      novoAno--;
    }
    setDataSelecionada(`${novoAno}-${String(novoMes).padStart(2, "0")}-01`);
  };

  const handleProximoMes = () => {
    const [ano, mes] = dataSelecionada.split("-");
    let novoMes = parseInt(mes) + 1;
    let novoAno = parseInt(ano);
    if (novoMes > 12) {
      novoMes = 1;
      novoAno++;
    }
    setDataSelecionada(`${novoAno}-${String(novoMes).padStart(2, "0")}-01`);
  };

  if (!prestadorSelecionado) {
    return (
      <div style={{ padding: "20px" }}>
        <h2 className="section-title">Portal do Prestador</h2>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 20 }}>
          Selecione um prestador para registrar apontamentos de jornada, visualizar agenda de serviços e acompanhar
          remuneração.
        </p>

        {prestadores.length === 0 ? (
          <div className="card" style={{ padding: 20, textAlign: "center" }}>
            <p>Nenhum prestador cadastrado. Acesse "Cadastros" para registrar prestadores de serviço.</p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {prestadores.map((p) => (
              <button
                key={p.id}
                className="card"
                onClick={() => setPrestadorSelecionado(p.id)}
                style={{
                  cursor: "pointer",
                  padding: "16px",
                  textAlign: "left",
                  border: "1px solid var(--ink-lighter)",
                  borderRadius: "6px",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--ink-base)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--ink-lighter)")}
              >
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{p.nome}</h3>
                <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>{p.servico}</p>
                {p.cpf_cnpj && <p style={{ fontSize: 11, color: "var(--ink-softer)" }}>{p.cpf_cnpj}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const prestador = prestadores.find((p) => p.id === prestadorSelecionado);
  const mesAnoAtual = dataSelecionada.slice(0, 7);

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 className="section-title">Portal do Prestador</h2>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
            {prestador?.nome} • {prestador?.servico}
          </p>
        </div>
        <button
          className="btn"
          onClick={() => {
            setPrestadorSelecionado(null);
            setApontamentoEmEdicao(null);
          }}
        >
          Trocar prestador
        </button>
      </div>

      {/* Navegação de mês */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button className="btn" onClick={handleMesAnterior} title="Mês anterior">
          <ChevronLeft size={16} />
        </button>
        <h3 style={{ fontSize: 14, fontWeight: 600 }}>
          {new Date(`${mesAnoAtual}-01`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </h3>
        <button className="btn" onClick={handleProximoMes} title="Próximo mês">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid var(--ink-lighter)" }}>
        {[
          { id: "agenda" as Tab, label: "Agenda", icon: Calendar },
          { id: "apontamentos" as Tab, label: "Apontamentos", icon: Clock },
          { id: "previa" as Tab, label: "Prévia Semanal", icon: BarChart3 },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => {
              setAbaAtiva(id);
              setApontamentoEmEdicao(null);
            }}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: "none",
              borderBottom: abaAtiva === id ? "2px solid var(--ink-base)" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: abaAtiva === id ? 600 : 400,
              color: abaAtiva === id ? "var(--ink-base)" : "var(--ink-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "all 0.2s",
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo das abas */}
      {abaAtiva === "agenda" && (
        <TabAgenda
          prestadorId={prestadorSelecionado}
          dataSelecionada={dataSelecionada}
          apontamentoHoje={apontamentoHoje}
          onSelecionarApontamento={(apt) => {
            setApontamentoEmEdicao(apt);
            setAbaAtiva("apontamentos");
          }}
        />
      )}

      {abaAtiva === "apontamentos" && (
        <TabApontamentos
          db={db}
          prestadorId={prestadorSelecionado}
          dataSelecionada={dataSelecionada}
          apontamentoAtual={apontamentoHoje}
          onSalvar={criarOuAtualizarApontamento}
          onPersistir={persistir}
          versao={versao}
        />
      )}

      {abaAtiva === "previa" && (
        <TabPreviaSemanal
          db={db}
          prestadorId={prestadorSelecionado}
          dataSelecionada={dataSelecionada}
          versao={versao}
        />
      )}
    </div>
  );
}
