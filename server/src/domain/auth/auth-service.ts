/**
 * Authentication and Authorization Service
 * Gerencia autenticação de usuários, roles e permissões
 *
 * Roles (Fase 1 — ver docs/viabilidade-backend-pagamentos.md; `administrador`
 * e `economista` adicionados numa fase seguinte, junto com a matriz de
 * permissões configurável — ver `permissoes.ts`):
 * - titular: dono(a) da conta/escritório — papel mais próximo de "admin"
 * - administrador: acesso amplo de gestão do SISTEMA (equivalente a titular
 *   nas permissões de código abaixo — `usuario`/`auditoria`), mas
 *   conceitualmente distinto: é alguém autorizado a administrar o sistema em
 *   nome do titular, não necessariamente o titular da contabilidade. Existe
 *   como papel separado (não um alias de `titular`) para que a trilha de
 *   auditoria e a matriz de permissões (papel × função) possam, no futuro,
 *   diferenciar o dono da conta de quem administra em nome dele — hoje têm
 *   exatamente as mesmas permissões de código (PERMISSOES_POR_ROLE), mas a
 *   matriz de permissões (tabela `permissoes_papel`) já os trata como duas
 *   linhas independentes.
 * - contador: profissional contábil
 * - perito: perito(a) — inclui quem também é rastreado no módulo de
 *   pagamento a prestadores (diária + km) para viagens/vistorias, via
 *   `Usuario.prestador_id` (ver nota abaixo)
 * - advogado: advogado(a)
 * - economista: análise financeira/indicadores de gestão e investimento —
 *   distinto de `contador` por foco: não faz escrituração contábil
 *   (lançamentos, plano de contas, fechamento), só CONSOME os indicadores
 *   que o módulo contábil produz (ver `ver_indicadores_gestao` em
 *   `permissoes.ts`).
 *
 * Estes são os papéis REAIS do produto (não os do antigo módulo interno de
 * pagamento a prestadores de serviço — admin/gestor/prestador — que foi
 * removido daqui; ver commit `926e8cf` e a análise de viabilidade). RBAC
 * granular por papel profissional continua raso de propósito NESTE arquivo
 * (PERMISSOES_POR_ROLE) — nenhuma tela real do módulo de pagamento a
 * prestadores consome essa diferenciação; só gestão de usuários e leitura de
 * auditoria são reservadas a titular/administrador. A diferenciação granular
 * por papel que o produto de fato precisa (aprovar despesa de OS, gerar
 * laudo pericial, ver indicadores de gestão, etc.) foi modelada à parte, na
 * matriz de permissões configurável (`permissoes.ts` + tabela
 * `permissoes_papel`) — não duplicada aqui.
 *
 * O módulo de pagamento a prestadores (`duplicate-payment-guard-db.ts`) não
 * usa mais nome de papel nenhum para decidir quem só vê os próprios dados —
 * usa a presença de `Usuario.prestador_id` (ver `podeAcessarPrestador`
 * abaixo), independente de qual dos 6 papéis o usuário tem.
 */

export type UserRole = "titular" | "administrador" | "contador" | "perito" | "advogado" | "economista" | "inquilino" | "prestador";

/** Todos os papéis válidos, na ordem em que aparecem em `UserRole` — fonte
 * única para validação de entrada em rotas HTTP (ex: `POST /api/auth/usuarios`)
 * e para popular um `<select>` no client, evitando uma segunda lista
 * hardcoded que poderia divergir desta. */
export const PAPEIS_VALIDOS: readonly UserRole[] = [
  "titular",
  "administrador",
  "contador",
  "perito",
  "advogado",
  "economista",
  "inquilino",
  "prestador",
];

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  prestador_id?: number; // Se prestador, qual prestador?
  ativo: boolean;
  data_criacao: string;
  ultimo_login?: string;
}

export interface ContextoAutenticacao {
  usuario: Usuario | null;
  autenticado: boolean;
  role?: UserRole;
  prestador_id?: number;
  token?: string;
}

export interface PermissaoOperacao {
  recurso: string;
  operacao: "criar" | "ler" | "atualizar" | "deletar" | "aprovar";
  roles: UserRole[];
}

/**
 * Mapa de permissões por role
 *
 * Fase 1: nenhuma tela real ainda consome diferença de permissão entre
 * titular/contador/perito/advogado — por isso os quatro têm exatamente o
 * mesmo conjunto de permissões sobre os recursos do (pré-existente) módulo
 * de pagamento a prestadores, EXCETO gestão de usuários e leitura de
 * auditoria, que ficam só com titular (o papel mais próximo de "dono da
 * conta"). Isto é proposital, não um esquecimento: inventar diferenciação
 * de permissão para contador/perito/advogado sem nenhuma tela que a use
 * seria criar regra que ninguém pode validar. Quando telas reais do produto
 * precisarem de RBAC granular por papel profissional, este mapa é o lugar
 * certo para crescer.
 */
export const PERMISSOES_POR_ROLE: Record<UserRole, PermissaoOperacao[]> = {
  titular: [
    { recurso: "prestador_contrato", operacao: "criar", roles: ["titular"] },
    { recurso: "prestador_contrato", operacao: "ler", roles: ["titular"] },
    { recurso: "prestador_contrato", operacao: "atualizar", roles: ["titular"] },
    { recurso: "prestador_contrato", operacao: "deletar", roles: ["titular"] },
    { recurso: "prestador_apontamento", operacao: "criar", roles: ["titular"] },
    { recurso: "prestador_apontamento", operacao: "ler", roles: ["titular"] },
    { recurso: "prestador_apontamento", operacao: "atualizar", roles: ["titular"] },
    { recurso: "prestador_apontamento", operacao: "deletar", roles: ["titular"] },
    { recurso: "prestador_pagamento", operacao: "criar", roles: ["titular"] },
    { recurso: "prestador_pagamento", operacao: "ler", roles: ["titular"] },
    { recurso: "prestador_pagamento", operacao: "atualizar", roles: ["titular"] },
    { recurso: "prestador_pagamento", operacao: "aprovar", roles: ["titular"] },
    { recurso: "auditoria", operacao: "ler", roles: ["titular"] },
    { recurso: "usuario", operacao: "criar", roles: ["titular"] },
    { recurso: "usuario", operacao: "atualizar", roles: ["titular"] },
  ],
  // `administrador`: acesso amplo de gestão do sistema, EQUIVALENTE a
  // `titular` nesta lista de permissões de código (a distinção entre os
  // dois — "dono da conta" vs. "administra em nome do titular" — não muda
  // nada aqui; ela é modelada na matriz de permissões configurável, ver
  // permissoes.ts, onde os dois têm linhas independentes que HOJE nascem
  // idênticas mas podem divergir se o titular decidir restringir um
  // administrador específico no futuro).
  administrador: [
    { recurso: "prestador_contrato", operacao: "criar", roles: ["administrador"] },
    { recurso: "prestador_contrato", operacao: "ler", roles: ["administrador"] },
    { recurso: "prestador_contrato", operacao: "atualizar", roles: ["administrador"] },
    { recurso: "prestador_contrato", operacao: "deletar", roles: ["administrador"] },
    { recurso: "prestador_apontamento", operacao: "criar", roles: ["administrador"] },
    { recurso: "prestador_apontamento", operacao: "ler", roles: ["administrador"] },
    { recurso: "prestador_apontamento", operacao: "atualizar", roles: ["administrador"] },
    { recurso: "prestador_apontamento", operacao: "deletar", roles: ["administrador"] },
    { recurso: "prestador_pagamento", operacao: "criar", roles: ["administrador"] },
    { recurso: "prestador_pagamento", operacao: "ler", roles: ["administrador"] },
    { recurso: "prestador_pagamento", operacao: "atualizar", roles: ["administrador"] },
    { recurso: "prestador_pagamento", operacao: "aprovar", roles: ["administrador"] },
    { recurso: "auditoria", operacao: "ler", roles: ["administrador"] },
    { recurso: "usuario", operacao: "criar", roles: ["administrador"] },
    { recurso: "usuario", operacao: "atualizar", roles: ["administrador"] },
  ],
  contador: [
    { recurso: "prestador_contrato", operacao: "criar", roles: ["contador"] },
    { recurso: "prestador_contrato", operacao: "ler", roles: ["contador"] },
    { recurso: "prestador_contrato", operacao: "atualizar", roles: ["contador"] },
    { recurso: "prestador_contrato", operacao: "deletar", roles: ["contador"] },
    { recurso: "prestador_apontamento", operacao: "criar", roles: ["contador"] },
    { recurso: "prestador_apontamento", operacao: "ler", roles: ["contador"] },
    { recurso: "prestador_apontamento", operacao: "atualizar", roles: ["contador"] },
    { recurso: "prestador_apontamento", operacao: "deletar", roles: ["contador"] },
    { recurso: "prestador_pagamento", operacao: "criar", roles: ["contador"] },
    { recurso: "prestador_pagamento", operacao: "ler", roles: ["contador"] },
    { recurso: "prestador_pagamento", operacao: "atualizar", roles: ["contador"] },
    { recurso: "prestador_pagamento", operacao: "aprovar", roles: ["contador"] },
  ],
  perito: [
    { recurso: "prestador_contrato", operacao: "criar", roles: ["perito"] },
    { recurso: "prestador_contrato", operacao: "ler", roles: ["perito"] },
    { recurso: "prestador_contrato", operacao: "atualizar", roles: ["perito"] },
    { recurso: "prestador_contrato", operacao: "deletar", roles: ["perito"] },
    { recurso: "prestador_apontamento", operacao: "criar", roles: ["perito"] },
    { recurso: "prestador_apontamento", operacao: "ler", roles: ["perito"] },
    { recurso: "prestador_apontamento", operacao: "atualizar", roles: ["perito"] },
    { recurso: "prestador_apontamento", operacao: "deletar", roles: ["perito"] },
    { recurso: "prestador_pagamento", operacao: "criar", roles: ["perito"] },
    { recurso: "prestador_pagamento", operacao: "ler", roles: ["perito"] },
    { recurso: "prestador_pagamento", operacao: "atualizar", roles: ["perito"] },
    { recurso: "prestador_pagamento", operacao: "aprovar", roles: ["perito"] },
  ],
  advogado: [
    { recurso: "prestador_contrato", operacao: "criar", roles: ["advogado"] },
    { recurso: "prestador_contrato", operacao: "ler", roles: ["advogado"] },
    { recurso: "prestador_contrato", operacao: "atualizar", roles: ["advogado"] },
    { recurso: "prestador_contrato", operacao: "deletar", roles: ["advogado"] },
    { recurso: "prestador_apontamento", operacao: "criar", roles: ["advogado"] },
    { recurso: "prestador_apontamento", operacao: "ler", roles: ["advogado"] },
    { recurso: "prestador_apontamento", operacao: "atualizar", roles: ["advogado"] },
    { recurso: "prestador_apontamento", operacao: "deletar", roles: ["advogado"] },
    { recurso: "prestador_pagamento", operacao: "criar", roles: ["advogado"] },
    { recurso: "prestador_pagamento", operacao: "ler", roles: ["advogado"] },
    { recurso: "prestador_pagamento", operacao: "atualizar", roles: ["advogado"] },
    { recurso: "prestador_pagamento", operacao: "aprovar", roles: ["advogado"] },
  ],
  // `economista`: mesmo padrão de acesso ao módulo de prestadores que
  // contador/perito/advogado (nenhuma tela real diferencia isso hoje — ver
  // nota no topo do arquivo); sem `usuario`/`auditoria`, reservadas a
  // titular/administrador. A diferenciação real do papel (foco em
  // indicadores de gestão, não em escrituração) vive na matriz de
  // permissões configurável, não nesta lista de código.
  economista: [
    { recurso: "prestador_contrato", operacao: "criar", roles: ["economista"] },
    { recurso: "prestador_contrato", operacao: "ler", roles: ["economista"] },
    { recurso: "prestador_contrato", operacao: "atualizar", roles: ["economista"] },
    { recurso: "prestador_contrato", operacao: "deletar", roles: ["economista"] },
    { recurso: "prestador_apontamento", operacao: "criar", roles: ["economista"] },
    { recurso: "prestador_apontamento", operacao: "ler", roles: ["economista"] },
    { recurso: "prestador_apontamento", operacao: "atualizar", roles: ["economista"] },
    { recurso: "prestador_apontamento", operacao: "deletar", roles: ["economista"] },
    { recurso: "prestador_pagamento", operacao: "criar", roles: ["economista"] },
    { recurso: "prestador_pagamento", operacao: "ler", roles: ["economista"] },
    { recurso: "prestador_pagamento", operacao: "atualizar", roles: ["economista"] },
    { recurso: "prestador_pagamento", operacao: "aprovar", roles: ["economista"] },
  ],
};

/** true se o usuário é um "profissional interno" com acesso amplo ao módulo
 * de pagamento a prestadores — ou seja, não está ele mesmo vinculado a um
 * único prestador via `prestador_id`. Esta é a única distinção estrutural
 * que hoje decide algo nesse módulo (ver nota em PERMISSOES_POR_ROLE); não
 * depende de qual dos 4 papéis do produto o usuário tem. */
export function usuarioTemAcessoAmploAPrestadores(usuario: Usuario | null | undefined): boolean {
  return !!usuario && usuario.prestador_id == null;
}

/** true se `contexto` pode ler/modificar dados do prestador `prestador_id`:
 * usuários sem vínculo próprio (`prestador_id` nulo) têm acesso amplo;
 * usuários vinculados só acessam o próprio registro. Usado tanto pelo
 * AuthService (podeLerPrestador/podeModificarApontamentos) quanto pelo
 * DuplicatePaymentGuardDB (bloqueio de submissão para outro prestador) —
 * fonte única da regra, para não divergir entre os dois lugares. */
export function podeAcessarPrestador(
  contexto: ContextoAutenticacao,
  prestador_id: number,
): boolean {
  if (!contexto.autenticado || !contexto.usuario) {
    return false;
  }
  if (usuarioTemAcessoAmploAPrestadores(contexto.usuario)) {
    return true;
  }
  return contexto.usuario.prestador_id === prestador_id;
}

/** true se `contexto` pode aprovar pagamento a prestadores — mesma regra de
 * "acesso amplo" acima: quem está vinculado ao próprio prestador_id não
 * aprova (nem o próprio pagamento). */
export function podeAprovarPagamentoPrestador(contexto: ContextoAutenticacao): boolean {
  if (!contexto.autenticado || !contexto.usuario) {
    return false;
  }
  return usuarioTemAcessoAmploAPrestadores(contexto.usuario);
}

/**
 * Verifica se um usuário tem permissão para uma operação, segundo
 * PERMISSOES_POR_ROLE. Função pura (não depende de banco nem de estado) —
 * usada tanto por `AuthServiceDB` quanto pelos testes.
 */
export function temPermissao(
  contexto: ContextoAutenticacao,
  recurso: string,
  operacao: "criar" | "ler" | "atualizar" | "deletar" | "aprovar",
): boolean {
  if (!contexto.autenticado || !contexto.usuario) {
    return false;
  }

  const permissoes = PERMISSOES_POR_ROLE[contexto.usuario.role];
  return permissoes.some((p) => p.recurso === recurso && p.operacao === operacao);
}

// NOTA: este arquivo já teve uma classe `AuthService` em memória, com
// singleton exportado (`authService`), que validava senha contra a
// constante fixa "senha123" e gerava token com `Math.random()`. Ela nunca
// foi importada por nenhum outro módulo (nem rota HTTP, nem teste próprio)
// — código morto desde que `AuthServiceDB` (auth-service-db.ts, com
// persistência em banco) foi escrito para substituí-la. Removida aqui em
// vez de corrigida, junto com os dois problemas reais que a motivaram esta
// fase (senha hardcoded, token sem assinatura): manter uma segunda
// implementação insegura ao lado da corrigida (`AuthServiceDB`) só criaria
// risco de alguém importar a errada por engano. As funções puras acima
// (temPermissao, podeAcessarPrestador, podeAprovarPagamentoPrestador) são
// o que efetivamente sobrevive e é reaproveitado pelas duas classes que
// usavam esta lógica antes.
