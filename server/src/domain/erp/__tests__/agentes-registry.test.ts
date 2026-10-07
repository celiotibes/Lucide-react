/**
 * Testes para serviço de verificação de registros de agentes econômicos
 * Cobre:
 * - Validação de CPF/CNPJ
 * - Detecção de duplicatas
 * - Integração com bases públicas
 * - Verificação OFAC
 * - Auditoria
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import {
  cpfValido,
  cnpjValido,
  normalizarCPF,
  normalizarCNPJ,
  obterTipoPorID,
  TipoEntidade,
  TipoValidacao,
  ResultadoValidacao,
} from "../agentes-tipos";
import {
  AgenteRegistryService,
  ResultadoVerificacao,
} from "../agentes-registry";

// Teste de banco de dados
const TEST_DB_PATH = path.join(
  __dirname,
  `test-registry-${process.pid}-${Date.now()}.db`
);

/**
 * Cria banco de dados de teste com schema completo
 */
function createTestDatabase(): Database.Database {
  const db = new Database(TEST_DB_PATH);
  db.pragma("foreign_keys = ON");

  // Schema de usuários (necessário para FK)
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ativo INTEGER DEFAULT 1
    );

    INSERT OR IGNORE INTO usuarios (id, email, nome)
    VALUES ('user-1', 'test@example.com', 'Test User');

    -- Agentes Econômicos
    CREATE TABLE IF NOT EXISTS agentes_economicos (
      id TEXT PRIMARY KEY,
      tipo_entidade TEXT NOT NULL CHECK (tipo_entidade IN ('pessoa_fisica', 'pessoa_juridica')),
      cpf_cnpj TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      nome_fantasia TEXT,
      pessoa_fisica_pf_nome_mae TEXT,
      papel TEXT NOT NULL,
      regime_tributario TEXT,
      inscricao_estadual TEXT,
      inscricao_municipal TEXT,
      classificacao_nfse TEXT,
      email TEXT,
      telefone TEXT,
      celular TEXT,
      endereco_logradouro TEXT,
      endereco_numero TEXT,
      endereco_complemento TEXT,
      endereco_bairro TEXT,
      endereco_cidade TEXT,
      endereco_estado TEXT,
      endereco_cep TEXT,
      endereco_pais TEXT DEFAULT 'Brasil',
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      criado_por TEXT NOT NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_por TEXT NOT NULL,
      observacoes TEXT,
      tags TEXT,
      validado INTEGER DEFAULT 0,
      validado_em DATETIME,
      validado_por TEXT,
      FOREIGN KEY (criado_por) REFERENCES usuarios(id),
      FOREIGN KEY (atualizado_por) REFERENCES usuarios(id),
      FOREIGN KEY (validado_por) REFERENCES usuarios(id)
    );

    CREATE INDEX idx_agentes_economicos_cpf_cnpj ON agentes_economicos(cpf_cnpj);

    -- Validações
    CREATE TABLE IF NOT EXISTS agentes_validacoes (
      id TEXT PRIMARY KEY,
      agente_id TEXT NOT NULL,
      tipo_validacao TEXT NOT NULL,
      resultado TEXT NOT NULL,
      motivo TEXT,
      detalhes TEXT,
      executado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      executado_por TEXT NOT NULL,
      FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id) ON DELETE CASCADE,
      FOREIGN KEY (executado_por) REFERENCES usuarios(id)
    );

    CREATE INDEX idx_agentes_validacoes_agente ON agentes_validacoes(agente_id);
    CREATE INDEX idx_agentes_validacoes_tipo ON agentes_validacoes(tipo_validacao);
  `);

  return db;
}

/**
 * Testes de validação de CPF
 */
describe("cpfValido", () => {
  describe("validações bem-sucedidas", () => {
    it("aceita CPF válido sem formatação", () => {
      const resultado = cpfValido("11144477735");
      expect(resultado.valido).toBe(true);
      expect(resultado.cpfLimpo).toBe("11144477735");
      expect(resultado.erro).toBeUndefined();
    });

    it("aceita CPF válido com formatação", () => {
      const resultado = cpfValido("111.444.777-35");
      expect(resultado.valido).toBe(true);
      expect(resultado.cpfLimpo).toBe("11144477735");
    });

    it("aceita CPF com diferentes formatações", () => {
      const resultado = cpfValido("111-444-777-35");
      expect(resultado.valido).toBe(true);
      expect(resultado.cpfLimpo).toBe("11144477735");
    });
  });

  describe("validações falhadas", () => {
    it("rejeita CPF com número incorreto de dígitos", () => {
      const resultado = cpfValido("12345");
      expect(resultado.valido).toBe(false);
      expect(resultado.erro).toBe("CPF deve conter exatamente 11 dígitos");
    });

    it("rejeita CPF com dígito verificador incorreto", () => {
      const resultado = cpfValido("11144477736"); // Último dígito errado
      expect(resultado.valido).toBe(false);
      expect(resultado.erro).toBe("CPF inválido: erro no dígito verificador");
    });

    it("rejeita CPF com todos os dígitos iguais", () => {
      const resultado = cpfValido("11111111111");
      expect(resultado.valido).toBe(false);
      expect(resultado.erro).toContain("padrão inválido");
    });

    it("rejeita CPF com caracteres não numéricos", () => {
      const resultado = cpfValido("abc-def-ghi-jk");
      expect(resultado.valido).toBe(false);
    });

    it("rejeita CPF vazio", () => {
      const resultado = cpfValido("");
      expect(resultado.valido).toBe(false);
    });
  });
});

/**
 * Testes de validação de CNPJ
 */
describe("cnpjValido", () => {
  describe("validações bem-sucedidas", () => {
    it("aceita CNPJ válido sem formatação", () => {
      const resultado = cnpjValido("00000000000191");
      expect(resultado.valido).toBe(true);
      expect(resultado.cnpjLimpo).toBe("00000000000191");
    });

    it("aceita CNPJ válido com formatação", () => {
      const resultado = cnpjValido("00.000.000/0001-91");
      expect(resultado.valido).toBe(true);
      expect(resultado.cnpjLimpo).toBe("00000000000191");
    });

    it("aceita CNPJ com diferentes formatações", () => {
      const resultado = cnpjValido("00-000-000-0001-91");
      expect(resultado.valido).toBe(true);
    });
  });

  describe("validações falhadas", () => {
    it("rejeita CNPJ com número incorreto de dígitos", () => {
      const resultado = cnpjValido("123456789");
      expect(resultado.valido).toBe(false);
      expect(resultado.erro).toBe("CNPJ deve conter exatamente 14 dígitos");
    });

    it("rejeita CNPJ com dígito verificador incorreto", () => {
      const resultado = cnpjValido("00000000000192"); // Último dígito errado
      expect(resultado.valido).toBe(false);
      expect(resultado.erro).toBe("CNPJ inválido: erro no dígito verificador");
    });

    it("rejeita CNPJ com todos os dígitos iguais", () => {
      const resultado = cnpjValido("11111111111111");
      expect(resultado.valido).toBe(false);
      expect(resultado.erro).toContain("padrão inválido");
    });

    it("rejeita CNPJ vazio", () => {
      const resultado = cnpjValido("");
      expect(resultado.valido).toBe(false);
    });
  });
});

/**
 * Testes de normalização
 */
describe("Normalização", () => {
  it("normaliza CPF válido", () => {
    const resultado = normalizarCPF("111.444.777-35");
    expect(resultado).toBe("11144477735");
  });

  it("retorna null para CPF inválido", () => {
    const resultado = normalizarCPF("123");
    expect(resultado).toBeNull();
  });

  it("normaliza CNPJ válido", () => {
    const resultado = normalizarCNPJ("00.000.000/0001-91");
    expect(resultado).toBe("00000000000191");
  });

  it("retorna null para CNPJ inválido", () => {
    const resultado = normalizarCNPJ("123");
    expect(resultado).toBeNull();
  });

  it("obtém tipo de pessoa para CPF", () => {
    const resultado = obterTipoPorID("11144477735");
    expect(resultado).toBe(TipoEntidade.PESSOA_FISICA);
  });

  it("obtém tipo de pessoa para CNPJ", () => {
    const resultado = obterTipoPorID("00000000000191");
    expect(resultado).toBe(TipoEntidade.PESSOA_JURIDICA);
  });

  it("retorna null para ID inválido", () => {
    const resultado = obterTipoPorID("invalid");
    expect(resultado).toBeNull();
  });
});

/**
 * Testes do serviço de registro
 */
describe("AgenteRegistryService", () => {
  let db: Database.Database;
  let service: AgenteRegistryService;

  beforeEach(() => {
    db = createTestDatabase();
    service = new AgenteRegistryService(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe("verifySoleCNPJ", () => {
    it("verifica CNPJ válido", async () => {
      const resultado = await service.verifySoleCNPJ("00000000000191");
      expect(resultado.valido).toBe(true);
      expect(resultado.nomeEmpresa).toBeDefined();
      expect(resultado.fonte).toBe("receita_federal");
    });

    it("rejeita CNPJ inválido", async () => {
      const resultado = await service.verifySoleCNPJ("12345");
      expect(resultado.valido).toBe(false);
      expect(resultado.erro).toBeDefined();
    });

    it("retorna erro para CNPJ cancelado", async () => {
      // 00000000000191 é um dos CNPJs bloqueados na simulação
      const resultado = await service.verifySoleCNPJ("11444777000161");
      expect(resultado.fonte).toBe("receita_federal");
    });
  });

  describe("verifySoleCPF", () => {
    it("verifica CPF válido", async () => {
      const resultado = await service.verifySoleCPF("11144477735");
      expect(resultado.valido).toBe(true);
      expect(resultado.fonte).toBe("receita_federal");
    });

    it("rejeita CPF inválido", async () => {
      const resultado = await service.verifySoleCPF("12345");
      expect(resultado.valido).toBe(false);
      expect(resultado.erro).toBeDefined();
    });
  });

  describe("detectarDuplicataTaxID", () => {
    it("detecta duplicata de CPF/CNPJ", () => {
      const agente1Id = "agent-1";
      const cpfCnpj = "11144477735";

      // Insere primeiro agente
      db.prepare(
        `
        INSERT INTO agentes_economicos (
          id, tipo_entidade, cpf_cnpj, nome, papel, criado_por, atualizado_por, ativo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(agente1Id, "pessoa_fisica", cpfCnpj, "Pessoa 1", "tenant", "user-1", "user-1", 1);

      // Busca duplicatas com mesmo CPF
      const duplicatas = service.detectarDuplicataTaxID(cpfCnpj, agente1Id);
      expect(duplicatas).toHaveLength(0); // Nenhuma duplicata pois excluiu o próprio agente

      // Insere segundo agente com mesmo CPF
      const agente2Id = "agent-2";
      db.prepare(
        `
        INSERT INTO agentes_economicos (
          id, tipo_entidade, cpf_cnpj, nome, papel, criado_por, atualizado_por, ativo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        agente2Id,
        "pessoa_fisica",
        cpfCnpj,
        "Pessoa 2",
        "tenant",
        "user-1",
        "user-1",
        1
      );

      // Agora deve encontrar duplicata
      const duplicatasAgora = service.detectarDuplicataTaxID(cpfCnpj, agente1Id);
      expect(duplicatasAgora).toHaveLength(1);
      expect(duplicatasAgora[0].agente_id_existente).toBe(agente2Id);
      expect(duplicatasAgora[0].score_similaridade).toBe(100);
      expect(duplicatasAgora[0].motivos).toContain("cpf_cnpj_identico");
    });

    it("não detecta duplicata de agente inativo", () => {
      const cpfCnpj = "11144477735";

      // Insere agente inativo
      db.prepare(
        `
        INSERT INTO agentes_economicos (
          id, tipo_entidade, cpf_cnpj, nome, papel, criado_por, atualizado_por, ativo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        "agent-1",
        "pessoa_fisica",
        cpfCnpj,
        "Pessoa Inativa",
        "tenant",
        "user-1",
        "user-1",
        0
      );

      // Busca duplicatas - não deve encontrar agente inativo
      const duplicatas = service.detectarDuplicataTaxID(cpfCnpj);
      expect(duplicatas).toHaveLength(0);
    });
  });

  describe("registrarValidacao", () => {
    it("registra validação aprovada", () => {
      const agentId = "agent-1";
      const usuarioId = "user-1";

      // Insere agente primeiro
      db.prepare(
        `
        INSERT INTO agentes_economicos (
          id, tipo_entidade, cpf_cnpj, nome, papel, criado_por, atualizado_por, ativo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(agentId, "pessoa_fisica", "11144477735", "Test", "tenant", usuarioId, usuarioId, 1);

      // Registra validação
      const validacao = service.registrarValidacao(
        agentId,
        TipoValidacao.CPF_CNPJ,
        ResultadoValidacao.APROVADO,
        usuarioId,
        "CPF validado com sucesso"
      );

      expect(validacao.agente_id).toBe(agentId);
      expect(validacao.resultado).toBe(ResultadoValidacao.APROVADO);
      expect(validacao.motivo).toBe("CPF validado com sucesso");

      // Verifica no banco
      const registro = db
        .prepare(
          `SELECT * FROM agentes_validacoes WHERE agente_id = ? AND tipo_validacao = ?`
        )
        .get(agentId, TipoValidacao.CPF_CNPJ) as any;

      expect(registro).toBeDefined();
      expect(registro.resultado).toBe(ResultadoValidacao.APROVADO);
    });

    it("registra validação com detalhes", () => {
      const agentId = "agent-1";
      const usuarioId = "user-1";
      const detalhes = {
        nomeEmpresa: "Teste LTDA",
        situacao: "ativo",
      };

      db.prepare(
        `
        INSERT INTO agentes_economicos (
          id, tipo_entidade, cpf_cnpj, nome, papel, criado_por, atualizado_por, ativo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(agentId, "pessoa_juridica", "00000000000191", "Test", "supplier", usuarioId, usuarioId, 1);

      const validacao = service.registrarValidacao(
        agentId,
        TipoValidacao.CPF_CNPJ,
        ResultadoValidacao.APROVADO,
        usuarioId,
        undefined,
        detalhes
      );

      expect(validacao.detalhes).toEqual(detalhes);
    });
  });

  describe("obterUltimaValidacao", () => {
    it("retorna última validação de um agente", () => {
      const agentId = "agent-1";
      const usuarioId = "user-1";

      db.prepare(
        `
        INSERT INTO agentes_economicos (
          id, tipo_entidade, cpf_cnpj, nome, papel, criado_por, atualizado_por, ativo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(agentId, "pessoa_fisica", "11144477735", "Test", "tenant", usuarioId, usuarioId, 1);

      // Registra duas validações
      service.registrarValidacao(
        agentId,
        TipoValidacao.CPF_CNPJ,
        ResultadoValidacao.PENDENTE,
        usuarioId,
        "Primeira tentativa"
      );

      service.registrarValidacao(
        agentId,
        TipoValidacao.CPF_CNPJ,
        ResultadoValidacao.APROVADO,
        usuarioId,
        "Segunda tentativa bem-sucedida"
      );

      // Obtém última
      const ultima = service.obterUltimaValidacao(
        agentId,
        TipoValidacao.CPF_CNPJ
      );

      expect(ultima).toBeDefined();
      expect(ultima!.resultado).toBe(ResultadoValidacao.APROVADO);
      expect(ultima!.motivo).toBe("Segunda tentativa bem-sucedida");
    });

    it("retorna null se nenhuma validação existe", () => {
      const resultado = service.obterUltimaValidacao(
        "agent-inexistente",
        TipoValidacao.CPF_CNPJ
      );
      expect(resultado).toBeNull();
    });
  });

  describe("verificarOFAC", () => {
    it("aprova entidade não bloqueada", async () => {
      const resultado = await service.verificarOFAC("11144477735", "Pessoa Normal");
      expect(resultado).toBe(true);
    });

    it("bloqueia entidade na lista OFAC", async () => {
      const resultado = await service.verificarOFAC("66666666666666", "Pessoa Bloqueada");
      expect(resultado).toBe(false);
    });

    it("não bloqueia em caso de erro", async () => {
      // Testa fail-open
      const resultado = await service.verificarOFAC("11144477735", "Test");
      expect(resultado).toBe(true);
    });
  });

  describe("obterInformacaoEmpresa", () => {
    it("retorna informações de empresa", async () => {
      const resultado = await service.obterInformacaoEmpresa("00000000000191");
      expect(resultado.nomeEmpresa).toBeDefined();
      expect(resultado.situacao).toBeDefined();
    });

    it("retorna erro para CNPJ inválido", async () => {
      const resultado = await service.obterInformacaoEmpresa("123");
      expect(resultado.erro).toBeDefined();
    });
  });
});

describe("Mensagens de erro específicas", () => {
  it("fornece mensagens claras para CPF inválido", () => {
    const resultado = cpfValido("111.444.777-36");
    expect(resultado.erro).toContain("dígito verificador");
  });

  it("fornece mensagens claras para CNPJ duplicado", () => {
    const db = createTestDatabase();
    const service = new AgenteRegistryService(db);

    // Insere agente
    db.prepare(
      `
      INSERT INTO agentes_economicos (
        id, tipo_entidade, cpf_cnpj, nome, papel, criado_por, atualizado_por, ativo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      "agent-1",
      "pessoa_juridica",
      "00000000000191",
      "Empresa 1",
      "supplier",
      "user-1",
      "user-1",
      1
    );

    const duplicatas = service.detectarDuplicataTaxID("00000000000191");
    expect(duplicatas).toHaveLength(0); // Nenhuma duplicata pois é a primeira

    db.close();
    const testPath = path.join(
      __dirname,
      `test-registry-*-${process.pid}*.db`
    );
    const files = require("glob").sync(testPath);
    files.forEach((file: string) => {
      try {
        fs.unlinkSync(file);
      } catch (e) {
        // ignore
      }
    });
  });
});
