import { useState, useMemo } from "react";
import type { Database } from "sql.js";
import { Clock, Plus, Trash2, CheckCircle, AlertCircle } from "lucide-react";
import { consultar, executar } from "../../db/connection";
import type { ApontamentoDiario, ItemRemunerable } from "../../domain/types";
import { HorarioAutomatico } from "./HorarioAutomatico";
import { MemoriaCalculo } from "./MemoriaCalculo";

interface Props {
  db: Database | null;
  prestadorId: number;
  dataSelecionada: string;
  apontamentoAtual: ApontamentoDiario | null;
  onSalvar: (dados: Partial<ApontamentoDiario>) => Promise<void>;
  onPersistir: () => Promise<void>;
  versao: number;
}

type SecaoAtiva = "entrada" | "intervalo" | "atividades" | "saida" | "envio";

export function TabApontamentos({
  db,
  prestadorId,
  dataSelecionada,
  apontamentoAtual,
  onSalvar,
  onPersistir,
  versao,
}: Props) {
  const [secaoAtiva, setSecaoAtiva] = useState<SecaoAtiva>("entrada");
  const [horarioCapturado, setHorarioCapturado] = useState<{ tipo: string; horario: string } | null>(null);
  const [novaAtividade, setNovaAtividade] = useState({ rubrica: "", tipo: "diaria" as const, valor: 0 });
  const [observacoes, setObservacoes] = useState("");

  const atividades = useMemo<ItemRemunerable[]>(
    () => (db && apontamentoAtual ? consultar<ItemRemunerable>(db, "SELECT * FROM itens_remuneraveis WHERE apontamento_id = ? ORDER BY criado_em", [apontamentoAtual.id]) : []),
    [db, versao, apontamentoAtual]
  );

  const totalRemuneracao = useMemo(() => atividades.reduce((sum, a) => sum + a.valor_final, 0), [atividades]);

  const podeAvansarParaIntervalo = apontamentoAtual?.entrada && !apontamentoAtual?.saida_intervalo;
  const podeAvansarParaRetorno = apontamentoAtual?.saida_intervalo && !apontamentoAtual?.retorno_intervalo;
  const podeAvansarParaSaida = apontamentoAtual?.entrada && apontamentoAtual?.saida_final === null;

  const adicionarAtividade = async () => {
    if (!db || !apontamentoAtual || !novaAtividade.rubrica) return;

    const agora = new Date().toISOString();
    executar(
      db,
      "INSERT INTO itens_remuneraveis (apontamento_id, tipo, rubrica, valor_base, adicional_percentual, valor_final, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [apontamentoAtual.id, novaAtividade.tipo, novaAtividade.rubrica, novaAtividade.valor, 0, novaAtividade.valor, agora]
    );
    await onPersistir();
    setNovaAtividade({ rubrica: "", tipo: "diaria", valor: 0 });
  };

  const removerAtividade = async (id: number) => {
    if (!db) return;
    executar(db, "DELETE FROM itens_remuneraveis WHERE id = ?", [id]);
    await onPersistir();
  };

  const confirmarHorario = async (tipo: string, horario: string) => {
    if (!apontamentoAtual) return;

    const dados: Partial<ApontamentoDiario> = {};
    switch (tipo) {
      case "chegada":
        dados.entrada = horario;
        setSecaoAtiva("intervalo");
        break;
      case "saida_intervalo":
        dados.saida_intervalo = horario;
        setSecaoAtiva("atividades");
        break;
      case "retorno":
        dados.retorno_intervalo = horario;
        setSecaoAtiva("saida");
        break;
      case "saida":
        dados.saida_final = horario;
        setSecaoAtiva("envio");
        break;
    }

    await onSalvar(dados);
    setHorarioCapturado(null);
  };

  return (
    <div>
      {!apontamentoAtual ? (
        <div className="card" style={{ padding: 20, textAlign: "center", backgroundColor: "rgba(0, 0, 0, 0.02)" }}>
          <AlertCircle size={24} style={{ marginBottom: 12, color: "var(--ink-soft)" }} />
          <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>Nenhum apontamento registrado para {new Date(dataSelecionada).toLocaleDateString("pt-BR")}</p>
          <p style={{ fontSize: 12, color: "var(--ink-softer)", marginTop: 8 }}>
            Registre a entrada e saída do dia usando os botões abaixo.
          </p>
        </div>
      ) : (
        <>
          {/* Seção 1: Entrada */}
          <div className="card" style={{ marginBottom: 16, padding: 14, borderLeft: "4px solid var(--viz-good)" }}>
            <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={14} /> Entrada
            </h4>
            {apontamentoAtual.entrada ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Chegada às {apontamentoAtual.entrada}</div>
                <span style={{ fontSize: 12, color: "var(--viz-good)", fontWeight: 500 }}>✓ Registrado</span>
              </div>
            ) : horarioCapturado?.tipo === "chegada" ? (
              <HorarioAutomatico horario={horarioCapturado.horario} onConfirmar={() => confirmarHorario("chegada", horarioCapturado.horario)} onRejeitar={() => setHorarioCapturado(null)} />
            ) : (
              <button
                className="btn primary"
                onClick={() => {
                  const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                  setHorarioCapturado({ tipo: "chegada", horario: agora });
                }}
              >
                Cheguei
              </button>
            )}
          </div>

          {/* Seção 2: Intervalo */}
          {podeAvansarParaIntervalo && (
            <div className="card" style={{ marginBottom: 16, padding: 14, borderLeft: "4px solid var(--viz-warn)" }}>
              <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Intervalo / Almoço</h4>
              <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 12 }}>Sugestão: pausa de 1 hora. Você pode ajustar o horário depois.</p>

              {apontamentoAtual.saida_intervalo ? (
                <div style={{ display: "flex", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Saída para almoço</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{apontamentoAtual.saida_intervalo}</div>
                  </div>
                  {apontamentoAtual.retorno_intervalo && (
                    <div>
                      <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Retorno</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{apontamentoAtual.retorno_intervalo}</div>
                    </div>
                  )}
                </div>
              ) : horarioCapturado?.tipo === "saida_intervalo" ? (
                <HorarioAutomatico
                  horario={horarioCapturado.horario}
                  onConfirmar={() => confirmarHorario("saida_intervalo", horarioCapturado.horario)}
                  onRejeitar={() => setHorarioCapturado(null)}
                />
              ) : (
                <button
                  className="btn"
                  onClick={() => {
                    const agora = new Date();
                    const horariosaidaintervalo = new Date(agora.getTime() + 30 * 60000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                    setHorarioCapturado({ tipo: "saida_intervalo", horario: horariosaidaintervalo });
                  }}
                >
                  Iniciar Almoço
                </button>
              )}
            </div>
          )}

          {/* Seção 3: Atividades Realizadas */}
          {apontamentoAtual.entrada && (
            <div className="card" style={{ marginBottom: 16, padding: 14, borderLeft: "4px solid var(--viz-info)" }}>
              <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Atividades Realizadas</h4>

              {atividades.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {atividades.map((ativ) => (
                    <div
                      key={ativ.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 0",
                        borderBottom: "1px solid var(--ink-lighter)",
                        fontSize: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500 }}>{ativ.rubrica}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                          {ativ.tipo} • R$ {ativ.valor_final.toFixed(2)}
                        </div>
                      </div>
                      <button
                        className="btn"
                        onClick={() => removerAtividade(ativ.id)}
                        style={{ padding: 4, minWidth: 0 }}
                        title="Remover atividade"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="Descrição da atividade"
                  value={novaAtividade.rubrica}
                  onChange={(e) => setNovaAtividade({ ...novaAtividade, rubrica: e.target.value })}
                  style={{ flex: 1, padding: "8px 10px", borderRadius: "4px", border: "1px solid var(--ink-lighter)", fontSize: 12 }}
                />
                <select
                  value={novaAtividade.tipo}
                  onChange={(e) => setNovaAtividade({ ...novaAtividade, tipo: e.target.value as any })}
                  style={{ padding: "8px 10px", borderRadius: "4px", border: "1px solid var(--ink-lighter)", fontSize: 12 }}
                >
                  <option value="diaria">Diária</option>
                  <option value="airbnb">Airbnb</option>
                  <option value="urgencia">Urgência</option>
                  <option value="deslocamento">Deslocamento</option>
                  <option value="materiais">Materiais</option>
                  <option value="extra">Extra</option>
                </select>
                <input
                  type="number"
                  placeholder="Valor"
                  value={novaAtividade.valor || ""}
                  onChange={(e) => setNovaAtividade({ ...novaAtividade, valor: parseFloat(e.target.value) || 0 })}
                  step="0.01"
                  min="0"
                  style={{ width: 80, padding: "8px 10px", borderRadius: "4px", border: "1px solid var(--ink-lighter)", fontSize: 12 }}
                />
                <button className="btn primary" onClick={adicionarAtividade} style={{ padding: "8px 12px" }}>
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Seção 4: Saída Final */}
          {apontamentoAtual.entrada && podeAvansarParaSaida && (
            <div className="card" style={{ marginBottom: 16, padding: 14, borderLeft: "4px solid var(--viz-critical)" }}>
              <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Saída Final</h4>
              {horarioCapturado?.tipo === "saida" ? (
                <HorarioAutomatico
                  horario={horarioCapturado.horario}
                  onConfirmar={() => confirmarHorario("saida", horarioCapturado.horario)}
                  onRejeitar={() => setHorarioCapturado(null)}
                />
              ) : (
                <button
                  className="btn primary"
                  onClick={() => {
                    const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                    setHorarioCapturado({ tipo: "saida", horario: agora });
                  }}
                  style={{ width: "100%" }}
                >
                  Encerrar Jornada
                </button>
              )}
            </div>
          )}

          {/* Seção 5: Memória de Cálculo */}
          {apontamentoAtual.entrada && apontamentoAtual.saida_final && (
            <MemoriaCalculo
              entrada={apontamentoAtual.entrada}
              saidaFinal={apontamentoAtual.saida_final}
              saidaIntervalo={apontamentoAtual.saida_intervalo}
              retornoIntervalo={apontamentoAtual.retorno_intervalo}
              atividades={atividades}
              totalRemuneracao={totalRemuneracao}
            />
          )}

          {/* Observações */}
          {apontamentoAtual.entrada && (
            <div className="card" style={{ marginBottom: 16, padding: 14 }}>
              <h4 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Observações</h4>
              <textarea
                value={observacoes}
                onChange={(e) => {
                  setObservacoes(e.target.value);
                  onSalvar({ observacoes: e.target.value });
                }}
                placeholder="Registre qualquer observação sobre o trabalho do dia"
                style={{
                  width: "100%",
                  minHeight: 80,
                  padding: "10px",
                  borderRadius: "4px",
                  border: "1px solid var(--ink-lighter)",
                  fontSize: 12,
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
