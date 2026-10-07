/**
 * Testes para o Sistema de Papéis e Permissões de Agentes
 *
 * Cobre:
 * - Definições de papéis
 * - Requisitos de campos
 * - Validações específicas por papel
 * - Matriz de permissões
 * - Compatibilidade entre tipo de entidade e papel
 * - Nível de risco
 */

import { describe, it, expect } from "vitest";
import {
  PapelAgente,
  TipoEntidade,
  RegimeTributario,
} from "../agentes-tipos.js";
import {
  obterDefinicaoPapel,
  validarCamposObrigatorios,
  obterPermissoes,
  temPermissao,
  listarPapeis,
  obterTiposTransacao,
  validarCompatibilidadeEntidadePapel,
  obterNivelRisco,
  PapelUsuario,
  AcaoPermissao,
  MATRIZ_PERMISSOES,
} from "../agentes-papeis.js";

// =====================================================================
// Testes de Definições de Papéis
// =====================================================================

describe("agentes-papeis: Definições de Papéis", () => {
  it("deve retornar definição válida para cada papel", () => {
    Object.values(PapelAgente).forEach((papel) => {
      const definicao = obterDefinicaoPapel(papel);

      expect(definicao).toBeDefined();
      expect(definicao.codigo).toBe(papel);
      expect(definicao.nome_pt).toBeTruthy();
      expect(definicao.descricao_pt).toBeTruthy();
      expect(Array.isArray(definicao.camposObrigatorios)).toBe(true);
      expect(typeof definicao.requerValidacaoManual).toBe("boolean");
      expect(typeof definicao.requerDocumentacao).toBe("boolean");
      expect(["baixo", "medio", "alto"]).toContain(definicao.nivelRisco);
    });
  });

  it("deve lançar erro para papel desconhecido", () => {
    expect(() => {
      obterDefinicaoPapel("papel_invalido" as PapelAgente);
    }).toThrow("Papel desconhecido");
  });

  it("deve listar todos os papéis disponíveis", () => {
    const papeis = listarPapeis();

    expect(papeis).toBeDefined();
    expect(papeis.length).toBeGreaterThan(0);
    expect(papeis.length).toBe(Object.values(PapelAgente).length);

    // Verificar que todos os papéis estão na lista
    Object.values(PapelAgente).forEach((papel) => {
      const encontrado = papeis.find((p) => p.codigo === papel);
      expect(encontrado).toBeDefined();
    });
  });

  it("TENANT deve ter campos obrigatórios corretos", () => {
    const definicao = obterDefinicaoPapel(PapelAgente.TENANT);

    expect(definicao.camposObrigatorios).toContain("cpf_cnpj");
    expect(definicao.camposObrigatorios).toContain("nome");
    expect(definicao.camposObrigatorios).toContain("email");
    expect(definicao.camposObrigatorios).toContain("endereco");
  });

  it("SUPPLIER deve ter regime tributário padrão de LUCRO_REAL", () => {
    const definicao = obterDefinicaoPapel(PapelAgente.SUPPLIER);

    expect(definicao.regimeTributarioPadrao).toBe(RegimeTributario.LUCRO_REAL);
  });

  it("PROVIDER deve ter regime tributário padrão de SIMPLES", () => {
    const definicao = obterDefinicaoPapel(PapelAgente.PROVIDER);

    expect(definicao.regimeTributarioPadrao).toBe(RegimeTributario.SIMPLES);
  });
});

// =====================================================================
// Testes de Validação de Campos
// =====================================================================

describe("agentes-papeis: Validação de Campos", () => {
  it("deve validar campos obrigatórios do TENANT", () => {
    const agente = {
      cpf_cnpj: "12345678901",
      nome: "João Silva",
      email: "joao@example.com",
      endereco: { logradouro: "Rua A" },
    };

    const faltantes = validarCamposObrigatorios(agente, PapelAgente.TENANT);
    expect(faltantes).toEqual([]);
  });

  it("deve detectar campos faltantes do TENANT", () => {
    const agente = {
      cpf_cnpj: "12345678901",
      nome: "João Silva",
      // email faltando
      // endereco faltando
    };

    const faltantes = validarCamposObrigatorios(agente, PapelAgente.TENANT);
    expect(faltantes).toContain("email");
    expect(faltantes).toContain("endereco");
    expect(faltantes.length).toBeGreaterThan(0);
  });

  it("deve detectar null como campo faltante", () => {
    const agente = {
      cpf_cnpj: "12345678901",
      nome: "João Silva",
      email: null,
      endereco: { logradouro: "Rua A" },
    };

    const faltantes = validarCamposObrigatorios(agente, PapelAgente.TENANT);
    expect(faltantes).toContain("email");
  });

  it("deve detectar undefined como campo faltante", () => {
    const agente = {
      cpf_cnpj: "12345678901",
      nome: "João Silva",
      email: undefined,
      endereco: { logradouro: "Rua A" },
    };

    const faltantes = validarCamposObrigatorios(agente, PapelAgente.TENANT);
    expect(faltantes).toContain("email");
  });

  it("deve detectar string vazia como campo faltante", () => {
    const agente = {
      cpf_cnpj: "12345678901",
      nome: "",
      email: "joao@example.com",
      endereco: { logradouro: "Rua A" },
    };

    const faltantes = validarCamposObrigatorios(agente, PapelAgente.TENANT);
    expect(faltantes).toContain("nome");
  });

  it("deve validar SUPPLIER com todos os campos", () => {
    const agente = {
      cpf_cnpj: "12345678901234",
      nome: "Empresa ABC",
      regime_tributario: RegimeTributario.LUCRO_REAL,
      email: "empresa@example.com",
      telefone: "1133334444",
    };

    const faltantes = validarCamposObrigatorios(agente, PapelAgente.SUPPLIER);
    expect(faltantes).toEqual([]);
  });
});

// =====================================================================
// Testes de Permissões
// =====================================================================

describe("agentes-papeis: Matriz de Permissões", () => {
  it("SUPER_ADMIN deve ter todas as permissões para TENANT", () => {
    const permissoes = obterPermissoes(
      PapelAgente.TENANT,
      PapelUsuario.SUPER_ADMIN
    );

    expect(permissoes).toContain(AcaoPermissao.CRIAR);
    expect(permissoes).toContain(AcaoPermissao.EDITAR);
    expect(permissoes).toContain(AcaoPermissao.VISUALIZAR);
    expect(permissoes).toContain(AcaoPermissao.DELETAR);
    expect(permissoes).toContain(AcaoPermissao.EXPORTAR);
    expect(permissoes.length).toBe(Object.values(AcaoPermissao).length);
  });

  it("ADMIN deve ter permissões limitadas para LEGAL_PARTY", () => {
    const permissoes = obterPermissoes(
      PapelAgente.LEGAL_PARTY,
      PapelUsuario.ADMIN
    );

    expect(permissoes).toContain(AcaoPermissao.CRIAR);
    expect(permissoes).toContain(AcaoPermissao.VISUALIZAR);
    expect(permissoes).toContain(AcaoPermissao.APROVAR);
    expect(permissoes).not.toContain(AcaoPermissao.DELETAR);
  });

  it("GERENTE deve poder criar e editar SUPPLIER", () => {
    const permissoes = obterPermissoes(
      PapelAgente.SUPPLIER,
      PapelUsuario.GERENTE
    );

    expect(permissoes).toContain(AcaoPermissao.CRIAR);
    expect(permissoes).toContain(AcaoPermissao.EDITAR);
    expect(permissoes).toContain(AcaoPermissao.VISUALIZAR);
    expect(permissoes).not.toContain(AcaoPermissao.DELETAR);
  });

  it("ANALISTA deve ter acesso limitado a leitura", () => {
    const permissoes = obterPermissoes(
      PapelAgente.SUPPLIER,
      PapelUsuario.ANALISTA
    );

    expect(permissoes).toContain(AcaoPermissao.VISUALIZAR);
    expect(permissoes).toContain(AcaoPermissao.EXPORTAR);
    expect(permissoes).not.toContain(AcaoPermissao.CRIAR);
    expect(permissoes).not.toContain(AcaoPermissao.DELETAR);
  });

  it("OPERADOR deve ter apenas permissão de visualizar", () => {
    const permissoes = obterPermissoes(
      PapelAgente.TENANT,
      PapelUsuario.OPERADOR
    );

    expect(permissoes).toEqual([AcaoPermissao.VISUALIZAR]);
  });

  it("temPermissao deve retornar true para permissão válida", () => {
    const resultado = temPermissao(
      PapelAgente.TENANT,
      PapelUsuario.ADMIN,
      AcaoPermissao.CRIAR
    );

    expect(resultado).toBe(true);
  });

  it("temPermissao deve retornar false para permissão inválida", () => {
    const resultado = temPermissao(
      PapelAgente.TENANT,
      PapelUsuario.OPERADOR,
      AcaoPermissao.DELETAR
    );

    expect(resultado).toBe(false);
  });

  it("VISUALIZADOR não deve ter permissão em papéis críticos", () => {
    const permissoes = obterPermissoes(
      PapelAgente.LEGAL_PARTY,
      PapelUsuario.VISUALIZADOR
    );

    // LEGAL_PARTY não está configurado para VISUALIZADOR
    expect(permissoes).toEqual([]);
  });
});

// =====================================================================
// Testes de Tipos de Transação
// =====================================================================

describe("agentes-papeis: Tipos de Transação", () => {
  it("TENANT deve ter tipos de transação típicos", () => {
    const tipos = obterTiposTransacao(PapelAgente.TENANT);

    expect(Array.isArray(tipos)).toBe(true);
    expect(tipos.length).toBeGreaterThan(0);
    expect(tipos).toContain("aluguel");
  });

  it("SUPPLIER deve ter tipos de transação de compra", () => {
    const tipos = obterTiposTransacao(PapelAgente.SUPPLIER);

    expect(tipos).toContain("compra");
    expect(tipos).toContain("nota_fiscal_entrada");
  });

  it("PROVIDER deve ter tipos de serviço", () => {
    const tipos = obterTiposTransacao(PapelAgente.PROVIDER);

    expect(tipos).toContain("prestacao_servico");
  });

  it("LENDER deve ter tipos de transação de crédito", () => {
    const tipos = obterTiposTransacao(PapelAgente.LENDER);

    expect(tipos).toContain("juros_recebido");
  });
});

// =====================================================================
// Testes de Compatibilidade Entidade-Papel
// =====================================================================

describe("agentes-papeis: Compatibilidade Entidade-Papel", () => {
  it("PESSOA_JURIDICA deve ser compatível com SUPPLIER", () => {
    const compativel = validarCompatibilidadeEntidadePapel(
      TipoEntidade.PESSOA_JURIDICA,
      PapelAgente.SUPPLIER
    );

    expect(compativel).toBe(true);
  });

  it("PESSOA_FISICA deve ser compatível com TENANT", () => {
    const compativel = validarCompatibilidadeEntidadePapel(
      TipoEntidade.PESSOA_FISICA,
      PapelAgente.TENANT
    );

    expect(compativel).toBe(true);
  });

  it("PESSOA_JURIDICA não deveria ser TENANT", () => {
    const compativel = validarCompatibilidadeEntidadePapel(
      TipoEntidade.PESSOA_JURIDICA,
      PapelAgente.TENANT
    );

    expect(compativel).toBe(false);
  });

  it("PESSOA_FISICA não deveria ser SUPPLIER", () => {
    const compativel = validarCompatibilidadeEntidadePapel(
      TipoEntidade.PESSOA_FISICA,
      PapelAgente.SUPPLIER
    );

    expect(compativel).toBe(false);
  });

  it("PESSOA_FISICA deve ser compatível com CO_OWNER", () => {
    const compativel = validarCompatibilidadeEntidadePapel(
      TipoEntidade.PESSOA_FISICA,
      PapelAgente.CO_OWNER
    );

    expect(compativel).toBe(true);
  });

  it("PESSOA_JURIDICA deve ser compatível com CO_OWNER", () => {
    const compativel = validarCompatibilidadeEntidadePapel(
      TipoEntidade.PESSOA_JURIDICA,
      PapelAgente.CO_OWNER
    );

    expect(compativel).toBe(true);
  });
});

// =====================================================================
// Testes de Nível de Risco
// =====================================================================

describe("agentes-papeis: Nível de Risco", () => {
  it("TENANT deve ter nível de risco baixo", () => {
    const risco = obterNivelRisco(PapelAgente.TENANT);

    expect(risco).toBe("baixo");
  });

  it("PROVIDER deve ter nível de risco baixo", () => {
    const risco = obterNivelRisco(PapelAgente.PROVIDER);

    expect(risco).toBe("baixo");
  });

  it("SUPPLIER deve ter nível de risco médio", () => {
    const risco = obterNivelRisco(PapelAgente.SUPPLIER);

    expect(risco).toBe("medio");
  });

  it("LEGAL_PARTY deve ter nível de risco alto", () => {
    const risco = obterNivelRisco(PapelAgente.LEGAL_PARTY);

    expect(risco).toBe("alto");
  });

  it("CO_OWNER deve ter nível de risco alto", () => {
    const risco = obterNivelRisco(PapelAgente.CO_OWNER);

    expect(risco).toBe("alto");
  });

  it("BORROWER deve ter nível de risco alto", () => {
    const risco = obterNivelRisco(PapelAgente.BORROWER);

    expect(risco).toBe("alto");
  });
});

// =====================================================================
// Testes de Requisitos de Documentação
// =====================================================================

describe("agentes-papeis: Requisitos de Documentação", () => {
  it("SUPPLIER deve requer validação manual", () => {
    const definicao = obterDefinicaoPapel(PapelAgente.SUPPLIER);

    expect(definicao.requerValidacaoManual).toBe(true);
  });

  it("SUPPLIER deve requer documentação", () => {
    const definicao = obterDefinicaoPapel(PapelAgente.SUPPLIER);

    expect(definicao.requerDocumentacao).toBe(true);
  });

  it("PROVIDER não deveria requer validação manual", () => {
    const definicao = obterDefinicaoPapel(PapelAgente.PROVIDER);

    expect(definicao.requerValidacaoManual).toBe(false);
  });

  it("LEGAL_PARTY deve requer documentação", () => {
    const definicao = obterDefinicaoPapel(PapelAgente.LEGAL_PARTY);

    expect(definicao.requerDocumentacao).toBe(true);
  });
});

// =====================================================================
// Testes Integrados
// =====================================================================

describe("agentes-papeis: Testes Integrados", () => {
  it("deve processar fluxo completo de validação de SUPPLIER", () => {
    const agente = {
      cpf_cnpj: "12345678901234",
      nome: "Fornecedor XYZ",
      regime_tributario: RegimeTributario.LUCRO_REAL,
      email: "contato@fornecedor.com",
      telefone: "1133334444",
    };

    // 1. Validar campos
    const faltantes = validarCamposObrigatorios(agente, PapelAgente.SUPPLIER);
    expect(faltantes).toEqual([]);

    // 2. Verificar compatibilidade
    const compativel = validarCompatibilidadeEntidadePapel(
      TipoEntidade.PESSOA_JURIDICA,
      PapelAgente.SUPPLIER
    );
    expect(compativel).toBe(true);

    // 3. Verificar nível de risco
    const risco = obterNivelRisco(PapelAgente.SUPPLIER);
    expect(risco).toBe("medio");

    // 4. Verificar requisitos de documentação
    const definicao = obterDefinicaoPapel(PapelAgente.SUPPLIER);
    expect(definicao.requerDocumentacao).toBe(true);

    // 5. Verificar permissões de ADMIN
    const permissoes = obterPermissoes(
      PapelAgente.SUPPLIER,
      PapelUsuario.ADMIN
    );
    expect(permissoes).toContain(AcaoPermissao.CRIAR);
    expect(permissoes).toContain(AcaoPermissao.APROVAR);
  });

  it("deve processar fluxo completo de validação de TENANT", () => {
    const agente = {
      cpf_cnpj: "12345678901",
      nome: "João da Silva",
      email: "joao@example.com",
      endereco: { logradouro: "Rua A", numero: "123" },
    };

    // 1. Validar campos
    const faltantes = validarCamposObrigatorios(agente, PapelAgente.TENANT);
    expect(faltantes).toEqual([]);

    // 2. Verificar compatibilidade
    const compativel = validarCompatibilidadeEntidadePapel(
      TipoEntidade.PESSOA_FISICA,
      PapelAgente.TENANT
    );
    expect(compativel).toBe(true);

    // 3. Verificar nível de risco
    const risco = obterNivelRisco(PapelAgente.TENANT);
    expect(risco).toBe("baixo");

    // 4. Verificar tipos de transação
    const tipos = obterTiposTransacao(PapelAgente.TENANT);
    expect(tipos.length).toBeGreaterThan(0);

    // 5. Verificar permissões de GERENTE
    const permissoes = obterPermissoes(
      PapelAgente.TENANT,
      PapelUsuario.GERENTE
    );
    expect(permissoes).toContain(AcaoPermissao.CRIAR);
    expect(permissoes).not.toContain(AcaoPermissao.DELETAR);
  });

  it("matriz de permissões deve ser completa e consistente", () => {
    const papelsAgentes = Object.values(PapelAgente);
    const papelUsuarios = Object.values(PapelUsuario);

    // Para cada combinação importante, deve ter entrada na matriz
    // (nem todas as combinações precisam existir)
    expect(papelsAgentes.length).toBeGreaterThan(0);
    expect(papelUsuarios.length).toBeGreaterThan(0);

    // Verificar que todas as ações na matriz são válidas
    const acoesValidas = Object.values(AcaoPermissao);
    for (const permissao of MATRIZ_PERMISSOES) {
      for (const acao of permissao.acoes) {
        expect(acoesValidas).toContain(acao);
      }
    }
  });
});
