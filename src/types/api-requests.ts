// API Request/Response types for all 4 critical functionalities

// ============= INSPECTION API =============
export interface CreateInspectionRequest {
  lease_id: string;
  property_id: string;
  video_url: string;
  video_size_mb: number;
  video_duration_seconds: number;
  uploaded_by_email: string;
}

export interface CreateInspectionResponse {
  id: string;
  lease_id: string;
  inspection_type: 'initial' | 'final';
  status: 'pending' | 'challenged' | 'rad_pending' | 'completed' | 'disputed';
  deadline_challenge_date: string;
  deadline_rad_date: string;
  deadline_return_deposit_date: string;
  created_at: string;
}

export interface ProcessChallengeRequest {
  inspection_id: string;
  challenge_reason: string;
}

export interface ProcessRADRequest {
  inspection_id: string;
  damages_found: boolean;
  estimated_value?: number;
  description?: string;
}

export interface CalculateDepositReductionRequest {
  total_deposit: number;
  damage_value: number;
  property_age: number;
}

// ============= LAUNDRY API =============
export interface CreateLaundryFranchiseRequest {
  lease_id: string;
  resident_count: number;
}

export interface CreateLaundryFranchiseResponse {
  id: string;
  lease_id: string;
  cycles_per_month_included: number;
  total_cycles_available: number;
  remaining_cycles: number;
  created_at: string;
}

export interface RecordLaundryCycleRequest {
  franchise_id: string;
  resident_name: string;
  machine_id?: string;
}

export interface PurchaseExtraPackageRequest {
  franchise_id: string;
  package_type: 'p2' | 'p4' | 'p6' | 'p10';
}

export interface PurchaseExtraPackageResponse {
  package_id: string;
  cycles_included: number;
  price_brl: number;
  payment_status: 'pending' | 'paid';
}

export interface RecordLaundryViolationRequest {
  franchise_id: string;
  aluguel_efetivo: number;
  violation_date: string;
  description: string;
  evidence_url?: string;
}

export interface GenerateMonthlyReportRequest {
  franchise_id: string;
  month: number;
  year: number;
}

// ============= OCCUPANCY API =============
export interface CreateOccupancyRulesRequest {
  property_id: string;
  max_occupants: number;
}

export interface CreateOccupancyRulesResponse {
  id: string;
  property_id: string;
  max_occupants: number;
  allow_airbnb: false;
  allow_booking: false;
  allow_sublet: false;
  violation_fine_percentage: 10;
}

export interface RegisterOccupantRequest {
  lease_id: string;
  name: string;
  cpf: string;
  role: 'primary' | 'secondary' | 'dependent';
  id_document_url: string;
  move_in_date: string;
  phone?: string;
  email?: string;
}

export interface ReportOccupancyViolationRequest {
  lease_id: string;
  property_id: string;
  aluguel_efetivo: number;
  violation_type: 'airbnb' | 'booking' | 'sublet' | 'overcrowding';
  detection_evidence: string;
  detection_method: 'neighbor_complaint' | 'airbnb_api' | 'booking_api' | 'property_inspection' | 'manual_report';
}

export interface InitiateTerminationRequest {
  violation_id: string;
  reason: string;
}

// ============= CRITICAL DATES API =============
export interface CreatePaymentCycleRequest {
  lease_id: string;
  property_id: string;
  billing_month: number;
  billing_year: number;
  aluguel_efetivo: number;
  cota_custeio: number;
}

export interface CreatePaymentCycleResponse {
  id: string;
  lease_id: string;
  billing_month: number;
  billing_year: number;
  due_date: string;
  value_brl: number;
  aluguel_efetivo: number;
  cota_custeio: number;
  payment_status: 'on_time' | 'late_10d' | 'late_30d' | 'serasa_included' | 'collected';
  created_at: string;
}

export interface ProcessPaymentReceivedRequest {
  cycle_id: string;
  amount_received: number;
  receive_date: string;
}

export interface RegisterSERASARequest {
  cycle_id: string;
  debtor_cpf: string;
  debtor_name: string;
}

export interface ScheduleRenewalNoticeRequest {
  lease_id: string;
  property_id: string;
  current_lease_end_date: string;
  will_renew: boolean;
  non_renewal_reason?: string;
}

// ============= UNIFIED RESPONSES =============
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
