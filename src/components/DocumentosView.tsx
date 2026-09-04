import { useMemo, useState } from "react";
import { FileText, Loader2, Link2, X, Check, Plus, Trash2, Pencil } from "lucide-react";
import { useDb } from "../db/useDb";
import { consultar } from "../db/connection";
import { Dropzone } from "./Dropzone";
import { extrairTextoDocumento, extrairCamposDeTexto } from "../domain/documentos/extrairCampos";
import {
  inserirDocumento,
  listarDocumentos,
  listarImoveisDoDocumento,
  listarTransacoesVinculadas,
  atualizarDocumento,
  excluirDocumento,
} from "../domain/documentos/documentos";
import { sugerirTransacoesParaDocumento, vincularDocumento, rejeitarSugestao, type SugestaoTransacao } from "../domain/documentos/matching";
import type { Documento, Imovel, PlanoConta, TipoDocumento } from "../domain/types";
import { formatarMoeda } from "../domain/formatarMoeda";

const ROTULO_TIPO: Record<TipoDocumento, string> = {
  contrato: "Contrato",
  recibo: "Recibo",
  fatura: "Fatura",
  nota_fiscal: "Nota fiscal",
  pedido_comercial: "Pedido comercial",
  boleto: "Boleto",
  outro: "Outro",
};

interface RascunhoDocumento {
  arquivoNome: string;
  textoExtraido: string;
  tipo: TipoDocumento;
  valor: string;
  data: string;
  cnpjCpf: string;
  nomeContraparte: string;
  descricaoProdutoServico: string;
  planoContaCodigo: string;
  imoveisPercentuais: { imovelId: number; percentual: string }[];
}

export function DocumentosView() {
  const { db, versao, persistir } = useDb();
  const [processando, setProcessando] = useState(false);
  const [rascunhos, setRascunhos] = useState<RascunhoDocumento[]>([]);
  const [documentoExpandidoId, setDocumentoExpandidoId] = useState<number | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const planoContas = useMemo<PlanoConta[]>(() => (db ? consultar<PlanoConta>(db, "SELECT * FROM plano_de_contas ORDER BY codigo") : []), [db, versao]);
  const imoveis = useMemo<Imovel[]>(() => (db ? consultar<Imovel>(db, "SELECT * FROM imoveis ORDER BY COALESCE(cidade,'zzz'), apelido") : []), [db, versao]);
  const documentos = useMemo<Documento[]>(() => (db ? listarDocumentos(db) : []), [db, versao]);

  async function tratarArquivos(arquivos: File[]) {
    setProcessando(true);
    const novos: RascunhoDocumento[] = [];
    for (const arquivo of arquivos) {
      try {
        const texto = await extrairTextoDocumento(arquivo);
        const campos = extrairCamposDeTexto(texto);
        const veioDeXmlNota = arquivo.name.toLowerCase().endsWith(".xml") && (campos.nomeContraparte || campos.descricaoProdutoServico);
        const descricao = [campos.numeroDocumento ? `NF nº ${campos.numeroDocumento}` : null, campos.descricaoProdutoServico]
          .filter(Boolean)
          .join(" — ");
        novos.push({
          arquivoNome: arquivo.name,
          textoExtraido: texto,
          tipo: veioDeXmlNota ? "nota_fiscal" : "outro",
          valor: campos.valor?.toFixed(2).replace(".", ",") ?? "",
          data: campos.data ?? "",
          cnpjCpf: campos.cnpjCpf ?? "",
          nomeContraparte: campos.nomeContraparte ?? "",
          descricaoProdutoServico: descricao,
          planoContaCodigo: "",
          imoveisPercentuais: [],
        });
      } catch (erro) {
        setMensagem(`Falha ao extrair "${arquivo.name}": ${erro instanceof Error ? erro.message : String(erro)}`);
      }
    }
    setRascunhos((atual) => [...novos, ...atual]);
    setProcessando(false);
  }

  function atualizarRascunho(indice: number, campos: Partial<RascunhoDocumento>) {
    setRascunhos((atual) => atual.map((r, i) => (i === indice ? { ...r, ...campos } : r)));
  }

  function adicionarImovelAoRascunho(indice: number) {
    if (imoveis.length === 0) return;
    setRascunhos((atual) =>
      atual.map((r, i) => (i === indice ? { ...r, imoveisPercentuais: [...r.imoveisPercentuais, { imovelId: imoveis[0].id, percentual: r.imoveisPercentuais.length === 0 ? "100" : "" }] } : r)),
    );
  }

  function removerImovelDoRascunho(indice: number, indiceImovel: number) {
    setRascunhos((atual) =>
      atual.map((r, i) => (i === indice ? { ...r, imoveisPercentuais: r.imoveisPercentuais.filter((_, j) => j !== indiceImovel) } : r)),
    );
  }

  async function salvarRascunho(indice: number) {
    if (!db) return;
    const r = rascunhos[indice];
    const valor = r.valor.trim() === "" ? undefined : Number.parseFloat(r.valor.replace(",", "."));
    const imoveisPct = r.imoveisPercentuais
      .filter((ip) => ip.percentual.trim() !== "")
      .map((ip) => ({ imovelId: ip.imovelId, percentual: Number.parseFloat(ip.percentual.replace(",", ".")) }));

    const id = inserirDocumento(
      db,
      {
        tipo: r.tipo,
        arquivo_nome: r.arquivoNome,
        valor,
        data_documento: r.data.trim() || undefined,
        cnpj_cpf_contraparte: r.cnpjCpf.trim() || undefined,
        nome_contraparte: r.nomeContraparte.trim() || undefined,
        descricao_produto_servico: r.descricaoProdutoServico.trim() || undefined,
        plano_conta_codigo: r.planoContaCodigo || undefined,
        texto_extraido: r.textoExtraido,
      },
      imoveisPct,
    );
    await persistir();
    setRascunhos((atual) => atual.filter((_, i) => i !== indice));
    setDocumentoExpandidoId(id);
    setMensagem(`Documento "${r.arquivoNome}" salvo. Veja as sugestões de transação abaixo.`);
  }

  function descartarRascunho(indice: number) {
    setRascunhos((atual) => atual.filter((_, i) => i !== indice));
  }

  return (
    <div>
      <h2 className="section-title">Documentos ({documentos.length})</h2>
      <p style={{ maxWidth: "68ch", color: "var(--ink-soft)", fontSize: 13.5, marginBottom: 18 }}>
        Envie contratos, recibos, faturas, notas fiscais, pedidos comerciais e boletos. O sistema extrai valor, data
        e CNPJ/CPF automaticamente (heurística local, sem IA) e sugere a qual pagamento/PIX cada documento
        corresponde por proximidade de valor e data — você confirma o vínculo, e a classificação (imóvel e
        categoria) é aplicada à transação só nesse momento.
      </p>

      <Dropzone
        onArquivos={tratarArquivos}
        aceitar=".pdf,.xml,image/*"
        ajuda="PDF ou foto de contrato, recibo, fatura, pedido comercial ou boleto — ou XML de nota fiscal (NF-e/NFS-e), extraído por tag em vez de OCR"
      />
      {processando && (
        <p style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          <Loader2 className="spin" size={16} /> Extraindo texto do documento…
        </p>
      )}
      {mensagem && (
        <div className="aviso-caixa" style={{ background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent)" }}>
          {mensagem}
        </div>
      )}

      {rascunhos.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Revisar antes de salvar</h3>
          {rascunhos.map((r, indice) => (
            <div key={indice} className="card" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <FileText size={16} /> {r.arquivoNome}
                </strong>
                <button className="btn" style={{ padding: "4px 7px" }} onClick={() => descartarRascunho(indice)}>
                  <X size={13} />
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Tipo
                  <select className="btn" style={{ width: "100%", marginTop: 4 }} value={r.tipo} onChange={(e) => atualizarRascunho(indice, { tipo: e.target.value as TipoDocumento })}>
                    {Object.entries(ROTULO_TIPO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Valor (R$) {r.valor && <span style={{ color: "var(--viz-good)" }}>· extraído</span>}
                  <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={r.valor} onChange={(e) => atualizarRascunho(indice, { valor: e.target.value })} />
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Data {r.data && <span style={{ color: "var(--viz-good)" }}>· extraída</span>}
                  <input type="date" className="btn" style={{ width: "100%", marginTop: 4 }} value={r.data} onChange={(e) => atualizarRascunho(indice, { data: e.target.value })} />
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  CNPJ/CPF {r.cnpjCpf && <span style={{ color: "var(--viz-good)" }}>· extraído</span>}
                  <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={r.cnpjCpf} onChange={(e) => atualizarRascunho(indice, { cnpjCpf: e.target.value })} />
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Fornecedor/contraparte
                  <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={r.nomeContraparte} onChange={(e) => atualizarRascunho(indice, { nomeContraparte: e.target.value })} />
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Categoria
                  <select className="btn" style={{ width: "100%", marginTop: 4 }} value={r.planoContaCodigo} onChange={(e) => atualizarRascunho(indice, { planoContaCodigo: e.target.value })}>
                    <option value="">— sem categoria —</option>
                    {planoContas.map((p) => <option key={p.codigo} value={p.codigo}>{p.codigo} · {p.descricao}</option>)}
                  </select>
                </label>
              </div>
              <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 10 }}>
                Produto/serviço a que se refere
                <input
                  className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }}
                  value={r.descricaoProdutoServico}
                  onChange={(e) => atualizarRascunho(indice, { descricaoProdutoServico: e.target.value })}
                  placeholder="ex: manutenção elétrica, material de construção, honorários advocatícios…"
                />
              </label>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
                  Imóvel(is) — deixe vazio para despesa administrativa geral / pessoa física / advocacia
                </div>
                {r.imoveisPercentuais.map((ip, j) => (
                  <div key={j} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <select
                      className="btn" style={{ flex: 1 }}
                      value={ip.imovelId}
                      onChange={(e) => {
                        const novoId = Number(e.target.value);
                        atualizarRascunho(indice, { imoveisPercentuais: r.imoveisPercentuais.map((x, k) => (k === j ? { ...x, imovelId: novoId } : x)) });
                      }}
                    >
                      {imoveis.map((im) => <option key={im.id} value={im.id}>{im.apelido}{im.cidade ? ` (${im.cidade})` : ""}</option>)}
                    </select>
                    <input
                      className="btn" style={{ cursor: "text", width: 80 }} value={ip.percentual}
                      placeholder="% "
                      onChange={(e) => {
                        const novoPct = e.target.value;
                        atualizarRascunho(indice, { imoveisPercentuais: r.imoveisPercentuais.map((x, k) => (k === j ? { ...x, percentual: novoPct } : x)) });
                      }}
                    />
                    <button className="btn" style={{ padding: "4px 7px" }} onClick={() => removerImovelDoRascunho(indice, j)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => adicionarImovelAoRascunho(indice)}>
                  <Plus size={12} /> Adicionar imóvel
                </button>
              </div>

              <button className="btn primary" onClick={() => salvarRascunho(indice)}>
                Salvar documento
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 10 }}>Documentos salvos</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Tipo</th>
                <th className="num">Valor</th>
                <th>Data</th>
                <th>Categoria</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => (
                <DocumentoLinha
                  key={d.id}
                  documento={d}
                  expandido={documentoExpandidoId === d.id}
                  onToggle={() => setDocumentoExpandidoId(documentoExpandidoId === d.id ? null : d.id)}
                  onMudou={persistir}
                  imoveis={imoveis}
                  planoContas={planoContas}
                />
              ))}
              {documentos.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-soft)", padding: 24 }}>
                    Nenhum documento enviado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface FormularioEdicao {
  arquivoNome: string;
  tipo: TipoDocumento;
  valor: string;
  data: string;
  cnpjCpf: string;
  nomeContraparte: string;
  descricaoProdutoServico: string;
  planoContaCodigo: string;
  imoveisPercentuais: { imovelId: number; percentual: string }[];
}

function DocumentoLinha({
  documento,
  expandido,
  onToggle,
  onMudou,
  imoveis,
  planoContas,
}: {
  documento: Documento;
  expandido: boolean;
  onToggle: () => void;
  onMudou: () => Promise<void>;
  imoveis: Imovel[];
  planoContas: PlanoConta[];
}) {
  const { db, versao } = useDb();
  const [editando, setEditando] = useState<FormularioEdicao | null>(null);

  const imoveisDoDocumento = useMemo(() => (db && expandido ? listarImoveisDoDocumento(db, documento.id) : []), [db, versao, expandido, documento.id]);
  const vinculos = useMemo(() => (db && expandido ? listarTransacoesVinculadas(db, documento.id) : []), [db, versao, expandido, documento.id]);
  const confirmados = vinculos.filter((v) => v.status === "confirmado");
  const sugestoes = useMemo<SugestaoTransacao[]>(
    () => (db && expandido && !editando && confirmados.length === 0 ? sugerirTransacoesParaDocumento(db, documento) : []),
    [db, versao, expandido, editando, documento, confirmados.length],
  );

  async function confirmar(s: SugestaoTransacao) {
    if (!db) return;
    vincularDocumento(db, documento.id, s.transacaoId, s.score);
    await onMudou();
  }
  async function rejeitar(s: SugestaoTransacao) {
    if (!db) return;
    rejeitarSugestao(db, documento.id, s.transacaoId);
    await onMudou();
  }

  function abrirEdicao() {
    const atuais = db ? listarImoveisDoDocumento(db, documento.id) : [];
    setEditando({
      arquivoNome: documento.arquivo_nome,
      tipo: documento.tipo,
      valor: documento.valor !== undefined && documento.valor !== null ? documento.valor.toFixed(2).replace(".", ",") : "",
      data: documento.data_documento ?? "",
      cnpjCpf: documento.cnpj_cpf_contraparte ?? "",
      nomeContraparte: documento.nome_contraparte ?? "",
      descricaoProdutoServico: documento.descricao_produto_servico ?? "",
      planoContaCodigo: documento.plano_conta_codigo ?? "",
      imoveisPercentuais: atuais.map((di) => ({ imovelId: di.imovel_id, percentual: di.percentual.toString() })),
    });
  }

  async function salvarEdicao() {
    if (!db || !editando) return;
    const valor = editando.valor.trim() === "" ? undefined : Number.parseFloat(editando.valor.replace(",", "."));
    const imoveisPct = editando.imoveisPercentuais
      .filter((ip) => ip.percentual.trim() !== "")
      .map((ip) => ({ imovelId: ip.imovelId, percentual: Number.parseFloat(ip.percentual.replace(",", ".")) }));
    atualizarDocumento(
      db,
      documento.id,
      {
        tipo: editando.tipo,
        arquivo_nome: editando.arquivoNome,
        valor,
        data_documento: editando.data.trim() || undefined,
        cnpj_cpf_contraparte: editando.cnpjCpf.trim() || undefined,
        nome_contraparte: editando.nomeContraparte.trim() || undefined,
        descricao_produto_servico: editando.descricaoProdutoServico.trim() || undefined,
        plano_conta_codigo: editando.planoContaCodigo || undefined,
      },
      imoveisPct,
    );
    await onMudou();
    setEditando(null);
  }

  async function excluir() {
    if (!db) return;
    const aviso =
      confirmados.length > 0
        ? `Este documento está vinculado a ${confirmados.length} transação(ões) confirmada(s). Excluir o documento NÃO desfaz a classificação (imóvel/categoria) já aplicada a elas — só remove o documento e o vínculo. Continuar?`
        : `Excluir "${documento.arquivo_nome}"?`;
    if (!confirm(aviso)) return;
    excluirDocumento(db, documento.id);
    await onMudou();
  }

  function adicionarImovelNaEdicao() {
    if (!editando || imoveis.length === 0) return;
    setEditando({ ...editando, imoveisPercentuais: [...editando.imoveisPercentuais, { imovelId: imoveis[0].id, percentual: editando.imoveisPercentuais.length === 0 ? "100" : "" }] });
  }
  function removerImovelNaEdicao(indice: number) {
    if (!editando) return;
    setEditando({ ...editando, imoveisPercentuais: editando.imoveisPercentuais.filter((_, i) => i !== indice) });
  }

  return (
    <>
      <tr>
        <td>{documento.arquivo_nome}</td>
        <td>{ROTULO_TIPO[documento.tipo]}</td>
        <td className="num">{documento.valor !== undefined && documento.valor !== null ? formatarMoeda(documento.valor) : "—"}</td>
        <td>{documento.data_documento ?? "—"}</td>
        <td style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{documento.plano_conta_codigo ?? "—"}</td>
        <td style={{ display: "flex", gap: 4 }}>
          <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => { setEditando(null); onToggle(); }}>
            <Link2 size={12} /> {expandido ? "Fechar" : "Vincular"}
          </button>
          <button className="btn" style={{ padding: "4px 7px" }} title="Editar" onClick={() => { abrirEdicao(); if (!expandido) onToggle(); }}>
            <Pencil size={13} />
          </button>
          <button className="btn danger" style={{ padding: "4px 7px" }} title="Excluir" onClick={excluir}>
            <Trash2 size={13} />
          </button>
        </td>
      </tr>
      {expandido && editando && (
        <tr>
          <td colSpan={6} style={{ background: "var(--surface-2)" }}>
            <div style={{ padding: "12px 4px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Tipo
                  <select className="btn" style={{ width: "100%", marginTop: 4 }} value={editando.tipo} onChange={(e) => setEditando({ ...editando, tipo: e.target.value as TipoDocumento })}>
                    {Object.entries(ROTULO_TIPO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Valor (R$)
                  <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={editando.valor} onChange={(e) => setEditando({ ...editando, valor: e.target.value })} />
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Data
                  <input type="date" className="btn" style={{ width: "100%", marginTop: 4 }} value={editando.data} onChange={(e) => setEditando({ ...editando, data: e.target.value })} />
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  CNPJ/CPF
                  <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={editando.cnpjCpf} onChange={(e) => setEditando({ ...editando, cnpjCpf: e.target.value })} />
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Fornecedor/contraparte
                  <input className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }} value={editando.nomeContraparte} onChange={(e) => setEditando({ ...editando, nomeContraparte: e.target.value })} />
                </label>
                <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  Categoria
                  <select className="btn" style={{ width: "100%", marginTop: 4 }} value={editando.planoContaCodigo} onChange={(e) => setEditando({ ...editando, planoContaCodigo: e.target.value })}>
                    <option value="">— sem categoria —</option>
                    {planoContas.map((p) => <option key={p.codigo} value={p.codigo}>{p.codigo} · {p.descricao}</option>)}
                  </select>
                </label>
              </div>
              <label style={{ fontSize: 12, color: "var(--ink-soft)", display: "block", marginBottom: 10 }}>
                Produto/serviço a que se refere
                <input
                  className="btn" style={{ cursor: "text", width: "100%", marginTop: 4 }}
                  value={editando.descricaoProdutoServico}
                  onChange={(e) => setEditando({ ...editando, descricaoProdutoServico: e.target.value })}
                />
              </label>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>Imóvel(is)</div>
                {editando.imoveisPercentuais.map((ip, j) => (
                  <div key={j} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <select
                      className="btn" style={{ flex: 1 }}
                      value={ip.imovelId}
                      onChange={(e) => {
                        const novoId = Number(e.target.value);
                        setEditando({ ...editando, imoveisPercentuais: editando.imoveisPercentuais.map((x, k) => (k === j ? { ...x, imovelId: novoId } : x)) });
                      }}
                    >
                      {imoveis.map((im) => <option key={im.id} value={im.id}>{im.apelido}{im.cidade ? ` (${im.cidade})` : ""}</option>)}
                    </select>
                    <input
                      className="btn" style={{ cursor: "text", width: 80 }} value={ip.percentual} placeholder="% "
                      onChange={(e) => {
                        const novoPct = e.target.value;
                        setEditando({ ...editando, imoveisPercentuais: editando.imoveisPercentuais.map((x, k) => (k === j ? { ...x, percentual: novoPct } : x)) });
                      }}
                    />
                    <button className="btn" style={{ padding: "4px 7px" }} onClick={() => removerImovelNaEdicao(j)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button className="btn" style={{ padding: "4px 8px", fontSize: 12 }} onClick={adicionarImovelNaEdicao}>
                  <Plus size={12} /> Adicionar imóvel
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn primary" onClick={salvarEdicao}>Salvar alterações</button>
                <button className="btn" onClick={() => setEditando(null)}>Cancelar</button>
              </div>
            </div>
          </td>
        </tr>
      )}
      {expandido && !editando && (
        <tr>
          <td colSpan={6} style={{ background: "var(--surface-2)" }}>
            <div style={{ padding: "10px 4px" }}>
              {imoveisDoDocumento.length > 0 && (
                <p style={{ fontSize: 12.5, marginBottom: 8 }}>
                  Imóvel(is): {imoveisDoDocumento.map((di) => `${di.apelido} (${di.percentual}%)`).join(", ")}
                </p>
              )}
              {confirmados.length > 0 ? (
                <div className="pill good" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <Check size={12} /> vinculado a {confirmados.length} transação(ões)
                </div>
              ) : sugestoes.length > 0 ? (
                <>
                  <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 8 }}>Transações sugeridas (por valor/data/CNPJ):</div>
                  {sugestoes.map((s) => (
                    <div key={s.transacaoId} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, fontSize: 13 }}>
                      <span className={`pill ${s.score >= 0.7 ? "good" : s.score >= 0.4 ? "warning" : ""}`}>{(s.score * 100).toFixed(0)}%</span>
                      <span>{s.data} · {formatarMoeda(s.valor)} · {s.descricaoOriginal}</span>
                      <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>({s.motivos.join(", ")})</span>
                      <button className="btn primary" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => confirmar(s)}>
                        Confirmar
                      </button>
                      <button className="btn" style={{ padding: "3px 8px", fontSize: 12 }} onClick={() => rejeitar(s)}>
                        Rejeitar
                      </button>
                    </div>
                  ))}
                </>
              ) : (
                <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                  Nenhuma transação encontrada perto do valor/data deste documento — confira se o valor/data foram
                  extraídos corretamente, ou vincule manualmente na tela de Transações.
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
