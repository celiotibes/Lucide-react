// ============================================================================
// MOCK DATA FOR DEVELOPMENT
// ============================================================================

import { Case, Intimation, ComplianceMetric, AuditTrailEntry } from '../types'

export const mockCases: Case[] = [
  {
    id: '1',
    number: 'PROC-2024-001',
    status: 'active',
    title: 'Ação Trabalhista - Horas Extras',
    description: 'Reclamação trabalhista por não pagamento de horas extras',
    deadline: '2026-12-31',
    progress: 65,
    clientName: 'João Silva',
    judge: 'Dr. Carlos Alberto',
    lastUpdate: '2026-07-15',
  },
  {
    id: '2',
    number: 'PROC-2024-002',
    status: 'active',
    title: 'Ação Civil - Indenização por Danos Morais',
    description: 'Ação indenizatória por danos morais e materiais',
    deadline: '2026-11-15',
    progress: 45,
    clientName: 'Maria Santos',
    judge: 'Dra. Fernanda Costa',
    lastUpdate: '2026-07-10',
  },
  {
    id: '3',
    number: 'PROC-2024-003',
    status: 'paused',
    title: 'Processo Criminoso - Furto',
    description: 'Processo criminal por crime de furto qualificado',
    deadline: '2026-10-30',
    progress: 30,
    clientName: 'Pedro Oliveira',
    judge: 'Dr. Roberto Mendes',
    lastUpdate: '2026-06-20',
  },
  {
    id: '4',
    number: 'PROC-2024-004',
    status: 'concluded',
    title: 'Ação Cível - Cobrança de Débito',
    description: 'Ação de cobrança de débito de natureza comercial',
    deadline: '2026-09-15',
    progress: 100,
    clientName: 'Empresa XYZ Ltda',
    judge: 'Dr. Antônio Ferreira',
    lastUpdate: '2026-07-18',
  },
  {
    id: '5',
    number: 'PROC-2024-005',
    status: 'active',
    title: 'Ação Imobiliária - Despejo',
    description: 'Ação de despejo por falta de pagamento de aluguel',
    deadline: '2026-08-30',
    progress: 55,
    clientName: 'Imóveis Brasil S/A',
    judge: 'Dra. Patricia Gomes',
    lastUpdate: '2026-07-12',
  },
  {
    id: '6',
    number: 'PROC-2024-006',
    status: 'active',
    title: 'Recurso Administrativo - Revisão',
    description: 'Recurso de revisão de decisão administrativa',
    deadline: '2026-12-20',
    progress: 20,
    clientName: 'João Pedro Construções',
    judge: 'Dr. Lucas Martins',
    lastUpdate: '2026-07-08',
  },
]

export const mockIntimations: Intimation[] = [
  {
    id: '1',
    number: 'INT-001',
    status: 'pending',
    title: 'Intimação para Apresentação de Defesa',
    description: 'Intimação para apresentar defesa em processo trabalhista',
    deadline: '2026-07-25',
    confidence: 0.95,
    source: 'email',
    lastUpdate: '2026-07-18',
  },
  {
    id: '2',
    number: 'INT-002',
    status: 'pending',
    title: 'Intimação para Comparecimento em Audiência',
    description: 'Intimação para comparecimento em audiência de conciliação',
    deadline: '2026-07-28',
    confidence: 0.88,
    source: 'sistema',
    lastUpdate: '2026-07-17',
  },
  {
    id: '3',
    number: 'INT-003',
    status: 'processed',
    title: 'Intimação para Pagamento de Custas',
    description: 'Intimação para pagamento de custas processuais',
    deadline: '2026-07-22',
    confidence: 0.92,
    source: 'email',
    lastUpdate: '2026-07-16',
  },
  {
    id: '4',
    number: 'INT-004',
    status: 'archived',
    title: 'Intimação para Arrolamento de Bens',
    description: 'Intimação para arrolamento e avaliação de bens',
    deadline: '2026-06-30',
    confidence: 0.85,
    source: 'sistema',
    lastUpdate: '2026-07-01',
  },
]

export const mockMetrics: ComplianceMetric[] = [
  {
    id: '1',
    name: 'Criptografia de Dados',
    value: 98,
    target: 100,
    status: 'compliant',
    description: 'Nível de criptografia em trânsito e em repouso',
  },
  {
    id: '2',
    name: 'Logs de Acesso',
    value: 87,
    target: 100,
    status: 'warning',
    description: 'Cobertura de auditoria de acessos ao sistema',
  },
  {
    id: '3',
    name: 'Retenção de Dados',
    value: 92,
    target: 100,
    status: 'compliant',
    description: 'Conformidade com política de retenção de dados',
  },
  {
    id: '4',
    name: 'Consentimento',
    value: 78,
    target: 100,
    status: 'warning',
    description: 'Consentimento explícito coletado e documentado',
  },
  {
    id: '5',
    name: 'MFA Habilitado',
    value: 82,
    target: 100,
    status: 'warning',
    description: 'Autenticação multifator para usuários',
  },
  {
    id: '6',
    name: 'Resposta a Incidentes',
    value: 95,
    target: 100,
    status: 'compliant',
    description: 'Plano de resposta a incidentes de segurança',
  },
]

export const mockAuditTrail: AuditTrailEntry[] = [
  {
    id: '1',
    action: 'Login',
    description: 'Usuário realizou login no sistema',
    user: 'joao.silva@empresa.com',
    timestamp: '2026-07-18T14:30:00',
    severity: 'info',
  },
  {
    id: '2',
    action: 'Atualização de Caso',
    description: 'Caso PROC-2024-001 foi atualizado',
    user: 'maria.santos@empresa.com',
    timestamp: '2026-07-18T13:45:00',
    severity: 'info',
  },
  {
    id: '3',
    action: 'Acesso a Dados Sensíveis',
    description: 'Acesso a informações de cliente confidenciais',
    user: 'pedro.oliveira@empresa.com',
    timestamp: '2026-07-18T13:15:00',
    severity: 'warning',
  },
  {
    id: '4',
    action: 'Tentativa de Login Falha',
    description: 'Múltiplas tentativas de login falhadas',
    user: 'unknown',
    timestamp: '2026-07-18T12:00:00',
    severity: 'warning',
  },
  {
    id: '5',
    action: 'Exportação de Dados',
    description: 'Relatório de casos exportado',
    user: 'admin@empresa.com',
    timestamp: '2026-07-17T16:20:00',
    severity: 'info',
  },
  {
    id: '6',
    action: 'Logout',
    description: 'Usuário realizou logout',
    user: 'joao.silva@empresa.com',
    timestamp: '2026-07-17T17:00:00',
    severity: 'info',
  },
]

// ============================================================================
// MOCK USER
// ============================================================================

export const mockUser = {
  id: 'user-123',
  email: 'demo@exemplo.com',
  name: 'Usuário Demo',
  role: 'attorney',
  avatar: undefined,
}

// ============================================================================
// FUNCTION TO SEED STORES WITH MOCK DATA
// ============================================================================

export async function seedMockData() {
  const { useCasesStore } = await import('../stores/casesStore')
  const { useIntimationsStore } = await import('../stores/intimationsStore')
  const { useComplianceStore } = await import('../stores/complianceStore')
  const { useAuthStore } = await import('../stores/authStore')

  // Seed stores with mock data
  useCasesStore.setState({ cases: mockCases })
  useIntimationsStore.setState({ intimations: mockIntimations })
  useComplianceStore.setState({
    metrics: mockMetrics,
    auditTrail: mockAuditTrail,
  })
  useAuthStore.setState({
    user: mockUser,
    isAuthenticated: true,
  })
}
