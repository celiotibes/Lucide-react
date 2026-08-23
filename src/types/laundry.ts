import { UUID } from 'crypto';

export type LaundryPackageType = 'p2' | 'p4' | 'p6' | 'p10';
export type LaundryViolationType = 'neighbor_laundry' | 'unauthorized_use';

export interface LaundryFranchise {
  id: UUID;
  lease_id: UUID;
  resident_count: number;

  // Ciclos inclusos por semana (contratualmente 2 ciclos/semana)
  cycles_per_week_included: number; // 2
  cycles_per_month_included: number; // 2 * 4.3 = 8.6, arredonda pra 9

  // Consumo atual
  cycles_used_this_month: number;
  cycles_used_this_year: { month: number; year: number; count: number }[];

  // Pacotes extras adicionados
  extra_packages: LaundryPackage[];

  // Violações
  violations: LaundryViolation[];

  // Totalizadores
  total_cycles_available: number; // included + extras
  remaining_cycles: number;
  alert_80_percent_sent: boolean;
  alert_sent_date?: Date;

  created_at: Date;
  updated_at: Date;
}

export interface LaundryPackage {
  id: UUID;
  franchise_id: UUID;
  package_type: LaundryPackageType;
  cycles_included: number; // 2, 4, 6, 10
  price_brl: number; // 25, 40, 55, 75
  purchase_date: Date;
  payment_status: 'pending' | 'paid' | 'failed';
  asaas_charge_id?: string;
  cycles_used: number;
}

export interface LaundryCycle {
  id: UUID;
  franchise_id: UUID;
  cycle_timestamp: Date;
  resident_name: string;
  package_source: 'included' | 'extra';
  cycle_duration_minutes: number;

  // Para detecção de uso não autorizado
  machine_id?: string;
  building_location?: string;

  audit_log_id: UUID;
}

export interface LaundryViolation {
  id: UUID;
  franchise_id: UUID;
  violation_type: LaundryViolationType;
  violation_date: Date;
  description: string;
  evidence_url?: string;
  fine_amount_brl: number; // 10% aluguel efetivo
  fine_status: 'pending' | 'applied' | 'disputed';
  fine_applied_date?: Date;
  resolved_at?: Date;
  audit_log_id: UUID;
}

export interface LaundryMonthlyReport {
  id: UUID;
  franchise_id: UUID;
  month: number;
  year: number;

  // Uso incluído
  included_cycles_available: number;
  included_cycles_used: number;

  // Pacotes extras
  extra_cycles_purchased: number;
  extra_cycles_used: number;
  extra_packages_cost: number;

  // Violações deste mês
  violations_count: number;
  violations_fine_total: number;

  // Totalizador
  total_charge: number;
  notes: string;

  generated_at: Date;
  included_in_invoice_id?: UUID;
}
