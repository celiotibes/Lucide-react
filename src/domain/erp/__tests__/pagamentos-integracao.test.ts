import { describe, it, expect, beforeEach } from "vitest";
import {
  criarPagamento,
  aprovarPagamento,
  procesarPagamento,
  confirmarPagamento,
  marcarPagamentoComFalha,
  reconciliarPagamento,
  obterPagamento,
  obterPagamentosComFalha,
  obterPagamentosAguardandoReconciliacao,
  obterHistoricoTentativas,
  obterResumoFinanceiro,
} from "../pagamentos-integracao";
import { prepararBancoTeste } from "./test-setup";

describe("Pagamentos Integração", () => {
  let db: any;
  let entidade_id: number;

  beforeEach(async () => {
    const setup = await prepararBancoTeste();
    db = setup.db;
    entidade_id = setup.entidade_id;
  });

  describe("criarPagamento", () => {
    it("deve criar pagamento válido", () => {
      const resultado = criarPagamento(db, {
        entidade_id,
        valor: 2000,
        descricao: 'Pagamento fornecedor A',
        tipo_pagamento: 'manutencao',
        metodo_pagamento: 'pix',
        beneficiario: 'Fornecedor A Ltda',
        referencia: 'FAT-001',
      });

      expect(resultado.sucesso).toBe(true);
      expect(resultado.payment_id).toBeDefined();
      expect(resultado.payment_id).toMatch(/^PAG_/);
    });

    it("deve rejeitar pagamento com valor negativo", () => {
      const resultado = criarPagamento(db, {
        entidade_id,
        valor: -500,
        descricao: 'Pagamento inválido',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'transferencia',
        beneficiario: 'Alguém',
        referencia: 'REF-001',
      });

      expect(resultado.sucesso).toBe(false);
      expect(resultado.errors).toBeDefined();
    });

    it("deve rejeitar pagamento sem valor", () => {
      const resultado = criarPagamento(db, {
        entidade_id,
        valor: 0,
        descricao: 'Pagamento zero',
        tipo_pagamento: 'outro',
        metodo_pagamento: 'cartao_credito',
        beneficiario: 'Alguém',
        referencia: 'REF-002',
      });

      expect(resultado.sucesso).toBe(false);
    });

    it("deve suportar todos os métodos de pagamento", () => {
      const metodos = ['pix', 'transferencia', 'boleto', 'cartao_credito'] as const;

      for (const metodo of metodos) {
        const resultado = criarPagamento(db, {
          entidade_id,
          valor: 1500,
          descricao: `Pagamento via ${metodo}`,
          tipo_pagamento: 'despesa',
          metodo_pagamento: metodo,
          beneficiario: 'Fornecedor',
          referencia: `REF-${metodo}`,
        });

        expect(resultado.sucesso).toBe(true);
      }
    });

    it("deve agendar pagamento para data futura", () => {
      const dataFutura = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const resultado = criarPagamento(db, {
        entidade_id,
        valor: 3000,
        descricao: 'Pagamento agendado',
        tipo_pagamento: 'aluguel',
        metodo_pagamento: 'transferencia',
        beneficiario: 'Proprietário',
        referencia: 'ALUG-001',
        data_agendado: dataFutura,
      });

      expect(resultado.sucesso).toBe(true);
      const pagamento = obterPagamento(db, resultado.payment_id!);
      expect(pagamento?.data_agendado).toBe(dataFutura);
    });
  });

  describe("aprovarPagamento", () => {
    it("deve aprovar pagamento pendente", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 1500,
        descricao: 'Pagamento para aprovação',
        tipo_pagamento: 'manutencao',
        metodo_pagamento: 'pix',
        beneficiario: 'Eletricista',
        referencia: 'MANUT-001',
      });

      const resultado = aprovarPagamento(db, criar.payment_id!);
      expect(resultado.sucesso).toBe(true);

      const pagamento = obterPagamento(db, criar.payment_id!);
      expect(pagamento?.status).toBe('aprovado');
    });

    it("deve rejeitar aprovação de pagamento inexistente", () => {
      const resultado = aprovarPagamento(db, 'PAG_INEXISTENTE');
      expect(resultado.sucesso).toBe(false);
      expect(resultado.errors).toBeDefined();
    });
  });

  describe("procesarPagamento", () => {
    it("deve processar pagamento aprovado", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 2500,
        descricao: 'Pagamento para processamento',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'transferencia',
        beneficiario: 'Fornecedor B',
        referencia: 'FAT-002',
      });

      aprovarPagamento(db, criar.payment_id!);

      const resultado = procesarPagamento(db, criar.payment_id!);
      expect(resultado.sucesso).toBe(true);

      const pagamento = obterPagamento(db, criar.payment_id!);
      expect(pagamento?.status).toBe('processando');
      expect(pagamento?.data_processamento).toBeDefined();
    });

    it("deve rejeitar processamento de pagamento não aprovado", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 1000,
        descricao: 'Pagamento para falha de processamento',
        tipo_pagamento: 'outro',
        metodo_pagamento: 'boleto',
        beneficiario: 'Alguém',
        referencia: 'REF-003',
      });

      const resultado = procesarPagamento(db, criar.payment_id!);
      expect(resultado.sucesso).toBe(false);
    });

    it("deve incrementar tentativas ao processar", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 800,
        descricao: 'Pagamento para tentativas',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'pix',
        beneficiario: 'Fornecedor',
        referencia: 'REF-004',
      });

      aprovarPagamento(db, criar.payment_id!);
      procesarPagamento(db, criar.payment_id!);

      const pagamento = obterPagamento(db, criar.payment_id!);
      expect(pagamento?.tentativas).toBeGreaterThan(0);
    });
  });

  describe("confirmarPagamento", () => {
    it("deve confirmar pagamento em processamento", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 3500,
        descricao: 'Pagamento para confirmação',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'transferencia',
        beneficiario: 'Fornecedor C',
        referencia: 'FAT-003',
      });

      aprovarPagamento(db, criar.payment_id!);
      procesarPagamento(db, criar.payment_id!);

      const resultado = confirmarPagamento(db, criar.payment_id!);
      expect(resultado.sucesso).toBe(true);

      const pagamento = obterPagamento(db, criar.payment_id!);
      expect(pagamento?.status).toBe('pago');
      expect(pagamento?.data_conclusao).toBeDefined();
    });

    it("deve iniciar com status não reconciliado", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 2000,
        descricao: 'Pagamento para reconciliação',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'pix',
        beneficiario: 'Fornecedor D',
        referencia: 'FAT-004',
      });

      aprovarPagamento(db, criar.payment_id!);
      procesarPagamento(db, criar.payment_id!);
      confirmarPagamento(db, criar.payment_id!);

      const pagamento = obterPagamento(db, criar.payment_id!);
      expect(pagamento?.reconciliacao_status).toBe('nao_reconciliado');
    });
  });

  describe("marcarPagamentoComFalha", () => {
    it("deve marcar pagamento como falho", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 1200,
        descricao: 'Pagamento com falha',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'boleto',
        beneficiario: 'Fornecedor E',
        referencia: 'FAT-005',
      });

      const resultado = marcarPagamentoComFalha(
        db,
        criar.payment_id!,
        'Banco recusou transação'
      );
      expect(resultado.sucesso).toBe(true);

      const pagamento = obterPagamento(db, criar.payment_id!);
      expect(pagamento?.status).toBe('falho');
      expect(pagamento?.ultimo_erro).toBe('Banco recusou transação');
    });

    it("deve registrar falhas múltiplas", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 900,
        descricao: 'Pagamento com múltiplas falhas',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'cartao_credito',
        beneficiario: 'Fornecedor F',
        referencia: 'FAT-006',
      });

      marcarPagamentoComFalha(db, criar.payment_id!, 'Erro 1');
      marcarPagamentoComFalha(db, criar.payment_id!, 'Erro 2');

      const pagamento = obterPagamento(db, criar.payment_id!);
      expect(pagamento?.tentativas).toBeGreaterThanOrEqual(2);
    });
  });

  describe("reconciliarPagamento", () => {
    it("deve reconciliar pagamento confirmado", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 2000,
        descricao: 'Pagamento para reconciliação',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'transferencia',
        beneficiario: 'Fornecedor G',
        referencia: 'FAT-007',
      });

      aprovarPagamento(db, criar.payment_id!);
      procesarPagamento(db, criar.payment_id!);
      confirmarPagamento(db, criar.payment_id!);

      const resultado = reconciliarPagamento(db, criar.payment_id!, 2000);
      expect(resultado.sucesso).toBe(true);
      expect(resultado.resultado?.status).toBe('reconciliado');
      expect(resultado.resultado?.diferenca).toBe(0);
    });

    it("deve detectar discrepâncias", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 5000,
        descricao: 'Pagamento com discrepância',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'pix',
        beneficiario: 'Fornecedor H',
        referencia: 'FAT-008',
      });

      aprovarPagamento(db, criar.payment_id!);
      procesarPagamento(db, criar.payment_id!);
      confirmarPagamento(db, criar.payment_id!);

      const resultado = reconciliarPagamento(db, criar.payment_id!, 4950);
      expect(resultado.sucesso).toBe(true);
      expect(resultado.resultado?.status).toBe('discrepancia');
      expect(resultado.resultado?.diferenca).toBe(-50);
    });

    it("deve usar valor esperado se nenhum valor realizado informado", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 3000,
        descricao: 'Pagamento sem valor informado',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'boleto',
        beneficiario: 'Fornecedor I',
        referencia: 'FAT-009',
      });

      aprovarPagamento(db, criar.payment_id!);
      procesarPagamento(db, criar.payment_id!);
      confirmarPagamento(db, criar.payment_id!);

      const resultado = reconciliarPagamento(db, criar.payment_id!);
      expect(resultado.sucesso).toBe(true);
      expect(resultado.resultado?.valor_realizado).toBe(3000);
      expect(resultado.resultado?.status).toBe('reconciliado');
    });
  });

  describe("obterPagamento", () => {
    it("deve retornar pagamento válido", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 1500,
        descricao: 'Pagamento para obter',
        tipo_pagamento: 'manutencao',
        metodo_pagamento: 'pix',
        beneficiario: 'Fornecedor J',
        referencia: 'FAT-010',
      });

      const pagamento = obterPagamento(db, criar.payment_id!);
      expect(pagamento).toBeDefined();
      expect(pagamento?.id).toBe(criar.payment_id);
      expect(pagamento?.valor).toBe(1500);
      expect(pagamento?.status).toBe('pendente');
    });

    it("deve retornar null para pagamento inexistente", () => {
      const pagamento = obterPagamento(db, 'PAG_INEXISTENTE');
      expect(pagamento).toBeNull();
    });
  });

  describe("obterPagamentosComFalha", () => {
    it("deve retornar pagamentos com falha", () => {
      // Criar pagamentos com falha
      for (let i = 0; i < 2; i++) {
        const criar = criarPagamento(db, {
          entidade_id,
          valor: 1000 + i * 100,
          descricao: `Pagamento falho ${i}`,
          tipo_pagamento: 'despesa',
          metodo_pagamento: 'transferencia',
          beneficiario: `Fornecedor ${i}`,
          referencia: `FAT-FAIL-${i}`,
        });
        marcarPagamentoComFalha(db, criar.payment_id!, `Erro ${i}`);
      }

      const pagamentosComFalha = obterPagamentosComFalha(db, entidade_id);
      expect(pagamentosComFalha.length).toBeGreaterThanOrEqual(2);
      expect(pagamentosComFalha.every((p) => p.status === 'falho')).toBe(true);
    });
  });

  describe("obterPagamentosAguardandoReconciliacao", () => {
    it("deve retornar pagamentos pagos mas não reconciliados", () => {
      // Criar e confirmar pagamento
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 2500,
        descricao: 'Pagamento aguardando reconciliação',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'pix',
        beneficiario: 'Fornecedor K',
        referencia: 'FAT-REC-001',
      });

      aprovarPagamento(db, criar.payment_id!);
      procesarPagamento(db, criar.payment_id!);
      confirmarPagamento(db, criar.payment_id!);

      const pagamentosAguardando = obterPagamentosAguardandoReconciliacao(
        db,
        entidade_id
      );
      expect(
        pagamentosAguardando.some((p) => p.id === criar.payment_id)
      ).toBe(true);
    });

    it("não deve retornar pagamentos já reconciliados", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 1800,
        descricao: 'Pagamento reconciliado',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'boleto',
        beneficiario: 'Fornecedor L',
        referencia: 'FAT-REC-002',
      });

      aprovarPagamento(db, criar.payment_id!);
      procesarPagamento(db, criar.payment_id!);
      confirmarPagamento(db, criar.payment_id!);
      reconciliarPagamento(db, criar.payment_id!, 1800);

      const pagamentosAguardando = obterPagamentosAguardandoReconciliacao(
        db,
        entidade_id
      );
      expect(
        pagamentosAguardando.some((p) => p.id === criar.payment_id)
      ).toBe(false);
    });
  });

  describe("obterHistoricoTentativas", () => {
    it("deve retornar histórico de tentativas", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 1400,
        descricao: 'Pagamento com histórico',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'cartao_credito',
        beneficiario: 'Fornecedor M',
        referencia: 'FAT-HIST-001',
      });

      aprovarPagamento(db, criar.payment_id!);
      procesarPagamento(db, criar.payment_id!);
      confirmarPagamento(db, criar.payment_id!);

      const historico = obterHistoricoTentativas(db, criar.payment_id!);
      expect(historico.length).toBeGreaterThan(0);
      expect(historico[0].payment_id).toBe(criar.payment_id);
    });
  });

  describe("obterResumoFinanceiro", () => {
    it("deve retornar resumo financeiro correto", () => {
      // Criar vários pagamentos em diferentes estados
      const criar1 = criarPagamento(db, {
        entidade_id,
        valor: 1000,
        descricao: 'Pagamento 1',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'pix',
        beneficiario: 'Forn 1',
        referencia: 'REF-RESUMO-1',
      });

      const criar2 = criarPagamento(db, {
        entidade_id,
        valor: 2000,
        descricao: 'Pagamento 2',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'transferencia',
        beneficiario: 'Forn 2',
        referencia: 'REF-RESUMO-2',
      });

      aprovarPagamento(db, criar2.payment_id!);
      procesarPagamento(db, criar2.payment_id!);
      confirmarPagamento(db, criar2.payment_id!);

      const resumo = obterResumoFinanceiro(db, entidade_id);
      expect(resumo).toHaveProperty('total_pendente');
      expect(resumo).toHaveProperty('total_em_processamento');
      expect(resumo).toHaveProperty('total_pago');
      expect(resumo).toHaveProperty('total_com_falha');
      expect(resumo).toHaveProperty('quantidade_reconciliadas');

      expect(resumo.total_pendente).toBeGreaterThanOrEqual(1000);
      expect(resumo.total_pago).toBeGreaterThanOrEqual(2000);
    });
  });

  describe("Testes Integrados de Fluxo Completo", () => {
    it("deve processar pagamento da criação até reconciliação", () => {
      // 1. Criar pagamento
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 5000,
        descricao: 'Pagamento completo',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'transferencia',
        beneficiario: 'Fornecedor Grande',
        referencia: 'FAT-COMPLETO-001',
      });
      expect(criar.sucesso).toBe(true);

      // 2. Aprovar
      const aprovar = aprovarPagamento(db, criar.payment_id!);
      expect(aprovar.sucesso).toBe(true);

      // 3. Processar
      const processar = procesarPagamento(db, criar.payment_id!);
      expect(processar.sucesso).toBe(true);

      // 4. Confirmar
      const confirmar = confirmarPagamento(db, criar.payment_id!);
      expect(confirmar.sucesso).toBe(true);

      // 5. Reconciliar
      const reconciliar = reconciliarPagamento(db, criar.payment_id!, 5000);
      expect(reconciliar.sucesso).toBe(true);
      expect(reconciliar.resultado?.status).toBe('reconciliado');

      // 6. Verificar estado final
      const pagamento = obterPagamento(db, criar.payment_id!);
      expect(pagamento?.status).toBe('pago');
      expect(pagamento?.reconciliacao_status).toBe('reconciliado');
    });

    it("deve processar múltiplos pagamentos paralelos", () => {
      const payment_ids: string[] = [];

      // Criar 5 pagamentos
      for (let i = 1; i <= 5; i++) {
        const criar = criarPagamento(db, {
          entidade_id,
          valor: 1000 * i,
          descricao: `Pagamento paralelo ${i}`,
          tipo_pagamento: 'despesa',
          metodo_pagamento: 'pix',
          beneficiario: `Fornecedor ${i}`,
          referencia: `FAT-PARA-${i}`,
        });
        payment_ids.push(criar.payment_id!);
      }

      // Aprovar todos
      payment_ids.forEach((id) => aprovarPagamento(db, id));

      // Processar todos
      payment_ids.forEach((id) => procesarPagamento(db, id));

      // Confirmar todos
      payment_ids.forEach((id) => confirmarPagamento(db, id));

      // Verificar
      const resumo = obterResumoFinanceiro(db, entidade_id);
      expect(resumo.total_pago).toBeGreaterThanOrEqual(15000); // 1000+2000+3000+4000+5000
    });

    it("deve recuperar de falhas e reprocessar", () => {
      const criar = criarPagamento(db, {
        entidade_id,
        valor: 3000,
        descricao: 'Pagamento com falha e recuperação',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'boleto',
        beneficiario: 'Fornecedor Recuperável',
        referencia: 'FAT-RECOV-001',
      });

      aprovarPagamento(db, criar.payment_id!);
      procesarPagamento(db, criar.payment_id!);

      // Falha na confirmação
      marcarPagamentoComFalha(db, criar.payment_id!, 'Erro temporário');

      let pagamento = obterPagamento(db, criar.payment_id!);
      expect(pagamento?.status).toBe('falho');

      // Tentar novamente
      const criar2 = criarPagamento(db, {
        entidade_id,
        valor: 3000,
        descricao: 'Reprocessamento de pagamento',
        tipo_pagamento: 'despesa',
        metodo_pagamento: 'pix',
        beneficiario: 'Fornecedor Recuperável',
        referencia: 'FAT-RECOV-RETRY',
      });

      aprovarPagamento(db, criar2.payment_id!);
      procesarPagamento(db, criar2.payment_id!);
      confirmarPagamento(db, criar2.payment_id!);

      pagamento = obterPagamento(db, criar2.payment_id!);
      expect(pagamento?.status).toBe('pago');
    });
  });
});
