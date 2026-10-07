# Guia de Implementação: Sistema de Agentes Econômicos

Este documento descreve como implementar serviços e APIs para o sistema de agentes econômicos.

## Estrutura de Arquivos Recomendada

```
server/src/
├── domain/erp/
│   ├── agentes-tipos.ts           # Tipos, schemas, validações
│   ├── agentes-service.ts         # Lógica de negócio
│   ├── agentes-repository.ts      # Acesso a dados
│   └── AGENTES_*.md               # Documentação
├── api/
│   └── agentes/
│       ├── [id].get.ts            # GET /api/agentes/:id
│       ├── [id].put.ts            # PUT /api/agentes/:id
│       ├── index.get.ts           # GET /api/agentes
│       ├── index.post.ts          # POST /api/agentes
│       ├── validacoes.post.ts     # POST /api/agentes/:id/validacoes
│       ├── duplicatas.get.ts      # GET /api/agentes/:id/duplicatas
│       └── vinculacoes.post.ts    # POST /api/agentes/:id/vinculacoes
└── __tests__/
    └── domain/
        └── agentes-*.test.ts
```

## 1. Repository Pattern

```typescript
// server/src/domain/erp/agentes-repository.ts

import { Database } from "better-sqlite3";
import { AgenteEconomico, DuplicataSuspeita, ValidacaoAgente, VinculacaoAgente, PapelDefinicao } from "./agentes-tipos";

export interface AgenteRepository {
  // CRUD Básico
  create(agente: Omit<AgenteEconomico, 'id'>): Promise<AgenteEconomico>;
  findById(id: string): Promise<AgenteEconomico | null>;
  findByCPFCNPJ(cpfCnpj: string): Promise<AgenteEconomico | null>;
  findAll(filters?: {
    tipo_entidade?: string;
    papel?: string;
    ativo?: boolean;
    validado?: boolean;
  }): Promise<AgenteEconomico[]>;
  update(id: string, agente: Partial<AgenteEconomico>): Promise<AgenteEconomico>;
  delete(id: string): Promise<void>;

  // Validações
  createValidacao(validacao: Omit<ValidacaoAgente, 'id'>): Promise<ValidacaoAgente>;
  findValidacoesByAgente(agenteId: string): Promise<ValidacaoAgente[]>;
  findValidacaoRecente(agenteId: string): Promise<ValidacaoAgente | null>;

  // Duplicatas
  findDuplicatas(agenteId: string): Promise<DuplicataSuspeita[]>;
  createDuplicata(duplicata: Omit<DuplicataSuspeita, 'id'>): Promise<DuplicataSuspeita>;
  updateDuplicata(id: string, status: string): Promise<DuplicataSuspeita>;

  // Vinculações
  createVinculacao(vinculacao: Omit<VinculacaoAgente, 'id'>): Promise<VinculacaoAgente>;
  findVinculacoes(agenteId: string): Promise<VinculacaoAgente[]>;
  deleteVinculacao(id: string): Promise<void>;

  // Papéis
  findPapeisByAgente(agenteId: string): Promise<PapelDefinicao[]>;
  getAllPapeis(): Promise<PapelDefinicao[]>;
}

// Implementação SQLite
export class SQLiteAgenteRepository implements AgenteRepository {
  constructor(private db: Database) {}

  async create(agente: Omit<AgenteEconomico, 'id'>): Promise<AgenteEconomico> {
    const id = crypto.randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO agentes_economicos (
        id, tipo_entidade, cpf_cnpj, nome, nome_fantasia, 
        pessoa_fisica_pf_nome_mae, papel, regime_tributario,
        inscricao_estadual, inscricao_municipal, classificacao_nfse,
        email, telefone, celular, ativo, criado_por, atualizado_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      id,
      agente.tipo_entidade,
      agente.cpf_cnpj,
      agente.nome,
      agente.nome_fantasia || null,
      agente.pessoa_fisica_pf_nome_mae || null,
      agente.papel,
      agente.regime_tributario || null,
      agente.inscricao_estadual || null,
      agente.inscricao_municipal || null,
      agente.classificacao_nfse || null,
      agente.email || null,
      agente.telefone || null,
      agente.celular || null,
      agente.ativo ? 1 : 0,
      agente.criado_por,
      agente.atualizado_por
    );

    return this.findById(id) as Promise<AgenteEconomico>;
  }

  async findById(id: string): Promise<AgenteEconomico | null> {
    const stmt = this.db.prepare("SELECT * FROM agentes_economicos WHERE id = ?");
    const row = stmt.get(id) as any;
    
    if (!row) return null;

    return this.rowToAgente(row);
  }

  async findByCPFCNPJ(cpfCnpj: string): Promise<AgenteEconomico | null> {
    const stmt = this.db.prepare("SELECT * FROM agentes_economicos WHERE cpf_cnpj = ?");
    const row = stmt.get(cpfCnpj) as any;
    
    if (!row) return null;

    return this.rowToAgente(row);
  }

  async findAll(filters?: any): Promise<AgenteEconomico[]> {
    let query = "SELECT * FROM agentes_economicos WHERE 1=1";
    const params: any[] = [];

    if (filters?.tipo_entidade) {
      query += " AND tipo_entidade = ?";
      params.push(filters.tipo_entidade);
    }

    if (filters?.papel) {
      query += " AND papel = ?";
      params.push(filters.papel);
    }

    if (filters?.ativo !== undefined) {
      query += " AND ativo = ?";
      params.push(filters.ativo ? 1 : 0);
    }

    if (filters?.validado !== undefined) {
      query += " AND validado = ?";
      params.push(filters.validado ? 1 : 0);
    }

    query += " ORDER BY criado_em DESC";

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => this.rowToAgente(row));
  }

  async update(id: string, updates: Partial<AgenteEconomico>): Promise<AgenteEconomico> {
    const fields: string[] = [];
    const values: any[] = [];

    // Construir query dinamicamente apenas com campos fornecidos
    if (updates.nome !== undefined) {
      fields.push("nome = ?");
      values.push(updates.nome);
    }

    if (updates.email !== undefined) {
      fields.push("email = ?");
      values.push(updates.email || null);
    }

    if (updates.telefone !== undefined) {
      fields.push("telefone = ?");
      values.push(updates.telefone || null);
    }

    if (updates.ativo !== undefined) {
      fields.push("ativo = ?");
      values.push(updates.ativo ? 1 : 0);
    }

    if (updates.validado !== undefined) {
      fields.push("validado = ?");
      values.push(updates.validado ? 1 : 0);
    }

    // Sempre atualizar timestamp
    fields.push("atualizado_em = CURRENT_TIMESTAMP");
    if (updates.atualizado_por) {
      fields.push("atualizado_por = ?");
      values.push(updates.atualizado_por);
    }

    values.push(id);

    const query = `UPDATE agentes_economicos SET ${fields.join(", ")} WHERE id = ?`;
    this.db.prepare(query).run(...values);

    return this.findById(id) as Promise<AgenteEconomico>;
  }

  async delete(id: string): Promise<void> {
    this.db.prepare("DELETE FROM agentes_economicos WHERE id = ?").run(id);
  }

  async createValidacao(validacao: Omit<ValidacaoAgente, 'id'>): Promise<ValidacaoAgente> {
    const id = crypto.randomUUID();
    const detalhes = validacao.detalhes ? JSON.stringify(validacao.detalhes) : null;

    const stmt = this.db.prepare(`
      INSERT INTO agentes_validacoes (
        id, agente_id, tipo_validacao, resultado, motivo, detalhes, executado_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      validacao.agente_id,
      validacao.tipo_validacao,
      validacao.resultado,
      validacao.motivo || null,
      detalhes,
      validacao.executado_por
    );

    return {
      ...validacao,
      id,
      executado_em: new Date(),
    };
  }

  async findValidacoesByAgente(agenteId: string): Promise<ValidacaoAgente[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM agentes_validacoes 
      WHERE agente_id = ? 
      ORDER BY executado_em DESC
    `);

    const rows = stmt.all(agenteId) as any[];

    return rows.map(row => ({
      ...row,
      detalhes: row.detalhes ? JSON.parse(row.detalhes) : undefined,
      executado_em: new Date(row.executado_em),
    }));
  }

  async findValidacaoRecente(agenteId: string): Promise<ValidacaoAgente | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM agentes_validacoes 
      WHERE agente_id = ? 
      ORDER BY executado_em DESC 
      LIMIT 1
    `);

    const row = stmt.get(agenteId) as any;

    if (!row) return null;

    return {
      ...row,
      detalhes: row.detalhes ? JSON.parse(row.detalhes) : undefined,
      executado_em: new Date(row.executado_em),
    };
  }

  // ... implementar outros métodos ...

  private rowToAgente(row: any): AgenteEconomico {
    return {
      ...row,
      ativo: Boolean(row.ativo),
      validado: Boolean(row.validado),
      criado_em: new Date(row.criado_em),
      atualizado_em: new Date(row.atualizado_em),
      validado_em: row.validado_em ? new Date(row.validado_em) : null,
    };
  }
}
```

## 2. Service Layer

```typescript
// server/src/domain/erp/agentes-service.ts

import {
  AgenteEconomico,
  CriarAgenteEconomicoSchema,
  AtualizarAgenteEconomicoSchema,
  ValidacaoAgenteSchema,
  isValidCPF,
  isValidCNPJ,
  calculateDuplicataScore,
  TipoValidacao,
  ResultadoValidacao,
  cleanCPFCNPJ,
} from "./agentes-tipos";
import { AgenteRepository } from "./agentes-repository";

export class AgenteEconomicoService {
  constructor(private repository: AgenteRepository) {}

  /**
   * Cria um novo agente econômico com validações
   */
  async criarAgente(
    data: any,
    usuarioId: string
  ): Promise<{ agente: AgenteEconomico; erros?: string[] }> {
    const erros: string[] = [];

    // Validar schema
    try {
      const validado = CriarAgenteEconomicoSchema.parse(data);
    } catch (error: any) {
      return {
        agente: null as any,
        erros: error.issues?.map((i: any) => i.message) || ["Validação falhou"],
      };
    }

    // Verificar duplicata por CPF/CNPJ
    const cpfCnpjLimpo = cleanCPFCNPJ(data.cpf_cnpj);
    const existente = await this.repository.findByCPFCNPJ(cpfCnpjLimpo);

    if (existente) {
      erros.push(`Agente com CPF/CNPJ ${cpfCnpjLimpo} já existe`);
      return { agente: null as any, erros };
    }

    // Criar agente
    const agente = await this.repository.create({
      ...data,
      cpf_cnpj: cpfCnpjLimpo,
      criado_por: usuarioId,
      atualizado_por: usuarioId,
    });

    // Executar validações automáticas
    await this.executarValidacoesAutomaticas(agente.id, usuarioId);

    return { agente };
  }

  /**
   * Executa validações automáticas sobre um agente
   */
  private async executarValidacoesAutomaticas(
    agenteId: string,
    usuarioId: string
  ): Promise<void> {
    const agente = await this.repository.findById(agenteId);
    if (!agente) return;

    // Validar CPF/CNPJ
    const cpfCnpjLimpo = cleanCPFCNPJ(agente.cpf_cnpj);
    let resultadoCPFCNPJ = ResultadoValidacao.REJEITADO;

    if (agente.tipo_entidade === "pessoa_fisica") {
      resultadoCPFCNPJ = isValidCPF(cpfCnpjLimpo)
        ? ResultadoValidacao.APROVADO
        : ResultadoValidacao.REJEITADO;
    } else {
      resultadoCPFCNPJ = isValidCNPJ(cpfCnpjLimpo)
        ? ResultadoValidacao.APROVADO
        : ResultadoValidacao.REJEITADO;
    }

    await this.repository.createValidacao({
      agente_id: agenteId,
      tipo_validacao: TipoValidacao.CPF_CNPJ,
      resultado: resultadoCPFCNPJ,
      executado_por: usuarioId,
    });

    // Validar email se presente
    if (agente.email) {
      const resultadoEmail = this.isValidEmail(agente.email)
        ? ResultadoValidacao.APROVADO
        : ResultadoValidacao.REJEITADO;

      await this.repository.createValidacao({
        agente_id: agenteId,
        tipo_validacao: TipoValidacao.EMAIL,
        resultado: resultadoEmail,
        executado_por: usuarioId,
      });
    }

    // Validar telefone se presente
    if (agente.telefone) {
      const resultadoTelefone = this.isValidTelefone(agente.telefone)
        ? ResultadoValidacao.APROVADO
        : ResultadoValidacao.REJEITADO;

      await this.repository.createValidacao({
        agente_id: agenteId,
        tipo_validacao: TipoValidacao.TELEFONE,
        resultado: resultadoTelefone,
        executado_por: usuarioId,
      });
    }
  }

  /**
   * Detecta possíveis duplicatas para um agente
   */
  async detectarDuplicatas(agenteId: string, usuarioId: string): Promise<void> {
    const agente = await this.repository.findById(agenteId);
    if (!agente) return;

    // Buscar todos os agentes do mesmo tipo
    const todosAgentes = await this.repository.findAll({
      tipo_entidade: agente.tipo_entidade,
      ativo: true,
    });

    for (const outro of todosAgentes) {
      if (outro.id === agenteId) continue;

      const score = calculateDuplicataScore(agente, outro);

      if (score >= 80) {
        // Verificar se já não existe um registro de duplicata
        const duplicatas = await this.repository.findDuplicatas(agenteId);
        const jáExiste = duplicatas.some(
          (d) =>
            (d.agente_id_1 === outro.id || d.agente_id_2 === outro.id) &&
            d.status !== "refutada"
        );

        if (!jáExiste) {
          await this.repository.createDuplicata({
            agente_id_1: agenteId,
            agente_id_2: outro.id,
            score,
            motivo: this.determinarMotivoDuplicata(agente, outro),
            criado_por: usuarioId,
          });
        }
      }
    }
  }

  /**
   * Determina o motivo da duplicata suspeita
   */
  private determinarMotivoDuplicata(agente1: AgenteEconomico, agente2: AgenteEconomico): string {
    if (agente1.cpf_cnpj === agente2.cpf_cnpj) {
      return "cpf_cnpj_similar";
    }

    if (
      agente1.email &&
      agente2.email &&
      agente1.email.toLowerCase() === agente2.email.toLowerCase()
    ) {
      return "email_identico";
    }

    if (agente1.telefone && agente2.telefone && agente1.telefone === agente2.telefone) {
      return "telefone_identico";
    }

    return "nome_similar";
  }

  /**
   * Valida email simples (regex básico)
   */
  private isValidEmail(email: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  /**
   * Valida telefone brasileiro
   */
  private isValidTelefone(telefone: string): boolean {
    const digitos = telefone.replace(/\D/g, "");
    return digitos.length === 10 || digitos.length === 11;
  }

  // ... implementar outros métodos ...
}
```

## 3. API Endpoints

### GET /api/agentes

```typescript
// server/src/api/agentes/index.get.ts

import { defineEventHandler, getQuery } from "h3";
import { AgenteRepository } from "~/domain/erp/agentes-repository";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);

  const repository = new AgenteRepository(getDB());
  const agentes = await repository.findAll({
    tipo_entidade: query.tipo_entidade?.toString(),
    papel: query.papel?.toString(),
    ativo: query.ativo ? query.ativo === "true" : undefined,
    validado: query.validado ? query.validado === "true" : undefined,
  });

  return {
    sucesso: true,
    total: agentes.length,
    dados: agentes,
  };
});
```

### POST /api/agentes

```typescript
// server/src/api/agentes/index.post.ts

import { defineEventHandler, readBody } from "h3";
import { AgenteEconomicoService } from "~/domain/erp/agentes-service";
import { AgenteRepository } from "~/domain/erp/agentes-repository";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const usuarioId = event.context.auth.usuarioId; // Obtido do middleware de auth

  const repository = new AgenteRepository(getDB());
  const service = new AgenteEconomicoService(repository);

  const { agente, erros } = await service.criarAgente(body, usuarioId);

  if (erros && erros.length > 0) {
    setResponseStatus(event, 400);
    return {
      sucesso: false,
      erros,
    };
  }

  // Detectar possíveis duplicatas assincronamente
  service.detectarDuplicatas(agente.id, usuarioId).catch(console.error);

  setResponseStatus(event, 201);
  return {
    sucesso: true,
    dados: agente,
  };
});
```

### POST /api/agentes/:id/validacoes

```typescript
// server/src/api/agentes/[id].validacoes.post.ts

import { defineEventHandler, readBody, getRouterParam } from "h3";
import { AgenteRepository } from "~/domain/erp/agentes-repository";
import { ValidacaoAgenteSchema } from "~/domain/erp/agentes-tipos";

export default defineEventHandler(async (event) => {
  const agenteId = getRouterParam(event, "id");
  const body = await readBody(event);
  const usuarioId = event.context.auth.usuarioId;

  const repository = new AgenteRepository(getDB());

  // Validar schema
  try {
    const validacao = ValidacaoAgenteSchema.parse({
      ...body,
      agente_id: agenteId,
      executado_por: usuarioId,
    });

    const resultado = await repository.createValidacao(validacao);

    return {
      sucesso: true,
      dados: resultado,
    };
  } catch (error: any) {
    setResponseStatus(event, 400);
    return {
      sucesso: false,
      erros: error.issues?.map((i: any) => i.message) || ["Validação falhou"],
    };
  }
});
```

## 4. Auditoria

```typescript
/**
 * Registrar ações em agentes na tabela de auditoria
 */
export async function registrarAuditoriaAgente(
  db: Database,
  usuarioId: string,
  tipoAcao: string,
  agenteId: string,
  descricao: string,
  valoresAntigos?: any,
  valoresNovos?: any
): Promise<void> {
  const stmt = db.prepare(`
    INSERT INTO auditoria (
      id, usuario_id, tipo_acao, recurso, recurso_id, 
      descricao, valores_antigos, valores_novos, resultado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    crypto.randomUUID(),
    usuarioId,
    tipoAcao,
    "agente",
    agenteId,
    descricao,
    valoresAntigos ? JSON.stringify(valoresAntigos) : null,
    valoresNovos ? JSON.stringify(valoresNovos) : null,
    "sucesso"
  );
}
```

## 5. Testes

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SQLiteAgenteRepository } from "~/domain/erp/agentes-repository";
import { AgenteEconomicoService } from "~/domain/erp/agentes-service";
import Database from "better-sqlite3";

describe("AgenteEconomicoService", () => {
  let db: Database.Database;
  let repository: SQLiteAgenteRepository;
  let service: AgenteEconomicoService;

  beforeEach(() => {
    db = new Database(":memory:");
    // Executar migrations...
    repository = new SQLiteAgenteRepository(db);
    service = new AgenteEconomicoService(repository);
  });

  it("deve criar um novo agente jurídico", async () => {
    const { agente, erros } = await service.criarAgente(
      {
        tipo_entidade: "pessoa_juridica",
        cpf_cnpj: "11222333000181",
        nome: "Empresa LTDA",
        nome_fantasia: "Empresa",
        papel: "supplier",
      },
      "user-1"
    );

    expect(erros).toBeUndefined();
    expect(agente).toBeDefined();
    expect(agente.cpf_cnpj).toBe("11222333000181");
  });

  it("deve detectar duplicatas", async () => {
    const agente1 = await repository.create({
      tipo_entidade: "pessoa_juridica",
      cpf_cnpj: "11222333000181",
      nome: "Empresa A LTDA",
      nome_fantasia: "Empresa A",
      papel: "supplier",
      criado_por: "user-1",
      atualizado_por: "user-1",
    });

    const agente2 = await repository.create({
      tipo_entidade: "pessoa_juridica",
      cpf_cnpj: "22333444000182",
      nome: "Empresa A LTDA",
      nome_fantasia: "Empresa A",
      papel: "supplier",
      criado_por: "user-1",
      atualizado_por: "user-1",
    });

    await service.detectarDuplicatas(agente1.id, "user-1");

    const duplicatas = await repository.findDuplicatas(agente1.id);
    expect(duplicatas.length).toBeGreaterThan(0);
  });
});
```

## Checklist de Implementação

- [ ] Criar arquivo `agentes-repository.ts` com implementação SQLite/PostgreSQL
- [ ] Criar arquivo `agentes-service.ts` com lógica de negócio
- [ ] Criar endpoints REST (GET, POST, PUT, DELETE)
- [ ] Criar validações de email/telefone mais robustas
- [ ] Integrar com tabela de auditoria
- [ ] Criar testes unitários
- [ ] Documentar na OpenAPI/Swagger
- [ ] Criar migrations para ambiente de produção
- [ ] Testar com dados reais de CPF/CNPJ
- [ ] Implementar detecção de duplicatas em background
- [ ] Criar dashboard para análise de duplicatas
- [ ] Integrar com sistema de permissões (ACL)
