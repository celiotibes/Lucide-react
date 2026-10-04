import { LogOut } from "lucide-react";
import { useSessao } from "../hooks/useSessao";

/** Mostra quem está logado no servidor e permite sair. Não renderiza nada sem sessão ativa,
 * então no uso 100% local o cabeçalho fica exatamente como era. */
export function IndicadorSessao() {
  const { status, usuario, sair } = useSessao();
  if (status !== "autenticado" || !usuario) return null;
  return (
    <span className="toolbar-actions" style={{ gap: 6 }}>
      <span className="pill good" title={`Sessão no servidor (${usuario.role})`}>
        {usuario.email}
      </span>
      <button className="btn" onClick={() => void sair()}>
        <LogOut size={14} aria-hidden="true" /> Sair
      </button>
    </span>
  );
}
