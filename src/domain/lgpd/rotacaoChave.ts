/**
 * MÓDULO LGPD: Registro de política de rotação de chave de encriptação.
 *
 * O QUE ESTE MÓDULO NÃO É: não há aqui NENHUMA execução de criptografia de arquivo. Este
 * app roda 100% no navegador (sql.js/IndexedDB, sem backend) e não tem onde guardar uma
 * chave de encriptação com segurança — a mesma limitação já documentada em
 * `src/domain/erp/compliance-audit-log.ts` sobre o segredo de assinatura HMAC
 * (`SEGREDO_PADRAO_INSEGURO`): quem abre o DevTools do navegador lê qualquer valor que o
 * próprio JavaScript do cliente precisou carregar para usar, inclusive uma "chave" de
 * encriptação. Guardar ou rotacionar uma chave de verdade aqui seria só teatro de
 * segurança.
 *
 * O QUE ESTE MÓDULO É: o REGISTRO de auditoria/política de que uma rotação de chave (de
 * um sistema de criptografia real, que vive do outro lado de um backend) aconteceu —
 * quem, quando, por quê, e um hash de referência da chave ANTERIOR (nunca a chave em si,
 * só prova de que ela mudou de fato). A criptografia de dados em repouso propriamente
 * dita, quando o produto for para trás de um backend de verdade, é responsabilidade da
 * INFRAESTRUTURA (Postgres/Supabase — cofre de chaves gerenciado, KMS etc.), nunca deste
 * módulo client-side.
 */
import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

export interface PoliticaRotacaoChave {
  id: number;
  data_rotacao: string;
  responsavel: string;
  motivo: string;
  chave_anterior_hash: string;
  observacoes: string | null;
}

/** Registra que uma rotação de chave aconteceu. `chave_anterior_hash` é só um hash de
 * referência para auditoria (ex: SHA-256 de um identificador da chave antiga no
 * cofre/KMS do backend) — NUNCA a chave em si; este módulo não tem como validar isso,
 * é responsabilidade de quem chama nunca passar a chave real aqui. */
export function registrarRotacao(
  db: Database,
  dados: {
    responsavel: string;
    motivo: string;
    chave_anterior_hash: string;
    observacoes?: string;
    /** Data da rotação; default = agora. Parâmetro explícito (em vez de sempre `new
     * Date()`) para permitir registrar uma rotação ocorrida no passado (migração de
     * histórico) e para tornar `proximaRotacaoDevida` testável deterministicamente. */
    data_rotacao?: string;
  },
): PoliticaRotacaoChave {
  const dataRotacao = dados.data_rotacao ?? new Date().toISOString();
  executar(
    db,
    `INSERT INTO politica_rotacao_chave (data_rotacao, responsavel, motivo, chave_anterior_hash, observacoes)
     VALUES (?, ?, ?, ?, ?)`,
    [dataRotacao, dados.responsavel, dados.motivo, dados.chave_anterior_hash, dados.observacoes ?? null],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id");
  const [criada] = consultar<PoliticaRotacaoChave>(db, "SELECT * FROM politica_rotacao_chave WHERE id = ?", [id]);
  return criada;
}

/** Lista todas as rotações registradas, mais recente primeiro. */
export function listarRotacoes(db: Database): PoliticaRotacaoChave[] {
  return consultar<PoliticaRotacaoChave>(db, "SELECT * FROM politica_rotacao_chave ORDER BY data_rotacao DESC, id DESC");
}

export interface StatusProximaRotacao {
  ultima_rotacao: PoliticaRotacaoChave | null;
  meses_desde_ultima_rotacao: number | null;
  devida: boolean;
  meses_limite: number;
}

/** Alerta se a última rotação foi há mais de `mesesLimite` meses (padrão 6, parametrizável
 * por política de segurança). Sem NENHUMA rotação registrada ainda, considera devida —
 * não há como assumir que uma rotação nunca registrada está em dia. */
export function proximaRotacaoDevida(db: Database, mesesLimite = 6): StatusProximaRotacao {
  const [ultima] = listarRotacoes(db);
  if (!ultima) {
    return { ultima_rotacao: null, meses_desde_ultima_rotacao: null, devida: true, meses_limite: mesesLimite };
  }

  const MS_POR_MES = 30.44 * 24 * 3600 * 1000; // média de dias/mês — suficiente para um alerta de política, não para cálculo contábil de data
  const mesesDecorridos = (new Date().getTime() - new Date(ultima.data_rotacao).getTime()) / MS_POR_MES;

  return {
    ultima_rotacao: ultima,
    meses_desde_ultima_rotacao: mesesDecorridos,
    devida: mesesDecorridos >= mesesLimite,
    meses_limite: mesesLimite,
  };
}
