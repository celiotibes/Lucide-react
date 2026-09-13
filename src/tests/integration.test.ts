/**
 * Testes de Integração - Sistema CRMT com Dados Reais
 * Referência: Contrato Kitnet 02 Pottker, assinado 29/08/2026
 * Inquilino: Gustavo Pereira Natal
 */

import { UUID, randomUUID } from 'crypto';
import { InspectionService } from '../services/InspectionService';
import { LaundryService } from '../services/LaundryService';
import { OccupancyService } from '../services/OccupancyService';
import { CriticalDatesService } from '../services/CriticalDatesService';

// Dados reais do contrato
const KITNET_02_POTTKER = {
  propertyId: randomUUID(),
  leaseId: randomUUID(),
  inquilino: 'Gustavo Pereira Natal',
  aluguel_efetivo: 846.45, // 55% de R$ 1.539
  cota_custeio: 692.55, // 45% de R$ 1.539
  valor_total: 1539.0,
  caucao: 1539.0,
  data_assinatura: new Date('2026-08-29'),
  data_vencimento: new Date('2026-09-10'),
  data_termino: new Date('2027-08-28'),
  franquia_hidrica: { interno: 4.5, lavanderia: 1.3, total: 5.8 },
  ciclos_lavanderia_inclusos: 2, // por semana
  max_occupants: 2,
  residente_count: 1,
};

describe('CRMT - Testes de Integração (Dados Reais)', () => {
  let inspectionService: InspectionService;
  let laundryService: LaundryService;
  let occupancyService: OccupancyService;
  let criticalDatesService: CriticalDatesService;

  beforeEach(() => {
    inspectionService = new InspectionService();
    laundryService = new LaundryService();
    occupancyService = new OccupancyService();
    criticalDatesService = new CriticalDatesService();
  });

  describe('1️⃣ VISTORIA ELETRÔNICA', () => {
    test('Criar vistoria com vídeo HD', async () => {
      const inspection = await inspectionService.createInspection(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.propertyId,
        's3://crmt-videos/kitnet-02-2026-08-29.mp4',
        120, // 120 MB
        180, // 3 minutos
        'locador@crmt.com'
      );

      expect(inspection).toBeDefined();
      expect(inspection.video_url).toContain('s3://');
      expect(inspection.status).toBe('pending');
      expect(inspection.uploaded_at).toBeDefined();
    });

    test('Validar qualidade de vídeo HD', async () => {
      const isValid = inspectionService.validateVideoQuality(120, 180);
      expect(isValid).toBe(true);

      const isInvalid = inspectionService.validateVideoQuality(10, 10);
      expect(isInvalid).toBe(false);
    });

    test('Prazos críticos da vistoria', async () => {
      const inspection = await inspectionService.createInspection(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.propertyId,
        's3://kitnet-02-initial.mp4',
        150,
        200,
        'locador@crmt.com'
      );

      // Anexo II - Prazos críticos
      const daysBetweenUploadAndChallenge = Math.floor(
        (inspection.deadline_challenge_date.getTime() - inspection.uploaded_at.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysBetweenUploadAndChallenge).toBe(7);

      const daysBetweenUploadAndReturn = Math.floor(
        (inspection.deadline_return_deposit_date.getTime() - inspection.uploaded_at.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysBetweenUploadAndReturn).toBe(10);
    });

    test('Calcular redução de caução por dano', async () => {
      const propertyAge = 5; // 5 anos
      const damageValue = 500; // R$ 500 em danos
      const reduction = inspectionService.calculateDepositReduction(
        KITNET_02_POTTKER.caucao,
        damageValue,
        propertyAge
      );

      expect(reduction).toBeGreaterThan(0);
      expect(reduction).toBeLessThanOrEqual(damageValue);
      console.log(`Redução de caução: R$ ${reduction.toFixed(2)}`);
    });
  });

  describe('2️⃣ FRANQUIA DE LAVANDERIA', () => {
    test('Criar franquia de lavanderia (Anexo III)', async () => {
      const franchise = await laundryService.createFranchise(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.residente_count
      );

      expect(franchise).toBeDefined();
      expect(franchise.cycles_per_week_included).toBe(2); // Contratualmente
      expect(franchise.resident_count).toBe(1);
      // 2 ciclos/semana × 4.3 semanas = ~8-9 ciclos/mês
      expect(franchise.cycles_per_month_included).toBeGreaterThanOrEqual(8);
    });

    test('Registrar ciclos de lavanderia', async () => {
      const franchise = await laundryService.createFranchise(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.residente_count
      );

      // Cenário: Morador usa 11 ciclos (dentro do mês)
      const initialCycles = franchise.cycles_per_month_included;

      const { cycle: c1, franchise: f1 } = await laundryService.recordCycle(
        franchise,
        KITNET_02_POTTKER.inquilino
      );
      expect(c1.package_source).toBe('included');
      expect(f1.cycles_used_this_month).toBe(1);

      // Usar todos os ciclos inclusos + 2 extras
      for (let i = 1; i < initialCycles + 2; i++) {
        const { franchise: updated } = await laundryService.recordCycle(
          f1,
          KITNET_02_POTTKER.inquilino
        );
        Object.assign(f1, updated);
      }

      expect(f1.cycles_used_this_month).toBe(initialCycles + 2);
    });

    test('Vender pacote extra (R$ 25)', async () => {
      const franchise = await laundryService.createFranchise(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.residente_count
      );

      const pkg = await laundryService.purchaseExtraPackage(franchise, 'p2');

      expect(pkg.price_brl).toBe(25.0);
      expect(pkg.cycles_included).toBe(2);
      expect(franchise.total_cycles_available).toBeGreaterThan(franchise.cycles_per_month_included);
    });

    test('Registrar violação (uso lavanderia vizinha)', async () => {
      const franchise = await laundryService.createFranchise(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.residente_count
      );

      const violation = await laundryService.recordViolation(
        franchise,
        KITNET_02_POTTKER.aluguel_efetivo,
        new Date(),
        'Uso de máquina do vizinho',
        'prova-fotografia.jpg'
      );

      // Multa: 10% do aluguel efetivo
      const expectedFine = KITNET_02_POTTKER.aluguel_efetivo * 0.1;
      expect(violation.fine_amount_brl).toBe(expectedFine);
      console.log(`Multa por violação: R$ ${violation.fine_amount_brl.toFixed(2)}`);
    });

    test('Relatório mensal de lavanderia', async () => {
      const franchise = await laundryService.createFranchise(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.residente_count
      );

      franchise.cycles_used_this_month = 10;

      const report = laundryService.generateMonthlyReport(franchise, 9, 2026);

      expect(report).toBeDefined();
      expect(report.included_cycles_used).toBeGreaterThan(0);
      console.log(`Relatório: ${report.notes}`);
    });
  });

  describe('3️⃣ REGRAS DE OCUPAÇÃO', () => {
    test('Criar regras de ocupação', async () => {
      const rules = await occupancyService.createOccupancyRules(
        KITNET_02_POTTKER.propertyId,
        KITNET_02_POTTKER.max_occupants
      );

      expect(rules.allow_airbnb).toBe(false);
      expect(rules.allow_booking).toBe(false);
      expect(rules.allow_sublet).toBe(false);
      expect(rules.violation_fine_percentage).toBe(10);
    });

    test('Registrar ocupante (inquilino)', async () => {
      const occupant = await occupancyService.registerOccupant(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.inquilino,
        '12345678900', // CPF fictício
        'primary',
        's3://docs/gustavo-rg.jpg',
        KITNET_02_POTTKER.data_assinatura,
        '41-99999999'
      );

      expect(occupant).toBeDefined();
      expect(occupant?.name).toBe(KITNET_02_POTTKER.inquilino);
      expect(occupant?.role).toBe('primary');
    });

    test('Validar limite de ocupação', async () => {
      const occupants = [
        await occupancyService.registerOccupant(
          KITNET_02_POTTKER.leaseId,
          KITNET_02_POTTKER.inquilino,
          '12345678900',
          'primary',
          's3://gustavo-rg.jpg',
          KITNET_02_POTTKER.data_assinatura
        ),
      ];

      const isValid = occupancyService.validateOccupantLimit(
        occupants as any,
        KITNET_02_POTTKER.max_occupants
      );
      expect(isValid).toBe(true);
    });

    test('Reportar violação (AirBnB detectado)', async () => {
      const violation = await occupancyService.reportViolation(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.propertyId,
        KITNET_02_POTTKER.aluguel_efetivo,
        'airbnb',
        'https://airbnb.com/rooms/12345',
        'airbnb_api'
      );

      const expectedFine = KITNET_02_POTTKER.aluguel_efetivo * 0.1;
      expect(violation.fine_amount_brl).toBe(expectedFine);
      expect(violation.verified).toBe(false);
      console.log(`Multa por AirBnB: R$ ${violation.fine_amount_brl.toFixed(2)}`);
    });
  });

  describe('4️⃣ PRAZOS CRÍTICOS AUTOMATIZADOS', () => {
    test('Criar ciclo de pagamento', async () => {
      const cycle = await criticalDatesService.createPaymentCycle(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.propertyId,
        9, // setembro
        2026,
        KITNET_02_POTTKER.aluguel_efetivo,
        KITNET_02_POTTKER.cota_custeio
      );

      expect(cycle).toBeDefined();
      expect(cycle.due_date.getDate()).toBe(10); // Vencimento dia 10
      expect(cycle.value_brl).toBe(KITNET_02_POTTKER.valor_total);
      expect(cycle.payment_status).toBe('on_time');
    });

    test('Notificação de vencimento (dia 10)', async () => {
      const cycle = await criticalDatesService.createPaymentCycle(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.propertyId,
        9,
        2026,
        KITNET_02_POTTKER.aluguel_efetivo,
        KITNET_02_POTTKER.cota_custeio
      );

      const notification = await criticalDatesService.scheduleDay10Notification(
        cycle,
        KITNET_02_POTTKER.inquilino + '@email.com'
      );

      expect(notification.notification_type).toBe('due_date');
      expect(cycle.day_10_notification_sent).toBe(true);
    });

    test('Atraso de 30 dias - Registrar em SPC/SERASA', async () => {
      const cycle = await criticalDatesService.createPaymentCycle(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.propertyId,
        9,
        2026,
        KITNET_02_POTTKER.aluguel_efetivo,
        KITNET_02_POTTKER.cota_custeio
      );

      // Simular pagamento não recebido por 30+ dias
      const lateDate = new Date(cycle.due_date);
      lateDate.setDate(lateDate.getDate() + 30);

      const notification = await criticalDatesService.processDay30Late(cycle);

      expect(cycle.payment_status).toBe('late_30d');
      expect(cycle.day_30_serasa_registered).toBe(true);
      expect(notification.notification_type).toBe('late_30d_serasa');
      expect(notification.channel).toBe('sms'); // SMS urgente

      const lateFee = criticalDatesService.calculateLateFee(cycle.value_brl, 30);
      console.log(`Multa por atraso (30 dias): R$ ${lateFee.toFixed(2)}`);
    });

    test('Atraso de 40 dias - Ação de execução', async () => {
      const cycle = await criticalDatesService.createPaymentCycle(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.propertyId,
        9,
        2026,
        KITNET_02_POTTKER.aluguel_efetivo,
        KITNET_02_POTTKER.cota_custeio
      );

      const action = await criticalDatesService.processDay40Execution(cycle);

      expect(cycle.day_40_collection_action_initiated).toBe(true);
      expect(action.action_type).toBe('judicial');
      expect(action.notification_method).toBe('notary');
    });

    test('Ciclo completo de pagamento', async () => {
      const cycle = await criticalDatesService.createPaymentCycle(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.propertyId,
        9,
        2026,
        KITNET_02_POTTKER.aluguel_efetivo,
        KITNET_02_POTTKER.cota_custeio
      );

      // Dia 10: Notificação
      await criticalDatesService.scheduleDay10Notification(cycle, 'inquilino@email.com');

      // Dia 15: Pagamento recebido
      const paymentDate = new Date(cycle.due_date);
      paymentDate.setDate(paymentDate.getDate() + 5);

      const finalCycle = await criticalDatesService.processPaymentReceived(
        cycle,
        cycle.value_brl,
        paymentDate
      );

      expect(finalCycle.payment_status).toBe('collected');
      expect(finalCycle.payment_received_date).toBeDefined();
      expect(finalCycle.days_late).toBe(5);

      const status = criticalDatesService.getPaymentStatus(finalCycle);
      console.log(`Status do pagamento: ${status}`);
    });
  });

  describe('🔄 CENÁRIO COMPLETO DE CONTRATO', () => {
    test('Fluxo completo: Vistoria + Ocupação + Lavanderia + Pagamento', async () => {
      // 1. VISTORIA INICIAL
      const inspection = await inspectionService.createInspection(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.propertyId,
        's3://kitnet-02-initial-2026-08-29.mp4',
        150,
        240,
        'locador@crmt.com'
      );
      console.log(`✅ Vistoria criada: ${inspection.id}`);

      // 2. OCUPAÇÃO VALIDADA
      const rules = await occupancyService.createOccupancyRules(
        KITNET_02_POTTKER.propertyId,
        KITNET_02_POTTKER.max_occupants
      );
      const occupant = await occupancyService.registerOccupant(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.inquilino,
        '12345678900',
        'primary',
        's3://rg.jpg',
        KITNET_02_POTTKER.data_assinatura
      );
      console.log(`✅ Ocupação validada: ${occupant?.name}`);

      // 3. FRANQUIA DE LAVANDERIA
      const franchise = await laundryService.createFranchise(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.residente_count
      );
      console.log(
        `✅ Franquia de lavanderia: ${franchise.cycles_per_month_included} ciclos/mês inclusos`
      );

      // 4. PAGAMENTO MÊS 1
      const cycle1 = await criticalDatesService.createPaymentCycle(
        KITNET_02_POTTKER.leaseId,
        KITNET_02_POTTKER.propertyId,
        9,
        2026,
        KITNET_02_POTTKER.aluguel_efetivo,
        KITNET_02_POTTKER.cota_custeio
      );

      const paidCycle = await criticalDatesService.processPaymentReceived(
        cycle1,
        cycle1.value_brl,
        KITNET_02_POTTKER.data_vencimento
      );
      console.log(`✅ Pagamento septembropago: R$ ${paidCycle.payment_amount_received}`);

      expect(inspection).toBeDefined();
      expect(rules).toBeDefined();
      expect(franchise).toBeDefined();
      expect(paidCycle.payment_status).toBe('collected');
    });
  });
});
