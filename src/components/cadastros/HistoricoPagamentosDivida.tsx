import { useMemo, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { useDb } from "../../db/useDb";
import { useToast } from "../../ui/useToast";
import { Dropzone } from "../Dropzone";
import { extrairTextoDocumento } from "../../domain/documentos/extrairCampos";
import { inserirDocumento } from "../../domain/documentos/documentos";
import { hashDoFile } from "../../domain/importacao/cofre";
import { formatarMoeda } from "../../domain/formatarMoeda";
import {
  vincularDocumentoADivida,
  extrairPagamentosDeDocumento,
  confirmarPagamentoExtraido,
  rejeitarPagamentoExtraido,
  registrarPagamentoManual,
  listarPagamentosPendentesConfirmacao,
  listarPagamentosConfirmados,
  type PagamentoDividaHistorico,
  type DividaTipo,
} from "../../domain/dividas/extracaoPagamentosIA";

interface Props {
  dividaTipo: DividaTipo;
  dividaId: number;
}

interface EdicaoPendente {
  dataPagamento: string;
  valorPago: string;
  valorJuros: string;
  valorAmortizacao: string;
}

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function edicaoInicial(p: PagamentoDividaHistorico): EdicaoPendente {
  return {
    dataPagamento: p.data_pagamento,
    valorPago: p.valor_pago.toFixed(2).replace(".", ","),
    valorJuros: p.valor_juros !== null ? p.valor_juros.toFixed(2).replace(".", ",") : "",
    valorAmortizacao: p.valor_amortizacao !== null ? p.valor_amortizacao.toFixed(2).replace(".", ",") : "",
  };
}

function manualVazio() {
  return { dataPagamento: "", valorPago: "", valorJuros: "", valorAmortizacao: "", observacoes: "" };
}

/** Seção "Histórico de pagamentos e upload de contrato" — reutilizada dentro de
 * DividasConsumoForm.tsx e FinanciamentosForm.tsx (mesmo padrão de composição de
 * RateioDestinoDivida.tsx) para a dívida/financiamento em edição.
 *
 * Decisão do usuário (2026-09-29): para dívida sem cronograma exato, a IA pode tentar ler o
 * contrato/extrato de pagamentos enviado aqui e sugerir data/valor/juros/amortização por
 * pagamento — SEMPRE como sugestão pendente (`confirmado_por_usuario = 0`), nunca lançada
 * sozinha. Esta tela é onde a pessoa revisa, corrige se precisar, e confirma ou rejeita cada
 * sugestão (ver src/domain/dividas/extracaoPagamentosIA.ts), além de poder digitar um
 * pagamento manualmente sem passar por upload/IA nenhuma.
 *
 * O documento enviado aqui é gravado em `documentos` pelo mesmo caminho usado em
 * DocumentosView.tsx (`extrairTextoDocumento` + `inserirDocumento`) — o hash SHA-256 do
 * arquivo (mesmo padrão de proveniência de arquivo de `importacao/cofre.ts`) fica registrado
 * em `documentos.observacoes`, já que a tabela `documentos` (schema não alterado nesta
 * tarefa) não tem uma coluna de hash dedicada como `lotes_importacao` tem.
 */
export function HistoricoPagamentosDivida({ dividaTipo, dividaId }: Props) {
  const { db, versao, persistir } = useDb();
  const { avisar } = useToast();
  const [processando, setProcessando] = useState(false);
  const [edicoes, setEdicoes] = useState<Record<number, EdicaoPendente>>({});
  const [manual, setManual] = useState(manualVazio());

  const pendentes = useMemo(
    () => {
      void versao;
      return db ? listarPagamentosPendentesConfirmacao(db, dividaTipo, dividaId) : [];
    },
    [db, versao, dividaTipo, dividaId],
  );
  const confirmados = useMemo(
    () => {
      void versao;
      return db ? listarPagamentosConfirmados(db, dividaTipo, dividaId) : [];
    },
    [db, versao, dividaTipo, dividaId],
  );

  function campoDe(p: PagamentoDividaHistorico): EdicaoPendente {
    return edicoes[p.id] ?? edicaoInicial(p);
  }
  function atualizarCampo(p: PagamentoDividaHistorico, campo: keyof EdicaoPendente, valor: string) {
    setEdicoes((atual) => ({ ...atual, [p.id]: { ...campoDe(p), [campo]: valor } }));
  }

  async function tratarArquivos(arquivos: File[]) {
    if (!db) return;
    setProcessando(true);
    try {
      for (const arquivo of arquivos) {
        // Mesmo caminho de extração de texto usado em DocumentosView.tsx — escolhe o parser
        // certo (PDF com camada de texto, OCR de imagem) conforme o tipo do arquivo.
        const [hash, texto] = await Promise.all([hashDoFile(arquivo), extrairTextoDocumento(arquivo)]);

        const documentoId = inserirDocumento(db, {
          tipo: "contrato",
          arquivo_nome: arquivo.name,
          texto_extraido: texto,
          observacoes: `Hash SHA-256 do arquivo original: ${hash}`,
        });
        vincularDocumentoADivida(db, documentoId, dividaTipo, dividaId);
        await persistir();

        try {
          const ids = await extrairPagamentosDeDocumento(db, documentoId);
          await persistir();
          avisar(
            ids.length > 0 ? "good" : "warning",
            ids.length > 0
              ? `"${arquivo.name}": ${ids.length} pagamento(s) sugerido(s) pela IA — revise e confirme abaixo.`
              : `"${arquivo.name}" foi salvo, mas nenhum pagamento foi identificado no texto — confira manualmente ou registre abaixo.`,
          );
        } catch (erroIA) {
          // Falha da IA (rede, todos os provedores indisponíveis, resposta malformada) não
          // trava a tela nem perde o documento já salvo — só não há sugestão automática
          // desta vez; o pagamento sempre pode ser digitado no formulário manual abaixo.
          avisar("critical", `"${arquivo.name}" foi salvo, mas a extração por IA falhou: ${mensagemErro(erroIA)}`);
        }
      }
    } catch (erro) {
      avisar("critical", `Falha ao processar documento: ${mensagemErro(erro)}`);
    } finally {
      setProcessando(false);
    }
  }

  async function confirmar(p: PagamentoDividaHistorico) {
    if (!db) return;
    const editado = campoDe(p);
    const valorPago = Number.parseFloat(editado.valorPago.replace(",", "."));
    if (editado.dataPagamento.trim() === "" || Number.isNaN(valorPago)) {
      avisar("critical", "Informe data e valor pago válidos antes de confirmar.");
      return;
    }
    const valorJuros = editado.valorJuros.trim() === "" ? null : Number.parseFloat(editado.valorJuros.replace(",", "."));
    const valorAmortizacao = editado.valorAmortizacao.trim() === "" ? null : Number.parseFloat(editado.valorAmortizacao.replace(",", "."));
    try {
      confirmarPagamentoExtraido(db, p.id, { dataPagamento: editado.dataPagamento, valorPago, valorJuros, valorAmortizacao });
    } catch (erro) {
      avisar("critical", mensagemErro(erro));
      return;
    }
    await persistir();
    setEdicoes((atual) => {
      const copia = { ...atual };
      delete copia[p.id];
      return copia;
    });
    avisar("good", "Pagamento confirmado.");
  }

  async function rejeitar(p: PagamentoDividaHistorico) {
    if (!db) return;
    const motivo = window.prompt("Motivo da rejeição desta sugestão (obrigatório):", "");
    if (motivo === null) return; // cancelado
    try {
      rejeitarPagamentoExtraido(db, p.id, motivo);
    } catch (erro) {
      avisar("critical", mensagemErro(erro));
      return;
    }
    await persistir();
    avisar("good", "Sugestão rejeitada.");
  }

  async function registrarManual() {
    if (!db) return;
    const valorPago = Number.parseFloat(manual.valorPago.replace(",", "."));
    if (manual.dataPagamento.trim() === "" || Number.isNaN(valorPago)) {
      avisar("critical", "Informe data e valor pago válidos.");
      return;
    }
    const valorJuros = manual.valorJuros.trim() === "" ? null : Number.parseFloat(manual.valorJuros.replace(",", "."));
    const valorAmortizacao = manual.valorAmortizacao.trim() === "" ? null : Number.parseFloat(manual.valorAmortizacao.replace(",", "."));
    try {
      registrarPagamentoManual(db, {
        dividaTipo,
        dividaId,
        dataPagamento: manual.dataPagamento,
        valorPago,
        valorJuros,
        valorAmortizacao,
        observacoes: manual.observacoes.trim() || undefined,
      });
    } catch (erro) {
      avisar("critical", mensagemErro(erro));
      return;
    }
    await persistir();
    setManual(manualVazio());
    avisar("good", "Pagamento registrado.");
  }

  return (
    <div className="card" style={{ marginTop: 12, marginBottom: 12, background: "var(--surface-2)" }}>
      <strong style={{ fontSize: 13 }}>Histórico de pagamentos e upload de contrato</strong>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "6px 0 12px", maxWidth: "64ch" }}>
        Envie o contrato ou extrato de pagamentos desta dívida — a IA tenta identificar cada pagamento (data, valor
        e, quando o próprio documento decompõe, juros/amortização). Toda sugestão fica pendente até você revisar,
        corrigir se precisar, e confirmar ou rejeitar — a IA nunca lança nada sozinha.
      </p>

      <Dropzone onArquivos={tratarArquivos} aceitar=".pdf,image/*" ajuda="PDF ou foto do contrato/extrato de pagamentos" />
      {processando && (
        <p style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12.5 }}>
          <Loader2 className="spin" size={14} /> Extraindo texto e consultando IA — pode levar alguns segundos…
        </p>
      )}

      {pendentes.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 8 }}>
            Sugestões pendentes de confirmação ({pendentes.length}):
          </div>
          {pendentes.map((p) => {
            const editado = campoDe(p);
            return (
              <div key={p.id} className="card" style={{ marginBottom: 8, padding: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span className="pill warning">extraído por IA — confirme</span>
                  {p.documento_id !== null && <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>documento #{p.documento_id}</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 8 }}>
                  <label style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                    Data
                    <input
                      type="date" className="btn" style={{ width: "100%", marginTop: 4 }}
                      value={editado.dataPagamento}
                      onChange={(e) => atualizarCampo(p, "dataPagamento", e.target.value)}
                    />
                  </label>
                  <label style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                    Valor pago (R$)
                    <input
                      className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }}
                      value={editado.valorPago}
                      onChange={(e) => atualizarCampo(p, "valorPago", e.target.value)}
                    />
                  </label>
                  <label style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                    Juros (R$)
                    <input
                      className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }}
                      value={editado.valorJuros} placeholder="não identificado"
                      onChange={(e) => atualizarCampo(p, "valorJuros", e.target.value)}
                    />
                  </label>
                  <label style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
                    Amortização (R$)
                    <input
                      className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }}
                      value={editado.valorAmortizacao} placeholder="não identificado"
                      onChange={(e) => atualizarCampo(p, "valorAmortizacao", e.target.value)}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn primary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => confirmar(p)}>
                    <Check size={13} /> Confirmar
                  </button>
                  <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => rejeitar(p)}>
                    <X size={13} /> Rejeitar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmados.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 8 }}>Histórico confirmado ({confirmados.length}):</div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Data</th><th className="num">Valor pago</th><th className="num">Juros</th><th className="num">Amortização</th><th>Origem</th></tr>
              </thead>
              <tbody>
                {confirmados.map((p) => (
                  <tr key={p.id}>
                    <td>{p.data_pagamento}</td>
                    <td className="num">{formatarMoeda(p.valor_pago)}</td>
                    <td className="num">{p.valor_juros !== null ? formatarMoeda(p.valor_juros) : "—"}</td>
                    <td className="num">{p.valor_amortizacao !== null ? formatarMoeda(p.valor_amortizacao) : "—"}</td>
                    <td>
                      <span className={`pill ${p.origem === "manual" ? "" : "good"}`}>
                        {p.origem === "manual" ? "digitado manualmente" : "IA confirmada"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 8 }}>Registrar pagamento manualmente (sem upload):</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, alignItems: "end" }}>
          <label style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
            Data *
            <input
              type="date" className="btn" style={{ width: "100%", marginTop: 4 }}
              value={manual.dataPagamento}
              onChange={(e) => setManual({ ...manual, dataPagamento: e.target.value })}
            />
          </label>
          <label style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
            Valor pago (R$) *
            <input
              className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }}
              value={manual.valorPago}
              onChange={(e) => setManual({ ...manual, valorPago: e.target.value })}
            />
          </label>
          <label style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
            Juros (R$)
            <input
              className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }}
              value={manual.valorJuros}
              onChange={(e) => setManual({ ...manual, valorJuros: e.target.value })}
            />
          </label>
          <label style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
            Amortização (R$)
            <input
              className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }}
              value={manual.valorAmortizacao}
              onChange={(e) => setManual({ ...manual, valorAmortizacao: e.target.value })}
            />
          </label>
          <label style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
            Observações
            <input
              className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }}
              value={manual.observacoes}
              onChange={(e) => setManual({ ...manual, observacoes: e.target.value })}
            />
          </label>
          <button
            className="btn" style={{ padding: "4px 10px", fontSize: 12 }}
            disabled={manual.dataPagamento.trim() === "" || manual.valorPago.trim() === ""}
            onClick={registrarManual}
          >
            <Plus size={13} /> Registrar
          </button>
        </div>
      </div>
    </div>
  );
}
