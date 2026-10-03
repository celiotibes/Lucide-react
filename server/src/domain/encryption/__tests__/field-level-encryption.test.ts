/**
 * Testes para Field-Level Encryption
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  gerarChaveCriptografia,
  gerarNonce,
  criptografar,
  descriptografar,
  criptografarObjeto,
  descriptografarObjeto,
  mascararCampoSensivel,
  ehCampoSensivel,
  type DadosCriptografados,
} from '../field-level-encryption';

describe('Field-Level Encryption', () => {
  let chave: Buffer;

  beforeEach(() => {
    chave = gerarChaveCriptografia();
  });

  describe('Geração de chaves e nonces', () => {
    it('deve gerar chave com 32 bytes', () => {
      const chave = gerarChaveCriptografia();
      expect(chave.length).toBe(32);
    });

    it('deve gerar nonce com 12 bytes', () => {
      const nonce = gerarNonce();
      expect(nonce.length).toBe(12);
    });

    it('deve gerar nonces diferentes a cada chamada', () => {
      const nonce1 = gerarNonce();
      const nonce2 = gerarNonce();
      expect(nonce1).not.toEqual(nonce2);
    });
  });

  describe('Criptografia e descriptografia', () => {
    it('deve criptografar dados', () => {
      const dados = '12345678901234';
      const criptografado = criptografar(dados, chave);

      expect(criptografado).toHaveProperty('iv');
      expect(criptografado).toHaveProperty('conteudo');
      expect(criptografado).toHaveProperty('tag');
      expect(criptografado).toHaveProperty('versao');
      expect(criptografado.versao).toBe(1);
    });

    it('deve descriptografar dados criptografados', () => {
      const dadosOriginais = '12345678901234';
      const criptografado = criptografar(dadosOriginais, chave);
      const descriptografado = descriptografar(criptografado, chave);

      expect(descriptografado).toBe(dadosOriginais);
    });

    it('deve falhar ao descriptografar com chave errada', () => {
      const dados = 'dados-secretos';
      const criptografado = criptografar(dados, chave);

      const chaveErrada = gerarChaveCriptografia();

      expect(() => {
        descriptografar(criptografado, chaveErrada);
      }).toThrow();
    });

    it('deve falhar ao descriptografar com tag adulterada', () => {
      const dados = 'dados-secretos';
      const criptografado = criptografar(dados, chave);

      // Adulterar tag
      const adulterado: DadosCriptografados = {
        ...criptografado,
        tag: 'ffffffffffffffffffffffffffffffff',
      };

      expect(() => {
        descriptografar(adulterado, chave);
      }).toThrow();
    });

    it('deve criptografar valores diferentes em saídas diferentes', () => {
      const dados = 'mesmo-valor';
      const criptografado1 = criptografar(dados, chave);
      const criptografado2 = criptografar(dados, chave);

      // Mesmo com mesmo valor de entrada, nonces diferentes produzem saídas diferentes
      expect(criptografado1.iv).not.toBe(criptografado2.iv);
      expect(criptografado1.conteudo).not.toBe(criptografado2.conteudo);
    });
  });

  describe('Criptografia de objetos', () => {
    it('deve criptografar objetos com campos sensíveis', () => {
      const usuario = {
        id: 1,
        nome: 'João Silva',
        cpf: '12345678901',
        email: 'joao@example.com',
      };

      const criptografado = criptografarObjeto(usuario, chave, ['cpf', 'email']);

      expect(criptografado.id).toBe(1);
      expect(criptografado.nome).toBe('João Silva');
      expect(typeof criptografado.cpf).toBe('object');
      expect(typeof criptografado.email).toBe('object');
    });

    it('deve descriptografar objetos criptografados', () => {
      const usuario = {
        id: 1,
        nome: 'João Silva',
        cpf: '12345678901',
        email: 'joao@example.com',
      };

      const criptografado = criptografarObjeto(usuario, chave, ['cpf', 'email']);
      const descriptografado = descriptografarObjeto(criptografado, chave, ['cpf', 'email']);

      expect(descriptografado).toEqual(usuario);
    });

    it('deve ignorar campos nulos', () => {
      const usuario = {
        id: 1,
        nome: 'João Silva',
        cpf: null,
        email: 'joao@example.com',
      };

      const criptografado = criptografarObjeto(usuario, chave, ['cpf', 'email']);

      expect(criptografado.cpf).toBeNull();
      expect(typeof criptografado.email).toBe('object');
    });

    it('deve não re-criptografar valores já criptografados', () => {
      const usuario = {
        id: 1,
        cpf: '12345678901',
      };

      const criptografado1 = criptografarObjeto(usuario, chave, ['cpf']);
      const criptografado2 = criptografarObjeto(criptografado1, chave, ['cpf']);

      expect(criptografado2.cpf).toEqual(criptografado1.cpf);
    });
  });

  describe('Validação de campos sensíveis', () => {
    it('deve identificar campos sensíveis', () => {
      expect(ehCampoSensivel('cpf')).toBe(true);
      expect(ehCampoSensivel('CNpj')).toBe(true);
      expect(ehCampoSensivel('email')).toBe(true);
      expect(ehCampoSensivel('telefone')).toBe(true);
      expect(ehCampoSensivel('numero_cartao')).toBe(true);
    });

    it('deve identificar campos não sensíveis', () => {
      expect(ehCampoSensivel('nome')).toBe(false);
      expect(ehCampoSensivel('descricao')).toBe(false);
      expect(ehCampoSensivel('data_criacao')).toBe(false);
    });
  });

  describe('Máscara de campos sensíveis', () => {
    it('deve mascarar CPF', () => {
      const cpf = '12345678901';
      const mascarado = mascararCampoSensivel(cpf, 'cpf');
      expect(mascarado).toBe('123.***.789-**');
    });

    it('deve mascarar cartão de crédito', () => {
      const cartao = '1234567890123456';
      const mascarado = mascararCampoSensivel(cartao, 'cartao');
      expect(mascarado).toBe('****-****-****-3456');
    });

    it('deve mascarar email', () => {
      const email = 'joao.silva@example.com';
      const mascarado = mascararCampoSensivel(email, 'email');
      expect(mascarado).toBe('j***@example.com');
    });

    it('deve retornar vazio para valor vazio', () => {
      expect(mascararCampoSensivel('')).toBe('');
    });
  });

  describe('Compatibilidade com string chave', () => {
    it('deve aceitar chave como string hex', () => {
      const chaveHex = chave.toString('hex');
      const dados = 'teste';

      const criptografado = criptografar(dados, chaveHex);
      const descriptografado = descriptografar(criptografado, chaveHex);

      expect(descriptografado).toBe(dados);
    });

    it('deve falhar com chave hex inválida', () => {
      const chaveInvalida = 'abc123'; // Menos de 32 bytes

      expect(() => {
        criptografar('dados', Buffer.from(chaveInvalida, 'hex'));
      }).toThrow('Chave deve ter 32 bytes');
    });
  });

  describe('Performance', () => {
    it('deve criptografar rapidamente', () => {
      const dados = 'test-data-small';
      const inicio = Date.now();

      for (let i = 0; i < 100; i++) {
        criptografar(dados, chave);
      }

      const tempo = Date.now() - inicio;
      expect(tempo).toBeLessThan(1000); // Menos de 1 segundo para 100 operações
    });

    it('deve descriptografar rapidamente', () => {
      const dados = 'test-data-small';
      const criptografados = Array(100)
        .fill(null)
        .map(() => criptografar(dados, chave));

      const inicio = Date.now();

      for (const cripto of criptografados) {
        descriptografar(cripto, chave);
      }

      const tempo = Date.now() - inicio;
      expect(tempo).toBeLessThan(1000);
    });
  });
});
