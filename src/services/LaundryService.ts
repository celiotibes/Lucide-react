import { UUID, randomUUID } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { LaundryFranchise, LaundryPackage, LaundryCycle, LaundryViolation, LaundryMonthlyReport } from '../types/laundry';
import { AuditService } from './AuditService';

export class LaundryService {
  private readonly CYCLES_PER_WEEK = 2;
  private readonly WEEKS_PER_MONTH = 4.3;
  private readonly PACKAGES = {
    p2: { cycles: 2, price: 25.0 },
    p4: { cycles: 4, price: 40.0 },
    p6: { cycles: 6, price: 55.0 },
    p10: { cycles: 10, price: 75.0 },
  };

  private auditService: AuditService;

  constructor(private supabase: SupabaseClient) {
    this.auditService = new AuditService(supabase);
  }

  /**
   * Criar nova franquia de lavanderia para um contrato
   * Requisito: Anexo III item 6 - 2 ciclos/semana por morador
   */
  async createFranchise(leaseId: UUID, residentCount: number): Promise<LaundryFranchise> {
    const cyclesPerMonth = Math.round(this.CYCLES_PER_WEEK * this.WEEKS_PER_MONTH * residentCount);
    const now = new Date();

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

      created_at: now,
      updated_at: now,
    };

    // Persistir no banco de dados
    const { error } = await this.supabase
      .from('laundry_franchises')
      .insert([franchise]);

    if (error) {
      console.error('Failed to create laundry franchise:', error);
      throw new Error(`Database insert failed: ${error.message}`);
    }

    // Registrar no audit log
    await this.logAudit(franchise.id, 'laundry_franchise_created', {
      lease_id: leaseId,
      resident_count: residentCount,
      cycles_per_month: cyclesPerMonth,
    });

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
    const now = new Date();
    const isExtra = franchise.cycles_used_this_month >= franchise.cycles_per_month_included;

    const cycle: LaundryCycle = {
      id: randomUUID(),
      franchise_id: franchise.id,
      cycle_timestamp: now,
      resident_name: residentName,
      package_source: isExtra ? 'extra' : 'included',
      cycle_duration_minutes: 40,
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
      franchise.alert_sent_date = now;
    }

    franchise.updated_at = now;

    // Inserir ciclo no banco de dados
    const { error: cycleError } = await this.supabase
      .from('laundry_cycles')
      .insert([cycle]);

    if (cycleError) {
      console.error('Failed to record cycle:', cycleError);
      throw new Error(`Database insert failed: ${cycleError.message}`);
    }

    // Atualizar franchise
    const { error: franchiseError } = await this.supabase
      .from('laundry_franchises')
      .update({
        cycles_used_this_month: franchise.cycles_used_this_month,
        remaining_cycles: franchise.remaining_cycles,
        alert_80_percent_sent: franchise.alert_80_percent_sent,
        alert_sent_date: franchise.alert_sent_date,
        updated_at: now,
      })
      .eq('id', franchise.id);

    if (franchiseError) {
      console.error('Failed to update franchise:', franchiseError);
      throw new Error(`Database update failed: ${franchiseError.message}`);
    }

    // Registrar no audit log
    await this.logAudit(franchise.id, 'laundry_cycle_recorded', {
      resident_name: residentName,
      package_source: isExtra ? 'extra' : 'included',
      machine_id: machineId,
    });

    return { cycle, franchise };
  }

  /**
   * Vender pacote extra (R$ 25, 40, 55 ou 75)
   */
  async purchaseExtraPackage(
    franchise: LaundryFranchise,
    packageType: keyof typeof this.PACKAGES
  ): Promise<LaundryPackage> {
    const now = new Date();
    const pkg = this.PACKAGES[packageType];

    const package_obj: LaundryPackage = {
      id: randomUUID(),
      franchise_id: franchise.id,
      package_type: packageType as 'p2' | 'p4' | 'p6' | 'p10',
      cycles_included: pkg.cycles,
      price_brl: pkg.price,
      purchase_date: now,
      payment_status: 'pending',
      cycles_used: 0,
    };

    franchise.extra_packages.push(package_obj);
    franchise.total_cycles_available += pkg.cycles;
    franchise.updated_at = now;

    // Inserir pacote no banco de dados
    const { error: pkgError } = await this.supabase
      .from('laundry_packages')
      .insert([package_obj]);

    if (pkgError) {
      console.error('Failed to purchase package:', pkgError);
      throw new Error(`Database insert failed: ${pkgError.message}`);
    }

    // Atualizar total_cycles_available na franchise
    const { error: franchiseError } = await this.supabase
      .from('laundry_franchises')
      .update({
        total_cycles_available: franchise.total_cycles_available,
        updated_at: now,
      })
      .eq('id', franchise.id);

    if (franchiseError) {
      console.error('Failed to update franchise:', franchiseError);
      throw new Error(`Database update failed: ${franchiseError.message}`);
    }

    // Registrar no audit log
    await this.logAudit(franchise.id, 'laundry_package_purchased', {
      package_type: packageType,
      cycles_included: pkg.cycles,
      price_brl: pkg.price,
    });

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
    const now = new Date();
    const fineAmount = aluguelEfetivo * 0.1;

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
    franchise.updated_at = now;

    // Inserir violação no banco de dados
    const { error: violationError } = await this.supabase
      .from('laundry_violations')
      .insert([violation]);

    if (violationError) {
      console.error('Failed to record violation:', violationError);
      throw new Error(`Database insert failed: ${violationError.message}`);
    }

    // Atualizar franchise
    const { error: franchiseError } = await this.supabase
      .from('laundry_franchises')
      .update({
        updated_at: now,
      })
      .eq('id', franchise.id);

    if (franchiseError) {
      console.error('Failed to update franchise:', franchiseError);
      throw new Error(`Database update failed: ${franchiseError.message}`);
    }

    // Registrar no audit log
    await this.logAudit(franchise.id, 'laundry_violation_recorded', {
      violation_type: 'neighbor_laundry',
      fine_amount_brl: fineAmount,
      description,
    });

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

  /**
   * Registrar ação no audit log com hash chain (Lei 12.682/2012)
   */
  private async logAudit(
    franchiseId: string,
    action: string,
    metadata: Record<string, any>
  ): Promise<void> {
    try {
      const eventData = JSON.stringify({ franchiseId, action, metadata, timestamp: new Date() });
      const hash = createHash('sha256').update(eventData).digest('hex');

      const { data: lastLog } = await this.supabase
        .from('audit_logs')
        .select('hash')
        .eq('entity_id', franchiseId)
        .order('created_at', { ascending: false })
        .limit(1);

      const previousHash = lastLog && lastLog.length > 0 ? lastLog[0].hash : null;

      const { error } = await this.supabase
        .from('audit_logs')
        .insert([{
          id: randomUUID(),
          entity_id: franchiseId,
          entity_type: 'laundry_franchise',
          action,
          metadata,
          hash,
          previous_hash: previousHash,
          created_at: new Date(),
        }]);

      if (error) {
        console.error('Failed to log audit event:', error);
      }
    } catch (error) {
      console.error('Error in logAudit:', error);
    }
  }
}
