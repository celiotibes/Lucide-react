/**
 * Matriz de permissões configurável (papel × função)
 *
 * Complementa PERMISSOES_POR_ROLE (auth-service.ts), que decide operações do
 * módulo (pré-existente) de pagamento a prestadores. Este módulo modela
 * "função" como uma capacidade nomeada do sistema — ex: "aprovar despesa de
 * ordem de serviço", "gerar laudo pericial" — inferida das abas/ações REAIS
 * que já existem no client (ver `src/App.tsx`, array `ABAS`). Não cobre
 * 100% das abas: cobre o que faz sentido como decisão de acesso por papel,
 * com bom senso, sem inventar granularidade que nenhuma tela ainda usa.
 *
 * Este arquivo é puro (sem `better-sqlite3`, sem I/O) — fonte única do
 * catálogo de funções e papéis válidos, e das regras de validação/matriz
 * padrão, reutilizada tanto pelo serviço com banco (`permissoes-db.ts`)
 * quanto pelos testes. O CHECK da coluna `funcao` em
 * `migrations-phase2-auth.sql` precisa ser mantido em sincronia manualmente
 * com `FUNCOES_CATALOGO` abaixo — SQLite não permite CHECK dinâmico a
 * partir de um enum TypeScript.
 */
import { PAPEIS_VALIDOS, type UserRole } from "./auth-service.js";

export { PAPEIS_VALIDOS };
export type { UserRole };

export interface DefinicaoFuncao {
  id: string;
  /** Rótulo curto, para cabeçalho de coluna numa tabela papel × função. */
  rotulo: string;
  /** Frase explicando o que a função libera — usada como texto de apoio na
   * tela de gerenciamento (tooltip/legenda), não só documentação de código. */
  descricao: string;
  /** true quando esta função aceita um `limite_valor` opcional (ex: alçada
   * de aprovação) — mesmo espírito de LIMITE_APROVACAO_DUPLA no client
   * (src/domain/operacoes/ordensServico.ts, R$ 5.000,00), mas configurável
   * por papel em vez de uma constante fixa global. */
  suportaLimite: boolean;
}

/**
 * Catálogo inicial de funções — construído a partir das abas/ações reais do
 * client (ver `ABAS` em `src/App.tsx`), não exaustivo de propósito (a tarefa
 * pede "cubra o que fizer sentido com bom senso", não 100% das telas).
 *
 * MANTENHA EM SINCRONIA com o CHECK(funcao IN (...)) de `permissoes_papel`
 * em migrations-phase2-auth.sql — os testes de `permissoes-db.test.ts`
 * cobrem a divergência (uma função aqui sem CHECK correspondente falharia
 * ao tentar gravar).
 */
export const FUNCOES_CATALOGO: readonly DefinicaoFuncao[] = [
  {
    id: "gerenciar_usuarios",
    rotulo: "Gerenciar usuários",
    descricao: "Criar contas para outros papéis e alterar dados de usuários existentes.",
    suportaLimite: false,
  },
  {
    id: "gerenciar_permissoes",
    rotulo: "Gerenciar permissões",
    descricao: "Ver e editar esta própria matriz de permissões (papel × função).",
    suportaLimite: false,
  },
  {
    id: "ver_trilha_auditoria",
    rotulo: "Ver trilha de auditoria",
    descricao: "Consultar o histórico de ações e acessos negados (abas Auditoria forense / Trilha de auditoria).",
    suportaLimite: false,
  },
  {
    id: "aprovar_despesa_os",
    rotulo: "Aprovar despesa de OS",
    descricao: "Aprovar despesas de ordem de serviço (aba Operações). Acima do limite, política de quórum duplo continua se aplicando.",
    suportaLimite: true,
  },
  {
    id: "aprovar_pagamento",
    rotulo: "Aprovar pagamento",
    descricao: "Aprovar pagamentos PIX/TED/DOC (aba Pagamentos).",
    suportaLimite: true,
  },
  {
    id: "editar_plano_de_contas",
    rotulo: "Editar plano de contas",
    descricao: "Alterar cadastros contábeis estruturais (aba Cadastros).",
    suportaLimite: false,
  },
  {
    id: "lancar_transacoes",
    rotulo: "Lançar transações",
    descricao: "Criar, editar e conciliar transações (abas Transações / Conciliação bancária).",
    suportaLimite: false,
  },
  {
    id: "fechar_periodo_contabil",
    rotulo: "Fechar período contábil",
    descricao: "Executar o fechamento de um período (aba Fechamento de período) — operação difícil de reverter.",
    suportaLimite: false,
  },
  {
    id: "gerar_laudo_pericial",
    rotulo: "Gerar laudo pericial",
    descricao: "Produzir o laudo pericial (aba Laudo pericial).",
    suportaLimite: false,
  },
  {
    id: "exportar_ecd",
    rotulo: "Exportar ECD",
    descricao: "Gerar a exportação fiscal ECD (aba Exportação ECD).",
    suportaLimite: false,
  },
  {
    id: "ver_indicadores_gestao",
    rotulo: "Ver indicadores de gestão",
    descricao: "Consultar indicadores de gestão/investimento (abas Indicadores de gestão financeira, Avaliação de mercado, Budget vs Realizado, Projeção de caixa) — sem acesso à escrituração.",
    suportaLimite: false,
  },
  {
    id: "gerenciar_contratos_advocacia",
    rotulo: "Gerenciar advocacia",
    descricao: "Gerenciar o módulo de contratos/processos jurídicos (aba Advocacia).",
    suportaLimite: false,
  },
  {
    id: "editar_lgpd_chaves",
    rotulo: "Editar LGPD e chaves",
    descricao: "Alterar configurações de LGPD e chaves de acesso (aba LGPD e chaves) — função sensível.",
    suportaLimite: false,
  },
  {
    id: "importar_documentos",
    rotulo: "Importar documentos",
    descricao: "Importar e triar documentos/extratos (abas Importar documentos, Triagem de importação, Documentos e classificação).",
    suportaLimite: false,
  },
];

const FUNCOES_IDS: ReadonlySet<string> = new Set(FUNCOES_CATALOGO.map((f) => f.id));
const PAPEIS_IDS: ReadonlySet<UserRole> = new Set(PAPEIS_VALIDOS);

export function funcaoValida(funcao: string): boolean {
  return FUNCOES_IDS.has(funcao);
}

export function papelValido(papel: string): papel is UserRole {
  return PAPEIS_IDS.has(papel as UserRole);
}

export function obterDefinicaoFuncao(funcao: string): DefinicaoFuncao | undefined {
  return FUNCOES_CATALOGO.find((f) => f.id === funcao);
}

export interface EntradaPermissao {
  papel: UserRole;
  funcao: string;
  habilitado: boolean;
  limite_valor: number | null;
}

/** Função que TODO papel com gestão do sistema (titular, administrador)
 * precisa manter habilitada — ver `atualizarMatriz` em `permissoes-db.ts`:
 * nenhuma atualização pode desabilitá-la para qualquer um dos dois, senão o
 * sistema fica sem ninguém que possa corrigir a própria matriz de permissões
 * (o requisito "nunca travar o sistema sem saída" do enunciado). */
export const FUNCAO_PROTEGIDA = "gerenciar_permissoes";
export const PAPEIS_COM_FUNCAO_PROTEGIDA: readonly UserRole[] = ["titular", "administrador"];

/**
 * Matriz padrão, seedada uma vez na criação do banco (ver
 * `database-init.ts`). Cobre TODA combinação papel × função (6 × 14 = 84
 * linhas) para que `GET /api/auth/permissoes` nunca precise "inventar" um
 * default em memória para uma combinação ausente — o banco é a fonte única
 * do estado vigente.
 *
 * Critério usado para os defaults (decisão de produto revisável por quem
 * administra o sistema depois — é só o PONTO DE PARTIDA):
 * - titular/administrador: tudo habilitado (acesso amplo de gestão).
 * - contador: escrituração + aprovações operacionais (com o mesmo limite de
 *   R$ 5.000,00 de LIMITE_APROVACAO_DUPLA no client, como sugestão inicial
 *   de alçada) — sem gestão de usuários/permissões/auditoria.
 * - perito: laudo pericial + importar documentos (evidências).
 * - advogado: módulo de advocacia + importar documentos.
 * - economista: indicadores de gestão + importar documentos — sem
 *   escrituração (é o traço que o distingue de contador, por desenho).
 */
export function matrizPadrao(): EntradaPermissao[] {
  const entradas: EntradaPermissao[] = [];
  const habilitadasPorPapel: Record<UserRole, Record<string, number | null | undefined>> = {
    titular: Object.fromEntries(FUNCOES_CATALOGO.map((f) => [f.id, null])),
    administrador: Object.fromEntries(FUNCOES_CATALOGO.map((f) => [f.id, null])),
    contador: {
      lancar_transacoes: null,
      editar_plano_de_contas: null,
      fechar_periodo_contabil: null,
      exportar_ecd: null,
      importar_documentos: null,
      aprovar_despesa_os: 5000,
      aprovar_pagamento: 5000,
    },
    perito: {
      gerar_laudo_pericial: null,
      importar_documentos: null,
    },
    advogado: {
      gerenciar_contratos_advocacia: null,
      importar_documentos: null,
    },
    economista: {
      ver_indicadores_gestao: null,
      importar_documentos: null,
    },
    // Papéis externos (inquilino/prestador) começam SEM nenhuma função habilitada
    inquilino: {},
    prestador: {},
  };

  for (const papel of PAPEIS_VALIDOS) {
    const habilitadas = habilitadasPorPapel[papel];
    for (const funcao of FUNCOES_CATALOGO) {
      const temEntrada = Object.prototype.hasOwnProperty.call(habilitadas, funcao.id);
      entradas.push({
        papel,
        funcao: funcao.id,
        habilitado: temEntrada,
        limite_valor: temEntrada ? (habilitadas[funcao.id] ?? null) : null,
      });
    }
  }
  return entradas;
}

/** Valida uma entrada recebida em `PUT /api/auth/permissoes` — retorna a
 * mensagem de erro, ou `null` se válida. Função pura, sem tocar o banco,
 * para poder validar TODO o payload antes de abrir a transação de escrita
 * (evita gravar metade de um payload inválido). */
export function validarEntradaPermissao(entrada: unknown): string | null {
  if (typeof entrada !== "object" || entrada === null) {
    return "Cada entrada precisa ser um objeto";
  }
  const e = entrada as Record<string, unknown>;
  if (typeof e.papel !== "string" || !papelValido(e.papel)) {
    return `Papel inválido: ${String(e.papel)}`;
  }
  if (typeof e.funcao !== "string" || !funcaoValida(e.funcao)) {
    return `Função inválida: ${String(e.funcao)}`;
  }
  if (typeof e.habilitado !== "boolean") {
    return "Campo 'habilitado' precisa ser booleano";
  }
  if (e.limite_valor !== undefined && e.limite_valor !== null) {
    if (typeof e.limite_valor !== "number" || !Number.isFinite(e.limite_valor) || e.limite_valor < 0) {
      return "Campo 'limite_valor' precisa ser um número finito >= 0, ou null";
    }
    const definicao = obterDefinicaoFuncao(e.funcao);
    if (!definicao?.suportaLimite) {
      return `Função '${e.funcao}' não aceita limite_valor`;
    }
  }
  return null;
}
