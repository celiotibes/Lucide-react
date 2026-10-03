/**
 * Hash e verificação de senha — Fase 1 (auth real)
 *
 * Escolha: `crypto.scrypt` (nativo do Node, módulo `node:crypto`), não bcrypt.
 * bcrypt é um addon nativo compilado via node-gyp na instalação — risco real de
 * falhar `npm install` em Mac/arquiteturas sem toolchain de build configurada
 * (a mesma preocupação que já vale para não trocar `better-sqlite3` por nada
 * mais pesado neste projeto). scrypt é built-in do Node (nada para compilar) e
 * é um KDF de senha aceito pela OWASP (Password Storage Cheat Sheet) — ver
 * https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 *
 * Assíncrono de propósito: `scryptSync` bloqueia o event loop inteiro do
 * processo pelo tempo do cálculo (dezenas de ms); num backend Express de
 * processo único isso significa nenhuma outra requisição é atendida enquanto
 * uma senha é verificada. A versão baseada em callback/Promise roda a conta
 * na thread pool do libuv, sem travar o loop principal.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  senha: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

// Parâmetros de custo — documentados porque vão precisar ser revisitados com
// o tempo (hardware fica mais rápido; custo precisa subir).
// N = custo de CPU/memória (potência de 2), r = tamanho de bloco, p = paralelismo.
// N=2^14 é o valor recomendado pela OWASP como "mínimo aceitável" para login
// interativo (onde a latência da requisição importa) e é o próprio default do
// Node para `crypto.scrypt`. Com r=8, p=1, o custo de memória é
// ~128*N*r bytes ≈ 16 MiB, dentro do `maxmem` padrão do Node (32 MiB) sem
// precisar de configuração extra. N=2^17 (recomendação "forte" da OWASP)
// custaria ~128 MiB por verificação e exigiria maxmem maior — trade-off que
// não vale a pena para um backend de uso pessoal/pequena escala como este.
const SCRYPT_N = 16384; // 2^14
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

/** Formato do hash armazenado: "scrypt$N$r$p$saltHex$hashHex".
 * Autodescritivo (carrega os parâmetros de custo usados) para que, se algum
 * dia N/r/p mudarem, hashes antigos continuem verificando corretamente —
 * só hashes NOVOS passam a usar o novo custo. */
export async function gerarHashSenha(senha: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await scrypt(senha, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

/** Verifica senha em texto puro contra um hash armazenado no formato acima.
 * Comparação em tempo constante (`timingSafeEqual`) — comparar os buffers
 * com `===`/`Buffer.equals` vazaria, por timing, quantos bytes iniciais
 * batem, útil para quem tenta adivinhar o hash byte a byte (não a senha
 * diretamente, mas ainda uma sobra de informação desnecessária). */
export async function verificarSenha(senha: string, hashArmazenado: string): Promise<boolean> {
  try {
    const partes = hashArmazenado.split("$");
    if (partes.length !== 6 || partes[0] !== "scrypt") {
      return false;
    }
    const [, nStr, rStr, pStr, saltHex, hashHex] = partes;
    const N = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
      return false;
    }
    const salt = Buffer.from(saltHex, "hex");
    const hashEsperado = Buffer.from(hashHex, "hex");
    const hashCalculado = await scrypt(senha, salt, hashEsperado.length, { N, r, p });
    if (hashCalculado.length !== hashEsperado.length) {
      // timingSafeEqual lança se os buffers têm tamanhos diferentes — um
      // hash corrompido/malformado no banco não pode derrubar o login.
      return false;
    }
    return timingSafeEqual(hashCalculado, hashEsperado);
  } catch {
    return false;
  }
}

// Hash "de mentira", calculado uma única vez na subida do processo, para
// gastar exatamente o mesmo tempo de CPU numa tentativa de login com e-mail
// que não existe no banco que numa tentativa com e-mail existente e senha
// errada. Sem isso, a ausência da chamada ao scrypt (que só rodaria se o
// usuário fosse encontrado) faria a resposta para "e-mail inexistente"
// voltar mensuravelmente mais rápido — um oráculo de timing clássico para
// enumerar quais e-mails têm conta no sistema.
const hashDummyPromise: Promise<string> = gerarHashSenha(
  "senha-de-mentira-" + randomBytes(8).toString("hex"),
);

/** Roda uma verificação de senha contra um hash dummy — mesmo custo de CPU
 * de uma verificação real, resultado sempre descartado. Chamar isto no
 * caminho de "usuário não encontrado" do login iguala o tempo de resposta
 * ao do caminho "usuário encontrado, senha errada". */
export async function verificarContraDummy(senha: string): Promise<void> {
  const hashDummy = await hashDummyPromise;
  await verificarSenha(senha, hashDummy);
}
