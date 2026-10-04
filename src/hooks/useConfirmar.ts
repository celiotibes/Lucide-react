import React, { useState, useCallback, ReactNode } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";

export interface OpcoesConfirm {
  titulo?: string;
  mensagem: string;
  textoCancelar?: string;
  textoConfirmar?: string;
  perigo?: boolean;
}

export interface UseConfirmarReturn {
  confirmar: (opcoes: OpcoesConfirm) => Promise<boolean>;
  dialogo: ReactNode;
}

export function useConfirmar(): UseConfirmarReturn {
  const [state, setState] = useState<{
    isOpen: boolean;
    titulo: string;
    mensagem: string;
    textoCancelar: string;
    textoConfirmar: string;
    perigo: boolean;
    resolver?: (value: boolean) => void;
  }>({
    isOpen: false,
    titulo: "Confirmar ação",
    mensagem: "",
    textoCancelar: "Cancelar",
    textoConfirmar: "Confirmar",
    perigo: false,
  });

  const confirmar = useCallback(
    (opcoes: OpcoesConfirm): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({
          isOpen: true,
          titulo: opcoes.titulo ?? "Confirmar ação",
          mensagem: opcoes.mensagem,
          textoCancelar: opcoes.textoCancelar ?? "Cancelar",
          textoConfirmar: opcoes.textoConfirmar ?? "Confirmar",
          perigo: opcoes.perigo ?? false,
          resolver: resolve,
        });
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    state.resolver?.(true);
    setState((prev) => ({ ...prev, isOpen: false }));
  }, [state]);

  const handleCancel = useCallback(() => {
    state.resolver?.(false);
    setState((prev) => ({ ...prev, isOpen: false }));
  }, [state]);

  const dialogo = React.createElement(ConfirmDialog, {
    isOpen: state.isOpen,
    title: state.titulo,
    message: state.mensagem,
    cancelText: state.textoCancelar,
    confirmText: state.textoConfirmar,
    isDanger: state.perigo,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  });

  return { confirmar, dialogo };
}
