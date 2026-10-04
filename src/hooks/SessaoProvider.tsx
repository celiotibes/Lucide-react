import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { aoSessaoExpirar } from "../api/cliente";
import { consultarSessao, entrar as entrarApi, sair as sairApi, type UsuarioSessao } from "../api/sessao";
import { SessaoContext, type SessaoContextoValor, type StatusSessao } from "./useSessao";

/** Guarda só o estado da sessão em memória (nunca token/senha, nada em storage). Não faz
 * nenhuma chamada de rede ao montar: o app local-first abre igual sem servidor. */
export function SessaoProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StatusSessao>("desconhecido");
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  const [motivoIndisponivel, setMotivoIndisponivel] = useState<string | null>(null);
  const verificacaoEmCurso = useRef<Promise<void> | null>(null);

  // 401 em qualquer chamada autenticada => volta para a tela de login.
  useEffect(
    () =>
      aoSessaoExpirar(() => {
        setUsuario(null);
        setStatus((atual) => (atual === "autenticado" ? "anonimo" : atual));
      }),
    [],
  );

  const verificar = useCallback((): Promise<void> => {
    if (verificacaoEmCurso.current) return verificacaoEmCurso.current;
    setStatus("verificando");
    const tarefa = consultarSessao()
      .then((resultado) => {
        setStatus(resultado.status);
        setUsuario(resultado.status === "autenticado" ? resultado.usuario : null);
        setMotivoIndisponivel(resultado.status === "indisponivel" ? resultado.motivo : null);
      })
      .finally(() => {
        verificacaoEmCurso.current = null;
      });
    verificacaoEmCurso.current = tarefa;
    return tarefa;
  }, []);

  const entrar = useCallback<SessaoContextoValor["entrar"]>(async (email, senha) => {
    const resultado = await entrarApi(email, senha);
    if (resultado.ok) {
      setUsuario(resultado.usuario);
      setMotivoIndisponivel(null);
      setStatus("autenticado");
    }
    return resultado;
  }, []);

  const sair = useCallback(async () => {
    await sairApi();
    setUsuario(null);
    setStatus("anonimo");
  }, []);

  const valor = useMemo<SessaoContextoValor>(
    () => ({ status, usuario, motivoIndisponivel, verificar, entrar, sair }),
    [status, usuario, motivoIndisponivel, verificar, entrar, sair],
  );

  return <SessaoContext.Provider value={valor}>{children}</SessaoContext.Provider>;
}
