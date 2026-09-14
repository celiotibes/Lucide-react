import { useMemo, useState } from "react";
import { FileWarning, FileCheck2, Loader2 } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { Dropzone } from "./Dropzone";
import { ConectarPluggy } from "./ConectarPluggy";
import { processarArquivo, type ResultadoImportacao } from "../domain/parsers/detectarTipo";
import { persistirTransacoes } from "../domain/parsers/persistirTransacoes";
import type { ContaBancaria } from "../domain/types";

interface ArquivoProcessado {
  nomeArquivo: string;
  resultado: ResultadoImportacao;
  contaId: number | null;
  aceito: boolean;
}

const RESUMO_TIPO: Record<ResultadoImportacao["tipoDetectado"], string> = {
  ofx: "Extrato OFX",
  csv: "Planilha CSV",
  pdf_extrato: "Extrato em PDF",
  pdf_fatura: "Fatura de cartão em PDF",
  pdf_desconhecido: "PDF não classificado",
  imagem_comprovante: "Comprovante (OCR)",
  open_finance: "Open Finance (Pluggy)",
  nao_suportado: "Formato não suportado",
};

export function ImportarView() {
  const { db, versao, persistir } = useDb();
  const [processando, setProcessando] = useState(false);
  const [arquivos, setArquivos] = useState<ArquivoProcessado[]>([]);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const contas = useMemo<ContaBancaria[]>(() => (db ? consultar<ContaBancaria>(db, "SELECT * FROM contas_bancarias ORDER BY banco") : []), [db, versao]);

  async function tratarArquivos(novos: File[]) {
    setProcessando(true);
    setMensagem(null);
    const processados: ArquivoProcessado[] = [];
    for (const arquivo of novos) {
      try {
        const resultado = await processarArquivo(arquivo);
        processados.push({
          nomeArquivo: arquivo.name,
          resultado,
          contaId: contas[0]?.id ?? null,
          aceito: resultado.transacoes.length > 0,
        });
      } catch (erro) {
        // Nunca deixa um arquivo com falha (ex: OCR sem rede) travar o lote inteiro
        // nem prender o spinner "Processando arquivos…" para sempre.
        processados.push({
          nomeArquivo: arquivo.name,
          resultado: { tipoDetectado: "nao_suportado", transacoes: [], avisos: [erro instanceof Error ? erro.message : String(erro)] },
          contaId: contas[0]?.id ?? null,
          aceito: false,
        });
      }
    }
    setArquivos((atual) => [...processados, ...atual]);
    setProcessando(false);
  }

  function tratarImportacaoPluggy(resultado: ResultadoImportacao, nomeFonte: string, contaSugeridaId: number | null) {
    setArquivos((atual) => [
      { nomeArquivo: nomeFonte, resultado, contaId: contaSugeridaId ?? contas[0]?.id ?? null, aceito: resultado.transacoes.length > 0 },
      ...atual,
    ]);
  }

  async function confirmarImportacao() {
    if (!db) return;
    let totalInserido = 0;
    let totalDuplicado = 0;
    let totalMalformado = 0;
    for (const item of arquivos) {
      if (!item.aceito || !item.contaId) continue;
      const resultado = persistirTransacoes(db, item.contaId, item.resultado.transacoes, item.nomeArquivo);
      totalInserido += resultado.inseridas;
      totalDuplicado += resultado.duplicadas;
      totalMalformado += resultado.malformadas;
    }
    await persistir();
    setArquivos([]);
    const partes = [`${totalInserido} lançamento(s) importado(s).`];
    if (totalDuplicado > 0) partes.push(`${totalDuplicado} duplicidade(s) ignorada(s) automaticamente.`);
    if (totalMalformado > 0) {
      partes.push(
        `${totalMalformado} linha(s) com data ou valor ilegível foram DESCARTADAS (não é duplicidade — confira o arquivo original, esse dado foi perdido).`,
      );
    }
    setMensagem(partes.join(" "));
  }

  return (
    <div>
      <h2 className="section-title">Importar documentos</h2>
      <Dropzone onArquivos={tratarArquivos} />
      <ConectarPluggy onImportado={tratarImportacaoPluggy} />
      {processando && (
        <p style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          <Loader2 className="spin" size={16} /> Processando arquivos…
        </p>
      )}
      {mensagem && <div className="aviso-caixa" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent)" }}>{mensagem}</div>}

      {arquivos.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h2 className="section-title">Revisar antes de importar</h2>
          {arquivos.map((item, indice) => (
            <div key={indice} className="card" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {item.resultado.transacoes.length > 0 ? <FileCheck2 size={18} color="var(--accent)" /> : <FileWarning size={18} color="var(--warn)" />}
                  <div>
                    <strong>{item.nomeArquivo}</strong>
                    <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                      {RESUMO_TIPO[item.resultado.tipoDetectado]} · {item.resultado.transacoes.length} lançamento(s) detectado(s)
                    </div>
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  Conta destino:
                  <select
                    value={item.contaId ?? ""}
                    onChange={(e) =>
                      setArquivos((atual) => atual.map((a, i) => (i === indice ? { ...a, contaId: Number(e.target.value) } : a)))
                    }
                  >
                    {contas.map((conta) => (
                      <option key={conta.id} value={conta.id}>
                        {conta.banco} — {conta.numero}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {item.resultado.avisos.map((aviso, i) => (
                <div key={i} className="aviso-caixa">
                  {aviso}
                </div>
              ))}

              {item.resultado.transacoes.length > 0 && (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Descrição</th>
                        <th className="num">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.resultado.transacoes.slice(0, 8).map((t, i) => (
                        <tr key={i}>
                          <td>{t.data}</td>
                          <td>{t.descricaoOriginal}</td>
                          <td className="num">{t.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {item.resultado.transacoes.length > 8 && (
                    <p style={{ fontSize: 12, color: "var(--ink-soft)", padding: "8px 12px" }}>
                      +{item.resultado.transacoes.length - 8} lançamento(s) adicional(is)
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
          <button className="btn primary" onClick={confirmarImportacao}>
            Confirmar importação
          </button>
        </div>
      )}
    </div>
  );
}
