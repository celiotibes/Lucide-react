import { useEffect, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { useSessao } from "../hooks/useSessao";
import { LoginView } from "./LoginView";

/** Porteiro das telas que falam com o servidor: consulta a sessão sob demanda (ao montar, não
 * no boot do app) e mostra login/aviso em vez do conteúdo quando necessário. Sem servidor, só
 * explica — nunca trava nem esconde o resto do app. */
export function ExigeSessao({ children }: { children: ReactNode }) {
  const { status, motivoIndisponivel, verificar } = useSessao();

  useEffect(() => {
    if (status === "desconhecido") void verificar();
  }, [status, verificar]);

  if (status === "autenticado") return <>{children}</>;

  if (status === "anonimo") return <LoginView />;

  if (status === "indisponivel") {
    return (
      <div className="aviso-caixa" role="status" style={{ marginTop: 16 }}>
        <strong>Servidor indisponível.</strong> {motivoIndisponivel} Esta área depende do servidor; o
        restante do sistema continua funcionando normalmente neste navegador.{" "}
        <button className="btn" onClick={() => void verificar()} style={{ marginLeft: 8 }}>
          <RefreshCw size={14} aria-hidden="true" /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <p role="status" style={{ color: "var(--ink-soft)" }}>
      Verificando sessão no servidor…
    </p>
  );
}
