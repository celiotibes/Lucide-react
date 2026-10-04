import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck, UserPlus } from "lucide-react";
import { useToast } from "../ui/useToast";
import {
  buscarMatrizPermissoes,
  salvarMatrizPermissoes,
  criarUsuarioAdmin,
  type DefinicaoFuncao,
  type EntradaPermissao,
} from "../domain/permissoesAdmin/api";

/** Tela de gestão do sistema: matriz de permissões (papel × função) e criação
 * de usuário de outro papel — consome as rotas do backend `server/`
 * (GET/PUT /api/auth/permissoes, POST /api/auth/usuarios), reservadas a
 * titular/administrador.
 *
 * Autenticação: sessão por cookie (login em <LoginView>, exigido por
 * <ExigeSessao> em App.tsx) — não há mais endereço/token para colar. O
 * endereço do servidor vem de `VITE_API_URL` (vazio = mesmo domínio).
 * Sem servidor, <ExigeSessao> só explica a dependência e o resto do app
 * (100% client-side) segue intacto. */

function chave(papel: string, funcao: string): string {
  return `${papel}::${funcao}`;
}

function entradasIguais(a: EntradaPermissao, b: EntradaPermissao): boolean {
  return a.habilitado === b.habilitado && (a.limite_valor ?? null) === (b.limite_valor ?? null);
}

const ROTULO_PAPEL: Record<string, string> = {
  titular: "Titular",
  administrador: "Administrador",
  contador: "Contador",
  perito: "Perito",
  advogado: "Advogado",
  economista: "Economista",
};

function formatarPapel(papel: string): string {
  return ROTULO_PAPEL[papel] ?? papel;
}

export function GerenciamentoPermissoesView() {
  const { avisar } = useToast();

  const [papeis, setPapeis] = useState<string[]>([]);
  const [catalogoFuncoes, setCatalogoFuncoes] = useState<DefinicaoFuncao[]>([]);
  const [matrizOriginal, setMatrizOriginal] = useState<EntradaPermissao[]>([]);
  const [matrizEditavel, setMatrizEditavel] = useState<EntradaPermissao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [carregouUmaVez, setCarregouUmaVez] = useState(false);

  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novoRole, setNovoRole] = useState("contador");
  const [criandoUsuario, setCriandoUsuario] = useState(false);

  const carregarMatriz = useCallback(async () => {
    setCarregando(true);
    try {
      const resposta = await buscarMatrizPermissoes();
      setPapeis(resposta.papeis);
      setCatalogoFuncoes(resposta.catalogoFuncoes);
      setMatrizOriginal(resposta.matriz);
      setMatrizEditavel(resposta.matriz);
    } catch (e) {
      avisar("critical", (e as Error).message);
    } finally {
      setCarregando(false);
      setCarregouUmaVez(true);
    }
  }, [avisar]);

  // Esta tela só é montada com sessão ativa (<ExigeSessao>): carrega a matriz de uma vez.
  useEffect(() => {
    if (!carregouUmaVez) carregarMatriz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entradasAlteradas = useMemo(() => {
    const porChaveOriginal = new Map(matrizOriginal.map((e) => [chave(e.papel, e.funcao), e]));
    return matrizEditavel.filter((e) => {
      const original = porChaveOriginal.get(chave(e.papel, e.funcao));
      return !original || !entradasIguais(e, original);
    });
  }, [matrizEditavel, matrizOriginal]);

  const alterarHabilitado = useCallback((papel: string, funcao: string, habilitado: boolean) => {
    setMatrizEditavel((atual) =>
      atual.map((e) => (e.papel === papel && e.funcao === funcao ? { ...e, habilitado } : e)),
    );
  }, []);

  const alterarLimite = useCallback((papel: string, funcao: string, valorTexto: string) => {
    const limite_valor = valorTexto.trim() === "" ? null : Number(valorTexto);
    setMatrizEditavel((atual) =>
      atual.map((e) =>
        e.papel === papel && e.funcao === funcao
          ? { ...e, limite_valor: Number.isFinite(limite_valor) ? limite_valor : e.limite_valor }
          : e,
      ),
    );
  }, []);

  const salvarAlteracoes = useCallback(async () => {
    if (entradasAlteradas.length === 0) return;
    setSalvando(true);
    try {
      const novaMatriz = await salvarMatrizPermissoes(entradasAlteradas);
      setMatrizOriginal(novaMatriz);
      setMatrizEditavel(novaMatriz);
      avisar("good", `${entradasAlteradas.length} alteração(ões) salva(s) na matriz de permissões.`);
    } catch (e) {
      avisar("critical", (e as Error).message);
    } finally {
      setSalvando(false);
    }
  }, [entradasAlteradas, avisar]);

  const criarUsuario = useCallback(async () => {
    if (!novoNome.trim() || !novoEmail.trim() || !novaSenha) {
      avisar("warning", "Preencha nome, e-mail e senha inicial.");
      return;
    }
    if (novaSenha.length < 8) {
      avisar("warning", "A senha inicial precisa ter pelo menos 8 caracteres.");
      return;
    }
    setCriandoUsuario(true);
    try {
      const usuario = await criarUsuarioAdmin({
        nome: novoNome.trim(),
        email: novoEmail.trim(),
        senha: novaSenha,
        role: novoRole,
      });
      avisar("good", `Usuário ${usuario.email} criado com papel ${formatarPapel(usuario.role)}.`);
      setNovoNome("");
      setNovoEmail("");
      setNovaSenha("");
    } catch (e) {
      avisar("critical", (e as Error).message);
    } finally {
      setCriandoUsuario(false);
    }
  }, [novoNome, novoEmail, novaSenha, novoRole, avisar]);

  const opcoesPapelNovoUsuario = papeis.length > 0 ? papeis : Object.keys(ROTULO_PAPEL);

  return (
    <div>
      <h2 className="section-title">Gerenciamento de permissões</h2>
      <p style={{ color: "var(--ink-soft)", marginTop: -8 }}>
        Matriz de permissões configurável por papel e criação de conta para outros papéis
        (titular/administrador, contador, perito, advogado, economista). Tudo aqui chama o backend
        real — nada é gravado no banco local da contabilidade.
      </p>

      <>
          <div className="toolbar-actions" style={{ marginTop: 22, marginBottom: 10 }}>
            <h3 className="section-title" style={{ margin: 0, flex: 1 }}>
              Matriz de permissões (papel × função)
            </h3>
            <button className="btn" onClick={carregarMatriz} disabled={carregando}>
              <RefreshCw size={14} /> {carregando ? "Carregando…" : "Atualizar"}
            </button>
            <button className="btn primary" onClick={salvarAlteracoes} disabled={salvando || entradasAlteradas.length === 0}>
              <ShieldCheck size={14} />
              {salvando ? "Salvando…" : `Salvar alterações${entradasAlteradas.length > 0 ? ` (${entradasAlteradas.length})` : ""}`}
            </button>
          </div>

          {carregando && matrizEditavel.length === 0 ? (
            <div className="card">
              <p style={{ margin: 0, color: "var(--ink-soft)" }}>Carregando matriz de permissões…</p>
            </div>
          ) : matrizEditavel.length === 0 ? (
            <div className="card">
              <p style={{ margin: 0, color: "var(--ink-soft)" }}>
                Nenhum dado carregado ainda. Clique em "Atualizar" acima.
              </p>
            </div>
          ) : (
            <div className="table-wrap" data-sticky-head="true">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Função</th>
                    {papeis.map((papel) => (
                      <th key={papel} className="num">
                        {formatarPapel(papel)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {catalogoFuncoes.map((funcao) => (
                    <tr key={funcao.id}>
                      <td>
                        <strong>{funcao.rotulo}</strong>
                        <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{funcao.descricao}</div>
                      </td>
                      {papeis.map((papel) => {
                        const entrada = matrizEditavel.find((e) => e.papel === papel && e.funcao === funcao.id);
                        return (
                          <td key={papel} className="num">
                            <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
                              <input
                                type="checkbox"
                                checked={entrada?.habilitado ?? false}
                                onChange={(e) => alterarHabilitado(papel, funcao.id, e.target.checked)}
                                aria-label={`${formatarPapel(papel)} tem ${funcao.rotulo}`}
                              />
                              {funcao.suportaLimite && (
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  style={{ width: 90, fontSize: 12 }}
                                  placeholder="sem limite"
                                  defaultValue={entrada?.limite_valor ?? ""}
                                  onBlur={(e) => alterarLimite(papel, funcao.id, e.target.value)}
                                  aria-label={`Limite de valor para ${formatarPapel(papel)} em ${funcao.rotulo}`}
                                />
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="toolbar-actions" style={{ marginTop: 22, marginBottom: 10 }}>
            <h3 className="section-title" style={{ margin: 0, flex: 1 }}>Criar usuário</h3>
          </div>
          <div className="card">
            <div className="form-grid">
              <label>
                Nome
                <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
              </label>
              <label>
                E-mail
                <input type="email" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} />
              </label>
              <label>
                Papel
                <select value={novoRole} onChange={(e) => setNovoRole(e.target.value)}>
                  {opcoesPapelNovoUsuario.map((papel) => (
                    <option key={papel} value={papel}>
                      {formatarPapel(papel)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Senha inicial (mín. 8 caracteres)
                <input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
              </label>
            </div>
            <div className="toolbar-actions" style={{ marginTop: 14, justifyContent: "flex-end" }}>
              <button className="btn primary" onClick={criarUsuario} disabled={criandoUsuario}>
                <UserPlus size={14} /> {criandoUsuario ? "Criando…" : "Criar usuário"}
              </button>
            </div>
            <p style={{ marginTop: 10, marginBottom: 0, fontSize: 12.5, color: "var(--ink-soft)" }}>
              Limitação conhecida: esta conta não é forçada a trocar a senha no primeiro login — o
              backend ainda não tem esse recurso (ver <code>server/README.md</code>).
            </p>
          </div>
      </>
    </div>
  );
}
