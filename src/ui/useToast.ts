import { createContext, useContext } from "react";

export type TipoToast = "good" | "warning" | "critical";

export interface Toast {
  id: number;
  tipo: TipoToast;
  mensagem: string;
}

export interface ToastContextValor {
  /** Mostra um aviso não-bloqueante no canto da tela. Some sozinho; `critical`
   *  fica até o usuário fechar, porque erro que some antes de ser lido não avisou. */
  avisar: (tipo: TipoToast, mensagem: string) => void;
  descartar: (id: number) => void;
}

export const ToastContext = createContext<ToastContextValor | null>(null);

export function useToast(): ToastContextValor {
  const contexto = useContext(ToastContext);
  if (!contexto) throw new Error("useToast precisa ser usado dentro de <ToastProvider>");
  return contexto;
}
