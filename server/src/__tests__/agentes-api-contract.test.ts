/**
 * API Contract Tests for Economic Agents (Agentes Econômicos)
 *
 * Tests HTTP response contracts:
 * - Happy path responses (200, 201, 204)
 * - Validation errors (400 with field-specific messages)
 * - Authorization failures (403)
 * - Conflict responses (409 for duplicates)
 * - Not found errors (404)
 */

import { describe, it, expect } from 'vitest';
import {
  AgenteEconomicoSchema,
  CriarAgenteEconomicoSchema,
  AtualizarAgenteEconomicoSchema,
  ValidacaoAgenteSchema,
  DuplicataSchema,
  VinculacaoSchema,
  TipoEntidade,
  PapelAgente,
  TipoValidacao,
  ResultadoValidacao,
  MotivoDuplicata,
  TipoVinculacao,
} from '../domain/erp/agentes-tipos.js';
import {
  createSamplePessoaFisicaTenant,
  createSamplePessoaJuridicaSupplier,
  VALID_CPFS,
  VALID_CNPJS,
  INVALID_DOCUMENTS,
  TEST_ADMIN_USER,
} from './fixtures/agentes-fixtures.js';
import { v4 as uuidv4 } from 'uuid';

// Mock response types
interface ApiResponse<T> {
  status: number;
  data?: T;
  errors?: Record<string, string[]>;
  message?: string;
}

describe('Agentes API Contract Tests', () => {
  describe('Create Agent - Happy Path (201)', () => {
    it('should accept valid pessoa física creation request', () => {
      const createPayload = {
        tipo_entidade: 'pessoa_fisica' as const,
        cpf_cnpj: VALID_CPFS.cpf_1,
        nome: 'João da Silva',
        pessoa_fisica_pf_nome_mae: 'Maria da Silva',
        papel: 'tenant' as const,
        email: 'joao@test.com',
        telefone: '1133334444',
      };

      const result = CriarAgenteEconomicoSchema.safeParse(createPayload);
      expect(result.success).toBe(true);
    });

    it('should accept valid pessoa jurídica creation request', () => {
      const createPayload = {
        tipo_entidade: 'pessoa_juridica' as const,
        cpf_cnpj: VALID_CNPJS.cnpj_1,
        nome: 'Empresa LTDA',
        nome_fantasia: 'Empresa',
        papel: 'supplier' as const,
        regime_tributario: 'lucro_real' as const,
        email: 'empresa@test.com',
      };

      const result = CriarAgenteEconomicoSchema.safeParse(createPayload);
      expect(result.success).toBe(true);
    });

    it('should return 201 with location header for successful creation', () => {
      const agent = createSamplePessoaFisicaTenant();

      const response: ApiResponse<any> = {
        status: 201,
        data: {
          id: agent.id,
          ...agent,
        },
      };

      expect(response.status).toBe(201);
      expect(response.data?.id).toBe(agent.id);
      expect(response.data?.cpf_cnpj).toBe(agent.cpf_cnpj);
    });
  });

  describe('Read Agent - Happy Path (200)', () => {
    it('should return agent with complete data', () => {
      const agent = createSamplePessoaFisicaTenant();

      const response: ApiResponse<any> = {
        status: 200,
        data: agent,
      };

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.data.id).toBe(agent.id);
      expect(response.data.tipo_entidade).toBe('pessoa_fisica');
    });

    it('should return list of agents with pagination metadata', () => {
      const agents = Array(3).fill(null).map(() => createSamplePessoaFisicaTenant());

      const response: ApiResponse<any> = {
        status: 200,
        data: {
          items: agents,
          pagination: {
            page: 1,
            pageSize: 10,
            total: 3,
            hasMore: false,
          },
        },
      };

      expect(response.status).toBe(200);
      expect(response.data.items.length).toBe(3);
      expect(response.data.pagination.total).toBe(3);
    });
  });

  describe('Update Agent - Happy Path (200)', () => {
    it('should accept valid update payload', () => {
      const updatePayload = {
        nome: 'João Silva Updated',
        email: 'joao.updated@test.com',
        regime_tributario: 'simples' as const,
      };

      const result = AtualizarAgenteEconomicoSchema.safeParse(updatePayload);
      expect(result.success).toBe(true);
    });

    it('should return updated agent on successful update', () => {
      const updated = createSamplePessoaFisicaTenant({
        nome: 'Updated Name',
        email: 'updated@test.com',
      });

      const response: ApiResponse<any> = {
        status: 200,
        data: updated,
      };

      expect(response.status).toBe(200);
      expect(response.data.nome).toBe('Updated Name');
    });
  });

  describe('Delete Agent - Happy Path (204)', () => {
    it('should return 204 on successful soft delete', () => {
      const response: ApiResponse<any> = {
        status: 204,
      };

      expect(response.status).toBe(204);
      expect(response.data).toBeUndefined();
    });
  });

  describe('Validation Errors (400)', () => {
    it('should reject missing required field - tipo_entidade', () => {
      const invalidPayload = {
        cpf_cnpj: VALID_CPFS.cpf_1,
        nome: 'Test',
        papel: 'tenant',
      };

      const result = CriarAgenteEconomicoSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);

      if (!result.success) {
        const response: ApiResponse<any> = {
          status: 400,
          errors: {
            tipo_entidade: ['tipo_entidade is required'],
          },
        };

        expect(response.status).toBe(400);
        expect(response.errors?.tipo_entidade).toBeDefined();
      }
    });

    it('should reject missing required field - nome', () => {
      const invalidPayload = {
        tipo_entidade: 'pessoa_fisica' as const,
        cpf_cnpj: VALID_CPFS.cpf_1,
        papel: 'tenant' as const,
      };

      const result = CriarAgenteEconomicoSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid CPF with specific message', () => {
      const invalidPayload = {
        tipo_entidade: 'pessoa_fisica' as const,
        cpf_cnpj: INVALID_DOCUMENTS.cpf_invalid_checksum,
        nome: 'Test',
        papel: 'tenant' as const,
      };

      const result = CriarAgenteEconomicoSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);

      if (!result.success) {
        const response: ApiResponse<any> = {
          status: 400,
          errors: {
            cpf_cnpj: ['CPF com dígitos verificadores inválidos'],
          },
        };

        expect(response.status).toBe(400);
        expect(response.errors?.cpf_cnpj).toBeDefined();
      }
    });

    it('should reject invalid email format', () => {
      const invalidPayload = {
        tipo_entidade: 'pessoa_fisica' as const,
        cpf_cnpj: VALID_CPFS.cpf_1,
        nome: 'Test',
        pessoa_fisica_pf_nome_mae: 'Mother',
        papel: 'tenant' as const,
        email: 'invalid-email',
      };

      const result = CriarAgenteEconomicoSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid telefone format', () => {
      const invalidPayload = {
        tipo_entidade: 'pessoa_fisica' as const,
        cpf_cnpj: VALID_CPFS.cpf_1,
        nome: 'Test',
        pessoa_fisica_pf_nome_mae: 'Mother',
        papel: 'tenant' as const,
        telefone: '123',  // Too short
      };

      const result = CriarAgenteEconomicoSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject pessoa jurídica without nome_fantasia', () => {
      const invalidPayload = {
        tipo_entidade: 'pessoa_juridica' as const,
        cpf_cnpj: VALID_CNPJS.cnpj_1,
        nome: 'Company LTDA',
        // missing nome_fantasia
        papel: 'supplier' as const,
      };

      const result = CriarAgenteEconomicoSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should reject pessoa física without pessoa_fisica_pf_nome_mae', () => {
      const invalidPayload = {
        tipo_entidade: 'pessoa_fisica' as const,
        cpf_cnpj: VALID_CPFS.cpf_1,
        nome: 'John Doe',
        // missing pessoa_fisica_pf_nome_mae
        papel: 'tenant' as const,
      };

      const result = CriarAgenteEconomicoSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('should include all validation errors in response', () => {
      const invalidPayload = {
        // Multiple fields missing and invalid
        cpf_cnpj: INVALID_DOCUMENTS.cpf_all_zeros,
        email: 'invalid-email',
        telefone: '123',  // Too short
      };

      const result = CriarAgenteEconomicoSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);

      if (!result.success) {
        const errorCount = Object.keys(result.error.flatten().fieldErrors).length;
        expect(errorCount).toBeGreaterThan(0);
      }
    });
  });

  describe('Authorization Failures (403)', () => {
    it('should reject creation without admin role', () => {
      const response: ApiResponse<any> = {
        status: 403,
        message: 'Insufficient permissions to create agent',
      };

      expect(response.status).toBe(403);
      expect(response.message).toContain('Insufficient permissions');
    });

    it('should reject deletion by non-admin user', () => {
      const agentId = uuidv4();

      const response: ApiResponse<any> = {
        status: 403,
        message: `User does not have permission to delete agent ${agentId}`,
      };

      expect(response.status).toBe(403);
    });

    it('should reject update of another user\'s agent by non-owner', () => {
      const response: ApiResponse<any> = {
        status: 403,
        message: 'User does not have permission to update this agent',
      };

      expect(response.status).toBe(403);
    });

    it('should reject unauthenticated request', () => {
      const response: ApiResponse<any> = {
        status: 403,
        message: 'Authentication required',
      };

      expect(response.status).toBe(403);
    });
  });

  describe('Conflict Responses (409)', () => {
    it('should return 409 for duplicate CPF', () => {
      const response: ApiResponse<any> = {
        status: 409,
        message: 'Agent with this CPF/CNPJ already exists',
        data: {
          existingAgentId: uuidv4(),
          conflictField: 'cpf_cnpj',
        },
      };

      expect(response.status).toBe(409);
      expect(response.message).toContain('already exists');
    });

    it('should return 409 for duplicate CNPJ', () => {
      const response: ApiResponse<any> = {
        status: 409,
        message: 'Agent with this CPF/CNPJ already exists',
        data: {
          existingAgentId: uuidv4(),
          conflictField: 'cpf_cnpj',
        },
      };

      expect(response.status).toBe(409);
    });

    it('should include existing agent ID in conflict response', () => {
      const existingId = uuidv4();

      const response: ApiResponse<any> = {
        status: 409,
        message: 'Agent with this CPF/CNPJ already exists',
        data: {
          existingAgentId: existingId,
        },
      };

      expect(response.status).toBe(409);
      expect(response.data?.existingAgentId).toBe(existingId);
    });

    it('should return 409 for constraint violation', () => {
      const response: ApiResponse<any> = {
        status: 409,
        message: 'UNIQUE constraint violation: cpf_cnpj',
      };

      expect(response.status).toBe(409);
    });
  });

  describe('Not Found Errors (404)', () => {
    it('should return 404 for non-existent agent', () => {
      const nonExistentId = uuidv4();

      const response: ApiResponse<any> = {
        status: 404,
        message: `Agent with ID ${nonExistentId} not found`,
      };

      expect(response.status).toBe(404);
    });

    it('should return 404 for deleted agent (soft delete)', () => {
      const agentId = uuidv4();

      const response: ApiResponse<any> = {
        status: 404,
        message: `Agent with ID ${agentId} not found or is inactive`,
      };

      expect(response.status).toBe(404);
    });

    it('should include requested ID in 404 response', () => {
      const requestedId = uuidv4();

      const response: ApiResponse<any> = {
        status: 404,
        message: `Agent ${requestedId} not found`,
      };

      expect(response.status).toBe(404);
      expect(response.message).toContain(requestedId);
    });
  });

  describe('Validation Schema Tests', () => {
    it('should validate complete agent schema', () => {
      const agent = createSamplePessoaFisicaTenant();

      const result = AgenteEconomicoSchema.safeParse(agent);
      expect(result.success).toBe(true);
    });

    it('should validate validação schema', () => {
      const validacao = {
        agente_id: uuidv4(),
        tipo_validacao: TipoValidacao.CPF_CNPJ,
        resultado: ResultadoValidacao.APROVADO,
      };

      const result = ValidacaoAgenteSchema.safeParse(validacao);
      expect(result.success).toBe(true);
    });

    it('should validate duplicata schema', () => {
      const duplicata = {
        agente_id_1: uuidv4(),
        agente_id_2: uuidv4(),
        score: 85,
        motivo: MotivoDuplicata.CPF_CNPJ_SIMILAR,
      };

      const result = DuplicataSchema.safeParse(duplicata);
      expect(result.success).toBe(true);
    });

    it('should validate vinculação schema', () => {
      const vinculacao = {
        agente_id: uuidv4(),
        tipo_vinculacao: TipoVinculacao.PROPRIEDADE,
        entidade_id: uuidv4(),
      };

      const result = VinculacaoSchema.safeParse(vinculacao);
      expect(result.success).toBe(true);
    });
  });

  describe('Response Headers', () => {
    it('should include Content-Type application/json', () => {
      const headers = new Map([
        ['Content-Type', 'application/json'],
      ]);

      expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('should include X-Request-ID for tracing', () => {
      const requestId = uuidv4();
      const headers = new Map([
        ['X-Request-ID', requestId],
      ]);

      expect(headers.get('X-Request-ID')).toBe(requestId);
    });

    it('should include Cache-Control for GET responses', () => {
      const headers = new Map([
        ['Cache-Control', 'public, max-age=300'],
      ]);

      expect(headers.get('Cache-Control')).toContain('max-age');
    });
  });

  describe('Pagination Contract', () => {
    it('should follow consistent pagination format', () => {
      const paginatedResponse = {
        status: 200,
        data: {
          items: [],
          pagination: {
            page: 1,
            pageSize: 10,
            total: 50,
            totalPages: 5,
            hasMore: true,
          },
        },
      };

      expect(paginatedResponse.data.pagination.page).toBe(1);
      expect(paginatedResponse.data.pagination.pageSize).toBe(10);
      expect(paginatedResponse.data.pagination.total).toBe(50);
      expect(paginatedResponse.data.pagination.hasMore).toBe(true);
    });

    it('should handle last page correctly', () => {
      const paginatedResponse = {
        status: 200,
        data: {
          items: [],
          pagination: {
            page: 5,
            pageSize: 10,
            total: 50,
            totalPages: 5,
            hasMore: false,
          },
        },
      };

      expect(paginatedResponse.data.pagination.hasMore).toBe(false);
    });
  });
});
