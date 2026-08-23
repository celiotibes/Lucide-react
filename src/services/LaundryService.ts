import { UUID, randomUUID } from 'crypto';
import { LaundryFranchise, LaundryPackage, LaundryCycle, LaundryViolation, LaundryMonthlyReport } from '../types/laundry';

export class LaundryService {
  private readonly CYCLES_PER_WEEK = 2; // Contratualmente 2 ciclos/semana inclusos
  private readonly WEEKS_PER_MONTH = 4.3;
  private readonly PACKAGES = {
    p2: { cycles: 2, price: 25.0 },
    p4: { cycles: 4, price: 40.0 },
    p6: { cycles: 6, price: 55.0 },
    p10: { cycles: 10, price: 75.0 },
  };

  /**
   * Criar nova franquia de lavanderia para um contrato
   * Requisito: Anexo III item 6 - 2 ciclos/semana por morador
   */
  async createFranchise(leaseId: UUID, residentCount: number): Promise<LaundryFranchise> {
    const cyclesPerMonth = Math.round(this.CYCLES_PER_WEEK * this.WEEKS_PER_MONTH * residentCount);

    const franchise: LaundryFranchise = {
      id: randomUUID(),
      lease_id: leaseId,
      resident_count: residentCount,

      cycles_per_week_included: this.CYCLES_PER_WEEK,
      cycles_per_month_included: cyclesPerMonth,

      cycles_used_this_month: 0,
      cycles_used_this_year: [],

      extra_packages: [],
      violations: [],

      total_cycles_available: cyclesPerMonth,
      remaining_cycles: cyclesPerMonth,
      alert_80_percent_sent: false,

      created_at: new Date(),
      updated_at: new Date(),
    };

    return franchise;
  }

  /**
   * Registrar uso de ciclo de lavanderia
   */
  async recordCycle(
    franchise: LaundryFranchise,
    residentName: string,
    machineId?: string
  ): Promise<{ cycle: LaundryCycle; franchise: LaundryFranchise }> {
    // Determinar se é ciclo incluído ou extra
    const cyclesAvailable = franchise.total_cycles_available - franchise.cycles_used_this_month;
    const isExtra = franchise.cycles_used_this_month >= franchise.cycles_per_month_included;

    const cycle: LaundryCycle = {
      id: randomUUID(),
      franchise_id: franchise.id,
      cycle_timestamp: new Date(),
      resident_name: residentName,
      package_source: isExtra ? 'extra' : 'included',
      cycle_duration_minutes: 40, // Típico
      machine_id: machineId,
      audit_log_id: randomUUID(),
    };

    // Atualizar contadores
    franchise.cycles_used_this_month += 1;
    franchise.remaining_cycles = franchise.total_cycles_available - franchise.cycles_used_this_month;

    // Verificar alerta 80%
    const usagePercentage = (franchise.cycles_used_this_month / franchise.cycles_per_month_included) * 100;
    if (usagePercentage >= 80 && !franchise.alert_80_percent_sent) {
      franchise.alert_80_percent_sent = true;
      franchise.alert_sent_date = new Date();
      // TODO: Enviar alerta via email/WhatsApp
    }

    franchise.updated_at = new Date();

    return { cycle, franchise };
  }

  /**
   * Vender pacote extra (R$ 25, 40, 55 ou 75)
   */
  async purchaseExtraPackage(
    franchise: LaundryFranchise,
    packageType: keyof typeof this.PACKAGES
  ): Promise<LaundryPackage> {
    const pkg = this.PACKAGES[packageType];

    const package_obj: LaundryPackage = {
      id: randomUUID(),
      franchise_id: franchise.id,
      package_type: packageType as 'p2' | 'p4' | 'p6' | 'p10',
      cycles_included: pkg.cycles,
      price_brl: pkg.price,
      purchase_date: new Date(),
      payment_status: 'pending',
      cycles_used: 0,
    };

    franchise.extra_packages.push(package_obj);
    franchise.total_cycles_available += pkg.cycles;

    // TODO: Integrar com Asaas para cobrar automaticamente

    franchise.updated_at = new Date();

    return package_obj;
  }

  /**
   * Registrar violação (uso de lavanderia vizinha)
   * Penalidade: 10% do aluguel efetivo
   */
  async recordViolation(
    franchise: LaundryFranchise,
    aluguelEfetivo: number,
    violationDate: Date,
    description: string,
    evidenceUrl?: string
  ): Promise<LaundryViolation> {
    const fineAmount = aluguelEfetivo * 0.1; // 10%

    const violation: LaundryViolation = {
      id: randomUUID(),
      franchise_id: franchise.id,
      violation_type: 'neighbor_laundry',
      violation_date: violationDate,
      description,
      evidence_url: evidenceUrl,
      fine_amount_brl: fineAmount,
      fine_status: 'pending',
      audit_log_id: randomUUID(),
    };

    franchise.violations.push(violation);
    franchise.updated_at = new Date();

    // TODO: Notificar inquilino e locador
    // TODO: Agendar aplicação de multa na próxima fatura

    return violation;
  }

  /**
   * Aplicar multa à fatura mensal
   */
  applyViolationFine(franchise: LaundryFranchise): number {
    const pendingFines = franchise.violations
      .filter((v) => v.fine_status === 'pending')
      .reduce((sum, v) => sum + v.fine_amount_brl, 0);

    // Atualizar status das multas
    franchise.violations
      .filter((v) => v.fine_status === 'pending')
      .forEach((v) => {
        v.fine_status = 'applied';
        v.fine_applied_date = new Date();
      });

    franchise.updated_at = new Date();

    return pendingFines;
  }

  /**
   * Gerar relatório mensal de lavanderia
   */
  generateMonthlyReport(franchise: LaundryFranchise, month: number, year: number): LaundryMonthlyReport {
    const extraCost = franchise.extra_packages
      .filter((p) => p.payment_status === 'paid')
      .reduce((sum, p) => sum + p.price_brl, 0);

    const violationsFine = this.applyViolationFine(franchise);

    const report: LaundryMonthlyReport = {
      id: randomUUID(),
      franchise_id: franchise.id,
      month,
      year,

      included_cycles_available: franchise.cycles_per_month_included,
      included_cycles_used: Math.min(franchise.cycles_used_this_month, franchise.cycles_per_month_included),

      extra_cycles_purchased: franchise.extra_packages.reduce((sum, p) => sum + p.cycles_included, 0),
      extra_cycles_used: franchise.extra_packages.reduce((sum, p) => sum + p.cycles_used, 0),
      extra_packages_cost: extraCost,

      violations_count: franchise.violations.length,
      violations_fine_total: violationsFine,

      total_charge: extraCost + violationsFine,
      notes: this.generateReportNotes(franchise),

      generated_at: new Date(),
    };

    return report;
  }

  /**
   * Gerar notas descritivas do relatório
   */
  private generateReportNotes(franchise: LaundryFranchise): string {
    const usagePercentage = (franchise.cycles_used_this_month / franchise.cycles_per_month_included) * 100;
    const notes: string[] = [];

    if (usagePercentage > 100) {
      notes.push(`⚠️ Excesso de ciclos: ${Math.round(usagePercentage - 100)}% acima do limite incluído.`);
    }

    if (franchise.violations.length > 0) {
      notes.push(`🔴 Violações detectadas: ${franchise.violations.length} caso(s).`);
    }

    if (!notes.length) {
      notes.push('✅ Uso dentro do contrato. Nenhuma cobrar adicional.');
    }

    return notes.join(' ');
  }

  /**
   * Verificar se há saldo de ciclos disponíveis
   */
  hasAvailableCycles(franchise: LaundryFranchise): boolean {
    return franchise.remaining_cycles > 0;
  }

  /**
   * Calcular percentual de uso
   */
  getUsagePercentage(franchise: LaundryFranchise): number {
    return (franchise.cycles_used_this_month / franchise.cycles_per_month_included) * 100;
  }
}
