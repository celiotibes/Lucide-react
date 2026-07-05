# API Multi-Tribunal - Documentação de Uso

## Visão Geral

O sistema agora suporta múltiplos tribunais brasileiros através de uma única API REST com roteamento automático via adapters.

### Tribunais Suportados

| Tribunal | Código | Tipo | Status |
|----------|--------|------|--------|
| **TJSC** | `tjsc` | Estadual (Santa Catarina) | ✅ Implementado |
| **TRF4** | `trf4` | Federal (4ª Região) | ✅ Implementado |
| **JFPR** | `jfpr` | Federal (Paraná) | ✅ Implementado |
| **TJPR** | `tjpr` | Estadual (Projudi) | ✅ Implementado |
| **JUST** | `just` | Federal (Unificado) | ✅ Implementado |

## Endpoints

### 1. Listar Tribunais Disponíveis

**Request**
```http
GET /api/v1/tribunals/tribunals
```

**Response**
```json
{
  "status": "success",
  "supported": ["tjsc", "trf4", "jfpr", "tjpr", "just"],
  "count": 5,
  "tribunals": [
    {
      "code": "tjsc",
      "name": "TJSC",
      "baseUrl": "https://eproc.tjsc.jus.br/api",
      "status": "healthy"
    },
    {
      "code": "trf4",
      "name": "TRF4",
      "baseUrl": "https://portal-eproc.trf4.jus.br/eprocV2/",
      "status": "healthy"
    }
    // ... outros tribunais
  ]
}
```

### 2. Verificar Saúde de um Tribunal

**Request**
```http
GET /api/v1/tribunals/:tribunal/health
```

**Example**
```http
GET /api/v1/tribunals/tjsc/health
```

**Response**
```json
{
  "status": "success",
  "tribunal": "tjsc",
  "healthy": true
}
```

### 3. Buscar Processo por Número

**Request**
```http
GET /api/v1/tribunals/:tribunal/processes/:number
Authorization: Bearer <token>
```

**Example**
```http
GET /api/v1/tribunals/tjsc/processes/0000001-12.2023.8.26.0100
```

**Response**
```json
{
  "status": "success",
  "tribunal": "tjsc",
  "process": {
    "number": "0000001-12.2023.8.26.0100",
    "cnj": "0000001122023082601000",
    "tribunal": "TJSC",
    "status": "Ativo",
    "plaintiff": "João Silva",
    "defendant": "Empresa XYZ LTDA",
    "subject": "Ação de Indenização",
    "openDate": "2023-12-01T00:00:00Z",
    "lastMovement": "2024-01-15T10:30:00Z"
  }
}
```

### 4. Pesquisar Processos

**Request**
```http
POST /api/v1/tribunals/:tribunal/processes/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "partyName": "João Silva",
  "subject": "Indenização",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "limit": 50
}
```

**Example**
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "partyName": "João Silva",
    "subject": "Dano Moral",
    "limit": 20
  }' \
  http://localhost:3000/api/v1/tribunals/trf4/processes/search
```

**Response**
```json
{
  "status": "success",
  "tribunal": "trf4",
  "count": 3,
  "processes": [
    {
      "number": "0000001-12.2023.8.26.0100",
      "cnj": "0000001122023082601000",
      "tribunal": "TRF4",
      "status": "Ativo",
      "plaintiff": "João Silva",
      "defendant": "Empresa XYZ LTDA",
      "subject": "Ação de Indenização",
      "openDate": "2023-12-01T00:00:00Z"
    }
    // ... mais processos
  ]
}
```

### 5. Obter Movimentações de um Processo

**Request**
```http
GET /api/v1/tribunals/:tribunal/processes/:number/movements
Authorization: Bearer <token>
```

**Example**
```http
GET /api/v1/tribunals/jfpr/processes/0000001-12.2023.8.26.0100/movements
```

**Response**
```json
{
  "status": "success",
  "tribunal": "jfpr",
  "processNumber": "0000001-12.2023.8.26.0100",
  "count": 5,
  "movements": [
    {
      "date": "2023-12-01T10:00:00Z",
      "description": "Distribuição da ação",
      "status": "processado",
      "complement": "Distribuído à Vara Cível"
    },
    {
      "date": "2023-12-05T14:30:00Z",
      "description": "Citação do réu",
      "status": "processado",
      "complement": "Citação por mandado"
    },
    // ... mais movimentações
  ]
}
```

### 6. Enviar Petição para um Tribunal

**Request**
```http
POST /api/v1/tribunals/:tribunal/petitions
Authorization: Bearer <token>
Content-Type: application/json

{
  "processNumber": "0000001-12.2023.8.26.0100",
  "title": "Petição Inicial",
  "content": "Excelentíssimo Senhor Juiz...",
  "subject": "Ação de Indenização por Dano Moral",
  "certificateFingerprint": "abc123...",
  "certificatePassword": "cert_password"
}
```

**Example**
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "processNumber": "0000001-12.2023.8.26.0100",
    "title": "Petição para Condenação",
    "content": "Excelentíssimo...",
    "subject": "Ação de Indenização",
    "certificateFingerprint": "fingerprint123",
    "certificatePassword": "password123"
  }' \
  http://localhost:3000/api/v1/tribunals/tjpr/petitions
```

**Response - Sucesso**
```json
{
  "status": "success",
  "tribunal": "tjpr",
  "protocol": "2024010123456789",
  "protocolDate": "2024-01-01T12:30:00Z",
  "message": "Petição enviada com sucesso"
}
```

**Response - Falha**
```json
{
  "status": "failed",
  "tribunal": "tjpr",
  "error": "Certificado inválido",
  "errors": ["Certificado expirado"]
}
```

### 7. Consultar Status de Petição

**Request**
```http
GET /api/v1/tribunals/:tribunal/petitions/:protocol/status
Authorization: Bearer <token>
```

**Example**
```http
GET /api/v1/tribunals/tjpr/petitions/2024010123456789/status
```

**Response**
```json
{
  "status": "success",
  "tribunal": "tjpr",
  "petitionStatus": {
    "protocolo": "2024010123456789",
    "status": "aceita",
    "dataStatus": "2024-01-01T14:00:00Z",
    "mensagem": "Petição aceita pelo tribunal"
  }
}
```

## Filtros de Busca

### Buscar por Parte

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"partyName": "João Silva"}' \
  http://localhost:3000/api/v1/tribunals/tjsc/processes/search
```

### Buscar por Assunto

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"subject": "Indenização"}' \
  http://localhost:3000/api/v1/tribunals/tjsc/processes/search
```

### Buscar por Intervalo de Datas

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-12-31"
  }' \
  http://localhost:3000/api/v1/tribunals/tjsc/processes/search
```

### Buscar com Múltiplos Critérios

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "partyName": "João Silva",
    "subject": "Dano Moral",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31",
    "limit": 100
  }' \
  http://localhost:3000/api/v1/tribunals/trf4/processes/search
```

## Códigos de Status HTTP

| Status | Significado |
|--------|-------------|
| 200 | Sucesso |
| 400 | Erro na requisição (validação, tribunal indisponível) |
| 401 | Não autorizado (token ausente ou inválido) |
| 404 | Tribunal não suportado |
| 500 | Erro interno do servidor |

## Exemplo Completo: Fluxo Multi-Tribunal

### 1. Listar tribunais disponíveis
```bash
curl http://localhost:3000/api/v1/tribunals/tribunals
```

### 2. Verificar saúde de um tribunal
```bash
curl http://localhost:3000/api/v1/tribunals/tjsc/health
```

### 3. Buscar processo no tribunal desejado
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/v1/tribunals/tjsc/processes/0000001-12.2023.8.26.0100
```

### 4. Obter movimentações
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/v1/tribunals/tjsc/processes/0000001-12.2023.8.26.0100/movements
```

### 5. Enviar petição
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "processNumber": "0000001-12.2023.8.26.0100",
    "title": "Minha Petição",
    "content": "Conteúdo...",
    "subject": "Ação",
    "certificateFingerprint": "abc123",
    "certificatePassword": "pwd"
  }' \
  http://localhost:3000/api/v1/tribunals/tjsc/petitions
```

### 6. Verificar status
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/v1/tribunals/tjsc/petitions/2024010123456789/status
```

## Variáveis de Ambiente

```env
# TJSC
EPROC_API_URL=https://eproc.tjsc.jus.br/api

# TRF4
TRF4_API_URL=https://portal-eproc.trf4.jus.br/eprocV2/
TRF4_LOGIN=seu_login
TRF4_PASSWORD=sua_senha

# JFPR
JFPR_API_URL=https://eproc.jfpr.jus.br/api
JFPR_LOGIN=seu_login
JFPR_PASSWORD=sua_senha

# TJPR (Projudi)
PROJUDI_WSDL_URL=https://tst.tjpr.jus.br/projudi/webservices/projudiIntercomunicacaoWebService222?wsdl
PROJUDI_USERNAME=seu_usuario
PROJUDI_PASSWORD=sua_senha

# JUST (PDPJ-Br)
JUST_API_URL=https://api.datajud.cnj.jus.br/api/v1
JUST_API_KEY=sua_chave_api
```

## Tratamento de Erros

### Tribunal Não Suportado
```json
{
  "error": "Tribunal tjxx não suportado. Tribunais disponíveis: tjsc, trf4, jfpr, tjpr, just"
}
```

### Processo Não Encontrado
```json
{
  "error": "Processo não encontrado: 9999999-99.9999.9.99.9999"
}
```

### Autenticação Falhada
```json
{
  "error": "Certificado inválido"
}
```

## Integração com Sistema de Petições

O sistema multi-tribunal integra-se perfeitamente com o sistema de petições existente:

```javascript
// Criar petição (genérica)
POST /api/v1/petitions {
  "processNumber": "0000001-12.2023.8.26.0100",
  "tribunal": "tjsc",
  "title": "Petição Inicial",
  "content": "..."
}

// Depois enviar para tribunal específico
POST /api/v1/tribunals/tjsc/petitions {
  "processNumber": "0000001-12.2023.8.26.0100",
  "title": "Petição Inicial",
  "content": "...",
  "certificateFingerprint": "...",
  "certificatePassword": "..."
}
```

## Performance e Limitações

- **Timeout**: 30 segundos por requisição
- **Limite de Resultados**: 50 processos por padrão (máximo 1000)
- **Rate Limiting**: 100 requisições por 15 minutos
- **Cache**: Processos são cacheados por 1 hora

## Roadmap Futuro

- [ ] Adapters para PJe, eSAJ
- [ ] Suporte a WebSocket para atualizações em tempo real
- [ ] Dashboard de sincronização multi-tribunal
- [ ] Webhooks para notificações de movimentações
- [ ] Filtros avançados (partes, juízes, valores)
- [ ] Relatórios multi-tribunal

## Suporte

Para dúvidas ou problemas:
- Email: celiotibes@gmail.com
- Documentação: https://github.com/celiotibes/legal-automation
