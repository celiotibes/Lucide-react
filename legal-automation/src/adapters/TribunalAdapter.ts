import { Process, Petition } from '@/types';

export type { Process };

export interface Movement {
  date: Date;
  description: string;
  status?: string;
  complement?: string;
}

export interface TribunalAdapter {
  // Configuração
  getName(): string;
  getBaseUrl(): string;
  getTribunalCode(): string;

  // Processos
  getProcess(number: string): Promise<Process>;
  searchProcesses(criteria: SearchCriteria): Promise<Process[]>;
  getMovements(processNumber: string): Promise<Movement[]>;

  // Petições
  submitPetition(petition: Petition, certificatePath: string, certPassword: string): Promise<ProtocolResponse>;
  getPetitionStatus(protocolNumber: string): Promise<PetitionStatus>;

  // Certificados
  validateCertificate(cert: Buffer, password: string): Promise<boolean>;

  // Status
  isHealthy(): Promise<boolean>;

  // Métodos opcionais para adapters específicos
  initialize?(): Promise<void>;
  searchProcess?(processNumber: string): Promise<Process>;
  searchProcessByParty?(partyName: string, options?: any): Promise<Process[]>;
  getProcessDeadlines?(processNumber: string): Promise<any[]>;
  getHealthStatus?(): Promise<{ status: 'ok' | 'error'; message: string }>;
}

export interface SearchCriteria {
  partyName?: string;
  subject?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  limit?: number;
}

export interface ProtocolResponse {
  protocolo: string;
  dataProtocolo: Date;
  sucesso: boolean;
  mensagem?: string;
  erros?: string[];
}

export interface PetitionStatus {
  protocolo: string;
  status: 'enviada' | 'processando' | 'aceita' | 'rejeitada';
  dataStatus: Date;
  mensagem?: string;
}
