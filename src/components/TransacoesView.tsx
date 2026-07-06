import { useMemo, useState } from "react";
import { useDb } from "../db/DbContext";
import { consultar, executar } from "../db/connection";
import type { PlanoConta, Transacao } from "../domain/types";

export function TransacoesView() {
  const { db, versao, persistir } = useDb();
  const [somentePendentes, setSomentePendentes] = useState(false);

  const planoContas = useMemo<PlanoConta[]>(() => (db ? consultar<PlanoConta>(db, "SELECT * FROM plano_de_contas ORDER BY codigo") : []), [db, versao]);

  const transacoes = useMemo<Transacao[]>(() => {
    if (!db) return [];
    const filtro = somentePendentes ? "WHERE plano_conta_codigo IS NULL" : "";
    return consultar<Transacao>(db, `SELECT * FROM transacoes ${filtro} ORDER BY data DESC LIMIT 300`);
  }, [db, versao, somentePendentes]);

  const totalPendentes = useMemo(
    () => (db ? consultar<{ total: number }>(db, "SELECT COUNT(*) as total FROM transacoes WHERE plano_conta_codigo IS NULL")[0]?.total ?? 0 : 0),
    [db, versao],
  );

  async function categorizar(transacaoId: number, codigo: string) {
    if (!db) return;
    executar(db, "UPDATE transacoes SET plano_conta_codigo = ?, categorizado_por = 'manual' WHERE id = ?", [codigo || null, transacaoId]);
    await persistir();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h2 className="section-title">Transações {totalPendentes > 0 && <span className="pill warning">{totalPendentes} pendente(s) de categorização</span>}</h2>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5 }}>
          <input type="checkbox" checked={somentePendentes} onChange={(e) => setSomentePendentes(e.target.checked)} />
          Mostrar apenas pendentes
        </label>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th className="num">Valor</th>
              <th>Categoria</th>
              <th>Origem</th>
            </tr>
          </thead>
          <tbody>
            {transacoes.map((t) => (
              <tr key={t.id}>
                <td>{t.data}</td>
                <td>{t.descricao_original}</td>
                <td className="num" style={{ color: t.valor < 0 ? "var(--viz-despesa)" : "var(--viz-good)" }}>
                  {t.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
                <td>
                  <select value={t.plano_conta_codigo ?? ""} onChange={(e) => categorizar(t.id, e.target.value)}>
                    <option value="">— sem categoria —</option>
                    {planoContas.map((p) => (
                      <option key={p.codigo} value={p.codigo}>
                        {p.codigo} · {p.descricao}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {t.categorizado_por ? <span className="pill good">{t.categorizado_por}</span> : <span className="pill warning">pendente</span>}
                </td>
              </tr>
            ))}
            {transacoes.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhuma transação encontrada. Importe documentos ou carregue os dados de demonstração.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
