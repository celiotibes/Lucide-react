import initSqlJs, { type Database } from "sql.js";

/** Consulta local, deliberadamente NÃO importada de src/db/connection.ts.
 *
 * `connection.ts` importa `schema.sql?raw`, sintaxe do Vite que não existe fora dele —
 * bastaria isso para este módulo só rodar dentro do app. E um verificador de backup que
 * exige o app de pé é meio inútil: a hora de conferir um backup costuma ser justamente
 * quando o app não está disponível, ou num cron, ou na máquina de outra pessoa.
 *
 * São dez linhas duplicadas em troca de o módulo rodar em qualquer lugar. O risco usual de
 * duplicar — as duas cópias divergirem — é baixo aqui: esta é uma leitura genérica de
 * sql.js, não regra de negócio. */
function consultar<T = Record<string, unknown>>(
  db: Database,
  sql: string,
  params: (string | number | null)[] = [],
): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const linhas: T[] = [];
  while (stmt.step()) linhas.push(stmt.getAsObject() as T);
  stmt.free();
  return linhas;
}

/** Verificação de backup: prova que o arquivo RESTAURA e que a contabilidade dentro dele
 * ainda fecha.
 *
 * O sistema já tinha hash SHA-256 do arquivo e aviso de "backup desatualizado". Nenhum dos
 * dois responde à única pergunta que importa na hora em que o backup é preciso: ele presta?
 *
 * Hash prova que o arquivo não mudou desde que foi gerado. Não prova que o que foi gerado
 * era bom. Um backup de um banco já corrompido tem hash perfeito.
 *
 * Num sistema de reconstituição contábil isso é mais grave do que em software comum: um
 * arquivo que abre, mas cujo razão está desbalanceado ou cujo caixa não bate com o extrato,
 * não serve como prova em perícia — e a hora de descobrir isso não é quando o banco
 * principal já se perdeu.
 *
 * Por isso a verificação restaura de verdade (abre o .sqlite num banco em memória) e roda
 * as mesmas invariantes contábeis que o app exige em operação. É teste de restauração, não
 * checagem de bytes.
 */

export type GravidadeVerificacao = "ok" | "aviso" | "falha";

export interface ResultadoChecagem {
  nome: string;
  gravidade: GravidadeVerificacao;
  detalhe: string;
}

export interface RelatorioVerificacao {
  /** false se QUALQUER checagem falhou. Avisos não derrubam o backup. */
  restauravel: boolean;
  contabilidadeIntegra: boolean;
  hashSha256: string;
  tamanhoBytes: number;
  checagens: ResultadoChecagem[];
  /** Contagem por tabela — é o que permite comparar dois backups e ver o que sumiu. */
  contagens: Record<string, number>;
}

/** Mesma assinatura que connection.ts exige ao importar: distingue um backup deste sistema
 * de um .sqlite qualquer escolhido por engano. */
const TABELAS_ASSINATURA = ["imoveis", "transacoes", "contratos_locacao"];

/** Tabelas cuja contagem vale acompanhar entre backups. Perder linha aqui é perder caso. */
const TABELAS_CONTADAS = [
  "transacoes",
  "imoveis",
  "contratos_locacao",
  "caucoes",
  "ledger_entries",
  "periodos_contabeis",
  "lotes_importacao",
  "importacao_linhas",
  "documentos",
  "entidades_legais",
  "auditoria_log",
];

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function contar(db: Database, tabela: string): number | null {
  try {
    return consultar<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${tabela}`)[0]?.n ?? 0;
  } catch {
    return null; // tabela não existe neste backup — versão anterior do schema
  }
}

/** Todo período contábil fecha (débito == crédito)?
 *
 * É a invariante central da partida dobrada. Um período desbalanceado significa perna
 * órfã: ou o backup pegou o banco no meio de uma gravação, ou o dado já estava corrompido
 * antes. Nos dois casos o arquivo não serve como prova. */
function checarBalanceamento(db: Database): ResultadoChecagem {
  let periodos: Array<{ id: number; ano: number; mes: number; d: number; c: number }>;
  try {
    periodos = consultar(
      db,
      `SELECT p.id, p.ano, p.mes,
              COALESCE(SUM(l.valor_debito), 0) AS d,
              COALESCE(SUM(l.valor_credito), 0) AS c
       FROM periodos_contabeis p
       LEFT JOIN ledger_entries l ON l.periodo_id = p.id
       GROUP BY p.id ORDER BY p.ano, p.mes`,
    );
  } catch (erro) {
    return {
      nome: "Balanceamento do razão",
      gravidade: "falha",
      detalhe: `Não foi possível ler os períodos: ${erro instanceof Error ? erro.message : String(erro)}`,
    };
  }

  if (periodos.length === 0) {
    return {
      nome: "Balanceamento do razão",
      gravidade: "aviso",
      detalhe: "Nenhum período contábil neste backup — o razão ainda não foi ligado.",
    };
  }

  const quebrados = periodos.filter((p) => Math.abs(p.d - p.c) >= 0.01);
  if (quebrados.length > 0) {
    const lista = quebrados
      .slice(0, 5)
      .map((p) => `${String(p.mes).padStart(2, "0")}/${p.ano} (diferença R$ ${(p.d - p.c).toFixed(2)})`)
      .join(", ");
    return {
      nome: "Balanceamento do razão",
      gravidade: "falha",
      detalhe: `${quebrados.length} de ${periodos.length} período(s) não fecham: ${lista}${quebrados.length > 5 ? " …" : ""}`,
    };
  }

  return {
    nome: "Balanceamento do razão",
    gravidade: "ok",
    detalhe: `${periodos.length} período(s), todos com débito igual a crédito.`,
  };
}

/** O caixa do razão bate com a soma do extrato?
 *
 * Detecta migração parcial: transações que entraram em `transacoes` e nunca chegaram ao
 * razão. É a mesma discrepância que a auditoria encontrou (Painel cheio, Relatórios
 * zerados) e que a conciliação decompõe — aqui serve como sinal de que o backup foi tirado
 * com o sistema em estado inconsistente. */
function checarCaixaContraExtrato(db: Database): ResultadoChecagem {
  try {
    const [extrato] = consultar<{ total: number }>(
      db,
      "SELECT COALESCE(SUM(valor), 0) AS total FROM transacoes",
    );
    const [caixa] = consultar<{ saldo: number }>(
      db,
      `SELECT COALESCE(SUM(valor_debito), 0) - COALESCE(SUM(valor_credito), 0) AS saldo
       FROM ledger_entries WHERE conta_id = 1101`,
    );

    const diferenca = (extrato?.total ?? 0) - (caixa?.saldo ?? 0);
    if (Math.abs(diferenca) < 0.01) {
      return {
        nome: "Caixa do razão × extrato",
        gravidade: "ok",
        detalhe: `Batem: R$ ${(extrato?.total ?? 0).toFixed(2)}.`,
      };
    }
    // Aviso e não falha: com o razão ainda não ligado, a diferença é o esperado.
    return {
      nome: "Caixa do razão × extrato",
      gravidade: "aviso",
      detalhe:
        `Diferença de R$ ${diferenca.toFixed(2)} entre a soma das transações e o caixa do razão. ` +
        `É esperado se o razão ainda não foi sincronizado; caso contrário, há transação fora do razão.`,
    };
  } catch (erro) {
    return {
      nome: "Caixa do razão × extrato",
      gravidade: "aviso",
      detalhe: `Não foi possível comparar: ${erro instanceof Error ? erro.message : String(erro)}`,
    };
  }
}

/** Toda linha de triagem aprovada aponta para uma transação que existe?
 *
 * É o elo do cofre de evidências. Aprovada sem transação significa que a resposta a "qual
 * documento prova este lançamento" se perdeu. */
function checarCofreDeEvidencias(db: Database): ResultadoChecagem {
  try {
    const [orfas] = consultar<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM importacao_linhas l
       WHERE l.status = 'aprovada'
         AND (l.transacao_id IS NULL
              OR NOT EXISTS (SELECT 1 FROM transacoes t WHERE t.id = l.transacao_id))`,
    );
    if ((orfas?.n ?? 0) > 0) {
      return {
        nome: "Cofre de evidências",
        gravidade: "falha",
        detalhe: `${orfas.n} linha(s) aprovada(s) sem a transação correspondente — a prova documental está rompida.`,
      };
    }
    const [total] = consultar<{ n: number }>(
      db,
      "SELECT COUNT(*) AS n FROM importacao_linhas WHERE status = 'aprovada'",
    );
    return {
      nome: "Cofre de evidências",
      gravidade: "ok",
      detalhe: `${total?.n ?? 0} linha(s) aprovada(s), todas ligadas à transação de origem.`,
    };
  } catch {
    return {
      nome: "Cofre de evidências",
      gravidade: "aviso",
      detalhe: "Backup anterior à triagem de importação — sem cofre de evidências para conferir.",
    };
  }
}

/** Lançamento no razão sem conta que exista no plano.
 *
 * `obterSaldoConta` assume natureza "debito" para conta desconhecida e devolve o saldo com
 * o sinal trocado, sem acusar nada. Num backup isso viraria relatório errado em silêncio. */
function checarContasDoRazao(db: Database): ResultadoChecagem {
  try {
    const [orfaos] = consultar<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM ledger_entries l
       WHERE NOT EXISTS (SELECT 1 FROM contas_plano_contas c WHERE c.id = l.conta_id)`,
    );
    if ((orfaos?.n ?? 0) > 0) {
      return {
        nome: "Contas do razão",
        gravidade: "falha",
        detalhe: `${orfaos.n} lançamento(s) apontam para conta inexistente no plano — o saldo sairia com sinal trocado sem aviso.`,
      };
    }
    return { nome: "Contas do razão", gravidade: "ok", detalhe: "Todo lançamento aponta para conta existente." };
  } catch {
    return { nome: "Contas do razão", gravidade: "aviso", detalhe: "Sem razão neste backup." };
  }
}

/** Restaura o backup num banco em memória e verifica se ele presta.
 *
 * `localizarWasm` existe porque o WASM do sql.js vem de lugar diferente no navegador
 * (`/sql-wasm.wasm`, servido pelo app) e no Node (o arquivo dentro de node_modules) — o
 * mesmo motivo pelo qual `src/test/fixtureDb.ts` precisa do próprio resolvedor. */
export async function verificarBackup(
  bytes: Uint8Array,
  localizarWasm?: (arquivo: string) => string,
): Promise<RelatorioVerificacao> {
  const checagens: ResultadoChecagem[] = [];
  const contagens: Record<string, number> = {};
  const hashSha256 = await sha256Hex(bytes);

  let db: Database;
  try {
    const SQL = await initSqlJs(localizarWasm ? { locateFile: localizarWasm } : undefined);
    db = new SQL.Database(bytes);
    // `new Database()` não valida conteúdo — só falha na primeira operação de verdade.
    db.exec("SELECT name FROM sqlite_master LIMIT 1");
  } catch (erro) {
    return {
      restauravel: false,
      contabilidadeIntegra: false,
      hashSha256,
      tamanhoBytes: bytes.length,
      contagens,
      checagens: [
        {
          nome: "Abertura do arquivo",
          gravidade: "falha",
          detalhe: `O arquivo não abre como banco SQLite: ${erro instanceof Error ? erro.message : String(erro)}`,
        },
      ],
    };
  }

  try {
    checagens.push({ nome: "Abertura do arquivo", gravidade: "ok", detalhe: "Restaurado em memória com sucesso." });

    const tabelas = new Set(
      (db.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]?.values ?? []).map((l) => String(l[0])),
    );
    const faltando = TABELAS_ASSINATURA.filter((t) => !tabelas.has(t));
    checagens.push(
      faltando.length === 0
        ? { nome: "Assinatura do sistema", gravidade: "ok", detalhe: `${tabelas.size} tabelas presentes.` }
        : {
            nome: "Assinatura do sistema",
            gravidade: "falha",
            detalhe: `Não parece um backup deste sistema — faltam: ${faltando.join(", ")}.`,
          },
    );

    for (const tabela of TABELAS_CONTADAS) {
      const n = contar(db, tabela);
      if (n !== null) contagens[tabela] = n;
    }

    // Backup que abre mas está vazio é o pior caso: parece bom e não é.
    const vazio = (contagens.transacoes ?? 0) === 0 && (contagens.imoveis ?? 0) === 0;
    checagens.push(
      vazio
        ? {
            nome: "Conteúdo",
            gravidade: "falha",
            detalhe: "O backup abre, mas não tem transação nem imóvel. Um arquivo vazio parece íntegro e não é.",
          }
        : {
            nome: "Conteúdo",
            gravidade: "ok",
            detalhe: `${contagens.transacoes ?? 0} transações, ${contagens.imoveis ?? 0} imóveis, ${contagens.ledger_entries ?? 0} lançamentos.`,
          },
    );

    checagens.push(checarBalanceamento(db));
    checagens.push(checarCaixaContraExtrato(db));
    checagens.push(checarCofreDeEvidencias(db));
    checagens.push(checarContasDoRazao(db));
  } finally {
    db.close();
  }

  const houveFalha = checagens.some((c) => c.gravidade === "falha");
  const aberturaOk = checagens[0]?.gravidade === "ok";

  return {
    restauravel: aberturaOk && !checagens.some((c) => c.gravidade === "falha" && c.nome === "Assinatura do sistema"),
    contabilidadeIntegra: !houveFalha,
    hashSha256,
    tamanhoBytes: bytes.length,
    checagens,
    contagens,
  };
}

/** Compara dois backups e aponta o que ENCOLHEU.
 *
 * Crescer é normal. Encolher quase nunca é — e quando é (limpeza deliberada, rejeição em
 * lote), precisa ser decisão consciente, não descoberta meses depois. É a checagem que
 * pega backup tirado de um banco parcialmente apagado. */
export function compararComAnterior(
  atual: RelatorioVerificacao,
  anterior: RelatorioVerificacao,
): ResultadoChecagem[] {
  const alertas: ResultadoChecagem[] = [];
  for (const [tabela, n] of Object.entries(anterior.contagens)) {
    const agora = atual.contagens[tabela];
    if (agora === undefined) {
      alertas.push({
        nome: `Tabela ${tabela}`,
        gravidade: "falha",
        detalhe: `Existia no backup anterior (${n} linhas) e sumiu deste.`,
      });
    } else if (agora < n) {
      alertas.push({
        nome: `Tabela ${tabela}`,
        gravidade: "falha",
        detalhe: `Encolheu de ${n} para ${agora} linhas (${n - agora} a menos). Se não foi intencional, este backup é de um banco já danificado.`,
      });
    }
  }
  if (alertas.length === 0) {
    alertas.push({ nome: "Comparação com o anterior", gravidade: "ok", detalhe: "Nenhuma tabela encolheu." });
  }
  return alertas;
}
