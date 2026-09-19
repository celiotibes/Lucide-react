import { useCallback, useMemo, useState } from "react";
import { Building2, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useDb } from "../db/useDb";
import { useToast } from "./useToast";
import {
  criarEntidadeLegal,
  formatarDocumento,
  validarDocumento,
  type RegimeTributario,
} from "../domain/erp/entidadeLegal";

/** Onboarding da entidade legal — o titular da contabilidade.
 *
 * Aparece uma vez, enquanto `entidades_legais` estiver vazia, e é bloqueante de
 * propósito: sem essa linha nada no razão pode existir (todo o núcleo contábil tem
 * `entidade_id NOT NULL` apontando para ela), e um app que deixa seguir em frente sem ela
 * é um app onde os Relatórios Integrados mostram R$ 0,00 para sempre sem explicar o
 * motivo — que foi exatamente o que a auditoria encontrou.
 *
 * O CPF/CNPJ é perguntado, não gerado. É `UNIQUE`, identifica uma pessoa real e vai para
 * a Exportação ECD; semear um valor de fachada colocaria um documento falso num arquivo
 * de entrega fiscal. */
export function OnboardingEntidade({ aoConcluir }: { aoConcluir: () => void }) {
  const { db, persistir } = useDb();
  const { avisar } = useToast();

  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [endereco, setEndereco] = useState("");
  const [regime, setRegime] = useState<RegimeTributario | "">("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Validação ao vivo, mas o erro só aparece depois de haver dígitos suficientes para a
  // conta fazer sentido — senão o campo acusa "CPF inválido" na primeira tecla digitada.
  const validacao = useMemo(() => validarDocumento(documento), [documento]);
  const mostrarErroDocumento =
    !validacao.valido &&
    (validacao.normalizado.length === 11 || validacao.normalizado.length === 14);

  const podeSalvar = nome.trim().length >= 2 && validacao.valido && !salvando;

  const salvar = useCallback(async () => {
    if (!db || !podeSalvar) return;
    setSalvando(true);
    setErro(null);

    const resultado = criarEntidadeLegal(db, {
      nome,
      cpf_cnpj: documento,
      endereco,
      regime_tributario: regime || null,
    });

    if (!resultado.sucesso) {
      setErro(resultado.mensagem);
      setSalvando(false);
      avisar("critical", resultado.mensagem);
      return;
    }

    await persistir();

    // Transação que não pôde ser lançada é pendência real, não detalhe: o aviso precisa
    // distingui-la de uma migração limpa, e `critical` não some sozinho.
    const houvePendencia =
      (resultado.migracao?.transacoes_falhadas ?? 0) > 0 ||
      (resultado.migracao?.transacoes_sem_classificacao ?? 0) > 0;
    avisar(houvePendencia ? "warning" : "good", resultado.mensagem);

    setSalvando(false);
    aoConcluir();
  }, [db, podeSalvar, nome, documento, endereco, regime, persistir, avisar, aoConcluir]);

  return (
    <div className="app-shell">
      <main className="app-main" style={{ maxWidth: 680, margin: "0 auto", paddingTop: 48 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 24 }}>
          <Building2 size={26} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>Quem é o titular desta contabilidade?</h1>
            <p style={{ color: "var(--ink-soft)", margin: "6px 0 0" }}>
              O razão contábil, o plano de contas e todos os períodos pendem de uma entidade legal.
              Enquanto ela não existir, nada pode ser lançado e os relatórios contábeis ficam zerados.
              É uma pergunta só, feita uma vez.
            </p>
          </div>
        </div>

        <div className="card">
          {/* Uma coluna só: são campos de identificação lidos em sequência, e a grade
              auto-fit de .form-grid os espalharia lado a lado em telas largas. */}
          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            <label>
              <span>Nome completo ou razão social</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Maria Ferreira de Souza"
                autoFocus
              />
            </label>

            <label>
              <span>CPF ou CNPJ</span>
              <input
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="Somente números, ou com pontuação"
                inputMode="numeric"
                aria-invalid={mostrarErroDocumento || undefined}
                aria-describedby="ajuda-documento"
              />
              <small id="ajuda-documento" style={{ color: mostrarErroDocumento ? "var(--warn)" : "var(--ink-soft)" }}>
                {mostrarErroDocumento
                  ? validacao.erro
                  : validacao.valido
                    ? `${validacao.tipo === "pessoa_fisica" ? "CPF" : "CNPJ"} válido: ${formatarDocumento(validacao.normalizado)}`
                    : "Usado na Exportação ECD e na identificação dos livros — por isso é conferido de verdade, dígito a dígito, e não pode ser inventado."}
              </small>
            </label>

            <label>
              <span>Endereço (opcional)</span>
              <input
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                placeholder="Rua, número, cidade/UF"
              />
            </label>

            <label>
              <span>Regime tributário (opcional)</span>
              <select value={regime} onChange={(e) => setRegime(e.target.value as RegimeTributario | "")}>
                <option value="">Não informar agora</option>
                <option value="simples_nacional">Simples Nacional</option>
                <option value="presumido">Lucro presumido</option>
                <option value="lucro_real">Lucro real</option>
              </select>
            </label>
          </div>

          {erro && (
            <div className="aviso-caixa" role="alert" style={{ marginBottom: 16 }}>
              {erro}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn primary" onClick={salvar} disabled={!podeSalvar}>
              {salvando ? <><Loader2 size={14} className="spin" /> Criando e lançando…</> : <><CheckCircle2 size={14} /> Criar entidade e ligar o razão</>}
            </button>
            <small style={{ color: "var(--ink-soft)", display: "flex", gap: 6, alignItems: "center" }}>
              <ShieldCheck size={13} /> Fica só neste navegador, como o resto dos dados.
            </small>
          </div>
        </div>

        <p style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 20 }}>
          Ao concluir, as transações já importadas são lançadas no razão em partida dobrada, cada uma
          na competência da própria data. As que ainda não tiverem categoria vão para a conta
          transitória <strong>1.9.99 — Classificação pendente</strong>, onde ficam visíveis no
          balancete até serem classificadas, em vez de sumirem do razão.
        </p>
      </main>
    </div>
  );
}
