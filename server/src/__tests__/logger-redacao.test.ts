/**
 * Testes para redação de dados pessoais nos logs
 *
 * Cobre:
 * - CPF (com e sem pontuação)
 * - CNPJ (com e sem pontuação)
 * - Email
 * - Telefone brasileiro
 * - Tokens e senhas
 * - Objetos aninhados
 * - Referências circulares
 * - Errors com mensagens contendo PII
 * - Falsos positivos (números que NÃO são CPF/CNPJ)
 */

import { describe, it, expect } from 'vitest';
import {
  mascaraCPF,
  mascaraCNPJ,
  mascaraEmail,
  mascaraTelefone,
  detectarEMascararDocumentos,
  mascaraTokensESenhas,
  redactarObjeto,
  aplicarRedacao,
} from '../services/logger-service';

describe('Logger Redação de PII', () => {
  // ================================================================
  // TESTES CPF
  // ================================================================
  describe('mascaraCPF', () => {
    it('mascara CPF com pontuação', () => {
      const cpf = '123.456.789-01';
      const resultado = mascaraCPF(cpf);
      expect(resultado).toBe('***.***.***-01');
    });

    it('mascara CPF sem pontuação', () => {
      const cpf = '12345678901';
      const resultado = mascaraCPF(cpf);
      expect(resultado).toBe('***.***.***-01');
    });

    it('retorna CPF inválido sem alteração', () => {
      const cpf = '123.456';
      const resultado = mascaraCPF(cpf);
      expect(resultado).toBe('123.456');
    });

    it('mantém 2 últimos dígitos do CPF', () => {
      const cpf = '111.111.111-77';
      const resultado = mascaraCPF(cpf);
      expect(resultado).toContain('-77');
    });
  });

  // ================================================================
  // TESTES CNPJ
  // ================================================================
  describe('mascaraCNPJ', () => {
    it('mascara CNPJ com pontuação', () => {
      const cnpj = '12.345.678/0001-99';
      const resultado = mascaraCNPJ(cnpj);
      expect(resultado).toBe('**.***.***/****-99');
    });

    it('mascara CNPJ sem pontuação', () => {
      const cnpj = '12345678000199';
      const resultado = mascaraCNPJ(cnpj);
      expect(resultado).toBe('**.***.***/****-99');
    });

    it('retorna CNPJ inválido sem alteração', () => {
      const cnpj = '123.456.789';
      const resultado = mascaraCNPJ(cnpj);
      expect(resultado).toBe('123.456.789');
    });

    it('mantém 2 últimos dígitos do CNPJ', () => {
      const cnpj = '11.222.333/0001-88';
      const resultado = mascaraCNPJ(cnpj);
      expect(resultado).toContain('-88');
    });
  });

  // ================================================================
  // TESTES EMAIL
  // ================================================================
  describe('mascaraEmail', () => {
    it('mascara email padrão', () => {
      const email = 'joao.silva@example.com';
      const resultado = mascaraEmail(email);
      expect(resultado).toBe('j***@example.com');
    });

    it('mantém primeira letra e domínio', () => {
      const email = 'a@domain.co.uk';
      const resultado = mascaraEmail(email);
      expect(resultado).toBe('a***@domain.co.uk');
    });

    it('retorna email inválido sem alteração', () => {
      const email = 'nao_tem_arroba.com';
      const resultado = mascaraEmail(email);
      expect(resultado).toBe('nao_tem_arroba.com');
    });
  });

  // ================================================================
  // TESTES TELEFONE
  // ================================================================
  describe('mascaraTelefone', () => {
    it('mascara telefone com formatação', () => {
      const telefone = '(11) 98765-4321';
      const resultado = mascaraTelefone(telefone);
      expect(resultado).toBe('(**) *****-4321');
    });

    it('mascara telefone sem formatação', () => {
      const telefone = '11987654321';
      const resultado = mascaraTelefone(telefone);
      expect(resultado).toBe('(**) *****-4321');
    });

    it('mantém 4 últimos dígitos', () => {
      const telefone = '(21) 99999-8888';
      const resultado = mascaraTelefone(telefone);
      expect(resultado).toContain('-8888');
    });

    it('retorna telefone muito curto sem alteração', () => {
      const telefone = '123-45';
      const resultado = mascaraTelefone(telefone);
      expect(resultado).toBe('123-45');
    });
  });

  // ================================================================
  // TESTES DETECÇÃO E MASCARAMENTO EM TEXTO
  // ================================================================
  describe('detectarEMascararDocumentos', () => {
    it('mascara CPF em texto corrido', () => {
      const texto = 'O CPF do cliente é 123.456.789-01 e é válido.';
      const resultado = detectarEMascararDocumentos(texto);
      expect(resultado).toContain('***.***.***-01');
      expect(resultado).not.toContain('123.456.789-01');
    });

    it('mascara CNPJ em texto', () => {
      const texto = 'A empresa 12.345.678/0001-99 foi registrada.';
      const resultado = detectarEMascararDocumentos(texto);
      expect(resultado).toContain('**.***.***/****-99');
      expect(resultado).not.toContain('12.345.678/0001-99');
    });

    it('mascara email em texto', () => {
      const texto = 'Contacte-me em joao@empresa.com para mais info.';
      const resultado = detectarEMascararDocumentos(texto);
      expect(resultado).toContain('j***@empresa.com');
      expect(resultado).not.toContain('joao@empresa.com');
    });

    it('mascara múltiplos emails', () => {
      const texto = 'Entre em contato: maria@test.com ou jose@test.com';
      const resultado = detectarEMascararDocumentos(texto);
      expect((resultado.match(/\*\*\*@test.com/g) || []).length).toBe(2);
    });

    it('não mascara id curto (falso positivo)', () => {
      const texto = 'ID do usuário: 123456';
      const resultado = detectarEMascararDocumentos(texto);
      // 6 dígitos não devem ser mascarados como CPF (que são 11)
      expect(resultado).toBe(texto);
    });

    it('não mascara timestamp de 13 dígitos (falso positivo)', () => {
      const texto = 'Timestamp: 1635360000000';
      const resultado = detectarEMascararDocumentos(texto);
      // 13 dígitos iguais (timestamp) não devem ser mascarados
      expect(resultado).toBe(texto);
    });

    it('não mascara valor monetário (falso positivo)', () => {
      const texto = 'O valor é 1234567890.00 reais';
      const resultado = detectarEMascararDocumentos(texto);
      // Valor com ponto decimal não deve ser confundido com CPF
      expect(resultado).toContain('1234567890.00');
    });
  });

  // ================================================================
  // TESTES TOKENS E SENHAS
  // ================================================================
  describe('mascaraTokensESenhas', () => {
    it('mascara Bearer token', () => {
      const texto = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const resultado = mascaraTokensESenhas(texto);
      expect(resultado).toContain('Bearer [REDACTED]');
      expect(resultado).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('mascara Authorization header', () => {
      const texto = 'authorization: Bearer xyz123abc456';
      const resultado = mascaraTokensESenhas(texto);
      expect(resultado).toContain('[REDACTED]');
      expect(resultado).not.toContain('xyz123abc456');
    });

    it('mascara token genérico', () => {
      const texto = 'token=abc123def456';
      const resultado = mascaraTokensESenhas(texto);
      expect(resultado).toContain('token: [REDACTED]');
      expect(resultado).not.toContain('abc123def456');
    });

    it('mascara api_key', () => {
      const texto = 'api_key=sk-1234567890abcdefghij';
      const resultado = mascaraTokensESenhas(texto);
      expect(resultado).toContain('api_key: [REDACTED]');
      expect(resultado).not.toContain('sk-1234567890abcdefghij');
    });
  });

  // ================================================================
  // TESTES REDAÇÃO DE OBJETOS
  // ================================================================
  describe('redactarObjeto', () => {
    it('mascara cpf em objeto aninhado', () => {
      const obj = {
        usuario: {
          nome: 'João',
          cpf: '123.456.789-01',
        },
      };
      const resultado = redactarObjeto(obj);
      expect(resultado.usuario.cpf).toBe('***.***.***-01');
    });

    it('mascara campos sensíveis por nome', () => {
      const obj = {
        username: 'joao',
        password: 'minha_senha_123',
        api_key: 'sk-1234567890',
      };
      const resultado = redactarObjeto(obj);
      expect(resultado.password).toBe('[REDACTED]');
      expect(resultado.api_key).toBe('[REDACTED]');
      expect(resultado.username).toBe('joao');
    });

    it('mascara Authorization em objeto', () => {
      const obj = {
        headers: {
          authorization: 'Bearer token123',
          'content-type': 'application/json',
        },
      };
      const resultado = redactarObjeto(obj);
      expect(resultado.headers.authorization).toBe('[REDACTED]');
      expect(resultado.headers['content-type']).toBe('application/json');
    });

    it('mascara secret_key case-insensitive', () => {
      const obj = {
        SECRET_KEY: 'minha_chave_secreta',
        Secret_Key: 'outra_chave',
      };
      const resultado = redactarObjeto(obj);
      expect(resultado.SECRET_KEY).toBe('[REDACTED]');
      expect(resultado.Secret_Key).toBe('[REDACTED]');
    });

    it('mascara arrays de objetos', () => {
      const obj = {
        usuarios: [
          { nome: 'João', email: 'joao@test.com' },
          { nome: 'Maria', email: 'maria@test.com' },
        ],
      };
      const resultado = redactarObjeto(obj);
      expect(resultado.usuarios[0].email).toContain('j***@test.com');
      expect(resultado.usuarios[1].email).toContain('m***@test.com');
    });

    it('detecta referências circulares', () => {
      const obj: any = { nome: 'João' };
      obj.self = obj; // Referência circular
      const resultado = redactarObjeto(obj);
      expect(resultado.self).toBe('[CIRCULAR]');
    });

    it('trata Error com mensagem contendo CPF', () => {
      const erro = new Error('CPF 123.456.789-01 inválido');
      const resultado = redactarObjeto(erro);
      expect(resultado.message).toContain('***.***.***-01');
      expect(resultado.message).not.toContain('123.456.789-01');
    });

    it('trata arrays como null/undefined', () => {
      const obj = {
        value: null,
        optional: undefined,
      };
      const resultado = redactarObjeto(obj);
      expect(resultado.value).toBeNull();
      expect(resultado.optional).toBeUndefined();
    });

    it('mantém tipos primitivos', () => {
      const obj = {
        numero: 123,
        booleano: true,
        nulo: null,
      };
      const resultado = redactarObjeto(obj);
      expect(resultado.numero).toBe(123);
      expect(resultado.booleano).toBe(true);
      expect(resultado.nulo).toBeNull();
    });
  });

  // ================================================================
  // TESTES APLICAR REDAÇÃO COMPLETA
  // ================================================================
  describe('aplicarRedacao', () => {
    it('redaciona mensagem e metadados', () => {
      const msg = 'Login com CPF 123.456.789-01';
      const meta = {
        ip: '192.168.1.1',
        cpf: '123.456.789-01',
      };
      const { mensagem, meta: metaRedatada } = aplicarRedacao(msg, meta);
      expect(mensagem).toContain('***.***.***-01');
      expect(metaRedatada.cpf).toBe('***.***.***-01');
    });

    it('redaciona mensagem com múltiplos dados sensíveis', () => {
      const msg = 'Usuário joao@test.com com CPF 123.456.789-01 e telefone (11) 98765-4321';
      const { mensagem } = aplicarRedacao(msg);
      expect(mensagem).toContain('j***@test.com');
      expect(mensagem).toContain('***.***.***-01');
      expect(mensagem).toContain('(**) *****-4321');
    });

    it('retorna undefined se meta for undefined', () => {
      const msg = 'Mensagem simples';
      const { mensagem, meta } = aplicarRedacao(msg, undefined);
      expect(mensagem).toBe('Mensagem simples');
      expect(meta).toBeUndefined();
    });

    it('mascara campos sensíveis em meta aninhada', () => {
      const msg = 'Operação realizada';
      const meta = {
        user: {
          name: 'João Silva',
          password: 'senhaForte123',
          contact: {
            email: 'joao@test.com',
          },
        },
      };
      const { meta: metaRedatada } = aplicarRedacao(msg, meta);
      expect(metaRedatada.user.password).toBe('[REDACTED]');
      expect(metaRedatada.user.contact.email).toContain('j***@test.com');
      expect(metaRedatada.user.name).toBe('João Silva');
    });
  });

  // ================================================================
  // TESTES INTEGRAÇÃO COMPLETA
  // ================================================================
  describe('Integração Completa', () => {
    it('mascara log com vários tipos de PII', () => {
      const msg = 'Cadastro: CPF 123.456.789-01, CNPJ 12.345.678/0001-99, email joao@test.com, token Bearer abc123';
      const meta = {
        user_id: 123,
        password: 'minhasenha',
        api_token: 'sk-1234567890',
        telefone: '(11) 98765-4321',
        dados: {
          cpf: '123.456.789-01',
          secret_key: 'chave_secreta',
        },
      };

      const { mensagem, meta: metaRedatada } = aplicarRedacao(msg, meta);

      // Verifica mensagem
      expect(mensagem).toContain('***.***.***-01');
      expect(mensagem).toContain('**.***.***/****-99');
      expect(mensagem).toContain('j***@test.com');
      expect(mensagem).toContain('Bearer [REDACTED]');

      // Verifica metadata
      expect(metaRedatada.password).toBe('[REDACTED]');
      expect(metaRedatada.api_token).toBe('[REDACTED]');
      expect(metaRedatada.telefone).toContain('(**) *****-4321');
      expect(metaRedatada.dados.cpf).toBe('***.***.***-01');
      expect(metaRedatada.dados.secret_key).toBe('[REDACTED]');
      expect(metaRedatada.user_id).toBe(123);
    });

    it('não mascara dados que não são PII', () => {
      const msg = 'Operação com id 12345 e valor 1000.50';
      const meta = {
        timestamp: 1635360000000,
        count: 42,
        name: 'João Silva',
      };

      const { mensagem, meta: metaRedatada } = aplicarRedacao(msg, meta);

      // Dados não-sensíveis devem permanecer
      expect(mensagem).toContain('id 12345');
      expect(mensagem).toContain('1000.50');
      expect(metaRedatada.timestamp).toBe(1635360000000);
      expect(metaRedatada.count).toBe(42);
      expect(metaRedatada.name).toBe('João Silva');
    });

    it('trata Error em metadados', () => {
      const msg = 'Erro ao processar';
      const erro = new Error('CPF 123.456.789-01 não encontrado');
      const { meta: metaRedatada } = aplicarRedacao(msg, { erro } as Record<string, unknown>);

      if (metaRedatada && metaRedatada.erro) {
        expect(metaRedatada.erro.message).toContain('***.***.***-01');
        expect(metaRedatada.erro.message).not.toContain('123.456.789-01');
      }
    });
  });
});

import { aplicarRedacao as aplicar, redactarObjeto as redactar } from "../services/logger-service.js";

describe("robustez da redação (revisão)", () => {
  it("mensagem não-string não lança e é redigida", () => {
    expect(() => aplicar(undefined as unknown as string)).not.toThrow();
    expect(() => aplicar(12345 as unknown as string)).not.toThrow();
    expect(aplicar({ cpf: "123.456.789-01", senha: "x" } as unknown as string).mensagem).toEqual({ cpf: "***.***.***-01", senha: "[REDACTED]" });
  });

  it("falha na redação é fail-closed: omite o conteúdo e não lança", () => {
    const hostil = { get x(): string { throw new Error("getter hostil"); } };
    const r = aplicar("msg 123.456.789-01", hostil as unknown as Record<string, unknown>);
    expect(r.mensagem).toBe("[REDACTION-ERROR: conteúdo omitido]");
    expect(JSON.stringify(r)).not.toContain("123.456.789-01");
  });

  it("o mesmo objeto referenciado duas vezes (sem ciclo) não vira [CIRCULAR]", () => {
    const comum = { a: 1 };
    expect(redactar({ x: comum, y: comum })).toEqual({ x: { a: 1 }, y: { a: 1 } });
    const ciclo: any = { n: 1 }; ciclo.self = ciclo;
    expect(redactar(ciclo)).toEqual({ n: 1, self: "[CIRCULAR]" });
  });

  it("não apaga a palavra seguinte a 'token' em texto comum", () => {
    expect(aplicar("Sessão com token expirado").mensagem).toBe("Sessão com token expirado");
    expect(aplicar("token=abc123").mensagem).toBe("token: [REDACTED]");
  });
});
