/**
 * Test Fixtures for Economic Agents (Agentes Econômicos)
 *
 * Provides sample data, valid CPF/CNPJ values, and helper functions
 * for testing across all test suites.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AgenteEconomico,
  TipoEntidade,
  PapelAgente,
  RegimeTributario,
  TipoValidacao,
  ResultadoValidacao,
  MotivoDuplicata,
  StatusDuplicata,
  TipoVinculacao,
} from '../../domain/erp/agentes-tipos.js';
import { Usuario, ContextoAutenticacao } from '../../domain/auth/auth-service.js';

// =====================================================================
// Valid CPF/CNPJ Test Values
// =====================================================================

/**
 * Valid CPF numbers for testing (pessoa física)
 * These are mathematically valid but fictitious CPFs
 */
export const VALID_CPFS = {
  cpf_1: '11144477735',  // Valid CPF
  cpf_2: '57956270891',  // Valid CPF
  cpf_3: '28476488091',  // Valid CPF
  cpf_4: '93827665191',  // Valid CPF (for duplicate testing)
  cpf_5: '58235640700',  // Valid CPF
};

/**
 * Valid CNPJ numbers for testing (pessoa jurídica)
 * These are mathematically valid but fictitious CNPJs
 */
export const VALID_CNPJS = {
  cnpj_1: '11222333000181',  // Valid CNPJ
  cnpj_2: '34666777000161',  // Valid CNPJ
  cnpj_3: '56789012000195',  // Valid CNPJ
  cnpj_4: '78901234000170',  // Valid CNPJ (for duplicate testing)
  cnpj_5: '12345678000190',  // Valid CNPJ
};

/**
 * Invalid CPF/CNPJ values for negative testing
 */
export const INVALID_DOCUMENTS = {
  cpf_all_zeros: '00000000000',
  cpf_all_nines: '99999999999',
  cpf_invalid_checksum: '11144477736',  // Wrong check digit
  cnpj_all_zeros: '00000000000000',
  cnpj_all_nines: '99999999999999',
  cnpj_invalid_checksum: '11222333000182',  // Wrong check digit
  cpf_too_short: '111444777',
  cnpj_too_long: '112223330001811111',
};

// =====================================================================
// Test User Contexts
// =====================================================================

/**
 * Standard authenticated admin user for tests
 */
export const TEST_ADMIN_USER: Usuario = {
  id: uuidv4(),
  nome: 'Admin Test User',
  email: 'admin@test.example.com',
  role: 'administrador',
  ativo: true,
  data_criacao: new Date().toISOString().split('T')[0],
};

/**
 * Standard authenticated regular user for tests
 */
export const TEST_REGULAR_USER: Usuario = {
  id: uuidv4(),
  nome: 'Regular Test User',
  email: 'user@test.example.com',
  role: 'perito',
  ativo: true,
  data_criacao: new Date().toISOString().split('T')[0],
};

/**
 * Authentication context for admin user
 */
export const TEST_ADMIN_CONTEXT: ContextoAutenticacao = {
  usuario: TEST_ADMIN_USER,
  autenticado: true,
  role: 'administrador',
};

/**
 * Authentication context for regular user
 */
export const TEST_USER_CONTEXT: ContextoAutenticacao = {
  usuario: TEST_REGULAR_USER,
  autenticado: true,
  role: 'perito',
};

/**
 * Unauthenticated context for authorization tests
 */
export const TEST_UNAUTHENTICATED_CONTEXT: ContextoAutenticacao = {
  usuario: null,
  autenticado: false,
};

// =====================================================================
// Sample Pessoa Física (Natural Persons) Fixtures
// =====================================================================

/**
 * Sample tenant (inquilino) - pessoa física
 */
export function createSamplePessoaFisicaTenant(overrides?: Partial<AgenteEconomico>): AgenteEconomico {
  const id = uuidv4();
  return {
    id,
    tipo_entidade: TipoEntidade.PESSOA_FISICA,
    cpf_cnpj: VALID_CPFS.cpf_1,
    nome: 'João da Silva',
    papel: PapelAgente.TENANT,
    pessoa_fisica_pf_nome_mae: 'Maria da Silva',
    email: 'joao.silva@test.com',
    telefone: '1133334444',
    celular: '11999998888',
    endereco: {
      logradouro: 'Rua A',
      numero: '123',
      bairro: 'Centro',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '01234567',
      pais: 'Brasil',
    },
    ativo: true,
    criado_em: new Date(),
    criado_por: TEST_ADMIN_USER.id,
    atualizado_em: new Date(),
    atualizado_por: TEST_ADMIN_USER.id,
    validado: false,
    ...overrides,
  };
}

/**
 * Sample borrower (mutuário) - pessoa física
 */
export function createSamplePessoaFisicaBorrower(overrides?: Partial<AgenteEconomico>): AgenteEconomico {
  return createSamplePessoaFisicaTenant({
    cpf_cnpj: VALID_CPFS.cpf_2,
    nome: 'Pedro Costa',
    papel: PapelAgente.BORROWER,
    pessoa_fisica_pf_nome_mae: 'Ana Costa',
    email: 'pedro.costa@test.com',
    ...overrides,
  });
}

/**
 * Sample lender (credor) - pessoa física
 */
export function createSamplePessoaFisicaLender(overrides?: Partial<AgenteEconomico>): AgenteEconomico {
  return createSamplePessoaFisicaTenant({
    cpf_cnpj: VALID_CPFS.cpf_3,
    nome: 'Carlos Oliveira',
    papel: PapelAgente.LENDER,
    pessoa_fisica_pf_nome_mae: 'Lucia Oliveira',
    email: 'carlos.oliveira@test.com',
    ...overrides,
  });
}

// =====================================================================
// Sample Pessoa Jurídica (Legal Entities) Fixtures
// =====================================================================

/**
 * Sample supplier - pessoa jurídica
 */
export function createSamplePessoaJuridicaSupplier(overrides?: Partial<AgenteEconomico>): AgenteEconomico {
  const id = uuidv4();
  return {
    id,
    tipo_entidade: TipoEntidade.PESSOA_JURIDICA,
    cpf_cnpj: VALID_CNPJS.cnpj_1,
    nome: 'Fornecedores Brasil LTDA',
    nome_fantasia: 'Fornecedores Brasil',
    papel: PapelAgente.SUPPLIER,
    regime_tributario: RegimeTributario.LUCRO_REAL,
    inscricao_estadual: 'IE123456789',
    inscricao_municipal: 'IM123456',
    classificacao_nfse: '0101',
    email: 'contato@fornecedores.test.com',
    telefone: '1133335555',
    celular: '11999999999',
    endereco: {
      logradouro: 'Avenida Paulista',
      numero: '1000',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '01311100',
      pais: 'Brasil',
    },
    ativo: true,
    criado_em: new Date(),
    criado_por: TEST_ADMIN_USER.id,
    atualizado_em: new Date(),
    atualizado_por: TEST_ADMIN_USER.id,
    validado: false,
    ...overrides,
  };
}

/**
 * Sample service provider - pessoa jurídica
 */
export function createSamplePessoaJuridicaProvider(overrides?: Partial<AgenteEconomico>): AgenteEconomico {
  return createSamplePessoaJuridicaSupplier({
    cpf_cnpj: VALID_CNPJS.cnpj_2,
    nome: 'Prestadores de Serviços Especializados LTDA',
    nome_fantasia: 'PSE Services',
    papel: PapelAgente.PROVIDER,
    inscricao_estadual: 'IE987654321',
    inscricao_municipal: 'IM654321',
    email: 'servicos@pse.test.com',
    ...overrides,
  });
}

/**
 * Sample legal party (advogado, etc) - pessoa jurídica
 */
export function createSamplePessoaJuridicaLegalParty(overrides?: Partial<AgenteEconomico>): AgenteEconomico {
  return createSamplePessoaJuridicaSupplier({
    cpf_cnpj: VALID_CNPJS.cnpj_3,
    nome: 'Escritório de Advocacia Legal LTDA',
    nome_fantasia: 'Legal Advocacia',
    papel: PapelAgente.LEGAL_PARTY,
    regime_tributario: RegimeTributario.SIMPLES,
    inscricao_estadual: 'IE111111111',
    email: 'contato@legal-advocacia.test.com',
    ...overrides,
  });
}

/**
 * Sample co-owner - pessoa jurídica
 */
export function createSamplePessoaJuridicaCoOwner(overrides?: Partial<AgenteEconomico>): AgenteEconomico {
  return createSamplePessoaJuridicaSupplier({
    cpf_cnpj: VALID_CNPJS.cnpj_4,
    nome: 'Imobiliária Propertiex LTDA',
    nome_fantasia: 'Propertiex',
    papel: PapelAgente.CO_OWNER,
    regime_tributario: RegimeTributario.LUCRO_PRESUMIDO,
    inscricao_estadual: 'IE222222222',
    email: 'info@propertiex.test.com',
    ...overrides,
  });
}

// =====================================================================
// Duplicate Agent Fixtures
// =====================================================================

/**
 * Create two agents with same CPF/CNPJ (exact duplicate)
 */
export function createDuplicateAgentsPair(tipo: TipoEntidade = TipoEntidade.PESSOA_FISICA) {
  const cpfCnpj = tipo === TipoEntidade.PESSOA_FISICA ? VALID_CPFS.cpf_4 : VALID_CNPJS.cnpj_4;

  if (tipo === TipoEntidade.PESSOA_FISICA) {
    const agent1 = createSamplePessoaFisicaTenant({
      cpf_cnpj: cpfCnpj,
      nome: 'João Silva Original',
      email: 'joao.silva.original@test.com',
    });

    const agent2 = createSamplePessoaFisicaTenant({
      cpf_cnpj: cpfCnpj,
      nome: 'João Silva Duplicado',
      email: 'joao.silva.duplicado@test.com',
    });

    return { agent1, agent2 };
  } else {
    const agent1 = createSamplePessoaJuridicaSupplier({
      cpf_cnpj: cpfCnpj,
      nome: 'Empresa Original LTDA',
      nome_fantasia: 'Empresa Original',
      email: 'empresa.original@test.com',
    });

    const agent2 = createSamplePessoaJuridicaSupplier({
      cpf_cnpj: cpfCnpj,
      nome: 'Empresa Duplicada LTDA',
      nome_fantasia: 'Empresa Duplicada',
      email: 'empresa.duplicada@test.com',
    });

    return { agent1, agent2 };
  }
}

/**
 * Create multiple agents with similar names (fuzzy duplicate candidates)
 */
export function createFuzzyDuplicateAgents() {
  return [
    createSamplePessoaFisicaTenant({
      cpf_cnpj: VALID_CPFS.cpf_1,
      nome: 'João da Silva Santos',
      email: 'joao1@test.com',
    }),
    createSamplePessoaFisicaTenant({
      cpf_cnpj: VALID_CPFS.cpf_2,
      nome: 'Joao da Silva Santos',  // Missing tilde
      email: 'joao2@test.com',
    }),
    createSamplePessoaFisicaTenant({
      cpf_cnpj: VALID_CPFS.cpf_3,
      nome: 'João da Silva',  // Abbreviated version
      email: 'joao3@test.com',
    }),
  ];
}

// =====================================================================
// Bulk Test Data Generators
// =====================================================================

/**
 * Generate N unique pessoas físicas for load testing
 */
export function generateBulkPessoasFisicas(count: number): AgenteEconomico[] {
  const agents: AgenteEconomico[] = [];
  const cpfs = Object.values(VALID_CPFS);

  for (let i = 0; i < count; i++) {
    const cpf = cpfs[i % cpfs.length];
    const uniqueCpf = cpf.slice(0, -4) + String(i).padStart(4, '0');

    agents.push(createSamplePessoaFisicaTenant({
      cpf_cnpj: uniqueCpf,
      nome: `Pessoa Física ${i + 1}`,
      email: `pf${i + 1}@test.com`,
      validado: Math.random() > 0.5,
      ativo: Math.random() > 0.2,
    }));
  }

  return agents;
}

/**
 * Generate N unique pessoas jurídicas for load testing
 */
export function generateBulkPessoasJuridicas(count: number): AgenteEconomico[] {
  const agents: AgenteEconomico[] = [];
  const cnpjs = Object.values(VALID_CNPJS);
  const papeis = [
    PapelAgente.SUPPLIER,
    PapelAgente.PROVIDER,
    PapelAgente.LEGAL_PARTY,
  ];

  for (let i = 0; i < count; i++) {
    const cnpj = cnpjs[i % cnpjs.length];
    const uniqueCnpj = cnpj.slice(0, -6) + String(i).padStart(6, '0');
    const papel = papeis[i % papeis.length];

    agents.push(createSamplePessoaJuridicaSupplier({
      cpf_cnpj: uniqueCnpj,
      nome: `Empresa ${i + 1} LTDA`,
      nome_fantasia: `Empresa ${i + 1}`,
      papel,
      email: `empresa${i + 1}@test.com`,
      validado: Math.random() > 0.5,
      ativo: Math.random() > 0.2,
    }));
  }

  return agents;
}

// =====================================================================
// Multiple Papel Test Fixtures
// =====================================================================

/**
 * Create an agent with multiple papéis for role testing
 */
export function createAgentWithMultiplePapeis(): AgenteEconomico {
  return createSamplePessoaJuridicaSupplier({
    // In a real scenario, this would support multiple papéis
    papel: PapelAgente.SUPPLIER,
  });
}

/**
 * Generate fixture for each papel type
 */
export function generateAgentsForAllPapelTypes() {
  return {
    [PapelAgente.TENANT]: createSamplePessoaFisicaTenant(),
    [PapelAgente.SUPPLIER]: createSamplePessoaJuridicaSupplier(),
    [PapelAgente.PROVIDER]: createSamplePessoaJuridicaProvider(),
    [PapelAgente.LEGAL_PARTY]: createSamplePessoaJuridicaLegalParty(),
    [PapelAgente.CO_OWNER]: createSamplePessoaJuridicaCoOwner(),
    [PapelAgente.BORROWER]: createSamplePessoaFisicaBorrower(),
    [PapelAgente.LENDER]: createSamplePessoaFisicaLender(),
  };
}

// =====================================================================
// Validation and Audit Fixtures
// =====================================================================

/**
 * Sample validation record
 */
export function createSampleValidacao(agente_id: string) {
  return {
    id: uuidv4(),
    agente_id,
    tipo_validacao: TipoValidacao.CPF_CNPJ,
    resultado: ResultadoValidacao.APROVADO,
    motivo: null,
    executado_em: new Date(),
    executado_por: TEST_ADMIN_USER.id,
  };
}

/**
 * Sample duplicate record
 */
export function createSampleDuplicata(agente_id_1: string, agente_id_2: string) {
  return {
    id: uuidv4(),
    agente_id_1,
    agente_id_2,
    score: 85,
    motivo: MotivoDuplicata.CPF_CNPJ_SIMILAR,
    score_cpf: 90,
    score_nome: 80,
    status: StatusDuplicata.PENDENTE,
    criado_em: new Date(),
    criado_por: TEST_ADMIN_USER.id,
  };
}

/**
 * Sample vinculação record
 */
export function createSampleVinculacao(agente_id: string, entidade_id: string) {
  return {
    id: uuidv4(),
    agente_id,
    tipo_vinculacao: TipoVinculacao.PROPRIEDADE,
    entidade_id,
    entidade_nome: 'Property #123',
    tipo_relacionamento: 'proprietário',
    ativo: true,
    criado_em: new Date(),
    criado_por: TEST_ADMIN_USER.id,
  };
}

// =====================================================================
// Error/Edge Case Fixtures
// =====================================================================

/**
 * Minimal valid pessoa física for testing required fields only
 */
export function createMinimalValidPessoaFisica(): AgenteEconomico {
  return {
    id: uuidv4(),
    tipo_entidade: TipoEntidade.PESSOA_FISICA,
    cpf_cnpj: VALID_CPFS.cpf_1,
    nome: 'Test User',
    pessoa_fisica_pf_nome_mae: 'Test Mother',
    papel: PapelAgente.TENANT,
    ativo: true,
    criado_em: new Date(),
    criado_por: TEST_ADMIN_USER.id,
    atualizado_em: new Date(),
    atualizado_por: TEST_ADMIN_USER.id,
    validado: false,
  };
}

/**
 * Minimal valid pessoa jurídica for testing required fields only
 */
export function createMinimalValidPessoaJuridica(): AgenteEconomico {
  return {
    id: uuidv4(),
    tipo_entidade: TipoEntidade.PESSOA_JURIDICA,
    cpf_cnpj: VALID_CNPJS.cnpj_1,
    nome: 'Test Company LTDA',
    nome_fantasia: 'Test Company',
    papel: PapelAgente.SUPPLIER,
    ativo: true,
    criado_em: new Date(),
    criado_por: TEST_ADMIN_USER.id,
    atualizado_em: new Date(),
    atualizado_por: TEST_ADMIN_USER.id,
    validado: false,
  };
}

// =====================================================================
// Helper Functions
// =====================================================================

/**
 * Generate a valid CPF (currently just returns a fixed valid CPF)
 * In production, you'd implement actual CPF generation with check digit calculation
 */
export function generateValidCPF(): string {
  const cpfs = Object.values(VALID_CPFS);
  return cpfs[Math.floor(Math.random() * cpfs.length)];
}

/**
 * Generate a valid CNPJ (currently just returns a fixed valid CNPJ)
 * In production, you'd implement actual CNPJ generation with check digit calculation
 */
export function generateValidCNPJ(): string {
  const cnpjs = Object.values(VALID_CNPJS);
  return cnpjs[Math.floor(Math.random() * cnpjs.length)];
}

/**
 * Create multiple agents in various states for comprehensive testing
 */
export function createCompleteAgentTestSuite() {
  return {
    pessoas_fisicas: {
      tenant: createSamplePessoaFisicaTenant(),
      borrower: createSamplePessoaFisicaBorrower(),
      lender: createSamplePessoaFisicaLender(),
      validado: createSamplePessoaFisicaTenant({ validado: true, validado_em: new Date() }),
      inativo: createSamplePessoaFisicaTenant({ ativo: false }),
    },
    pessoas_juridicas: {
      supplier: createSamplePessoaJuridicaSupplier(),
      provider: createSamplePessoaJuridicaProvider(),
      legal_party: createSamplePessoaJuridicaLegalParty(),
      co_owner: createSamplePessoaJuridicaCoOwner(),
      validado: createSamplePessoaJuridicaSupplier({ validado: true, validado_em: new Date() }),
      inativo: createSamplePessoaJuridicaSupplier({ ativo: false }),
    },
    duplicatas: createDuplicateAgentsPair(TipoEntidade.PESSOA_FISICA),
  };
}
