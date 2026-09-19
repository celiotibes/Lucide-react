import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CircleCheckBig, CircleX, TriangleAlert, X } from "lucide-react";
import { ToastContext, type Toast, type TipoToast } from "./useToast";

const DURACAO_MS: Record<TipoToast, number> = {
  good: 4000,
  warning: 7000,
  critical: 0, // 0 = não some sozinho
};

const ICONE: Record<TipoToast, typeof CircleCheckBig> = {
  good: CircleCheckBig,
  warning: TriangleAlert,
  critical: CircleX,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const proximoId = useRef(0);
  const temporizadores = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const descartar = useCallback((id: number) => {
    const temporizador = temporizadores.current.get(id);
    if (temporizador !== undefined) {
      clearTimeout(temporizador);
      temporizadores.current.delete(id);
    }
    setToasts((atuais) => atuais.filter((t) => t.id !== id));
  }, []);

  const avisar = useCallback(
    (tipo: TipoToast, mensagem: string) => {
      const id = proximoId.current++;
      setToasts((atuais) => [...atuais, { id, tipo, mensagem }]);

      const duracao = DURACAO_MS[tipo];
      if (duracao > 0) {
        temporizadores.current.set(
          id,
          setTimeout(() => descartar(id), duracao)
        );
      }
    },
    [descartar]
  );

  // Sem isto, um toast pendente dispararia setState depois do app desmontar.
  useEffect(() => {
    // Lido aqui, e não no corpo do componente: o Map é criado uma vez e nunca
    // reatribuído, então a captura vale para toda a vida do provider.
    const mapa = temporizadores.current;
    return () => {
      for (const temporizador of mapa.values()) clearTimeout(temporizador);
      mapa.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ avisar, descartar }}>
      {children}
      {/* polite (e não assertive) porque nenhum aviso daqui interrompe o que a pessoa
          está fazendo — o leitor de tela anuncia ao terminar a frase atual. */}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((toast) => {
          const Icone = ICONE[toast.tipo];
          return (
            <div key={toast.id} className={`toast ${toast.tipo}`}>
              <Icone size={16} className="toast-icone" aria-hidden="true" />
              <div className="toast-corpo">{toast.mensagem}</div>
              <button className="toast-fechar" onClick={() => descartar(toast.id)} aria-label="Fechar aviso">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
