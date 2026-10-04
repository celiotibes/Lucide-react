import { createContext, useContext } from "react";
import type { ResultadoLogin, UsuarioSessao } from "../api/sessao";

/**
 * - `desconhecido`: ninguém perguntou ao servidor ainda (estado inicial — o app local-first
 *   não faz nenhuma chamada de rede no boot);
 * - `verificando`: consulta a /api/auth/me em andamento;
 * - `anonimo`: servidor alcançável, sem sessão => mostrar a tela de login;
 * - `autenticado`: sessão válida;
 * - `indisponivel`: sem servidor utilizável (o app local segue funcionando normalmente).
 */
export type StatusSessao = "desconhecido" | "verificando" | "anonimo" | "autenticado" | "indisponivel";

export interface SessaoContextoValor {
  status: StatusSessao;
  usuario: UsuarioSessao | null;
  /** Motivo legível quando `status === "indisponivel"`. */
  motivoIndisponivel: string | null;
  /** Consulta GET /api/auth/me. Chamada sob demanda por <ExigeSessao>, nunca no boot. */
  verificar: () => Promise<void>;
  entrar: (email: string, senha: string) => Promise<ResultadoLogin>;
  sair: () => Promise<void>;
}

export const SessaoContext = createContext<SessaoContextoValor | null>(null);

export function useSessao(): SessaoContextoValor {
  const ctx = useContext(SessaoContext);
  if (!ctx) throw new Error("useSessao precisa estar dentro de <SessaoProvider>");
  return ctx;
}
