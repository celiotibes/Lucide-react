/**
 * Token de sessão assinado — Fase 1 (auth real)
 *
 * O comentário original (`FIXME: usar JWT com assinatura`) presumia um token
 * stateless auto-contido. Mas o desenho que já existe (tabela `sessoes`,
 * `validarToken` fazendo JOIN com `usuarios`) é um session token OPACO
 * validado no servidor a cada requisição — não um JWT. Reescrever para JWT
 * de verdade (stateless, sem consulta ao banco) mudaria esse desenho já
 * testado (persistência de sessão, expiração, logout revogando de fato) por
 * um com trade-offs piores para este caso (revogar um JWT antes de expirar
 * exige uma blocklist — ou seja, voltar a consultar o banco mesmo assim).
 *
 * Por isso a escolha aqui foi: manter o token opaco validado no banco, mas
 * corrigir os dois problemas reais do gerador antigo:
 *   1. `Math.random()` não é um gerador aleatório criptograficamente seguro
 *      (a própria documentação do Node avisa: "não deve ser usado para nada
 *      relacionado a segurança") — trocado por `crypto.randomBytes` (CSPRNG).
 *   2. Nenhuma assinatura: qualquer string parecida com token era só uma
 *      tentativa de SELECT no banco. Agora o token carrega uma assinatura
 *      HMAC-SHA256 sobre a parte aleatória — tokens malformados/adivinhados
 *      são rejeitados ANTES de tocar o banco (barato, sem round-trip), e um
 *      token só valida se foi gerado por um processo que conhece o segredo.
 *
 * Formato do token: "<aleatorioHex>.<assinaturaHex>".
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { logger } from "../../services/logger-service.js";

function resolverSegredo(): { segredo: string; geradoEmMemoria: boolean } {
  const doAmbiente = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  if (doAmbiente && doAmbiente.length >= 16) {
    return { segredo: doAmbiente, geradoEmMemoria: false };
  }
  return { segredo: randomBytes(32).toString("hex"), geradoEmMemoria: true };
}

const { segredo: SEGREDO_SESSAO, geradoEmMemoria: SEGREDO_GERADO_EM_MEMORIA } = resolverSegredo();

/** Deve ser chamado uma vez, na subida do servidor, fora de testes — emite o
 * aviso alto e explícito exigido quando não há SESSION_SECRET configurado. */
export function avisarSeSegredoForTemporario(log: (msg: string) => void = (msg) => logger.warn(msg)): void {
  if (!SEGREDO_GERADO_EM_MEMORIA) {
    return;
  }
  log(
    "\n" +
      "!!! AVISO DE SEGURANÇA: SESSION_SECRET (ou JWT_SECRET) não configurado !!!\n" +
      "Um segredo de assinatura de sessão foi gerado aleatoriamente só para este\n" +
      "processo. Consequências:\n" +
      "  - TODAS as sessões de login ficam inválidas no próximo restart do servidor\n" +
      "    (deploy, crash, reinício manual) — todo mundo é deslogado.\n" +
      "  - Se você rodar mais de uma réplica deste servidor ao mesmo tempo, cada\n" +
      "    uma terá um segredo diferente e vai rejeitar o token gerado pela outra.\n" +
      "NÃO RODE ASSIM EM PRODUÇÃO. Configure SESSION_SECRET no .env com um valor\n" +
      "aleatório fixo (ex: openssl rand -hex 32) antes de hospedar isto de verdade.\n",
  );
}

export function gerarTokenSessao(): string {
  const aleatorio = randomBytes(32).toString("hex");
  const assinatura = createHmac("sha256", SEGREDO_SESSAO).update(aleatorio).digest("hex");
  return `${aleatorio}.${assinatura}`;
}

/** Confere só a assinatura (não toca o banco) — um token forjado ou
 * corrompido é rejeitado aqui, sem gastar uma consulta SQL. */
export function tokenTemAssinaturaValida(token: string): boolean {
  const partes = token.split(".");
  if (partes.length !== 2) {
    return false;
  }
  const [aleatorio, assinatura] = partes;
  if (!aleatorio || !assinatura) {
    return false;
  }
  const assinaturaEsperada = createHmac("sha256", SEGREDO_SESSAO).update(aleatorio).digest("hex");
  let bufRecebido: Buffer;
  let bufEsperado: Buffer;
  try {
    bufRecebido = Buffer.from(assinatura, "hex");
    bufEsperado = Buffer.from(assinaturaEsperada, "hex");
  } catch {
    return false;
  }
  if (bufRecebido.length !== bufEsperado.length) {
    return false;
  }
  return timingSafeEqual(bufRecebido, bufEsperado);
}

/** Só para diagnóstico em log — nunca logar o token inteiro. */
export function prefixoToken(token: string): string {
  return token.slice(0, 8) + "…";
}
