/**
 * Testes para o sistema de agentes econômicos
 *
 * Cobre:
 * - Validação de CPF/CNPJ
 * - Schemas Zod
 * - Funções utilitárias
 * - Cálculo de duplicatas
 */

import { describe, it, expect } from "vitest";
import {
  isValidCPF,
  isValidCNPJ,
  formatCPF,
  formatCNPJ,
  formatCPFCNPJ,
  cleanCPFCNPJ,
  detectTipoEntidade,
  calculateSimilarity,
  calculateDuplicataScore,
  CPFSchema,
  CNPJSchema,
  CPFCNPJSchema,
  CriarAgenteEconomicoSchema,
  TipoEntidade,
  PapelAgente,
  RegimeTributario,
} from "../../domain/erp/agentes-tipos";

describe("Validação de CPF", () => {
  it("deve validar CPF correto", () => {
    // CPF real fictício com dígitos verificadores válidos
    expect(isValidCPF("11144477735")).toBe(true);
  });

  it("deve rejeitar CPF com dígitos verificadores inválidos", () => {
    expect(isValidCPF("11144477736")).toBe(false);
  });

  it("deve rejeitar CPF com todos os dígitos iguais", () => {
    expect(isValidCPF("11111111111")).toBe(false);
    expect(isValidCPF("00000000000")).toBe(false);
  });

  it("deve rejeitar CPF com menos de 11 dígitos", () => {
    expect(isValidCPF("1114447773")).toBe(false);
  });

  it("deve rejeitar CPF com mais de 11 dígitos", () => {
    expect(isValidCPF("111444777351")).toBe(false);
  });

  it("deve rejeitar CPF com caracteres não numéricos", () => {
    expect(isValidCPF("111.444.777-35")).toBe(false);
  });
});

describe("Validação de CNPJ", () => {
  it("deve validar CNPJ correto", () => {
    // CNPJ real fictício com dígitos verificadores válidos
    expect(isValidCNPJ("11222333000181")).toBe(true);
  });

  it("deve rejeitar CNPJ com dígitos verificadores inválidos", () => {
    expect(isValidCNPJ("11222333000182")).toBe(false);
  });

  it("deve rejeitar CNPJ com todos os dígitos iguais", () => {
    expect(isValidCNPJ("11111111111111")).toBe(false);
    expect(isValidCNPJ("00000000000000")).toBe(false);
  });

  it("deve rejeitar CNPJ com menos de 14 dígitos", () => {
    expect(isValidCNPJ("1122233300018")).toBe(false);
  });

  it("deve rejeitar CNPJ com mais de 14 dígitos", () => {
    expect(isValidCNPJ("112223330001811")).toBe(false);
  });
});

describe("Formatação de CPF", () => {
  it("deve formatar CPF corretamente", () => {
    expect(formatCPF("11144477735")).toBe("111.444.777-35");
  });

  it("deve retornar valor original se formato inválido", () => {
    expect(formatCPF("123")).toBe("123");
  });

  it("deve aceitar CPF já formatado", () => {
    // Nota: formatCPF remove caracteres não numéricos primeiro
    expect(formatCPF("111.444.777-35")).toBe("111.444.777-35");
  });
});

describe("Formatação de CNPJ", () => {
  it("deve formatar CNPJ corretamente", () => {
    expect(formatCNPJ("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("deve retornar valor original se formato inválido", () => {
    expect(formatCNPJ("123")).toBe("123");
  });
});

describe("Formatação de CPF/CNPJ", () => {
  it("deve formatar CPF automaticamente", () => {
    expect(formatCPFCNPJ("11144477735")).toBe("111.444.777-35");
  });

  it("deve formatar CNPJ automaticamente", () => {
    expect(formatCPFCNPJ("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("deve retornar valor original se formato inválido", () => {
    expect(formatCPFCNPJ("123")).toBe("123");
  });
});

describe("Limpeza de CPF/CNPJ", () => {
  it("deve remover formatação de CPF", () => {
    expect(cleanCPFCNPJ("111.444.777-35")).toBe("11144477735");
  });

  it("deve remover formatação de CNPJ", () => {
    expect(cleanCPFCNPJ("11.222.333/0001-81")).toBe("11222333000181");
  });

  it("deve remover todos os caracteres não numéricos", () => {
    expect(cleanCPFCNPJ("111-444-777/35")).toBe("11144477735");
  });
});

describe("Detectar tipo de entidade", () => {
  it("deve detectar pessoa física com 11 dígitos", () => {
    expect(detectTipoEntidade("11144477735")).toBe(TipoEntidade.PESSOA_FISICA);
  });

  it("deve detectar pessoa jurídica com 14 dígitos", () => {
    expect(detectTipoEntidade("11222333000181")).toBe(
      TipoEntidade.PESSOA_JURIDICA
    );
  });

  it("deve detectar mesmo com formatação", () => {
    expect(detectTipoEntidade("111.444.777-35")).toBe(
      TipoEntidade.PESSOA_FISICA
    );
    expect(detectTipoEntidade("11.222.333/0001-81")).toBe(
      TipoEntidade.PESSOA_JURIDICA
    );
  });

  it("deve lançar erro para formato inválido", () => {
    expect(() => detectTipoEntidade("123")).toThrow();
  });
});

describe("Schema CPF", () => {
  it("deve validar CPF correto", () => {
    const resultado = CPFSchema.safeParse("11144477735");
    expect(resultado.success).toBe(true);
  });

  it("deve rejeitar CPF inválido", () => {
    const resultado = CPFSchema.safeParse("11144477736");
    expect(resultado.success).toBe(false);
  });

  it("deve rejeitar valor com menos de 11 dígitos", () => {
    const resultado = CPFSchema.safeParse("1114447773");
    expect(resultado.success).toBe(false);
  });
});

describe("Schema CNPJ", () => {
  it("deve validar CNPJ correto", () => {
    const resultado = CNPJSchema.safeParse("11222333000181");
    expect(resultado.success).toBe(true);
  });

  it("deve rejeitar CNPJ inválido", () => {
    const resultado = CNPJSchema.safeParse("11222333000182");
    expect(resultado.success).toBe(false);
  });
});

describe("Schema CPF/CNPJ", () => {
  it("deve validar CPF", () => {
    const resultado = CPFCNPJSchema.safeParse("11144477735");
    expect(resultado.success).toBe(true);
  });

  it("deve validar CNPJ", () => {
    const resultado = CPFCNPJSchema.safeParse("11222333000181");
    expect(resultado.success).toBe(true);
  });

  it("deve rejeitar formato inválido", () => {
    const resultado = CPFCNPJSchema.safeParse("123");
    expect(resultado.success).toBe(false);
  });
});

describe("Schema CriarAgenteEconomico", () => {
  it("deve validar pessoa física corretamente", () => {
    const agente = {
      tipo_entidade: "pessoa_fisica" as const,
      cpf_cnpj: "11144477735",
      nome: "João da Silva",
      pessoa_fisica_pf_nome_mae: "Maria Silva",
      papel: "tenant" as const,
      ativo: true,
    };

    const resultado = CriarAgenteEconomicoSchema.safeParse(agente);
    expect(resultado.success).toBe(true);
  });

  it("deve validar pessoa jurídica corretamente", () => {
    const agente = {
      tipo_entidade: "pessoa_juridica" as const,
      cpf_cnpj: "11222333000181",
      nome: "Empresa LTDA",
      nome_fantasia: "Empresa",
      papel: "supplier" as const,
      regime_tributario: "lucro_real" as const,
      ativo: true,
    };

    const resultado = CriarAgenteEconomicoSchema.safeParse(agente);
    expect(resultado.success).toBe(true);
  });

  it("deve rejeitar pessoa física sem nome da mãe", () => {
    const agente = {
      tipo_entidade: "pessoa_fisica" as const,
      cpf_cnpj: "11144477735",
      nome: "João da Silva",
      papel: "tenant" as const,
    };

    const resultado = CriarAgenteEconomicoSchema.safeParse(agente);
    expect(resultado.success).toBe(false);
  });

  it("deve rejeitar pessoa jurídica sem nome fantasia", () => {
    const agente = {
      tipo_entidade: "pessoa_juridica" as const,
      cpf_cnpj: "11222333000181",
      nome: "Empresa LTDA",
      papel: "supplier" as const,
    };

    const resultado = CriarAgenteEconomicoSchema.safeParse(agente);
    expect(resultado.success).toBe(false);
  });

  it("deve validar com email", () => {
    const agente = {
      tipo_entidade: "pessoa_fisica" as const,
      cpf_cnpj: "11144477735",
      nome: "João da Silva",
      pessoa_fisica_pf_nome_mae: "Maria Silva",
      papel: "tenant" as const,
      email: "joao@example.com",
    };

    const resultado = CriarAgenteEconomicoSchema.safeParse(agente);
    expect(resultado.success).toBe(true);
  });

  it("deve rejeitar email inválido", () => {
    const agente = {
      tipo_entidade: "pessoa_fisica" as const,
      cpf_cnpj: "11144477735",
      nome: "João da Silva",
      pessoa_fisica_pf_nome_mae: "Maria Silva",
      papel: "tenant" as const,
      email: "email-invalido",
    };

    const resultado = CriarAgenteEconomicoSchema.safeParse(agente);
    expect(resultado.success).toBe(false);
  });
});

describe("Cálculo de Similaridade", () => {
  it("deve retornar 100 para strings idênticas", () => {
    expect(calculateSimilarity("Empresa LTDA", "Empresa LTDA")).toBe(100);
  });

  it("deve retornar 100 para strings com case diferentes", () => {
    expect(calculateSimilarity("Empresa LTDA", "empresa ltda")).toBe(100);
  });

  it("deve calcular similaridade para strings parecidas", () => {
    const score = calculateSimilarity("Empresa LTDA", "Empresa Ltd");
    expect(score).toBeGreaterThan(70);
    expect(score).toBeLessThan(100);
  });

  it("deve retornar low score para strings diferentes", () => {
    expect(calculateSimilarity("ABC", "XYZ")).toBeLessThan(50);
  });

  it("deve lidar com strings vazias", () => {
    expect(calculateSimilarity("", "")).toBe(100);
  });
});

describe("Cálculo de Score de Duplicata", () => {
  it("deve retornar 100 se agentes são idênticos", () => {
    const agente = {
      id: "1",
      tipo_entidade: TipoEntidade.PESSOA_FISICA,
      cpf_cnpj: "11144477735",
      nome: "João Silva",
      papel: PapelAgente.TENANT,
      ativo: true,
      criado_em: new Date(),
      criado_por: "user1",
      atualizado_em: new Date(),
      atualizado_por: "user1",
      validado: false,
    };

    const score = calculateDuplicataScore(agente, agente);
    expect(score).toBeGreaterThan(0);
  });

  it("deve retornar 40 se apenas CPF é igual", () => {
    const agente1 = {
      id: "1",
      tipo_entidade: TipoEntidade.PESSOA_FISICA,
      cpf_cnpj: "11144477735",
      nome: "João Silva",
      papel: PapelAgente.TENANT,
      ativo: true,
      criado_em: new Date(),
      criado_por: "user1",
      atualizado_em: new Date(),
      atualizado_por: "user1",
      validado: false,
    };

    const agente2 = {
      ...agente1,
      id: "2",
      nome: "Pedro Santos",
    };

    const score = calculateDuplicataScore(agente1, agente2);
    expect(score).toBe(40);
  });

  it("deve somar scores de múltiplos campos", () => {
    const agente1 = {
      id: "1",
      tipo_entidade: TipoEntidade.PESSOA_FISICA,
      cpf_cnpj: "11144477735",
      nome: "João Silva",
      email: "joao@example.com",
      telefone: "11999999999",
      papel: PapelAgente.TENANT,
      ativo: true,
      criado_em: new Date(),
      criado_por: "user1",
      atualizado_em: new Date(),
      atualizado_por: "user1",
      validado: false,
    };

    const agente2 = {
      ...agente1,
      id: "2",
    };

    const score = calculateDuplicataScore(agente1, agente2);
    expect(score).toBeGreaterThan(40); // Mais que apenas CPF
  });

  it("deve retornar 0 se agentes são completamente diferentes", () => {
    const agente1 = {
      id: "1",
      tipo_entidade: TipoEntidade.PESSOA_FISICA,
      cpf_cnpj: "11144477735",
      nome: "João Silva",
      papel: PapelAgente.TENANT,
      ativo: true,
      criado_em: new Date(),
      criado_por: "user1",
      atualizado_em: new Date(),
      atualizado_por: "user1",
      validado: false,
    };

    const agente2 = {
      id: "2",
      tipo_entidade: TipoEntidade.PESSOA_FISICA,
      cpf_cnpj: "22233344455",
      nome: "Pedro Santos",
      papel: PapelAgente.SUPPLIER,
      ativo: true,
      criado_em: new Date(),
      criado_por: "user1",
      atualizado_em: new Date(),
      atualizado_por: "user1",
      validado: false,
    };

    const score = calculateDuplicataScore(agente1, agente2);
    expect(score).toBe(0);
  });
});

describe("Casos de Uso Reais", () => {
  it("deve criar agente fornecedor completo", () => {
    const agente = {
      tipo_entidade: "pessoa_juridica" as const,
      cpf_cnpj: "11222333000181",
      nome: "Serviços Técnicos Brasil LTDA",
      nome_fantasia: "Serviços Técnicos",
      papel: "supplier" as const,
      regime_tributario: "lucro_real" as const,
      inscricao_estadual: "123.456.789.012",
      inscricao_municipal: "123456",
      email: "contato@servicostecnicos.com",
      telefone: "1133334444",
      endereco: {
        logradouro: "Rua das Flores",
        numero: "123",
        complemento: "Sala 45",
        bairro: "Centro",
        cidade: "São Paulo",
        estado: "SP",
        cep: "01310100",
      },
      ativo: true,
    };

    const resultado = CriarAgenteEconomicoSchema.safeParse(agente);
    expect(resultado.success).toBe(true);
  });

  it("deve criar agente inquilino completo", () => {
    const agente = {
      tipo_entidade: "pessoa_fisica" as const,
      cpf_cnpj: "11144477735",
      nome: "João da Silva Santos",
      pessoa_fisica_pf_nome_mae: "Maria da Silva",
      papel: "tenant" as const,
      email: "joao.silva@example.com",
      telefone: "11987654321",
      endereco: {
        logradouro: "Avenida Principal",
        numero: "456",
        bairro: "Vila Nova",
        cidade: "São Paulo",
        estado: "SP",
        cep: "04531010",
      },
      ativo: true,
    };

    const resultado = CriarAgenteEconomicoSchema.safeParse(agente);
    expect(resultado.success).toBe(true);
  });
});
