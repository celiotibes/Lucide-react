/**
 * MÓDULO DE COMPLIANCE: Retenção de dados (políticas gerais + legal hold específico).
 *
 * Generaliza a regra de retenção que antes vivia hardcoded dentro de
 * `lgpd/direitosTitular.ts` (7 anos contábil fixo, mais dois casos binários — contrato
 * vigente e processo em curso — que não são "prazo", são um estado ainda aberto). Duas
 * tabelas novas sustentam isso:
 *
 * - `politicas_retencao`: quanto tempo (em anos) um registro de um DOMÍNIO precisa ser
 *   guardado, e sob qual base legal. Versionada — nunca edita uma política existente,
 *   sempre insere uma nova versão (mesmo padrão de `rad_avaliacoes` em
 *   `laudo/gerarRadPdf.ts`/schema.sql: histórico preservado, "versão vigente" é uma
 *   consulta, não um UPDATE destrutivo).
 * - `retencoes_legais`: um "legal hold" sobre um registro específico (entidade_tipo +
 *   entidade_id) — independe de prazo, é uma retenção ad-hoc (ex: processo aberto contra
 *   aquele CPF especificamente, notificação de auditoria). Um hold ativo bloqueia
 *   exclusão/anonimização mesmo que o prazo padrão já tenha vencido.
 *
 * IMPORTANTE — o que este módulo NÃO cobre: estados binários "ainda em curso" sem data de
 * referência (contrato de locação sem `data_fim`, processo com status 'ativo'/'suspenso')
 * continuam sendo checados diretamente em `direitosTitular.ts`, porque não há uma "idade"
 * para comparar contra um `prazo_anos` — são exatamente o tipo de retenção ad-hoc que
 * `retencoes_legais` está aqui para modelar no futuro (o chamador pode registrar um hold
 * explícito via `registrarRetencaoLegal` no momento em que o processo abre ou o contrato é
 * assinado), mas migrar esses dois casos para holds registrados é uma mudança de fluxo de
 * escrita (quem chama `registrarRetencaoLegal`/`encerrarRetencaoLegal` e quando) fora do
 * escopo desta tarefa — o objetivo aqui é generalizar o PRAZO fixo, sem alterar o
 * comportamento observável do fluxo de exclusão já testado.
 */
import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";

export interface PoliticaRetencao {
  id: number;
  dominio: string;
  prazo_anos: number;
  base_legal: string;
  versao: number;
  vigente_desde: string;
  observacoes: string | null;
}

export interface RetencaoLegal {
  id: number;
  entidade_tipo: string;
  entidade_id: number;
  motivo: string;
  ativo: number; // 0/1 (SQLite não tem boolean nativo)
  criado_em: string;
  encerrado_em: string | null;
}

export interface ResultadoPodeExcluir {
  permitido: boolean;
  motivo?: string;
}

/** Normaliza `Date` ou string ISO (com ou sem horário) para 'YYYY-MM-DD' — mesmo formato
 * de `vigente_desde`/`data_documento`/etc no schema, para que a comparação lexicográfica
 * de datas funcione (string maior = data mais recente) sem depender de função de data do
 * SQLite. */
function paraDataISO(data: Date | string): string {
  if (typeof data === "string") return data.slice(0, 10);
  return data.toISOString().slice(0, 10);
}

// Mesma fórmula usada em `lgpd/direitosTitular.ts` antes desta generalização — repetida
// aqui (não importada de lá) pelo mesmo motivo já documentado naquele arquivo: são módulos
// sobre coisas diferentes, a duplicação é da fórmula, não uma dependência entre módulos.
function anosDesde(dataISO: string, referencia: Date = new Date()): number {
  return (referencia.getTime() - new Date(dataISO).getTime()) / (365.25 * 24 * 3600 * 1000);
}

/** Cadastra uma nova política de retenção para um domínio — NUNCA edita uma existente.
 * Se já houver política(s) para o mesmo domínio, a nova entra com `versao` = maior versão
 * existente + 1 (histórico preservado; "a política vigente" é sempre uma consulta por
 * data via `obterPoliticaVigente`, nunca a única linha da tabela). */
export function cadastrarPoliticaRetencao(
  db: Database,
  dados: { dominio: string; prazoAnos: number; baseLegal: string; vigenteDesde: string; observacoes?: string },
): PoliticaRetencao {
  const [{ maxVersao }] = consultar<{ maxVersao: number | null }>(
    db,
    "SELECT MAX(versao) as maxVersao FROM politicas_retencao WHERE dominio = ?",
    [dados.dominio],
  );
  const versao = (maxVersao ?? 0) + 1;

  executar(
    db,
    `INSERT INTO politicas_retencao (dominio, prazo_anos, base_legal, versao, vigente_desde, observacoes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [dados.dominio, dados.prazoAnos, dados.baseLegal, versao, dados.vigenteDesde, dados.observacoes ?? null],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id");
  const [politica] = consultar<PoliticaRetencao>(db, "SELECT * FROM politicas_retencao WHERE id = ?", [id]);
  return politica;
}

/** Retorna a versão vigente da política de retenção de um domínio numa data de
 * referência (default: hoje) — a versão de maior `vigente_desde` que seja <= a data de
 * referência. `null` se não houver NENHUMA política cadastrada para o domínio: o chamador
 * decide o que fazer (ex: cair num prazo default hardcoded como fallback documentado, ou
 * tratar como "sem restrição conhecida" — este módulo não impõe uma escolha). */
export function obterPoliticaVigente(db: Database, dominio: string, dataReferencia: Date | string = new Date()): PoliticaRetencao | null {
  const dataRef = paraDataISO(dataReferencia);
  const [politica] = consultar<PoliticaRetencao>(
    db,
    `SELECT * FROM politicas_retencao
     WHERE dominio = ? AND vigente_desde <= ?
     ORDER BY vigente_desde DESC, versao DESC
     LIMIT 1`,
    [dominio, dataRef],
  );
  return politica ?? null;
}

/** Registra um legal hold ativo sobre uma entidade específica. DECISÃO DOCUMENTADA: não
 * lança erro ao encontrar um hold já ativo para o mesmo entidade_tipo+entidade_id — em vez
 * disso retorna o hold existente (idempotente do ponto de vista do chamador: "garanta que
 * há um hold aberto para X" pode ser chamado mais de uma vez sem se preocupar em checar
 * antes). Quem precisa saber se ACABOU de criar um hold novo pode checar isso comparando o
 * `id` retornado contra uma chamada prévia de `existeRetencaoLegalAtiva`. */
export function registrarRetencaoLegal(
  db: Database,
  dados: { entidadeTipo: string; entidadeId: number; motivo: string },
): RetencaoLegal {
  const [existente] = consultar<RetencaoLegal>(
    db,
    "SELECT * FROM retencoes_legais WHERE entidade_tipo = ? AND entidade_id = ? AND ativo = 1",
    [dados.entidadeTipo, dados.entidadeId],
  );
  if (existente) return existente;

  executar(
    db,
    `INSERT INTO retencoes_legais (entidade_tipo, entidade_id, motivo, ativo, criado_em)
     VALUES (?, ?, ?, 1, ?)`,
    [dados.entidadeTipo, dados.entidadeId, dados.motivo, new Date().toISOString()],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id");
  const [retencao] = consultar<RetencaoLegal>(db, "SELECT * FROM retencoes_legais WHERE id = ?", [id]);
  return retencao;
}

/** Encerra um legal hold — ativo=0, `encerrado_em` preenchido. Idempotente: encerrar um
 * hold que já estava encerrado é um no-op (retorna a linha como está, sem sobrescrever o
 * `encerrado_em` original). Lança erro se o id não existir — diferente de "já encerrado",
 * que é um estado válido, não um erro de uso. */
export function encerrarRetencaoLegal(db: Database, retencaoId: number): RetencaoLegal {
  const [existente] = consultar<RetencaoLegal>(db, "SELECT * FROM retencoes_legais WHERE id = ?", [retencaoId]);
  if (!existente) throw new Error(`Retenção legal ${retencaoId} não encontrada.`);
  if (existente.ativo === 0) return existente;

  executar(db, "UPDATE retencoes_legais SET ativo = 0, encerrado_em = ? WHERE id = ?", [new Date().toISOString(), retencaoId]);
  const [depois] = consultar<RetencaoLegal>(db, "SELECT * FROM retencoes_legais WHERE id = ?", [retencaoId]);
  return depois;
}

/** Existe algum legal hold ATIVO para esta entidade específica? */
export function existeRetencaoLegalAtiva(db: Database, entidadeTipo: string, entidadeId: number): boolean {
  return (
    consultar(db, "SELECT 1 FROM retencoes_legais WHERE entidade_tipo = ? AND entidade_id = ? AND ativo = 1", [entidadeTipo, entidadeId])
      .length > 0
  );
}

/** Função central: pode este registro ser excluído/anonimizado agora?
 *
 * (a) Se há um legal hold ativo para `entidadeTipo`+`entidadeId` → NÃO, com o motivo do
 *     hold (independe de prazo — um hold ativo bloqueia mesmo com o prazo padrão vencido).
 * (b) Senão, busca a política vigente para `dominio`; se a idade do registro (hoje menos
 *     `dataReferenciaDoRegistro`) for menor que `prazo_anos` da política → NÃO, citando
 *     prazo e base legal.
 * (c) Senão → SIM.
 *
 * Se não houver política cadastrada para o domínio, o passo (b) simplesmente não se aplica
 * (não impede a exclusão) — mesmo fallback permissivo documentado em
 * `obterPoliticaVigente`. Quem chama esta função para um domínio que precisa de um prazo
 * mínimo garantido deve ter chamado `garantirPoliticasRetencaoPadrao` (ou cadastrado a
 * política manualmente) antes. */
export function podeExcluirOuAnonimizar(
  db: Database,
  dados: { entidadeTipo: string; entidadeId: number; dominio: string; dataReferenciaDoRegistro: Date | string },
): ResultadoPodeExcluir {
  const [hold] = consultar<RetencaoLegal>(
    db,
    "SELECT * FROM retencoes_legais WHERE entidade_tipo = ? AND entidade_id = ? AND ativo = 1",
    [dados.entidadeTipo, dados.entidadeId],
  );
  if (hold) {
    return { permitido: false, motivo: `retenção legal ativa: ${hold.motivo}` };
  }

  const politica = obterPoliticaVigente(db, dados.dominio);
  if (politica) {
    const idade = anosDesde(paraDataISO(dados.dataReferenciaDoRegistro));
    if (idade < politica.prazo_anos) {
      return {
        permitido: false,
        motivo: `dentro do prazo de retenção de ${politica.prazo_anos} anos (${politica.base_legal}).`,
      };
    }
  }

  return { permitido: true };
}

// Políticas padrão que substituem o RETENCAO_ANOS=7 antes hardcoded em
// lgpd/direitosTitular.ts (ver comentário daquele arquivo, e compliance-audit-log.ts, que
// usa o mesmo prazo para `retencao_ate`). Três domínios porque três "relações" diferentes
// tinham a mesma contagem de 7 anos por motivos textualmente distintos no código antigo —
// documento contábil por força direta da Lei 6.404/76, e contrato/processo por CAUTELA
// (o código antigo reaproveitava a mesma constante sem citar uma lei própria para eles) —
// mantido honesto na `base_legal` de cada um em vez de fabricar uma citação específica que
// o código original não tinha.
const POLITICAS_PADRAO: { dominio: string; prazoAnos: number; baseLegal: string; vigenteDesde: string; observacoes?: string }[] = [
  {
    dominio: "contabil",
    prazoAnos: 7,
    baseLegal: "Lei 6.404/76 (guarda obrigatória de escrituração e documentos contábeis)",
    vigenteDesde: "2000-01-01",
    observacoes:
      "Cobre documentos (nota/recibo), prestadores (via última transação vinculada) e pagamentos_iniciados — mesmo prazo usado " +
      "historicamente em RETENCAO_ANOS (lgpd/direitosTitular.ts) e em retencao_ate (compliance-audit-log.ts).",
  },
  {
    dominio: "contrato_locacao",
    prazoAnos: 7,
    baseLegal: "Lei 6.404/76, aplicado por analogia/cautela ao encerramento de contrato de locação (mesmo prazo do domínio contábil)",
    vigenteDesde: "2000-01-01",
    observacoes: "Contrato ainda vigente (sem data_fim) continua sendo um caso à parte, checado em direitosTitular.ts — não é 'prazo vencido', é 'ainda em curso'.",
  },
  {
    dominio: "processo_legal",
    prazoAnos: 7,
    baseLegal: "Lei 6.404/76, aplicado por analogia/cautela ao arquivamento de processo judicial (mesmo prazo do domínio contábil)",
    vigenteDesde: "2000-01-01",
    observacoes: "Processo com status 'ativo'/'suspenso' continua sendo um caso à parte, checado em direitosTitular.ts — não é 'prazo vencido', é 'em curso'.",
  },
];

/** Garante que as políticas padrão acima existam — idempotente (não insere de novo, nem
 * versiona, se o domínio já tiver QUALQUER política cadastrada; isso é intencional: uma
 * vez que um domínio tem uma política real, ainda que divergente da padrão aqui, esta
 * função não deve competir com ela criando novas versões a cada chamada). Chamada a partir
 * do próprio fluxo de exclusão do LGPD (`atenderExclusao`, em `lgpd/direitosTitular.ts`) —
 * decisão de onde chamar: aqui e não no bootstrap do banco (`db/connection.ts`) porque é o
 * único fluxo hoje que de fato PRECISA dessas políticas para funcionar como antes; se outro
 * módulo passar a depender de `podeExcluirOuAnonimizar` no futuro, ele chama esta função
 * também (é barata e idempotente) em vez de duplicar a lista. */
export function garantirPoliticasRetencaoPadrao(db: Database): void {
  for (const padrao of POLITICAS_PADRAO) {
    const jaExiste = consultar(db, "SELECT 1 FROM politicas_retencao WHERE dominio = ? LIMIT 1", [padrao.dominio]).length > 0;
    if (jaExiste) continue;
    cadastrarPoliticaRetencao(db, padrao);
  }
}
