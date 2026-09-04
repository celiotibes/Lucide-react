import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createHash } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";

/** Servidor mínimo de sincronização do banco .sqlite entre seus próprios dispositivos —
 * pensado para rodar na SUA máquina (ou num Raspberry Pi/NAS na sua rede), sem nenhum
 * serviço de nuvem. Guarda um único arquivo .sqlite (o mesmo formato de backup que o app já
 * exporta/importa manualmente) mais um contador de versão simples — não é sincronização em
 * tempo real nem faz merge de edições concorrentes: é "enviar o banco inteiro" e "baixar o
 * banco inteiro", com um contador de versão para detectar quando dois dispositivos editaram
 * sem sincronizar entre si (o segundo a enviar recebe 409, não sobrescreve o primeiro sem
 * avisar). Suficiente para uso pessoal/poucos dispositivos; não é um banco de dados
 * compartilhado com múltiplos escritores simultâneos. */

if (!process.env.API_KEY) {
  throw new Error(
    "Defina API_KEY no .env (veja .env.example — gere um valor aleatório, ex: openssl rand -hex 32) antes de iniciar o servidor. " +
      "Sem isso, qualquer pessoa que descubra a URL deste servidor na sua rede consegue ler e sobrescrever seus dados.",
  );
}
const API_KEY = process.env.API_KEY;

const DADOS_DIR = path.resolve(process.env.DADOS_DIR ?? "./dados");
const CAMINHO_BANCO = path.join(DADOS_DIR, "banco.sqlite");
const CAMINHO_ESTADO = path.join(DADOS_DIR, "estado.json");
mkdirSync(DADOS_DIR, { recursive: true });

interface EstadoSincronizacao {
  versao: number;
  atualizadoEm: string | null;
  hashSha256: string | null;
  tamanhoBytes: number;
  dispositivo: string | null;
}

function estadoInicial(): EstadoSincronizacao {
  return { versao: 0, atualizadoEm: null, hashSha256: null, tamanhoBytes: 0, dispositivo: null };
}

function lerEstado(): EstadoSincronizacao {
  if (!existsSync(CAMINHO_ESTADO)) return estadoInicial();
  try {
    return { ...estadoInicial(), ...JSON.parse(readFileSync(CAMINHO_ESTADO, "utf-8")) };
  } catch {
    // estado.json corrompido — não inventa versão, recomeça do zero (o arquivo banco.sqlite
    // em si, se existir, continua intacto; só o contador de versão é perdido).
    return estadoInicial();
  }
}

function salvarEstado(estado: EstadoSincronizacao): void {
  writeFileSync(CAMINHO_ESTADO, JSON.stringify(estado, null, 2));
}

function mensagemErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173" }));

// Limite de requisições por IP — protege contra força bruta da API_KEY e contra alguém
// martelando upload/download na rede.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 200 }));

function exigirChaveApi(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.header("X-API-Key") !== API_KEY) {
    res.status(401).json({ erro: "Chave de API ausente ou inválida" });
    return;
  }
  next();
}

app.get("/api/sync/estado", exigirChaveApi, (_req, res) => {
  res.json(lerEstado());
});

app.get("/api/sync/banco", exigirChaveApi, (_req, res) => {
  const estado = lerEstado();
  if (estado.versao === 0 || !existsSync(CAMINHO_BANCO)) {
    res.status(404).json({ erro: "Nenhum banco enviado ainda para este servidor." });
    return;
  }
  res.setHeader("Content-Type", "application/x-sqlite3");
  res.setHeader("X-Sync-Versao", String(estado.versao));
  res.sendFile(CAMINHO_BANCO);
});

// Corpo bruto (bytes do .sqlite) só nesta rota — as outras usam JSON, mas não faz sentido
// aqui (o banco pode ter dezenas de MB, não cabe bem num campo de string JSON em base64).
app.post("/api/sync/banco", exigirChaveApi, express.raw({ type: "application/octet-stream", limit: "200mb" }), (req, res) => {
  const versaoBase = Number(req.query.versaoBase);
  if (!Number.isInteger(versaoBase) || versaoBase < 0) {
    res.status(400).json({ erro: "Parâmetro versaoBase (inteiro >= 0) é obrigatório — a versão do banco que este envio parte." });
    return;
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    res.status(400).json({ erro: "Corpo da requisição vazio ou não é application/octet-stream." });
    return;
  }

  const estadoAtual = lerEstado();
  // Concorrência otimista: só aceita o envio se ninguém mais atualizou o servidor desde a
  // última vez que ESTE dispositivo baixou/enviou — sem isso, dois dispositivos editando
  // offline e sincronizando depois fariam o segundo apagar silenciosamente o trabalho do
  // primeiro. 409 devolve o estado atual para o cliente decidir (normalmente: baixar a
  // versão mais nova, conferir, e tentar de novo).
  if (versaoBase !== estadoAtual.versao) {
    res.status(409).json({ erro: "O servidor já tem uma versão mais nova — baixe-a antes de enviar a sua.", estadoServidor: estadoAtual });
    return;
  }

  const caminhoTemporario = `${CAMINHO_BANCO}.tmp-${Date.now()}`;
  try {
    writeFileSync(caminhoTemporario, req.body);
    renameSync(caminhoTemporario, CAMINHO_BANCO); // rename é atômico no mesmo filesystem — nunca deixa banco.sqlite pela metade
    const hashSha256 = createHash("sha256").update(req.body).digest("hex");
    const novoEstado: EstadoSincronizacao = {
      versao: estadoAtual.versao + 1,
      atualizadoEm: new Date().toISOString(),
      hashSha256,
      tamanhoBytes: req.body.length,
      dispositivo: typeof req.query.dispositivo === "string" ? req.query.dispositivo.slice(0, 80) : null,
    };
    salvarEstado(novoEstado);
    res.json(novoEstado);
  } catch (erro) {
    console.error("Erro ao gravar banco sincronizado:", mensagemErro(erro));
    // writeFileSync pode ter criado o temporário antes de falhar (ex: renameSync deu erro,
    // ou salvarEstado falhou depois do rename já ter ido) — sem essa limpeza, cada upload
    // que falhasse nessa janela deixava um arquivo .tmp-<timestamp> órfão em DADOS_DIR para
    // sempre (achado de auditoria: nenhum request malicioso precisa disso, uploads legítimos
    // que falham por disco cheio/permissão já acumulariam lixo).
    if (existsSync(caminhoTemporario)) {
      try {
        unlinkSync(caminhoTemporario);
      } catch {
        // limpeza é best-effort — se nem isso funcionar, o erro original já foi logado acima
      }
    }
    res.status(500).json({ erro: "Falha ao gravar o banco no servidor." });
  }
});

/** Apaga o banco sincronizado deste servidor — ação destrutiva, exige a mesma API_KEY.
 * Existe para o caso de querer "zerar" o servidor de sincronização sem mexer no arquivo
 * por fora (ex: recomeçar depois de testar). Não afeta o banco local de nenhum dispositivo. */
app.delete("/api/sync/banco", exigirChaveApi, (_req, res) => {
  if (existsSync(CAMINHO_BANCO)) unlinkSync(CAMINHO_BANCO);
  salvarEstado(estadoInicial());
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

/** Middleware de erro — precisa ser o ÚLTIMO app.use() (Express identifica middleware de erro
 * pela assinatura de 4 parâmetros). Aqui o corpo bruto (express.raw) já roda depois de
 * exigirChaveApi em toda rota, então este servidor não tem o mesmo caminho não-autenticado
 * que o server/ (Pluggy) tinha — mas mantém a mesma defesa em profundidade: qualquer erro
 * não previsto (ex: falha inesperada do Express/body-parser) nunca deve devolver stack trace
 * com caminho absoluto do servidor, não importa se NODE_ENV foi configurado certo ou não. */
app.use((erro: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Erro não tratado:", mensagemErro(erro));
  const status = (erro as { status?: number; statusCode?: number })?.status ?? (erro as { statusCode?: number })?.statusCode ?? 500;
  res.status(status).json({ erro: "Requisição inválida ou falha interna." });
});

const porta = Number(process.env.PORT) || 8788;
app.listen(porta, () => {
  console.log(`Servidor de sincronização rodando em http://localhost:${porta} (dados em ${DADOS_DIR})`);
});
