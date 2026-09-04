import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Database } from "sql.js";
import { abrirBanco, salvarBanco, reiniciarBanco } from "./connection";
import { registrarUltimaAlteracao } from "../domain/backupIntegridade";
import { DbContext } from "./useDb";

export function DbProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    abrirBanco()
      .then(setDb)
      .finally(() => setCarregando(false));
  }, []);

  const persistir = useCallback(async () => {
    if (!db) return;
    await salvarBanco(db);
    registrarUltimaAlteracao();
    setVersao((v) => v + 1);
  }, [db]);

  const reiniciar = useCallback(async () => {
    setCarregando(true);
    const novoDb = await reiniciarBanco();
    setDb(novoDb);
    setVersao((v) => v + 1);
    setCarregando(false);
  }, []);

  return <DbContext.Provider value={{ db, carregando, versao, persistir, reiniciar }}>{children}</DbContext.Provider>;
}
