/**
 * Swagger/OpenAPI Example Payloads
 * Exemplos concretos de requisição e resposta para documentação interativa
 */

export const swaggerExamples = {
  // ============================================================================
  // CRM CLIENTS
  // ============================================================================
  clientCreate: {
    request: {
      name: "João Silva",
      email: "joao.silva@example.com",
      phone: "11987654321",
      cpf: "12345678901",
      status: "customer",
      case_types: ["trabalhista", "civil"],
      address: "Rua Principal, 123",
      city: "São Paulo",
      state: "SP",
      zip_code: "01234-567",
      contact_person: "João Silva",
      industry: "Manufatura",
      company_size: "pequena"
    },
    response: {
      id: "client-001",
      name: "João Silva",
      email: "joao.silva@example.com",
      phone: "11987654321",
      cpf: "12345678901",
      status: "customer",
      case_types: ["trabalhista", "civil"],
      address: "Rua Principal, 123",
      city: "São Paulo",
      state: "SP",
      zip_code: "01234-567",
      contact_person: "João Silva",
      industry: "Manufatura",
      company_size: "pequena",
      createdAt: "2024-01-15T10:30:00Z",
      updatedAt: "2024-01-15T10:30:00Z"
    }
  },

  clientUpdate: {
    request: {
      name: "João Silva Santos",
      status: "prospect",
      city: "Rio de Janeiro"
    },
    response: {
      id: "client-001",
      name: "João Silva Santos",
      email: "joao.silva@example.com",
      status: "prospect",
      city: "Rio de Janeiro",
      createdAt: "2024-01-15T10:30:00Z",
      updatedAt: "2024-01-15T11:45:00Z"
    }
  },

  clientList: {
    request: {
      status: "customer",
      limit: 10,
      offset: 0
    },
    response: {
      data: [
        {
          id: "client-001",
          name: "João Silva",
          email: "joao@example.com",
          status: "customer",
          city: "São Paulo",
          createdAt: "2024-01-15T10:30:00Z"
        }
      ],
      total: 1,
      limit: 10,
      offset: 0
    }
  },

  // ============================================================================
  // CONTRACTS
  // ============================================================================
  contractCreate: {
    request: {
      client_id: "client-001",
      title: "Contrato de Representação Legal",
      description: "Contrato de prestação de serviços legais para caso trabalhista",
      content: "CONTRATO DE REPRESENTAÇÃO LEGAL\n\n1. As partes contratantes...",
      status: "draft",
      signature_required: true
    },
    response: {
      id: "contract-001",
      client_id: "client-001",
      title: "Contrato de Representação Legal",
      description: "Contrato de prestação de serviços legais para caso trabalhista",
      status: "draft",
      version: 1,
      signature_required: true,
      signed_at: null,
      executed_at: null,
      createdAt: "2024-01-15T10:30:00Z",
      updatedAt: "2024-01-15T10:30:00Z"
    }
  },

  contractUpdate: {
    request: {
      status: "pending_signature"
    },
    response: {
      id: "contract-001",
      client_id: "client-001",
      status: "pending_signature",
      version: 1,
      updatedAt: "2024-01-15T11:45:00Z"
    }
  },

  contractSign: {
    request: {
      signature_data: "base64-encoded-signature-or-jwt",
      signer_id: "user-001"
    },
    response: {
      id: "contract-001",
      status: "signed",
      signed_at: "2024-01-15T14:30:00Z",
      signers: [
        {
          id: "user-001",
          name: "Dr. Felipe Rocha",
          signed_at: "2024-01-15T14:30:00Z"
        }
      ]
    }
  },

  // ============================================================================
  // LEGAL CASES
  // ============================================================================
  caseCreate: {
    request: {
      case_number: "0001234-56.2024.1.02.3500",
      client_id: "client-001",
      case_type: "trabalhista",
      court_name: "TJ-SP",
      judge_name: "Juiz Carlos Mendes",
      process_number: "1234567890123456789",
      status: "registered",
      amount_claimed: 50000.00,
      lawyer_assigned: "Dr. Felipe Rocha",
      filing_date: "2024-01-15",
      deadline_date: "2024-07-15",
      notes: "Caso de rescisão de contrato sem justa causa"
    },
    response: {
      id: "case-001",
      case_number: "0001234-56.2024.1.02.3500",
      client_id: "client-001",
      case_type: "trabalhista",
      court_name: "TJ-SP",
      status: "registered",
      outcome: null,
      success_rate: 65.00,
      amount_claimed: 50000.00,
      lawyer_assigned: "Dr. Felipe Rocha",
      filing_date: "2024-01-15",
      deadline_date: "2024-07-15",
      createdAt: "2024-01-15T10:30:00Z",
      updatedAt: "2024-01-15T10:30:00Z"
    }
  },

  caseUpdate: {
    request: {
      status: "closed",
      outcome: "favorable",
      amount_awarded: 45000.00
    },
    response: {
      id: "case-001",
      status: "closed",
      outcome: "favorable",
      amount_claimed: 50000.00,
      amount_awarded: 45000.00,
      updatedAt: "2024-01-20T15:30:00Z"
    }
  },

  // ============================================================================
  // INVOICES
  // ============================================================================
  invoiceCreate: {
    request: {
      invoice_number: "NF-2024-001",
      client_id: "client-001",
      case_id: "case-001",
      amount: 5000.00,
      currency: "BRL",
      status: "sent",
      description: "Serviços de representação legal - Janeiro 2024",
      due_date: "2024-02-15",
      issued_date: "2024-01-20",
      payment_method: "transferência"
    },
    response: {
      id: "invoice-001",
      invoice_number: "NF-2024-001",
      client_id: "client-001",
      case_id: "case-001",
      amount: 5000.00,
      amount_paid: 0.00,
      currency: "BRL",
      status: "sent",
      due_date: "2024-02-15",
      issued_date: "2024-01-20",
      createdAt: "2024-01-20T10:30:00Z"
    }
  },

  invoicePayment: {
    request: {
      amount_paid: 5000.00,
      payment_method: "transferência",
      payment_reference: "TRF-20240215-001"
    },
    response: {
      id: "invoice-001",
      amount: 5000.00,
      amount_paid: 5000.00,
      status: "paid",
      paid_date: "2024-02-15T09:30:00Z"
    }
  },

  // ============================================================================
  // INTIMATIONS
  // ============================================================================
  intimationCreate: {
    request: {
      case_id: "case-001",
      document_type: "Audiência",
      title: "Intimação para Audiência de Instrução",
      received_date: "2024-02-10T09:00:00Z",
      deadline_date: "2024-03-10T23:59:59Z",
      notification_method: "Eletrônica",
      sender_name: "Tribunal de Justiça SP"
    },
    response: {
      id: "intimation-001",
      case_id: "case-001",
      document_type: "Audiência",
      title: "Intimação para Audiência de Instrução",
      received_date: "2024-02-10T09:00:00Z",
      deadline_date: "2024-03-10T23:59:59Z",
      notification_method: "Eletrônica",
      sender_name: "Tribunal de Justiça SP",
      is_processed: false,
      createdAt: "2024-02-10T10:30:00Z"
    }
  },

  // ============================================================================
  // ANALYTICS
  // ============================================================================
  caseAnalytics: {
    response: {
      id: "analytics-case-001",
      case_id: "case-001",
      success_rate: 65.00,
      avg_duration_days: 180,
      favorable_outcomes: 0,
      unfavorable_outcomes: 0,
      settled_outcomes: 0,
      predicted_outcome: "favorable",
      prediction_confidence: 72.50,
      risk_factors: ["complexidade do caso", "juiz conservador"],
      opportunity_factors: ["jurisprudência favorável", "precedentes similares"]
    }
  },

  courtAnalytics: {
    response: {
      id: "analytics-tj-sp",
      court_name: "TJ-SP",
      total_cases: 5000,
      favorable_cases: 3500,
      unfavorable_cases: 1500,
      success_rate: 70.00,
      avg_duration_days: 180,
      avg_case_value: 85000.00,
      specialization: ["civil", "trabalhista", "administrativo"]
    }
  },

  lawyerPerformance: {
    response: {
      id: "lawyer-001",
      lawyer_name: "Dr. Felipe Rocha",
      total_cases: 45,
      cases_won: 32,
      cases_lost: 13,
      win_rate: 71.11,
      active_cases: 5,
      experience_years: 12,
      specializations: ["trabalhista", "civil"],
      client_satisfaction_score: 4.8
    }
  },

  // ============================================================================
  // ERROR RESPONSES
  // ============================================================================
  errorValidation: {
    statusCode: 400,
    code: "VALIDATION_ERROR",
    message: "Validação de entrada falhou",
    details: {
      field: "email",
      value: "invalid-email",
      reason: "Email format is invalid. Expected: user@domain.com"
    },
    timestamp: "2024-01-15T10:30:00Z",
    traceId: "req-12345-abcde"
  },

  errorAuth: {
    statusCode: 401,
    code: "UNAUTHORIZED",
    message: "Token de autenticação inválido ou expirado",
    details: {
      reason: "JWT token has expired. Please refresh your token."
    },
    timestamp: "2024-01-15T10:30:00Z",
    traceId: "req-12345-abcde"
  },

  errorForbidden: {
    statusCode: 403,
    code: "FORBIDDEN",
    message: "Permissão insuficiente para acessar este recurso",
    details: {
      required_permission: "client.write",
      user_permissions: ["client.read", "case.read"]
    },
    timestamp: "2024-01-15T10:30:00Z",
    traceId: "req-12345-abcde"
  },

  errorNotFound: {
    statusCode: 404,
    code: "NOT_FOUND",
    message: "Recurso não encontrado",
    details: {
      resource_type: "Client",
      resource_id: "client-999"
    },
    timestamp: "2024-01-15T10:30:00Z",
    traceId: "req-12345-abcde"
  },

  errorConflict: {
    statusCode: 409,
    code: "CONFLICT",
    message: "Recurso já existe ou há conflito nos dados",
    details: {
      reason: "Email already exists in database",
      existing_resource_id: "client-001"
    },
    timestamp: "2024-01-15T10:30:00Z",
    traceId: "req-12345-abcde"
  },

  errorRateLimit: {
    statusCode: 429,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Limite de requisições excedido",
    details: {
      limit: 100,
      remaining: 0,
      reset_at: "2024-01-15T11:30:00Z"
    },
    timestamp: "2024-01-15T10:30:00Z",
    traceId: "req-12345-abcde"
  },

  errorServerError: {
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "Erro interno do servidor",
    details: {
      reason: "An unexpected error occurred. Please try again later."
    },
    timestamp: "2024-01-15T10:30:00Z",
    traceId: "req-12345-abcde"
  },

  errorServiceUnavailable: {
    statusCode: 503,
    code: "SERVICE_UNAVAILABLE",
    message: "Banco de dados indisponível",
    details: {
      service: "PostgreSQL",
      reason: "Connection pool exhausted"
    },
    timestamp: "2024-01-15T10:30:00Z",
    traceId: "req-12345-abcde"
  }
};

/**
 * HTTP Status Code Documentation
 * Mapeamento de códigos de erro para mensagens e recomendações
 */
export const httpErrorCodes = {
  "400": {
    title: "Bad Request - Validação falhou",
    description: "A requisição contém dados inválidos ou mal formatados",
    commonCauses: [
      "CPF/CNPJ inválido (checksum ou formato)",
      "Email duplicado no sistema",
      "Email formato inválido",
      "Campo obrigatório ausente",
      "Tipo de dados incorreto (string vs number)",
      "Data em formato incorreto",
      "Enum value inválido (status, case_type)"
    ],
    resolution: "Verifique os dados enviados e corrija os erros antes de tentar novamente",
    example: swaggerExamples.errorValidation
  },

  "401": {
    title: "Unauthorized - Autenticação falhou",
    description: "Token JWT inválido, expirado ou ausente",
    commonCauses: [
      "Token JWT não fornecido no header Authorization",
      "Token JWT expirado",
      "Token JWT inválido ou corrompido",
      "Assinatura do token não corresponde à chave pública",
      "Bearer prefix não especificado"
    ],
    resolution: "Faça login novamente para obter um novo token JWT",
    example: swaggerExamples.errorAuth
  },

  "403": {
    title: "Forbidden - Permissão insuficiente",
    description: "Usuário autenticado mas sem permissão para acessar o recurso",
    commonCauses: [
      "Usuário não tem escopo 'client.write' para criar clientes",
      "Usuário não tem escopo 'case.delete' para deletar casos",
      "Usuário tenta acessar dados de outro usuário/empresa",
      "Role do usuário é read-only"
    ],
    resolution: "Solicite ao administrador para elevar suas permissões ou use uma conta com acesso",
    example: swaggerExamples.errorForbidden
  },

  "404": {
    title: "Not Found - Recurso não existe",
    description: "O recurso solicitado não foi encontrado no banco de dados",
    commonCauses: [
      "ID do cliente não existe",
      "ID do caso foi deletado",
      "URL contém ID inválido",
      "Recurso foi deletado por outro usuário"
    ],
    resolution: "Verifique o ID do recurso e tente novamente com um ID válido",
    example: swaggerExamples.errorNotFound
  },

  "409": {
    title: "Conflict - Conflito nos dados",
    description: "Tentativa de criar/atualizar recurso que viola constraint de integridade",
    commonCauses: [
      "Email já existe no banco de dados",
      "Número de caso já foi registrado",
      "Número de invoice já existe",
      "Atualização concorrente (versão desatualizada)",
      "Foreign key referencia recurso inexistente"
    ],
    resolution: "Verifique se o recurso já existe ou ajuste os dados para evitar conflito",
    example: swaggerExamples.errorConflict
  },

  "429": {
    title: "Too Many Requests - Rate limit excedido",
    description: "Limite de requisições por IP/usuário foi atingido",
    commonCauses: [
      "Mais de 100 requisições por minuto do mesmo IP",
      "Mais de 1000 requisições por hora do mesmo IP",
      "Client fazendo requisições em loop sem intervalo"
    ],
    resolution: "Aguarde alguns minutos antes de tentar novamente ou contate o administrador",
    headers: {
      "X-RateLimit-Limit": "100 (limite por minuto)",
      "X-RateLimit-Remaining": "0 (requisições restantes)",
      "X-RateLimit-Reset": "1705419000 (timestamp unix quando reseta)"
    },
    example: swaggerExamples.errorRateLimit
  },

  "500": {
    title: "Internal Server Error - Erro não esperado",
    description: "Erro interno do servidor não relacionado com os dados enviados",
    commonCauses: [
      "Bug no código do servidor",
      "Exceção não tratada",
      "Erro ao processar requisição"
    ],
    resolution: "Contate o suporte fornecendo o traceId do erro",
    example: swaggerExamples.errorServerError
  },

  "503": {
    title: "Service Unavailable - Banco de dados indisponível",
    description: "Serviço temporariamente indisponível (geralmente banco de dados)",
    commonCauses: [
      "PostgreSQL offline ou reiniciando",
      "Connection pool saturado (todas as conexões em uso)",
      "Manutenção programada",
      "Falha de rede com banco de dados"
    ],
    resolution: "Aguarde alguns minutos e tente novamente. Se o problema persistir, contate suporte",
    example: swaggerExamples.errorServiceUnavailable
  }
};

/**
 * Rate Limiting Information
 */
export const rateLimitingConfig = {
  description: "Rate limiting por IP e por usuário autenticado",
  limits: {
    perMinute: 100,
    perHour: 1000,
    perDay: 10000
  },
  responseHeaders: {
    "X-RateLimit-Limit": "Limite total de requisições",
    "X-RateLimit-Remaining": "Requisições restantes no período",
    "X-RateLimit-Reset": "Timestamp Unix quando o limite reseta"
  },
  retryAfter: "Indica quantos segundos esperar antes de tentar novamente (quando 429)"
};

/**
 * Authentication Requirements
 */
export const authenticationRequirements = {
  type: "HTTP Bearer",
  scheme: "Bearer",
  bearerFormat: "JWT",
  description: "Token JWT obtido via endpoint POST /auth/login",
  headerFormat: "Authorization: Bearer <jwt-token>",
  tokenLifetime: "1 hour",
  refreshTokenLifetime: "7 days",
  exampleHeader: "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  scopes: {
    "client.read": "Ler dados de clientes",
    "client.write": "Criar/atualizar clientes",
    "client.delete": "Deletar clientes",
    "case.read": "Ler casos legais",
    "case.write": "Criar/atualizar casos",
    "case.delete": "Deletar casos",
    "contract.read": "Ler contratos",
    "contract.write": "Criar/atualizar contratos",
    "contract.sign": "Assinar contratos digitalmente",
    "invoice.read": "Ler faturas",
    "invoice.write": "Criar/atualizar faturas",
    "invoice.delete": "Deletar faturas",
    "analytics.read": "Acessar analytics e relatórios",
    "admin": "Acesso total (requer role admin)"
  }
};

/**
 * Validation Rules Documentation
 */
export const validationRules = {
  cpf: {
    format: "XXX.XXX.XXX-XX or XXXXXXXXXXX (11 dígitos)",
    validation: "Checksum (módulo 11) validado",
    example: "123.456.789-01",
    description: "CPF válido com checksum correto"
  },
  cnpj: {
    format: "XX.XXX.XXX/XXXX-XX or XXXXXXXXXXXXXX (14 dígitos)",
    validation: "Checksum (módulo 11) validado",
    example: "12.345.678/0001-90",
    description: "CNPJ válido com checksum correto"
  },
  email: {
    format: "RFC 5321 compliant",
    validation: "Formato de email válido",
    example: "joao.silva@example.com",
    description: "Email deve ser único no banco de dados"
  },
  phone: {
    format: "Número brasileiro com DDD (XX) XXXXX-XXXX ou XX9XXXX-XXXX",
    validation: "Apenas dígitos permitidos após limpeza",
    example: "11987654321",
    description: "Telefone brasileiro com código de área"
  },
  caseNumber: {
    format: "NNNNNNN-DD.AAAA.J.TT.OOOO (CNJ padrão)",
    validation: "Deve ser único no banco",
    example: "0001234-56.2024.1.02.3500",
    description: "Número de caso padronizado pelo CNJ"
  },
  date: {
    format: "ISO 8601 (YYYY-MM-DD)",
    validation: "Data válida (não futura por padrão)",
    example: "2024-01-15",
    description: "Data no formato internacional"
  },
  status: {
    enum: ["prospect", "lead", "customer", "inactive"],
    description: "Status do cliente - valores permitidos"
  }
};
