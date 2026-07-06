import { useMemo } from "react";
import { useDb } from "../db/DbContext";
import { consultar } from "../db/connection";
import { calcularCaucao } from "../domain/caucao/calculoCaucao";
import type { Caucao, ContratoLocacao, Imovel } from "../domain/types";

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CaucaoView() {
  const { db, versao } = useDb();
  const hoje = hojeIso();

  const caucoes = useMemo<Caucao[]>(() => (db ? consultar<Caucao>(db, "SELECT * FROM caucoes ORDER BY data_deposito DESC") : []), [db, versao]);
  const contratos = useMemo(
    () => new Map((db ? consultar<ContratoLocacao>(db, "SELECT * FROM contratos_locacao") : []).map((c) => [c.id, c])),
    [db, versao],
  );
  const imoveis = useMemo(() => new Map((db ? consultar<Imovel>(db, "SELECT * FROM imoveis") : []).map((i) => [i.id, i])), [db, versao]);

  const calculos = useMemo(() => {
    if (!db) return [];
    return caucoes.map((c) => calcularCaucao(db, c.id, hoje));
  }, [db, caucoes, hoje]);

  return (
    <div>
      <h2 className="section-title">Depósitos caução ({caucoes.length})</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Correção calculada mês a mês pela série cadastrada em <code>indices_economicos</code> (poupança/IGPM/IPCA). A série
        pré-carregada nos dados de demonstração é <strong>ilustrativa</strong> — substitua pelos valores reais do
        BACEN/IBGE antes de usar o cálculo para fins periciais.
      </p>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Imóvel</th>
              <th>Locatário</th>
              <th className="num">Valor inicial</th>
              <th>Depósito</th>
              <th>Índice</th>
              <th>Situação</th>
              <th className="num">Saldo corrigido hoje</th>
              <th className="num">Deduções</th>
              <th className="num">A devolver</th>
            </tr>
          </thead>
          <tbody>
            {caucoes.map((c, indice) => {
              const contrato = contratos.get(c.contrato_id);
              const resultado = calculos[indice];
              return (
                <tr key={c.id}>
                  <td>{contrato ? imoveis.get(contrato.imovel_id)?.apelido : "—"}</td>
                  <td>{contrato?.locatario}</td>
                  <td className="num">{formatarMoeda(c.valor_inicial)}</td>
                  <td>{c.data_deposito}</td>
                  <td style={{ textTransform: "uppercase", fontSize: 12 }}>{c.indice_correcao}</td>
                  <td>
                    {c.data_devolucao ? <span className="pill good">devolvida em {c.data_devolucao}</span> : <span className="pill warning">retida</span>}
                  </td>
                  <td className="num">{formatarMoeda(resultado.saldoCorrigido)}</td>
                  <td className="num">{formatarMoeda(c.deducoes_valor)}</td>
                  <td className="num">{formatarMoeda(resultado.valorADevolver)}</td>
                </tr>
              );
            })}
            {caucoes.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                  Nenhum depósito caução cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {calculos.some((r) => r.mesesSemIndiceDisponivel.length > 0) && (
        <div className="aviso-caixa">
          Meses sem taxa cadastrada em <code>indices_economicos</code> não foram compostos no cálculo acima — complete a
          série antes de fechar o valor para fins periciais.
        </div>
      )}
    </div>
  );
}
