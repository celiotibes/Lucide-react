/**
 * Sincronização bancária via MeuPluggy (uso pessoal, gratuito da Pluggy) — PARALELA ao fluxo
 * comercial que já existe (`ConectarPluggy.tsx` + `src/domain/parsers/pluggyClient.ts`, widget
 * Pluggy Connect). Aqui o usuário já conectou as contas por fora, em meu.pluggy.ai; este
 * módulo só liga essas contas às contas bancárias já cadastradas no sistema
 * (`pluggy_contas_vinculadas`, ver contabilidade-reconstituicao/schema.sql) e sincroniza as
 * transações delas.
 *
 * Como o fluxo manual de importação (ImportarView.tsx) e o fluxo comercial de Open Finance já
 * existente, a sincronização aqui NUNCA grava direto em `transacoes`: ela entra pela mesma
 * porta — `registrarLote` (src/domain/importacao/cofre.ts) — que cria o lote de importação e
 * as linhas de triagem (`lotes_importacao`/`importacao_linhas`), com a MESMA lógica de
 * dedup por hash do lote (`loteExistente`) e de duplicata provável por fitid/data+valor
 * (`marcarDuplicatasProvaveis`) que o resto do sistema usa. Todo lançamento sincronizado
 * ainda espera aprovação humana na aba Triagem de importação antes de virar lançamento no
 * razão — não duplicamos essa lógica aqui.
 */
import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLote, hashDoArquivo, type ResultadoLote } from "../importacao/cofre";

export interface TransacaoPluggyMeu {
  data: string;
  valor: number;
  descricaoOriginal: string;
  fitid: string;
  documentoFonte?: string;
}

export interface ContaPluggyMeuDisponivel {
  itemId: string;
  nomeInstituicao: string;
  statusItem: string;
  contaId: string;
  nomeConta: string;
  numero: string;
  tipo: "BANK" | "CREDIT";
  subtipo: string;
  saldo: number;
}

export interface OpcoesSincronizacao {
  dataInicio?: string;
  dataFim?: string;
}

/** Fronteira testável com o backend — a implementação real (HTTP, com o Bearer token da
 * sessão do app) fica em `src/components/integracoes/PluggySyncView.tsx`, que é quem sabe o
 * endereço do backend e tem acesso ao token de sessão. Este módulo de domínio nunca faz
 * `fetch` diretamente: assim os testes exercitam a lógica de vínculo/triagem/erro sem rede. */
export interface PluggyMeuApiClient {
  listarContas(): Promise<ContaPluggyMeuDisponivel[]>;
  buscarTransacoes(accountId: string, opcoes?: OpcoesSincronizacao): Promise<TransacaoPluggyMeu[]>;
}

export interface DadosVinculoPluggy {
  itemId: string;
  accountId: string;
  nomeInstituicao?: string;
}

export type StatusSincronizacaoPluggy = "ok" | "erro" | "desconectado";

export interface ContaVinculadaPluggy {
  id: number;
  conta_bancaria_id: number;
  pluggy_item_id: string;
  pluggy_account_id: string;
  nome_instituicao_pluggy: string | null;
  ultima_sincronizacao: string | null;
  status_sincronizacao: StatusSincronizacaoPluggy;
  observacoes: string | null;
  criado_em: string;
  // Colunas de contas_bancarias, trazidas via JOIN só por `listarContasVinculadas` — convenientes
  // para a tela não precisar de uma segunda consulta para mostrar banco/número ao lado do status.
  banco?: string;
  numero?: string;
}

function obterVinculoPorId(db: Database, id: number): ContaVinculadaPluggy {
  const linha = consultar<ContaVinculadaPluggy>(db, "SELECT * FROM pluggy_contas_vinculadas WHERE id = ?", [id])[0];
  if (!linha) throw new Error(`Vínculo Pluggy #${id} não encontrado (inconsistência interna após escrita).`);
  return linha;
}

/** Vincula uma conta bancária já cadastrada a uma conta do MeuPluggy. Idempotente por
 * `pluggy_account_id` (UNIQUE no schema): vincular de novo a mesma conta Pluggy atualiza o
 * vínculo (permite trocar para qual conta bancária local ela aponta) em vez de duplicar linha
 * e colidir com a constraint. */
export function vincularContaPluggy(db: Database, contaBancariaId: number, dadosPluggy: DadosVinculoPluggy): ContaVinculadaPluggy {
  const contaBancaria = consultar<{ id: number }>(db, "SELECT id FROM contas_bancarias WHERE id = ?", [contaBancariaId])[0];
  if (!contaBancaria) {
    throw new Error(`Conta bancária #${contaBancariaId} não encontrada — cadastre-a antes de vincular ao MeuPluggy.`);
  }

  const existente = consultar<{ id: number }>(
    db,
    "SELECT id FROM pluggy_contas_vinculadas WHERE pluggy_account_id = ?",
    [dadosPluggy.accountId],
  )[0];

  if (existente) {
    executar(
      db,
      `UPDATE pluggy_contas_vinculadas
       SET conta_bancaria_id = ?, pluggy_item_id = ?, nome_instituicao_pluggy = ?
       WHERE id = ?`,
      [contaBancariaId, dadosPluggy.itemId, dadosPluggy.nomeInstituicao ?? null, existente.id],
    );
    return obterVinculoPorId(db, existente.id);
  }

  executar(
    db,
    `INSERT INTO pluggy_contas_vinculadas (conta_bancaria_id, pluggy_item_id, pluggy_account_id, nome_instituicao_pluggy)
     VALUES (?, ?, ?, ?)`,
    [contaBancariaId, dadosPluggy.itemId, dadosPluggy.accountId, dadosPluggy.nomeInstituicao ?? null],
  );
  const novoId = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id")[0].id;
  return obterVinculoPorId(db, novoId);
}

/** Todos os vínculos já cadastrados, com banco/número da conta local para exibição. */
export function listarContasVinculadas(db: Database): ContaVinculadaPluggy[] {
  return consultar<ContaVinculadaPluggy>(
    db,
    `SELECT v.*, c.banco AS banco, c.numero AS numero
     FROM pluggy_contas_vinculadas v
     JOIN contas_bancarias c ON c.id = v.conta_bancaria_id
     ORDER BY v.criado_em DESC`,
  );
}

export interface ResultadoSincronizacaoPluggy {
  lote_id: number;
  ja_sincronizado_antes: boolean;
  /** Total de linhas registradas em `importacao_linhas` para este lote (inclui as marcadas
   * como duplicata provável e as malformadas — nenhuma delas é descartada, só aguardam
   * triagem). Mesma semântica de `ResultadoLote.linhas_registradas` em cofre.ts. */
  inseridas: number;
  /** Subconjunto de `inseridas` que bateu com uma transação já existente (mesmo fitid, ou
   * mesma conta+data+valor) e entrou com status 'duplicata_provavel' em vez de 'pendente'. */
  duplicadas: number;
  /** Subconjunto de `inseridas` com data ou valor ilegível. */
  malformadas: number;
}

/** Hash do CONTEÚDO da janela sincronizada (não do accountId nem das datas pedidas) — mesmo
 * critério que `ImportarView.tsx` já usa para o fluxo comercial de Open Finance: se a mesma
 * conta sincronizar duas vezes e não houver transação nova, o lote é reconhecido como já
 * existente (mesma UNIQUE(arquivo_hash_sha256, conta_id) de `lotes_importacao`) em vez de
 * criar um lote vazio repetido. */
async function hashDaJanelaSincronizada(transacoes: TransacaoPluggyMeu[]): Promise<string> {
  return hashDoArquivo(
    new TextEncoder().encode(transacoes.map((t) => `${t.data}|${t.valor}|${t.descricaoOriginal}`).join("\n")),
  );
}

function marcarStatus(db: Database, vinculoId: number, status: StatusSincronizacaoPluggy, observacoes: string | null): void {
  executar(
    db,
    `UPDATE pluggy_contas_vinculadas
     SET ultima_sincronizacao = CURRENT_TIMESTAMP, status_sincronizacao = ?, observacoes = ?
     WHERE id = ?`,
    [status, observacoes, vinculoId],
  );
}

/** Busca as transações da conta MeuPluggy vinculada e as entrega à MESMA porta de entrada do
 * sistema (`registrarLote`) que a importação manual de extrato usa — cria um lote em
 * `lotes_importacao` e uma linha por transação em `importacao_linhas`, todas em status
 * 'pendente' (ou 'duplicata_provavel' quando a dedup encontra bate com algo já lançado).
 * Nenhuma linha vira transação no razão aqui: isso só acontece quando um humano aprova na aba
 * Triagem de importação.
 *
 * Em caso de falha (API fora do ar, item desconectado, etc.), marca
 * `status_sincronizacao = 'erro'` com o motivo em `observacoes` e relança o erro — quem chama
 * decide o que mostrar na tela, mas o estado do vínculo já registra a falha. */
export async function sincronizarTransacoes(
  db: Database,
  apiClient: PluggyMeuApiClient,
  contaBancariaId: number,
  opcoes?: OpcoesSincronizacao,
): Promise<ResultadoSincronizacaoPluggy> {
  const vinculo = consultar<ContaVinculadaPluggy>(
    db,
    "SELECT * FROM pluggy_contas_vinculadas WHERE conta_bancaria_id = ?",
    [contaBancariaId],
  )[0];
  if (!vinculo) {
    throw new Error(`Conta bancária #${contaBancariaId} não tem vínculo com o MeuPluggy — vincule antes de sincronizar.`);
  }

  try {
    const transacoes = await apiClient.buscarTransacoes(vinculo.pluggy_account_id, opcoes);
    const hash = await hashDaJanelaSincronizada(transacoes);

    const resultado: ResultadoLote = registrarLote(
      db,
      {
        arquivo_nome: `MeuPluggy — ${vinculo.nome_instituicao_pluggy ?? vinculo.pluggy_account_id}`,
        arquivo_hash_sha256: hash,
        arquivo_bytes: 0,
        tipo_detectado: "open_finance",
        conta_id: contaBancariaId,
      },
      transacoes,
    );

    marcarStatus(db, vinculo.id, "ok", null);

    if (resultado.ja_existia) {
      return { lote_id: resultado.lote_id, ja_sincronizado_antes: true, inseridas: 0, duplicadas: transacoes.length, malformadas: 0 };
    }
    return {
      lote_id: resultado.lote_id,
      ja_sincronizado_antes: false,
      inseridas: resultado.linhas_registradas,
      duplicadas: resultado.linhas_duplicata_provavel,
      malformadas: resultado.linhas_malformadas,
    };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    marcarStatus(db, vinculo.id, "erro", `Falha ao sincronizar em ${new Date().toISOString()}: ${motivo}`);
    throw erro instanceof Error ? erro : new Error(motivo);
  }
}
