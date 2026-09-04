// Controle de backup e integridade do arquivo exportado — tudo em localStorage, nunca no
// banco em si: o banco é o que é exportado, então gravar "quando foi o último backup"
// dentro dele criaria um problema circular (o hash do arquivo mudaria ao registrar o
// próprio backup). São dois problemas relacionados mas distintos:
// (1) o usuário pode perder dados reais em silêncio se o navegador limpar o IndexedDB e
//     não houver backup exportado recente — sem aviso, isso só é percebido tarde demais;
// (2) para uso pericial, o arquivo apresentado ao juízo precisa ter uma forma de provar
//     que não foi alterado depois de gerado — um hash SHA-256 exibido no momento da
//     exportação serve como esse comprovante (o mesmo princípio de cadeia de custódia
//     digital: hash externo, calculado uma vez, nunca embutido no próprio arquivo).

const CHAVE_ULTIMA_ALTERACAO = "contabilidade-ultima-alteracao-em";
const CHAVE_HISTORICO_BACKUPS = "contabilidade-historico-backups-v1";
const MAX_HISTORICO = 20;

export interface RegistroBackup {
  timestamp: string; // ISO 8601
  arquivo: string;
  hashSha256: string;
  tamanhoBytes: number;
}

export function registrarUltimaAlteracao(): void {
  try {
    localStorage.setItem(CHAVE_ULTIMA_ALTERACAO, new Date().toISOString());
  } catch {
    // localStorage indisponível (modo privado, quota excedida) — não é crítico, só
    // desativa o aviso de backup desatualizado; o app continua funcionando normalmente.
  }
}

export function lerUltimaAlteracao(): string | null {
  try {
    return localStorage.getItem(CHAVE_ULTIMA_ALTERACAO);
  } catch {
    return null;
  }
}

export function lerHistoricoBackups(): RegistroBackup[] {
  try {
    const bruto = localStorage.getItem(CHAVE_HISTORICO_BACKUPS);
    if (!bruto) return [];
    const salvo = JSON.parse(bruto);
    if (!Array.isArray(salvo)) return [];
    return salvo.filter(
      (r): r is RegistroBackup =>
        r && typeof r.timestamp === "string" && typeof r.arquivo === "string" && typeof r.hashSha256 === "string" && typeof r.tamanhoBytes === "number",
    );
  } catch {
    return [];
  }
}

export function lerUltimoBackup(): RegistroBackup | null {
  const historico = lerHistoricoBackups();
  return historico.length > 0 ? historico[0] : null;
}

/** Calcula o SHA-256 do arquivo exportado via Web Crypto API (nativa do navegador, sem
 * dependência externa) e registra no histórico local — não prova nada sozinho, mas dá ao
 * usuário um valor para copiar e anexar à petição/laudo como referência do arquivo exato
 * que foi gerado naquele momento. */
export async function registrarBackup(bytes: Uint8Array, nomeArquivo: string): Promise<RegistroBackup> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  const hashSha256 = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const registro: RegistroBackup = { timestamp: new Date().toISOString(), arquivo: nomeArquivo, hashSha256, tamanhoBytes: bytes.byteLength };

  try {
    const historico = [registro, ...lerHistoricoBackups()].slice(0, MAX_HISTORICO);
    localStorage.setItem(CHAVE_HISTORICO_BACKUPS, JSON.stringify(historico));
  } catch {
    // idem: falha ao persistir o histórico não impede o backup em si (o download já
    // aconteceu) — só o registro local do hash fica indisponível nesta sessão.
  }

  return registro;
}

export interface StatusBackup {
  ultimaAlteracaoEm: string | null;
  ultimoBackupEm: string | null;
  existeAlteracaoNaoBackupeada: boolean;
  diasDesdeUltimoBackup: number | null; // null = nunca fez backup
}

export function calcularStatusBackup(): StatusBackup {
  const ultimaAlteracaoEm = lerUltimaAlteracao();
  const ultimoBackup = lerUltimoBackup();
  const ultimoBackupEm = ultimoBackup?.timestamp ?? null;

  const existeAlteracaoNaoBackupeada =
    ultimaAlteracaoEm !== null && (ultimoBackupEm === null || new Date(ultimaAlteracaoEm).getTime() > new Date(ultimoBackupEm).getTime());

  const diasDesdeUltimoBackup =
    ultimoBackupEm !== null ? Math.floor((Date.now() - new Date(ultimoBackupEm).getTime()) / (1000 * 60 * 60 * 24)) : null;

  return { ultimaAlteracaoEm, ultimoBackupEm, existeAlteracaoNaoBackupeada, diasDesdeUltimoBackup };
}
