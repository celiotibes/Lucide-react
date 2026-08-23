import { createContext, useContext } from "react";
import type { Database } from "sql.js";

export interface DbContextValor {
  db: Database | null;
  carregando: boolean;
  versao: number;
  persistir: () => Promise<void>;
  reiniciar: () => Promise<void>;
}

export const DbContext = createContext<DbContextValor | null>(null);

export function useDb(): DbContextValor {
  const contexto = useContext(DbContext);
  if (!contexto) throw new Error("useDb precisa ser usado dentro de <DbProvider>");
  return contexto;
}
