# Arquitetura Multi-Tribunal - eProc TJSC, Justiça Federal (TRF4, JFPR, JUST)

Sistema único capaz de operar em múltiplos tribunais brasileiros com roteamento automático.

## 📊 Matriz de Compatibilidade

| Tribunal | Tipo | Status | API | Certificado | Prioridade |
|----------|------|--------|-----|-------------|-----------|
| **TJSC** | Estadual | ✅ Implementado | REST (Domicílio) | OAB Digital | 1 |
| **TRF4** | Federal | ⚠️ Pronto | REST | Certificado | 1 |
| **JFPR** | Federal | ⚠️ Pronto | REST | Certificado | 1 |
| **JUST** | Federal | ⚠️ Pronto | PDPJ-Br | Unificado | 2 |
| **Projudi TJPR** | Estadual | ✅ Implementado | SOAP | OAB Digital | 1 |
| **Outros (PJe, eSAJ)** | Múltiplo | 📅 Futuro | Variado | Múltiplo | 3 |

## 🏗️ Arquitetura Recomendada: Padrão Adapter

```
┌─────────────────────────────────────────────────────────────┐
│                   Cliente / Frontend                         │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
    ▼                                   ▼
┌──────────────────────┐    ┌──────────────────────┐
│  Seletor de Tribunal │    │  Router (por tribunal)│
│  - TJSC              │    │  - /api/tjsc/*       │
│  - TRF4              │    │  - /api/trf4/*       │
│  - JFPR              │    │  - /api/jfpr/*       │
│  - JUST              │    │  - /api/projudi/*    │
└──────────┬───────────┘    └──────────┬───────────┘
           │                           │
           └─────────────┬─────────────┘
                         │
        ┌────────────────▼────────────────┐
        │    Camada de Abstração          │
        │  - normalizeProcess()           │
        │  - normalizePetition()          │
        │  - normalizeResponse()          │
        └────────────────┬────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
    ▼                                   ▼
┌──────────────────┐            ┌──────────────────┐
│   Adapter Pool   │            │  Certificados    │
│┌────────────────┐│            │┌────────────────┐│
││ TJSCAdapter    ││            ││ TJSC Cert      ││
││ TRF4Adapter    ││            ││ TRF4 Cert      ││
││ JFPRAdapter    ││            ││ JFPR Cert      ││
││ PDPJAdapter    ││            ││ OAB Cert       ││
│└────────────────┘│            │└────────────────┘│
└──────┬───────────┘            └──────┬───────────┘
       │                               │
       └─────────────┬─────────────────┘
                     │
        ┌────────────▼────────────┐
        │  External APIs & WS     │
        │┌──────────────────────┐│
        ││ eProc TJSC REST      ││
        ││ eProc TRF4 REST      ││
        ││ eProc JFPR REST      ││
        ││ PDPJ-Br REST         ││
        ││ Projudi SOAP         ││
        ││ DataJud API          ││
        │└──────────────────────┘│
        └────────────────────────┘
```

## 🔌 Padrão Adapter (Implementation)

### 1. Interface Base

```typescript
// src/adapters/TribunalAdapter.ts

export interface TribunalAdapter {
  // Configuração
  getName(): string;
  getBaseUrl(): string;
  
  // Processos
  getProcess(number: string): Promise<Process>;
  searchProcesses(criteria: SearchCriteria): Promise<Process[]>;
  getMovements(processNumber: string): Promise<Movement[]>;
  
  // Petições
  submitPetition(petition: Petition): Promise<ProtocolResponse>;
  getPetitionStatus(protocolNumber: string): Promise<PetitionStatus>;
  
  // Certificados
  validateCertificate(cert: Certificate): Promise<boolean>;
  signDocument(content: Buffer, cert: Certificate): Promise<Buffer>;
}
```

### 2. Adapter TJSC

```typescript
// src/adapters/TJSCAdapter.ts

export class TJSCAdapter implements TribunalAdapter {
  getName(): string {
    return 'TJSC';
  }

  getBaseUrl(): string {
    return config.tjsc_api_url || 'https://eproc.tjsc.jus.br/api';
  }

  async getProcess(number: string): Promise<Process> {
    const response = await axios.get(
      `${this.getBaseUrl()}/processos/${number}`,
      this.getHeaders()
    );
    return this.normalizeProcess(response.data);
  }

  private normalizeProcess(data: any): Process {
    return {
      number: data.numeroProcesso,
      cnj: data.cnj,
      tribunal: 'TJSC',
      status: data.status,
      // ... mapeamento
    };
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.getToken()}`,
      'Content-Type': 'application/json',
    };
  }
}
```

### 3. Adapter TRF4

```typescript
// src/adapters/TRF4Adapter.ts

export class TRF4Adapter implements TribunalAdapter {
  getName(): string {
    return 'TRF4';
  }

  getBaseUrl(): string {
    return config.trf4_api_url || 'https://portal-eproc.trf4.jus.br/eprocV2/';
  }

  async getProcess(number: string): Promise<Process> {
    // TRF4 usa padrão diferente
    const response = await axios.post(
      `${this.getBaseUrl()}/consultar`,
      {
        numeroProcesso: number,
        login: config.trf4_login,
        senha: config.trf4_password,
      }
    );
    return this.normalizeProcess(response.data);
  }

  private normalizeProcess(data: any): Process {
    return {
      number: data.processo.numero,
      cnj: this.extractCNJ(data.processo.numero),
      tribunal: 'TRF4',
      status: data.processo.situacao,
      // ... mapeamento
    };
  }
}
```

### 4. Adapter Factory

```typescript
// src/adapters/AdapterFactory.ts

export class AdapterFactory {
  private static adapters: Map<string, TribunalAdapter> = new Map();

  static {
    this.register('tjsc', new TJSCAdapter());
    this.register('trf4', new TRF4Adapter());
    this.register('jfpr', new JFPRAdapter());
    this.register('projudi', new ProjudiAdapter());
  }

  static getAdapter(tribunal: string): TribunalAdapter {
    const adapter = this.adapters.get(tribunal.toLowerCase());
    if (!adapter) {
      throw new Error(`Tribunal ${tribunal} não suportado`);
    }
    return adapter;
  }

  static register(name: string, adapter: TribunalAdapter): void {
    this.adapters.set(name.toLowerCase(), adapter);
  }

  static listAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }
}
```

## 🛣️ Roteamento de API

### Controllers Multi-Tribunal

```typescript
// src/api/controllers/multiTribunalController.ts

router.get('/tribunals', (req: Request, res: Response) => {
  res.json({
    status: 'success',
    supported: AdapterFactory.listAdapters(),
    count: 4,
  });
});

// Rota dinâmica por tribunal
router.get('/:tribunal/processes/:number', async (req: Request, res: Response) => {
  const { tribunal, number } = req.params;

  try {
    const adapter = AdapterFactory.getAdapter(tribunal);
    const process = await adapter.getProcess(number);

    res.json({
      status: 'success',
      tribunal,
      process,
    });
  } catch (error) {
    res.status(400).json({
      error: `Tribunal ${tribunal} não suportado ou processo não encontrado`,
    });
  }
});

router.post('/:tribunal/petitions', async (req: Request, res: Response) => {
  const { tribunal } = req.params;
  const petition = req.body;

  try {
    const adapter = AdapterFactory.getAdapter(tribunal);
    const result = await adapter.submitPetition(petition);

    res.json({
      status: 'success',
      tribunal,
      protocol: result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## 🔐 Gerenciamento de Certificados Multi-Tribunal

```typescript
// src/auth/multiCertificateManager.ts

interface CertificateByTribunal {
  tribunal: string;
  certificateFingerprint: string;
  validFrom: Date;
  validTo: Date;
  lastUsed?: Date;
}

class MultiCertificateManager {
  private userCerts: Map<string, CertificateByTribunal[]> = new Map();

  async uploadCertificate(
    userId: string,
    tribunal: string,
    pfxBuffer: Buffer,
    password: string
  ): Promise<CertificateByTribunal> {
    // Validar certificado para tribunal específico
    const cert = await this.validateForTribunal(pfxBuffer, password, tribunal);

    const certData: CertificateByTribunal = {
      tribunal,
      certificateFingerprint: cert.fingerprint,
      validFrom: cert.validFrom,
      validTo: cert.validTo,
    };

    if (!this.userCerts.has(userId)) {
      this.userCerts.set(userId, []);
    }
    this.userCerts.get(userId)!.push(certData);

    return certData;
  }

  async getCertificateForTribunal(
    userId: string,
    tribunal: string
  ): Promise<CertificateByTribunal | null> {
    const certs = this.userCerts.get(userId) || [];
    return certs.find(c => c.tribunal === tribunal) || null;
  }

  async validateForTribunal(
    pfxBuffer: Buffer,
    password: string,
    tribunal: string
  ): Promise<any> {
    // Validar se certificado é válido para tribunal específico
    // Alguns tribunais requerem certificado OAB, outros aceitam qualquer cert
    if (tribunal === 'tjsc' || tribunal === 'projudi') {
      return this.validateOABCertificate(pfxBuffer, password);
    } else if (tribunal === 'trf4' || tribunal === 'jfpr') {
      return this.validateGeneralCertificate(pfxBuffer, password);
    }
  }
}
```

## 📡 Endpoints Multi-Tribunal

```bash
# Listar tribunais suportados
GET /api/v1/tribunals
Response: { supported: ['tjsc', 'trf4', 'jfpr'], count: 3 }

# Buscar processo em tribunal específico
GET /api/v1/:tribunal/processes/:number
GET /api/v1/tjsc/processes/0000001-12.2023.8.26.0100
GET /api/v1/trf4/processes/0000001-12.2023.8.26.0100

# Pesquisar processos
POST /api/v1/:tribunal/processes/search
{
  "parteNome": "João Silva",
  "dataInicio": "2024-01-01"
}

# Enviar petição
POST /api/v1/:tribunal/petitions
{
  "processNumber": "...",
  "tribunal": "tjsc",
  "content": "..."
}

# Gerenciar certificados por tribunal
POST /api/v1/auth/certificates/:tribunal/upload
GET /api/v1/auth/certificates/list-by-tribunal
```

## 🔄 Fluxo Completo Multi-Tribunal

```
USUÁRIO
  │
  1. Seleciona tribunal: TJSC, TRF4, JFPR ou JUST
  │
  2. Faz login (autenticação unificada)
  │   └─ 2FA + Certificado (específico por tribunal)
  │
  3. Busca processo
  │   └─ Adapter redireciona para API correta
  │   └─ Resposta normalizada
  │
  4. Cria petição
  │   └─ Seleciona tribunal destino
  │   └─ Adapter valida formato específico
  │
  5. Assina digitalmente
  │   └─ Usa certificado apropriado para tribunal
  │
  6. Envia
  │   └─ Adapter submete via API correta
  │   └─ Retorna protocolo unificado
```

## 📦 Estrutura de Pastas

```
src/
├── adapters/
│   ├── TribunalAdapter.ts          (Interface)
│   ├── AdapterFactory.ts            (Factory)
│   ├── TJSCAdapter.ts
│   ├── TRF4Adapter.ts
│   ├── JFPRAdapter.ts
│   ├── ProjudiAdapter.ts
│   └── normalization/
│       ├── ProcessNormalizer.ts
│       ├── PetitionNormalizer.ts
│       └── ResponseNormalizer.ts
├── auth/
│   ├── multiCertificateManager.ts
│   └── tribunalAuthHandler.ts
├── api/
│   └── controllers/
│       ├── multiTribunalController.ts
│       └── tribunalSelectorController.ts
└── config/
    └── tribunalConfig.ts
```

## ⚙️ Configuração

```env
# TJSC
TJSC_API_URL=https://eproc.tjsc.jus.br/api
TJSC_ENABLED=true

# TRF4
TRF4_API_URL=https://portal-eproc.trf4.jus.br/eprocV2
TRF4_LOGIN=seu_login
TRF4_PASSWORD=sua_senha
TRF4_ENABLED=true

# JFPR
JFPR_API_URL=https://eproc.jfpr.jus.br/api
JFPR_LOGIN=seu_login
JFPR_PASSWORD=sua_senha
JFPR_ENABLED=true

# JUST (PDPJ-Br)
JUST_API_URL=https://jus.br/api
JUST_SSO_ENABLED=true
JUST_ENABLED=false  # Futuro

# Projudi
PROJUDI_WSDL_URL=https://tst.tjpr.jus.br/projudi/webservices
PROJUDI_ENABLED=true
```

## 🧪 Teste Multi-Tribunal

```bash
# Teste TJSC
curl http://localhost:3000/api/v1/tjsc/processes/0000001-12.2023.8.26.0100

# Teste TRF4
curl http://localhost:3000/api/v1/trf4/processes/0000001-12.2023.8.26.0100

# Teste JFPR
curl http://localhost:3000/api/v1/jfpr/processes/0000001-12.2023.8.26.0100

# Listar suportados
curl http://localhost:3000/api/v1/tribunals
```

## 📊 Matriz de Implementação

| Phase | Timeline | Tasks |
|-------|----------|-------|
| **Phase 1** | Semana 1 | Implementar TRF4 + JFPR adapters |
| **Phase 2** | Semana 2 | Multi-certificate manager |
| **Phase 3** | Semana 3 | Testes E2E multi-tribunal |
| **Phase 4** | Semana 4 | Integração PDPJ-Br (JUST) |
| **Phase 5** | Futuro | PJe, eSAJ adapters |

## 🎯 Benefícios

✅ **Um único backend** para múltiplos tribunais
✅ **Escalável** - Adicionar novo tribunal = 1 novo adapter
✅ **Normalização** - Respostas padronizadas
✅ **Flexibilidade** - Cada tribunal mantém suas características
✅ **Manutenção** - Código DRY e testável
✅ **Futuro-proof** - Padrão adapter para novos sistemas (PJe, eSAJ)

## ⚠️ Desafios

🔴 Cada tribunal pode ter formato diferente
🔴 Certificados específicos por tribunal
🔴 Taxa de mudanças nas APIs (sem SLA)
🔴 Documentação inconsistente entre tribunais
🔴 Testes reais exigem acesso aos ambientes

## 🚀 Próximos Passos

1. Solicitar documentação técnica ao TRF4 e JFPR
2. Criar adapters para TRF4 e JFPR
3. Implementar multi-certificate manager
4. Testes E2E com dados reais
5. Deploy em staging
6. Validação com usuários finais
