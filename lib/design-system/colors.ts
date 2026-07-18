/**
 * Design System - Color Palette
 * Comprehensive color scheme for Lei 8.245/91 property inspection system
 */

export const colors = {
  // Primary Brand Colors
  primary: {
    50: '#e3f2fd',
    100: '#bbdefb',
    200: '#90caf9',
    300: '#64b5f6',
    400: '#42a5f5',
    500: '#2196f3', // Main brand blue
    600: '#1e88e5',
    700: '#1976d2',
    800: '#1565c0',
    900: '#0d47a1',
  },

  // Semantic Colors
  success: {
    light: '#c8e6c9',
    main: '#4caf50',
    dark: '#2e7d32',
    text: '#1b5e20',
  },

  warning: {
    light: '#fff3cd',
    main: '#ff9800',
    dark: '#e65100',
    text: '#bf360c',
  },

  error: {
    light: '#ffcdd2',
    main: '#f44336',
    dark: '#c62828',
    text: '#b71c1c',
  },

  info: {
    light: '#e1f5fe',
    main: '#03a9f4',
    dark: '#01579b',
    text: '#006064',
  },

  // Neutral Colors
  neutral: {
    white: '#ffffff',
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#eeeeee',
    300: '#e0e0e0',
    400: '#bdbdbd',
    500: '#9e9e9e',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
    black: '#000000',
  },

  // Status Specific Colors
  status: {
    pending: '#ff9800',
    processing: '#2196f3',
    completed: '#4caf50',
    expired: '#f44336',
    warning: '#ffc107',
    info: '#17a2b8',
  },

  // Law-specific Colors (Lei 8.245/91)
  legal: {
    preclusao: '#f44336', // Urgent - time is running out
    preclusaoWarning: '#ff9800', // Warning - 3 days left
    preclusaoInfo: '#ffc107', // Info - 5+ days
    contestacao: '#9c27b0', // Contestation
    auditoria: '#673ab7', // Audit
    compliance: '#4caf50', // Compliance
  },

  // Repair Status Colors
  reparo: {
    pendente: '#9e9e9e',
    orcado: '#2196f3',
    aprovado: '#4caf50',
    rejeitado: '#f44336',
    agendado: '#9c27b0',
    emExecucao: '#ff5722',
    concluido: '#4caf50',
    desistido: '#795548',
  },

  // Gradient Definitions
  gradients: {
    primary: ['#2196f3', '#1976d2'],
    success: ['#4caf50', '#2e7d32'],
    warning: ['#ff9800', '#e65100'],
    error: ['#f44336', '#c62828'],
    info: ['#03a9f4', '#01579b'],
  },
};

/**
 * Get color based on reparo status
 */
export function getStatusColor(status: string): string {
  const statusMap: Record<string, string> = {
    pendente: colors.reparo.pendente,
    orcado: colors.reparo.orcado,
    aprovado: colors.reparo.aprovado,
    rejeitado: colors.reparo.rejeitado,
    agendado: colors.reparo.agendado,
    em_execucao: colors.reparo.emExecucao,
    concluido: colors.reparo.concluido,
    desistido: colors.reparo.desistido,
  };
  return statusMap[status] || colors.neutral[400];
}

/**
 * Get color based on dias_uteis_restantes (preclusão countdown)
 */
export function getPreclusaoColor(diasUteis: number | null | undefined): string {
  if (!diasUteis || diasUteis < 0) return colors.legal.preclusao;
  if (diasUteis === 1) return colors.legal.preclusao;
  if (diasUteis <= 3) return colors.legal.preclusaoWarning;
  return colors.legal.preclusaoInfo;
}

/**
 * Get gradient based on status
 */
export function getStatusGradient(status: string): string[] {
  const gradients: Record<string, string[]> = {
    pendente: [colors.neutral[400], colors.neutral[600]],
    orcado: colors.gradients.info,
    aprovado: colors.gradients.success,
    rejeitado: colors.gradients.error,
    agendado: [colors.reparo.agendado, '#7b1fa2'],
    em_execucao: [colors.reparo.emExecucao, '#d84315'],
    concluido: colors.gradients.success,
  };
  return gradients[status] || colors.gradients.primary;
}
