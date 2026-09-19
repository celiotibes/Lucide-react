import { useMemo, useState } from "react";
import { FileWarning, FileCheck2, Loader2 } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { Dropzone } from "./Dropzone";
import { ConectarPluggy } from "./ConectarPluggy";
import { processarArquivo, type ResultadoImportacao } from "../domain/parsers/detectarTipo";
import { hashDoArquivo, hashDoFile, registrarLote } from "../domain/importacao/cofre";
import type { ContaBancaria } from "../domain/types";

interface ArquivoProcessado {
  nomeArquivo: string;
  resultado: ResultadoImportacao;
  contaId: number | null;
  aceito: boolean;
  /** SHA-256 do conteúdo do arquivo. É o que vai para o cofre de evidências e permite
   *  provar, depois, que o documento apresentado originou aquele lançamento. Nulo para
   *  origens sem arquivo (Open Finance vem por API, não há bytes a carimbar). */
  hash: string | null;
  bytes: number;
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
          hash: await hashDoFile(arquivo),
          bytes: arquivo.size,
        });
      } catch (erro) {
        // Nunca deixa um arquivo com falha (ex: OCR sem rede) travar o lote inteiro
        // nem prender o spinner "Processando arquivos…" para sempre.
        processados.push({
          nomeArquivo: arquivo.name,
          resultado: { tipoDetectado: "nao_suportado", transacoes: [], avisos: [erro instanceof Error ? erro.message : String(erro)] },
          contaId: contas[0]?.id ?? null,
          aceito: false,
          hash: null,
          bytes: arquivo.size,
        });
      }
    }
    setArquivos((atual) => [...processados, ...atual]);
    setProcessando(false);
  }

  function tratarImportacaoPluggy(resultado: ResultadoImportacao, nomeFonte: string, contaSugeridaId: number | null) {
    setArquivos((atual) => [
      {
        nomeArquivo: nomeFonte,
        resultado,
        contaId: contaSugeridaId ?? contas[0]?.id ?? null,
        aceito: resultado.transacoes.length > 0,
        // Open Finance não entrega arquivo: o hash identifica a JANELA sincronizada, para
        // que duas sincronizações da mesma conta não virem dois lotes idênticos.
        hash: null,
        bytes: 0,
      },
      ...atual,
    ]);
  }

  /** Envia para a TRIAGEM, não para `transacoes`.
   *
   * Antes isto gravava direto na contabilidade: um extrato escolhido por engano entrava
   * sem ninguém ver, a duplicidade só era detectada em OFX (a UNIQUE do banco é por
   * conta_id+fitid, e CSV/PDF não têm fitid) e a linha ilegível era descartada com uma
   * contagem no rodapé — o dado sumia sem deixar onde procurá-lo. Agora cada arquivo vira
   * um lote com o hash do conteúdo, e cada linha espera decisão na aba Triagem. */
  async function enviarParaTriagem() {
    if (!db) return;
    let lotes = 0;
    let linhas = 0;
    let duplicatas = 0;
    let ilegiveis = 0;
    let repetidos = 0;

    for (const item of arquivos) {
      if (!item.aceito || !item.contaId) continue;

      // Open Finance não tem arquivo. O hash é derivado do próprio conteúdo sincronizado,
      // para que duas sincronizações idênticas da mesma conta não virem dois lotes.
      const hash =
        item.hash ??
        (await hashDoArquivo(
          new TextEncoder().encode(
            item.resultado.transacoes.map((t) => `${t.data}|${t.valor}|${t.descricaoOriginal}`).join("\n"),
          ),
        ));

      const r = registrarLote(
        db,
        {
          arquivo_nome: item.nomeArquivo,
          arquivo_hash_sha256: hash,
          arquivo_bytes: item.bytes,
          tipo_detectado: item.resultado.tipoDetectado,
          conta_id: item.contaId,
        },
        item.resultado.transacoes,
      );

      if (r.ja_existia) {
        repetidos++;
        continue;
      }
      lotes++;
      linhas += r.linhas_registradas;
      duplicatas += r.linhas_duplicata_provavel;
      ilegiveis += r.linhas_malformadas;
    }

    await persistir();
    setArquivos([]);

    if (lotes === 0 && repetidos > 0) {
      setMensagem(
        `Nenhum lote novo: ${repetidos} arquivo(s) já haviam sido importados antes (mesmo conteúdo, mesma conta). Veja a aba Triagem de importação.`,
      );
      return;
    }

    const partes = [
      `${linhas} linha(s) de ${lotes} arquivo(s) em triagem — nenhuma virou lançamento ainda.`,
      "Abra a aba Triagem de importação para aprovar, rejeitar ou corrigir.",
    ];
    if (duplicatas > 0) partes.push(`${duplicatas} marcada(s) como possível duplicidade.`);
    if (ilegiveis > 0) partes.push(`${ilegiveis} com data ou valor ilegível, preservada(s) para correção.`);
    if (repetidos > 0) partes.push(`${repetidos} arquivo(s) já importado(s) antes foram ignorados.`);
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
          <p style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: -8 }}>
            O que for enviado vai para a <strong>triagem</strong>, não para a contabilidade: cada arquivo
            entra com o hash SHA-256 do próprio conteúdo e cada linha espera aprovação na aba
            Triagem de importação.
          </p>
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
          <button className="btn primary" onClick={enviarParaTriagem}>
            Enviar para triagem
          </button>
        </div>
      )}
    </div>
  );
}
