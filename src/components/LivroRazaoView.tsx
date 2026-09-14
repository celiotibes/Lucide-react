import { useMemo, useState } from "react";
import { useDb } from "../db/useDb";
import { gerarLancamentos, gerarBalancete, gerarRazaoDaConta } from "../domain/contabilidade/livroRazao";
import { formatarMoeda } from "../domain/formatarMoeda";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}
export function LivroRazaoView() {
  const { db, versao } = useDb();
  const hoje = hojeIso();
  const [periodoInicio, setPeriodoInicio] = useState(new Date(new Date(hoje).setMonth(new Date(hoje).getMonth() - 12)).toISOString().slice(0, 10));
  const [periodoFim, setPeriodoFim] = useState(hoje);
  const [contaSelecionada, setContaSelecionada] = useState<string | null>(null);

  const lancamentos = useMemo(() => (db ? gerarLancamentos(db, periodoInicio, periodoFim) : []), [db, versao, periodoInicio, periodoFim]);
  const balancete = useMemo(() => gerarBalancete(lancamentos), [lancamentos]);
  const razaoDaConta = useMemo(() => (contaSelecionada ? gerarRazaoDaConta(lancamentos, contaSelecionada) : []), [lancamentos, contaSelecionada]);

  const totalDebito = balancete.reduce((acc, l) => acc + l.totalDebito, 0);
  const totalCredito = balancete.reduce((acc, l) => acc + l.totalCredito, 0);

  return (
    <div>
      <h2 className="section-title">Livro razão e balancete</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Cada transação vira duas pernas (débito/crédito) derivadas na hora — entrada debita a conta bancária e
        credita a conta do plano de contas; saída faz o inverso. Nada é persistido separadamente, então isto nunca
        diverge das transações. É o ponto de partida que um contador usa para fechar um balanço formal.
      </p>

      <div className="form-grid" style={{ maxWidth: 420 }}>
        <label>
          Período — início
          <input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
        </label>
        <label>
          Período — fim
          <input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
        </label>
      </div>

      <h2 className="section-title">Balancete de verificação</h2>
      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table className="data-table">
          <thead>
            <tr><th>Conta</th><th className="num">Débito</th><th className="num">Crédito</th><th className="num">Saldo</th><th></th></tr>
          </thead>
          <tbody>
            {balancete.map((l) => (
              <tr key={l.conta}>
                <td>{l.conta}</td>
                <td className="num">{formatarMoeda(l.totalDebito)}</td>
                <td className="num">{formatarMoeda(l.totalCredito)}</td>
                <td className="num">{formatarMoeda(l.saldo)}</td>
                <td>
                  <button className="btn" style={{ padding: "3px 8px" }} onClick={() => setContaSelecionada(l.conta)}>
                    Ver razão
                  </button>
                </td>
              </tr>
            ))}
            <tr style={{ fontWeight: 600 }}>
              <td>Total</td>
              <td className="num">{formatarMoeda(totalDebito)}</td>
              <td className="num">{formatarMoeda(totalCredito)}</td>
              <td className="num">{formatarMoeda(totalDebito - totalCredito)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      {Math.abs(totalDebito - totalCredito) > 0.01 && (
        <div className="aviso-caixa">
          Total de débitos e créditos não bate — isso não deveria acontecer numa partida dobrada derivada
          corretamente; verifique se há transação sem `conta_id` válido.
        </div>
      )}

      {contaSelecionada && (
        <>
          <h2 className="section-title">Razão — {contaSelecionada}</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Data</th><th>Histórico</th><th className="num">Débito</th><th className="num">Crédito</th><th className="num">Saldo acumulado</th></tr>
              </thead>
              <tbody>
                {razaoDaConta.map((l) => (
                  <tr key={l.transacaoId}>
                    <td>{l.data}</td>
                    <td>{l.historico}</td>
                    <td className="num">{l.debito > 0 ? formatarMoeda(l.debito) : ""}</td>
                    <td className="num">{l.credito > 0 ? formatarMoeda(l.credito) : ""}</td>
                    <td className="num">{formatarMoeda(l.saldoAcumulado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
