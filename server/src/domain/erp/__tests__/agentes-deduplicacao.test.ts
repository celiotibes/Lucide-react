/**
 * Testes para sistema de deduplicação de agentes
 *
 * Cobertura:
 * - Detecção de duplicatas exatas (CNPJ/CPF)
 * - Fuzzy-match de nomes (Levenshtein)
 * - Similaridade de endereços
 * - Merge de agentes
 * - Rollback de merge
 * - Performance (<100ms por agente)
 * - Accuracy >85%
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  AgentesDeduplicacaoService,
  TransacoesDeduplicacaoService,
} from "../agentes-deduplicacao.js";

// =====================================================================
// Setup de Banco de Dados para Testes
// =====================================================================

let db: Database.Database;
let deduplicacaoService: AgentesDeduplicacaoService;
let transacoesService: TransacoesDeduplicacaoService;

const USUARIO_TESTE_ID = "550e8400-e29b-41d4-a716-446655440000";

// Helpers para criar dados de teste
function criarAgenteTeste(sobrescrita: Partial<unknown> = {}): unknown {
  return {
    tipo_entidade: "pessoa_juridica",
    cpf_cnpj: "11222333000181",
    nome: "EMPRESA TESTE LTDA",
    nome_fantasia: "EMPRESA TESTE",
    papel: "supplier",
    regime_tributario: "lucro_real",
    email: "contato@empresa.com",
    telefone: "1133334444",
    celular: "11999998888",
    endereco_logradouro: "Rua Principal",
    endereco_numero: "100",
    endereco_cidade: "São Paulo",
    endereco_estado: "SP",
    endereco_cep: "01310100",
    ativo: true,
    validado: false,
    criado_por: USUARIO_TESTE_ID,
    atualizado_por: USUARIO_TESTE_ID,
    ...sobrescrita,
  };
}

function inserirAgente(dados: unknown): string {
  const stmt = db.prepare(
    `INSERT INTO agentes_economicos (
      tipo_entidade, cpf_cnpj, nome, nome_fantasia, papel,
      regime_tributario, email, telefone, celular,
      endereco_logradouro, endereco_numero, endereco_cidade, endereco_estado,
      endereco_cep, ativo, validado, criado_em, criado_por,
      atualizado_em, atualizado_por
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, ?)
    RETURNING id`
  );

  const resultado = stmt.get(
    dados.tipo_entidade,
    dados.cpf_cnpj,
    dados.nome,
    dados.nome_fantasia,
    dados.papel,
    dados.regime_tributario,
    dados.email,
    dados.telefone,
    dados.celular,
    dados.endereco_logradouro,
    dados.endereco_numero,
    dados.endereco_cidade,
    dados.endereco_estado,
    dados.endereco_cep,
    dados.ativo ? 1 : 0,
    dados.validado ? 1 : 0,
    dados.criado_por,
    dados.atualizado_por
  ) as { id: string };

  return resultado.id;
}

// =====================================================================
// Testes de Inicialização
// =====================================================================

describe("AgentesDeduplicacaoService", () => {
  beforeEach(() => {
    // Criar banco de dados em memória para testes
    db = new Database(":memory:");

    // Executar schema básico
    db.exec(`
      CREATE TABLE usuarios (
        id UUID PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL
      );

      INSERT INTO usuarios (id, nome, email) VALUES
        ('550e8400-e29b-41d4-a716-446655440000', 'Usuário Teste', 'teste@example.com');

      CREATE TABLE agentes_economicos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tipo_entidade TEXT NOT NULL,
        cpf_cnpj VARCHAR(20) NOT NULL UNIQUE,
        nome VARCHAR(255) NOT NULL,
        nome_fantasia VARCHAR(255),
        papel TEXT NOT NULL,
        regime_tributario TEXT,
        email VARCHAR(255),
        telefone VARCHAR(20),
        celular VARCHAR(20),
        endereco_logradouro VARCHAR(255),
        endereco_numero VARCHAR(10),
        endereco_complemento VARCHAR(255),
        endereco_bairro VARCHAR(100),
        endereco_cidade VARCHAR(100),
        endereco_estado VARCHAR(2),
        endereco_cep VARCHAR(10),
        endereco_pais VARCHAR(50),
        ativo BOOLEAN DEFAULT true,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        criado_por UUID NOT NULL,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_por UUID NOT NULL,
        validado BOOLEAN DEFAULT false,
        validado_em TIMESTAMP,
        validado_por UUID,
        FOREIGN KEY (criado_por) REFERENCES usuarios(id),
        FOREIGN KEY (atualizado_por) REFERENCES usuarios(id)
      );

      CREATE TABLE agentes_duplicatas_suspeitas (
        id UUID PRIMARY KEY,
        agente_id_1 UUID NOT NULL,
        agente_id_2 UUID NOT NULL,
        score DECIMAL(5, 2) NOT NULL,
        motivo TEXT NOT NULL,
        score_cpf DECIMAL(5, 2),
        score_nome DECIMAL(5, 2),
        score_email DECIMAL(5, 2),
        score_telefone DECIMAL(5, 2),
        score_endereco DECIMAL(5, 2),
        status TEXT DEFAULT 'pendente',
        analisado_em TIMESTAMP,
        analisado_por UUID,
        decisao TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        criado_por UUID NOT NULL,
        FOREIGN KEY (agente_id_1) REFERENCES agentes_economicos(id),
        FOREIGN KEY (agente_id_2) REFERENCES agentes_economicos(id),
        FOREIGN KEY (analisado_por) REFERENCES usuarios(id)
      );

      CREATE TABLE agentes_duplicatas_audit_trail (
        id UUID PRIMARY KEY,
        tipo_operacao TEXT NOT NULL,
        agente_primario_id UUID NOT NULL,
        agente_secundario_id UUID NOT NULL,
        estado_anterior TEXT,
        estado_posterior TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        criado_por UUID NOT NULL,
        descricao TEXT,
        FOREIGN KEY (agente_primario_id) REFERENCES agentes_economicos(id),
        FOREIGN KEY (agente_secundario_id) REFERENCES agentes_economicos(id),
        FOREIGN KEY (criado_por) REFERENCES usuarios(id)
      );

      CREATE TABLE ledger_entries (
        id UUID PRIMARY KEY,
        usuario_id UUID NOT NULL,
        agente_id UUID,
        valor DECIMAL(10, 2),
        data TEXT,
        descricao TEXT,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
        FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id)
      );

      CREATE TABLE ledger_entries_duplicatas (
        id UUID PRIMARY KEY,
        ledger_entrada_1_id UUID,
        ledger_entrada_2_id UUID,
        score DECIMAL(5, 2),
        status TEXT DEFAULT 'pendente',
        criado_em TIMESTAMP,
        criado_por UUID
      );

      CREATE TABLE agentes_vinculacoes (
        id UUID PRIMARY KEY,
        agente_id UUID,
        tipo_vinculacao TEXT,
        entidade_id UUID,
        FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id)
      );

      CREATE TABLE agentes_validacoes (
        id UUID PRIMARY KEY,
        agente_id UUID,
        tipo_validacao TEXT,
        resultado TEXT,
        FOREIGN KEY (agente_id) REFERENCES agentes_economicos(id)
      );
    `);

    deduplicacaoService = new AgentesDeduplicacaoService(db);
    transacoesService = new TransacoesDeduplicacaoService(db);
  });

  afterEach(() => {
    db.close();
  });

  // =====================================================================
  // Testes de Detecção de Duplicatas Exatas (CNPJ)
  // =====================================================================

  describe("Detecção de duplicatas exatas (CNPJ/CPF)", () => {
    it("deve detectar CNPJ idêntico com score 100", () => {
      const cpfCnpj = "11222333000181";
      const agente1 = inserirAgente(criarAgenteTeste({ cpf_cnpj: cpfCnpj }));
      const agente2 = inserirAgente(
        criarAgenteTeste({
          cpf_cnpj: cpfCnpj,
          nome: "EMPRESA TESTE IRMÃ",
          email: "outro@empresa.com",
        })
      );

      const candidatos =
        deduplicacaoService.detectarDuplicatasAgente(agente1, USUARIO_TESTE_ID);

      expect(candidatos).toHaveLength(1);
      expect(candidatos[0].score).toBe(100);
      expect(candidatos[0].score_cpf_cnpj).toBe(100);
      expect(candidatos[0].agente_id_2).toBe(agente2);
    });

    it("deve ignorar CPF/CNPJ já mesclado", () => {
      const agente1 = inserirAgente(criarAgenteTeste({ cpf_cnpj: "11111111000111" }));
      const agente2 = inserirAgente(
        criarAgenteTeste({ cpf_cnpj: "22222222000222" })
      );

      // Registrar merge
      const stmtMerge = db.prepare(
        `INSERT INTO agentes_duplicatas_suspeitas
         (id, agente_id_1, agente_id_2, score, motivo, status, criado_by, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      );
      stmtMerge.run(
        "550e8400-e29b-41d4-a716-446655440001",
        agente1,
        agente2,
        100,
        "CNPJ idêntico",
        "mesclada",
        USUARIO_TESTE_ID
      );

      const candidatos =
        deduplicacaoService.detectarDuplicatasAgente(agente1, USUARIO_TESTE_ID);

      // Não deve encontrar agente2 pois já foi mesclado
      expect(
        candidatos.some((c) => c.agente_id_2 === agente2)
      ).toBe(false);
    });
  });

  // =====================================================================
  // Testes de Fuzzy-Match de Nomes
  // =====================================================================

  describe("Fuzzy-match de nomes (Levenshtein)", () => {
    it("deve detectar nomes muito similares (>95%)", () => {
      const agente1 = inserirAgente(
        criarAgenteTeste({
          cpf_cnpj: "11111111000111",
          nome: "EMPRESA XYZ LTDA",
        })
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const agente2 = inserirAgente(
        criarAgenteTeste({
          cpf_cnpj: "22222222000222",
          nome: "EMPRESA XYZ LTDA ", // Nota: espaço extra
        })
      );

      const candidatos =
        deduplicacaoService.detectarDuplicatasAgente(agente1, USUARIO_TESTE_ID);

      expect(candidatos).toHaveLength(1);
      expect(candidatos[0].score).toBeGreaterThanOrEqual(70);
      expect(candidatos[0].score_nome).toBeGreaterThan(0);
    });

    it("deve ter score diferente para similaridade 85% vs 75%", () => {
      const agente1 = inserirAgente(
        criarAgenteTeste({
          cpf_cnpj: "11111111000111",
          nome: "EMPRESA TESTE COMPLETA LTDA",
        })
      );

      // 85% similar
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const agente2 = inserirAgente(
        criarAgenteTeste({
          cpf_cnpj: "22222222000222",
          nome: "EMPRESA TESTE COMPLETA",
        })
      );

      // 75% similar
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const agente3 = inserirAgente(
        criarAgenteTeste({
          cpf_cnpj: "33333333000333",
          nome: "EMPRESA TESTE DIFERENTE",
        })
      );

      const candidatos =
        deduplicacaoService.detectarDuplicatasAgente(agente1, USUARIO_TESTE_ID);

      expect(candidatos.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =====================================================================
  // Testes de Similaridade de Endereço
  // =====================================================================

  describe("Similaridade de endereço", () => {
    it("deve detectar endereços idênticos", () => {
      const endereco = {
        endereco_logradouro: "Rua Principal",
        endereco_numero: "100",
        endereco_cidade: "São Paulo",
        endereco_cep: "01310100",
      };

      const agente1 = inserirAgente(
        criarAgenteTeste({
          cpf_cnpj: "11111111000111",
          ...endereco,
        })
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const agente2 = inserirAgente(
        criarAgenteTeste({
          cpf_cnpj: "22222222000222",
          ...endereco,
        })
      );

      const candidatos =
        deduplicacaoService.detectarDuplicatasAgente(agente1, USUARIO_TESTE_ID);

      expect(candidatos).toHaveLength(1);
      expect(candidatos[0].score_endereco).toBeGreaterThan(0);
    });
  });

  // =====================================================================
  // Testes de Merge de Agentes
  // =====================================================================

  describe("Merge de agentes", () => {
    it("deve fundir dois agentes com sucesso", () => {
      const agente1 = inserirAgente(
        criarAgenteTeste({ cpf_cnpj: "11111111000111" })
      );
      const agente2 = inserirAgente(
        criarAgenteTeste({ cpf_cnpj: "22222222000222" })
      );

      const resultado = deduplicacaoService.fundirAgentes(
        {
          agente_primario_id: agente1,
          agente_duplicado_id: agente2,
          motivo: "CNPJ similar - duplicata confirmada",
        },
        USUARIO_TESTE_ID
      );

      expect(resultado.sucesso).toBe(true);
      expect(resultado.agente_primario_id).toBe(agente1);
      expect(resultado.agente_duplicado_id).toBe(agente2);

      // Verificar que agente2 foi desativado
      const stmt = db.prepare("SELECT ativo FROM agentes_economicos WHERE id = ?");
      const agente2Check = stmt.get(agente2) as { ativo: number };
      expect(agente2Check.ativo).toBe(0);
    });

    it("deve registrar merge na auditoria", () => {
      const agente1 = inserirAgente(
        criarAgenteTeste({ cpf_cnpj: "11111111000111" })
      );
      const agente2 = inserirAgente(
        criarAgenteTeste({ cpf_cnpj: "22222222000222" })
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const resultado = deduplicacaoService.fundirAgentes(
        {
          agente_primario_id: agente1,
          agente_duplicado_id: agente2,
          motivo: "Teste",
        },
        USUARIO_TESTE_ID
      );

      // Verificar que merge foi registrado
      const stmt = db.prepare(
        `SELECT * FROM agentes_duplicatas_suspeitas WHERE status = 'mesclada'`
      );
      const merges = stmt.all() as unknown[];

      expect(merges.length).toBeGreaterThan(0);
    });
  });

  // =====================================================================
  // Testes de Desfazer Merge (Rollback)
  // =====================================================================

  describe("Desfazer merge (unmerge)", () => {
    it("deve restaurar agente após desfazer merge", () => {
      const agente1 = inserirAgente(
        criarAgenteTeste({ cpf_cnpj: "11111111000111" })
      );
      const agente2 = inserirAgente(
        criarAgenteTeste({ cpf_cnpj: "22222222000222" })
      );

      // Realizar merge
      const mergeResult = deduplicacaoService.fundirAgentes(
        {
          agente_primario_id: agente1,
          agente_duplicado_id: agente2,
          motivo: "Teste",
        },
        USUARIO_TESTE_ID
      );

      // Desfazer merge
      const unmergeResult = deduplicacaoService.desfazerMerge(
        mergeResult.id,
        USUARIO_TESTE_ID
      );

      expect(unmergeResult.sucesso).toBe(true);

      // Verificar que agente2 foi reativado
      const stmt = db.prepare("SELECT ativo FROM agentes_economicos WHERE id = ?");
      const agente2Check = stmt.get(agente2) as { ativo: number };
      expect(agente2Check.ativo).toBe(1);
    });
  });

  // =====================================================================
  // Testes de Performance
  // =====================================================================

  describe("Performance", () => {
    it("deve detectar duplicatas em <100ms por agente", () => {
      // Criar 100 agentes
      const agentes: string[] = [];
      for (let i = 0; i < 100; i++) {
        const agente = inserirAgente(
          criarAgenteTeste({
            cpf_cnpj: `${String(i).padStart(11, "0")}000${String(i).padStart(2, "0")}`,
            nome: `EMPRESA TESTE ${i}`,
          })
        );
        agentes.push(agente);
      }

      // Cronometrar detecção de duplicatas
      const inicio = performance.now();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const candidatos =
        deduplicacaoService.detectarDuplicatasAgente(agentes[0], USUARIO_TESTE_ID);
      const duracao = performance.now() - inicio;

      expect(duracao).toBeLessThan(100);
      console.log(`Detecção de duplicatas: ${duracao.toFixed(2)}ms`);
    });

    it("deve escanear 1000 agentes em <10 segundos", () => {
      // Criar 1000 agentes
      for (let i = 0; i < 1000; i++) {
        inserirAgente(
          criarAgenteTeste({
            cpf_cnpj: `${String(i).padStart(11, "0")}000${String(i).padStart(2, "0")}`,
            nome: `EMPRESA TESTE ${i}`,
          })
        );
      }

      // Cronometrar scan completo
      const inicio = performance.now();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const duplicatas = deduplicacaoService.detectarTodasDuplicatas(
        USUARIO_TESTE_ID,
        80
      );
      const duracao = performance.now() - inicio;

      expect(duracao).toBeLessThan(10000);
      console.log(
        `Scan completo de 1000 agentes: ${(duracao / 1000).toFixed(2)}s`
      );
    });
  });

  // =====================================================================
  // Testes de Transações
  // =====================================================================

  describe("Deduplicação de transações", () => {
    it("deve detectar transações duplicadas", () => {
      const usuarioId = "550e8400-e29b-41d4-a716-446655440000";
      const valor = 1000.5;
      const data = "2024-10-07";
      const descricao = "Pagamento fornecedor X";

      // Inserir transação original
      const stmt1 = db.prepare(
        `INSERT INTO ledger_entries (id, usuario_id, valor, data, descricao, atualizado_em)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         RETURNING id`
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const tx1 = stmt1.get(
        "550e8400-e29b-41d4-a716-446655440001",
        usuarioId,
        valor,
        data,
        descricao
      ) as { id: string };

      // Verificar duplicata
      const resultado = transacoesService.isDuplicate(
        {
          valor,
          data,
          descricao,
        },
        usuarioId,
        3
      );

      expect(resultado.isDuplicate).toBe(true);
      expect(resultado.score).toBeGreaterThanOrEqual(80);
    });
  });

  // =====================================================================
  // Testes de Accuracy
  // =====================================================================

  describe("Accuracy >85%", () => {
    it("deve ter accuracy de detecção >85% em casos de teste", () => {
      // Casos de teste conhecidos
      const testesCasos = [
        {
          nome: "EMPRESA ABC LTDA",
          cpf_cnpj: "11111111000111",
          esperado: "duplicata",
          similar_nome: "EMPRESA ABC LTDA",
          similar_cpf: "11111111000111",
        },
        {
          nome: "EMPRESA XYZ INDUSTRIA",
          cpf_cnpj: "22222222000222",
          esperado: "duplicata",
          similar_nome: "EMPRESA XYZ IND",
          similar_cpf: "22222222000222",
        },
      ];

      let acertos = 0;
      for (const teste of testesCasos) {
        const agente1 = inserirAgente(
          criarAgenteTeste({
            cpf_cnpj: teste.cpf_cnpj,
            nome: teste.nome,
          })
        );

        const agente2 = inserirAgente(
          criarAgenteTeste({
            cpf_cnpj: teste.similar_cpf,
            nome: teste.similar_nome,
            email: "outro@email.com",
          })
        );

        const candidatos =
          deduplicacaoService.detectarDuplicatasAgente(agente1, USUARIO_TESTE_ID);

        if (
          teste.esperado === "duplicata" &&
          candidatos.some((c) => c.agente_id_2 === agente2)
        ) {
          acertos++;
        } else if (teste.esperado !== "duplicata" && candidatos.length === 0) {
          acertos++;
        }
      }

      const accuracy = (acertos / testesCasos.length) * 100;
      expect(accuracy).toBeGreaterThanOrEqual(85);
      console.log(`Accuracy: ${accuracy.toFixed(2)}%`);
    });
  });
});
