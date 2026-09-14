import { describe, it, expect, beforeEach } from "vitest";
import {
  criarRequisicaoAprovacao,
  submeterAprovacao,
  aprovarNivel,
  rejeitarNivel,
  obterStatusAprovacao,
  obterEtapasAprovacao,
  obterNotificacoes,
  obterRequisicoesAguardandoAprovacao,
} from "../document-approvals";
import { prepararBancoTeste } from "./test-setup";

describe("Document Approval Workflows", () => {
  let db: any;
  let entidade_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
  });

  describe("criarRequisicaoAprovacao", () => {
    it("deve criar requisição válida", () => {
      const resultado = criarRequisicaoAprovacao(db, {
        documento_id: 1,
        tipo_documento: 'contrato',
        entidade_id,
        valor: 5000,
        descricao: 'Contrato de aluguel novo',
        solicitante_id: 1,
      });

      expect(resultado.sucesso).toBe(true);
      expect(resultado.request_id).toBeDefined();
      expect(resultado.request_id).toMatch(/^APR_/);
    });

    it("deve rejeitar requisição sem valor", () => {
      const resultado = criarRequisicaoAprovacao(db, {
        documento_id: 1,
        tipo_documento: 'despesa',
        entidade_id,
        valor: -100,
        descricao: 'Despesa inválida',
        solicitante_id: 1,
      });

      expect(resultado.sucesso).toBe(false);
      expect(resultado.errors).toBeDefined();
    });

    it("deve suportar múltiplos tipos de documentos", () => {
      const tipos = ['contrato', 'despesa', 'reembolso', 'contato_fornecedor'] as const;

      for (const tipo of tipos) {
        const resultado = criarRequisicaoAprovacao(db, {
          documento_id: Math.floor(Math.random() * 1000),
          tipo_documento: tipo,
          entidade_id,
          valor: 1000,
          descricao: `Documento tipo ${tipo}`,
          solicitante_id: 1,
        });

        expect(resultado.sucesso).toBe(true);
      }
    });
  });

  describe("submeterAprovacao", () => {
    it("deve submeter requisição para aprovação", () => {
      const criar = criarRequisicaoAprovacao(db, {
        documento_id: 2,
        tipo_documento: 'despesa',
        entidade_id,
        valor: 3000,
        descricao: 'Despesa com manutenção',
        solicitante_id: 1,
      });

      expect(criar.sucesso).toBe(true);
      expect(criar.request_id).toBeDefined();

      const submeter = submeterAprovacao(db, criar.request_id!);
      expect(submeter.sucesso).toBe(true);

      const status = obterStatusAprovacao(db, criar.request_id!);
      expect(status?.status).toBe('submitted');
    });

    it("deve criar etapas de aprovação ao submeter", () => {
      const criar = criarRequisicaoAprovacao(db, {
        documento_id: 3,
        tipo_documento: 'contrato',
        entidade_id,
        valor: 10000,
        descricao: 'Contrato grande',
        solicitante_id: 2,
      });

      submeterAprovacao(db, criar.request_id!);

      const etapas = obterEtapasAprovacao(db, criar.request_id!);
      expect(etapas.length).toBeGreaterThanOrEqual(3); // manager, director, financial
      expect(etapas.every((e) => e.status === 'pendente')).toBe(true);
    });

    it("deve rejeitar submissão de requisição inexistente", () => {
      const resultado = submeterAprovacao(db, 'REQ_INEXISTENTE');
      expect(resultado.sucesso).toBe(false);
      expect(resultado.errors).toBeDefined();
    });
  });

  describe("aprovarNivel", () => {
    it("deve aprovar nível de manager", () => {
      const criar = criarRequisicaoAprovacao(db, {
        documento_id: 4,
        tipo_documento: 'reembolso',
        entidade_id,
        valor: 500,
        descricao: 'Reembolso de despesa',
        solicitante_id: 1,
      });

      submeterAprovacao(db, criar.request_id!);

      const resultado = aprovarNivel(
        db,
        criar.request_id!,
        'manager',
        10,
        'Aprovado em primeira instância'
      );

      expect(resultado.sucesso).toBe(true);
      expect(resultado.proximoNivel).toBe('director');
    });

    it("deve aprovar todos os níveis sequencialmente", () => {
      const criar = criarRequisicaoAprovacao(db, {
        documento_id: 5,
        tipo_documento: 'contrato',
        entidade_id,
        valor: 8000,
        descricao: 'Contrato de aluguel',
        solicitante_id: 1,
      });

      submeterAprovacao(db, criar.request_id!);

      // Nível 1: Manager
      const aprovManager = aprovarNivel(db, criar.request_id!, 'manager', 10);
      expect(aprovManager.sucesso).toBe(true);
      expect(aprovManager.proximoNivel).toBe('director');

      // Nível 2: Director
      const aprovDirector = aprovarNivel(db, criar.request_id!, 'director', 11);
      expect(aprovDirector.sucesso).toBe(true);
      expect(aprovDirector.proximoNivel).toBe('financial');

      // Nível 3: Financial
      const aprovFinancial = aprovarNivel(db, criar.request_id!, 'financial', 12);
      expect(aprovFinancial.sucesso).toBe(true);
      expect(aprovFinancial.proximoNivel).toBeUndefined();

      // Verificar status final
      const status = obterStatusAprovacao(db, criar.request_id!);
      expect(status?.status).toBe('approved');
    });

    it("deve permitir comentários em aprovações", () => {
      const criar = criarRequisicaoAprovacao(db, {
        documento_id: 6,
        tipo_documento: 'despesa',
        entidade_id,
        valor: 1500,
        descricao: 'Despesa teste',
        solicitante_id: 1,
      });

      submeterAprovacao(db, criar.request_id!);

      const resultado = aprovarNivel(
        db,
        criar.request_id!,
        'manager',
        10,
        'Aprovado com análise concluída'
      );

      expect(resultado.sucesso).toBe(true);

      const etapas = obterEtapasAprovacao(db, criar.request_id!);
      const managerEtapa = etapas.find((e) => e.nivel === 'manager');
      expect(managerEtapa?.comentario).toBe('Aprovado com análise concluída');
    });
  });

  describe("rejeitarNivel", () => {
    it("deve rejeitar em nível de manager com motivo", () => {
      const criar = criarRequisicaoAprovacao(db, {
        documento_id: 7,
        tipo_documento: 'contrato',
        entidade_id,
        valor: 7000,
        descricao: 'Contrato para rejeição',
        solicitante_id: 1,
      });

      submeterAprovacao(db, criar.request_id!);

      const resultado = rejeitarNivel(
        db,
        criar.request_id!,
        'manager',
        10,
        'Documentação incompleta'
      );

      expect(resultado.sucesso).toBe(true);

      const status = obterStatusAprovacao(db, criar.request_id!);
      expect(status?.status).toBe('rejected');

      const etapas = obterEtapasAprovacao(db, criar.request_id!);
      const managerEtapa = etapas.find((e) => e.nivel === 'manager');
      expect(managerEtapa?.status).toBe('rejeitado');
      expect(managerEtapa?.motivo_rejeicao).toBe('Documentação incompleta');
    });

    it("deve rejeitar em qualquer nível", () => {
      const criar = criarRequisicaoAprovacao(db, {
        documento_id: 8,
        tipo_documento: 'reembolso',
        entidade_id,
        valor: 2000,
        descricao: 'Reembolso para rejeição no diretor',
        solicitante_id: 1,
      });

      submeterAprovacao(db, criar.request_id!);

      // Aprovar manager
      aprovarNivel(db, criar.request_id!, 'manager', 10);

      // Rejeitar director
      const resultado = rejeitarNivel(
        db,
        criar.request_id!,
        'director',
        11,
        'Não está dentro do orçamento'
      );

      expect(resultado.sucesso).toBe(true);

      const etapas = obterEtapasAprovacao(db, criar.request_id!);
      const directorEtapa = etapas.find((e) => e.nivel === 'director');
      expect(directorEtapa?.status).toBe('rejeitado');
    });
  });

  describe("obterStatusAprovacao", () => {
    it("deve retornar status completo da requisição", () => {
      const criar = criarRequisicaoAprovacao(db, {
        documento_id: 9,
        tipo_documento: 'contrato',
        entidade_id,
        valor: 6000,
        descricao: 'Contrato para status',
        solicitante_id: 1,
      });

      submeterAprovacao(db, criar.request_id!);

      const status = obterStatusAprovacao(db, criar.request_id!);
      expect(status).toBeDefined();
      expect(status?.id).toBe(criar.request_id);
      expect(status?.tipo_documento).toBe('contrato');
      expect(status?.valor).toBe(6000);
      expect(status?.status).toBe('submitted');
    });

    it("deve retornar null para requisição inexistente", () => {
      const status = obterStatusAprovacao(db, 'REQ_INEXISTENTE');
      expect(status).toBeNull();
    });
  });

  describe("obterEtapasAprovacao", () => {
    it("deve retornar todas as etapas de uma requisição", () => {
      const criar = criarRequisicaoAprovacao(db, {
        documento_id: 10,
        tipo_documento: 'despesa',
        entidade_id,
        valor: 4000,
        descricao: 'Despesa com etapas',
        solicitante_id: 1,
      });

      submeterAprovacao(db, criar.request_id!);

      const etapas = obterEtapasAprovacao(db, criar.request_id!);
      expect(etapas.length).toBeGreaterThanOrEqual(3);
      expect(etapas.map((e) => e.nivel)).toContain('manager');
      expect(etapas.map((e) => e.nivel)).toContain('director');
      expect(etapas.map((e) => e.nivel)).toContain('financial');
    });

    it("deve retornar array vazio para requisição inexistente", () => {
      const etapas = obterEtapasAprovacao(db, 'REQ_INEXISTENTE');
      expect(etapas).toEqual([]);
    });
  });

  describe("obterNotificacoes", () => {
    it("deve retornar notificações após submissão", () => {
      const criar = criarRequisicaoAprovacao(db, {
        documento_id: 11,
        tipo_documento: 'contrato',
        entidade_id,
        valor: 9000,
        descricao: 'Contrato com notificações',
        solicitante_id: 1,
      });

      submeterAprovacao(db, criar.request_id!);

      const notificacoes = obterNotificacoes(db);
      expect(notificacoes.length).toBeGreaterThan(0);
      expect(notificacoes.some((n) => n.request_id === criar.request_id)).toBe(true);
    });

    it("deve retornar notificações de rejeição", () => {
      const criar = criarRequisicaoAprovacao(db, {
        documento_id: 12,
        tipo_documento: 'reembolso',
        entidade_id,
        valor: 1200,
        descricao: 'Reembolso com notificação de rejeição',
        solicitante_id: 1,
      });

      submeterAprovacao(db, criar.request_id!);
      rejeitarNivel(db, criar.request_id!, 'manager', 10, 'Motivo teste');

      const notificacoes = obterNotificacoes(db);
      expect(notificacoes.some((n) => n.tipo === 'rejeicao')).toBe(true);
    });
  });

  describe("obterRequisicoesAguardandoAprovacao", () => {
    it("deve retornar requisições pendentes para um nível específico", () => {
      // Criar múltiplas requisições
      for (let i = 0; i < 3; i++) {
        const criar = criarRequisicaoAprovacao(db, {
          documento_id: 100 + i,
          tipo_documento: 'contrato',
          entidade_id,
          valor: 5000 + i * 1000,
          descricao: `Contrato ${i}`,
          solicitante_id: 1,
        });
        submeterAprovacao(db, criar.request_id!);
      }

      const requisicoes = obterRequisicoesAguardandoAprovacao(db, 10, 'manager');
      expect(requisicoes.length).toBeGreaterThanOrEqual(3);
    });

    it("deve filtrar por nível correto", () => {
      const criar = criarRequisicaoAprovacao(db, {
        documento_id: 200,
        tipo_documento: 'despesa',
        entidade_id,
        valor: 3000,
        descricao: 'Despesa para filtro',
        solicitante_id: 1,
      });

      submeterAprovacao(db, criar.request_id!);

      // Aprovar manager (move para director)
      aprovarNivel(db, criar.request_id!, 'manager', 10);

      // Não deve aparecer para manager
      const paraManager = obterRequisicoesAguardandoAprovacao(db, 10, 'manager');
      const idEmManager = paraManager.find((r) => r.id === criar.request_id);
      expect(idEmManager).toBeUndefined();
    });
  });

  describe("Testes Integrados de Fluxo Completo", () => {
    it("deve processar fluxo de aprovação completo com sucesso", () => {
      // 1. Criar requisição
      const criar = criarRequisicaoAprovacao(db, {
        documento_id: 300,
        tipo_documento: 'contrato',
        entidade_id,
        valor: 12000,
        descricao: 'Contrato grande para fluxo completo',
        solicitante_id: 5,
      });
      expect(criar.sucesso).toBe(true);

      // 2. Submeter
      const submeter = submeterAprovacao(db, criar.request_id!);
      expect(submeter.sucesso).toBe(true);

      // 3. Aprovar em todos os níveis
      const aprovManager = aprovarNivel(
        db,
        criar.request_id!,
        'manager',
        10,
        'OK para diretor'
      );
      expect(aprovManager.sucesso).toBe(true);

      const aprovDirector = aprovarNivel(
        db,
        criar.request_id!,
        'director',
        11,
        'OK para financeiro'
      );
      expect(aprovDirector.sucesso).toBe(true);

      const aprovFinancial = aprovarNivel(
        db,
        criar.request_id!,
        'financial',
        12,
        'Aprovado para execução'
      );
      expect(aprovFinancial.sucesso).toBe(true);

      // 4. Verificar status final
      const status = obterStatusAprovacao(db, criar.request_id!);
      expect(status?.status).toBe('approved');

      // 5. Verificar todas as etapas
      const etapas = obterEtapasAprovacao(db, criar.request_id!);
      expect(etapas.every((e) => e.status === 'aprovado')).toBe(true);
    });

    it("deve processar rejeição após primeira aprovação", () => {
      const criar = criarRequisicaoAprovacao(db, {
        documento_id: 301,
        tipo_documento: 'despesa',
        entidade_id,
        valor: 5000,
        descricao: 'Despesa para rejeição no segundo nível',
        solicitante_id: 5,
      });

      submeterAprovacao(db, criar.request_id!);

      // Aprovar manager
      aprovarNivel(db, criar.request_id!, 'manager', 10);

      // Rejeitar director
      const rejeitar = rejeitarNivel(
        db,
        criar.request_id!,
        'director',
        11,
        'Análise de risco elevado'
      );
      expect(rejeitar.sucesso).toBe(true);

      // Verificar status
      const status = obterStatusAprovacao(db, criar.request_id!);
      expect(status?.status).toBe('rejected');

      // Verificar notificação
      const notificacoes = obterNotificacoes(db);
      const rejeicaoNotif = notificacoes.find(
        (n) => n.request_id === criar.request_id && n.tipo === 'rejeicao'
      );
      expect(rejeicaoNotif).toBeDefined();
    });
  });
});
