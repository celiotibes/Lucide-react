// ============ TRIBUNAL ADAPTER BASE ============

export interface TribunalConfig {
  code: string;
  name: string;
  apiUrl: string;
  wsdlUrl?: string;
  oauthUrl?: string;
  clientId?: string;
  clientSecret?: string;
  certificate?: string;
  certificatePassword?: string;
}

export interface ProcessData {
  processNumber: string;
  status: 'active' | 'pending' | 'concluded' | 'archived';
  currentPhase: string;
  lastUpdate: Date;
  movements: ProcessMovement[];
  parties: ProcessParty[];
  documents: ProcessDocument[];
  deadlines: ProcessDeadline[];
}

export interface ProcessMovement {
  id: string;
  type: string;
  description: string;
  date: Date;
  origin?: string;
}

export interface ProcessParty {
  id: string;
  name: string;
  role: string; // 'plaintiff', 'defendant', 'third_party'
  documentId?: string;
  representative?: string;
}

export interface ProcessDocument {
  id: string;
  name: string;
  type: string;
  date: Date;
  url?: string;
  size?: number;
}

export interface ProcessDeadline {
  id: string;
  description: string;
  dueDate: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// ============ PJE SPECIFIC ============

export interface PJeConfig extends TribunalConfig {
  systemId: string; // identifier no PJe
  tokenUrl: string;
}

export interface PJeProcess extends ProcessData {
  caseType: string;
  classificationCode: string;
  estimatedValue?: number;
  court: string;
}

export interface PJeSearchResult {
  processNumber: string;
  partyName: string;
  classified: boolean;
  lastUpdate: Date;
  url: string;
}

// ============ eSAJ SPECIFIC ============

export interface eSAJConfig extends TribunalConfig {
  courtSystem: string; // 'TJPA', 'TJAM', etc
  versionId?: string;
}

export interface eSAJProcess extends ProcessData {
  origin: string;
  subjectCode: string;
  judgeId?: string;
  forum?: string;
}

export interface eSAJSearchResult {
  cdProcesso: string;
  dsProcesso: string;
  nmParte: string;
  dtMovimentacao: Date;
}

// ============ DATAJUZ FALLBACK ============

export interface DataJuzProcess extends ProcessData {
  tribunal: string;
  originalJson: Record<string, any>;
}

// ============ ADAPTER ERRORS ============

export class TribunalAdapterError extends Error {
  constructor(
    public code: string,
    public tribunal: string,
    message: string,
    public originalError?: Error,
  ) {
    super(message);
    this.name = 'TribunalAdapterError';
  }
}

export class ProcessNotFoundError extends TribunalAdapterError {
  constructor(processNumber: string, tribunal: string) {
    super('PROCESS_NOT_FOUND', tribunal, `Processo ${processNumber} não encontrado em ${tribunal}`);
    this.name = 'ProcessNotFoundError';
  }
}

export class AuthenticationError extends TribunalAdapterError {
  constructor(tribunal: string) {
    super('AUTH_ERROR', tribunal, `Erro de autenticação com ${tribunal}`);
    this.name = 'AuthenticationError';
  }
}
