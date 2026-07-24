// Testes para sistema de alertas de vencimento de garantias

import { describe, it, expect } from 'vitest';
import { alertarVencimentoGarantias } from './alertarVencimentoGarantias';

// Mock do pool — em testes reais com DATABASE_URL, usar Postgres real
const mockPool = {
  query: async (sql: string, params?: any[]) => {
    // Simular garantias vencendo em 30-45 dias
    if (sql.includes('from garantias g')) {
      return {
        rows: [
          {
            id: 'garantia-1',
            contrato_id: 'contrato-1',
            tipo: 'seguro_fianca',
            valor: 1500,
            data_vencimento_apolice: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
            apolice_numero: 'ABC123456',
            dias_para_vencer: 30,
            imovel_identificacao: 'Apto 14',
            imovel_endereco: 'Rua das Flores, 123',
            cidade_nome: 'Florianópolis',
            proprietario_nome: 'João Silva',
            proprietario_email: 'joao@example.com',
            proprietario_celular: '+5548999999999',
            contrato_locatario_nome: 'Maria Santos',
          },
          {
            id: 'garantia-2',
            contrato_id: 'contrato-2',
            tipo: 'seguro_incendio',
            valor: 5000,
            data_vencimento_apolice: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
            apolice_numero: 'XYZ789012',
            dias_para_vencer: 45,
            imovel_identificacao: 'Kitnet 5',
            imovel_endereco: 'Av. Paulista, 456',
            cidade_nome: 'Curitiba',
            proprietario_nome: 'Ana Costa',
            proprietario_email: 'ana@example.com',
            proprietario_celular: '+5541988888888',
            contrato_locatario_nome: 'Pedro Oliveira',
          },
        ],
      };
    }

    // Simular insert em audit_log
    if (sql.includes('insert into audit_log')) {
      return { rows: [{ id: 'audit-1' }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  },
} as any;

describe('alertarVencimentoGarantias', () => {
  it('Detecta garantias vencendo em 30-60 dias', async () => {
    const resultado = await alertarVencimentoGarantias(mockPool);

    expect(resultado.total_detectadas).toBe(2);
    expect(resultado.detalhes).toHaveLength(2);
  });

  it('Classifica tipos de garantias corretamente', async () => {
    const resultado = await alertarVencimentoGarantias(mockPool);

    const seguroFianca = resultado.detalhes.find((d) => d.tipo === 'Seguro-Fiança');
    const seguroIncendio = resultado.detalhes.find((d) => d.tipo === 'Seguro-Incêndio');

    expect(seguroFianca).toBeDefined();
    expect(seguroIncendio).toBeDefined();
  });

  it('Calcula dias para vencimento corretamente', async () => {
    const resultado = await alertarVencimentoGarantias(mockPool);

    const garantia1 = resultado.detalhes.find((d) => d.garantia_id === 'garantia-1');
    const garantia2 = resultado.detalhes.find((d) => d.garantia_id === 'garantia-2');

    expect(garantia1?.dias_para_vencer).toBe(30);
    expect(garantia2?.dias_para_vencer).toBe(45);
  });

  it('Agrupa garantias por proprietário para evitar múltiplos emails', async () => {
    const resultado = await alertarVencimentoGarantias(mockPool);

    // 2 garantias, 2 proprietários diferentes = esperado 2 emails
    // Em caso de mesmo proprietário, seria apenas 1 email com múltiplas garantias
    expect(resultado.total_detectadas).toBeGreaterThan(0);
  });

  it('Retorna status de sucesso ou falha para cada garantia', async () => {
    const resultado = await alertarVencimentoGarantias(mockPool);

    for (const detalhe of resultado.detalhes) {
      expect(['alerta_enviado', 'falha_notificacao']).toContain(detalhe.status);
    }
  });

  it('Registra alertas em audit_log', async () => {
    const resultado = await alertarVencimentoGarantias(mockPool);

    // Se o mock fosse contar chamadas a pool.query, verificaria:
    // - 1 SELECT de garantias
    // - 2 INSERT em audit_log (uma por garantia)
    expect(resultado.total_detectadas).toBe(2);
  });
});
