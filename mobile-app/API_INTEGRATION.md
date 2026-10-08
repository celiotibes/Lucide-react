# API Integration Guide

## Overview

The CRMT Mobile App communicates with the desktop CRMT installer via HTTP/HTTPS REST API. All communication is request/response based with JSON payloads.

## Base URL Configuration

The API endpoint must be configured before authentication:

```typescript
// Via Setup Wizard (first launch)
// Via Settings Screen (runtime)
// Programmatically:
import { useAuth } from '@/hooks';

const { setApiEndpoint } = useAuth();
setApiEndpoint('http://192.168.1.100:8000');
```

## Authentication

### Login Endpoint

**Request**
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "refresh_token_here...",
  "expiresIn": 3600,
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "nome": "John Doe",
    "avatar": "https://..."
  }
}
```

### Token Refresh

**Request**
```
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "refresh_token_here"
}
```

**Response**
```json
{
  "token": "new_token_here",
  "expiresIn": 3600
}
```

### Token Verification

**Request**
```
GET /api/auth/verify
Authorization: Bearer <token>
```

**Response**
```json
{
  "valid": true
}
```

## Document Management

### List Documents

**Request**
```
GET /api/documentos?page=1&limit=20&search=contrato&tipo=contrato&dataInicio=2024-01-01&dataFim=2024-12-31
Authorization: Bearer <token>
```

**Response**
```json
{
  "data": [
    {
      "id": "doc-123",
      "tipo": "contrato",
      "arquivo_nome": "contrato_2024.pdf",
      "valor": 50000.00,
      "data_documento": "2024-01-15",
      "data_criacao": "2024-01-15T10:30:00Z",
      "proprietario_id": "user-123",
      "descricao": "Purchase contract",
      "tags": ["important", "2024"],
      "url": "https://api.example.com/files/doc-123",
      "arquivo_path": "/documents/doc-123.pdf"
    }
  ],
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 20,
    "pages": 3
  }
}
```

### Get Document Detail

**Request**
```
GET /api/documentos/:id
Authorization: Bearer <token>
```

**Response**
```json
{
  "id": "doc-123",
  "tipo": "contrato",
  "arquivo_nome": "contrato_2024.pdf",
  "valor": 50000.00,
  "data_documento": "2024-01-15",
  "data_criacao": "2024-01-15T10:30:00Z",
  "proprietario_id": "user-123",
  "descricao": "Purchase contract",
  "tags": ["important", "2024"],
  "url": "https://api.example.com/files/doc-123",
  "arquivo_path": "/documents/doc-123.pdf"
}
```

### Create Document

**Request**
```
POST /api/documentos
Content-Type: application/json
Authorization: Bearer <token>

{
  "tipo": "contrato",
  "arquivo_nome": "contrato_2024.pdf",
  "valor": 50000.00,
  "data_documento": "2024-01-15",
  "descricao": "Purchase contract",
  "tags": ["important", "2024"]
}
```

**Response**
```json
{
  "id": "doc-123",
  "tipo": "contrato",
  "arquivo_nome": "contrato_2024.pdf",
  "valor": 50000.00,
  "data_documento": "2024-01-15",
  "data_criacao": "2024-01-15T10:30:00Z",
  "proprietario_id": "user-123",
  "url": "https://api.example.com/files/doc-123"
}
```

### Update Document

**Request**
```
PATCH /api/documentos/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "descricao": "Updated description",
  "tags": ["important", "2024", "archived"]
}
```

### Delete Document

**Request**
```
DELETE /api/documentos/:id
Authorization: Bearer <token>
```

### Upload Document File

**Request**
```
POST /api/documentos/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>

FormData:
  file: <binary file>
  documentoId: "doc-123" (optional)
  tipo: "contrato"
```

**Response**
```json
{
  "id": "doc-123",
  "arquivo_nome": "contrato_2024.pdf",
  "arquivo_path": "/documents/doc-123.pdf",
  "url": "https://api.example.com/files/doc-123"
}
```

## OCR Processing

### Process Document with OCR

**Request**
```
POST /api/ocr/process
Content-Type: application/json
Authorization: Bearer <token>

{
  "arquivo_path": "/documents/doc-123.pdf",
  "documentoId": "doc-123"
}
```

**Response**
```json
{
  "id": "ocr-task-123",
  "status": "processing",
  "result": null
}
```

### Get OCR Status

**Request**
```
GET /api/ocr/:id/status
Authorization: Bearer <token>
```

**Response**
```json
{
  "id": "ocr-task-123",
  "status": "completed",
  "result": {
    "text": "Extracted text from document...",
    "confidence": 0.95,
    "detectedFields": {
      "valor": "R$ 50.000,00",
      "data": "15/01/2024",
      "proprietario": "John Doe"
    }
  }
}
```

## Transaction Management

### List Transactions

**Request**
```
GET /api/transacoes?page=1&limit=20&categoria=salary&dataInicio=2024-01-01&dataFim=2024-12-31&tipo=income
Authorization: Bearer <token>
```

**Response**
```json
{
  "data": [
    {
      "id": "trans-123",
      "data": "2024-01-15",
      "descricao": "Monthly salary",
      "valor": 5000.00,
      "categoria": "salary",
      "tipo": "income",
      "proprietario_id": "user-123",
      "data_criacao": "2024-01-15T10:30:00Z",
      "tags": ["work", "recurring"]
    }
  ],
  "pagination": {
    "total": 125,
    "page": 1,
    "limit": 20,
    "pages": 7
  }
}
```

### Create Transaction

**Request**
```
POST /api/transacoes
Content-Type: application/json
Authorization: Bearer <token>

{
  "data": "2024-01-15",
  "descricao": "Monthly salary",
  "valor": 5000.00,
  "categoria": "salary",
  "tipo": "income",
  "documento_id": "doc-123",
  "tags": ["work", "recurring"]
}
```

### Update Transaction

**Request**
```
PATCH /api/transacoes/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "descricao": "Updated description",
  "valor": 5100.00,
  "tags": ["work", "recurring", "bonus"]
}
```

### Delete Transaction

**Request**
```
DELETE /api/transacoes/:id
Authorization: Bearer <token>
```

## Property Management

### List Properties

**Request**
```
GET /api/imoveis?page=1&limit=20&search=apartment&tipo=imovel
Authorization: Bearer <token>
```

### Create Property

**Request**
```
POST /api/imoveis
Content-Type: application/json
Authorization: Bearer <token>

{
  "nome": "Downtown Apartment",
  "tipo": "imovel",
  "endereco": "123 Main St, City, State",
  "valor_estimado": 250000.00,
  "data_aquisicao": "2020-06-15",
  "descricao": "2-bedroom apartment",
  "tags": ["residential", "investment"]
}
```

## Sync Endpoint

For offline-first sync with WatermelonDB:

### Sync Request

**Request**
```
POST /api/sync
Content-Type: application/json
Authorization: Bearer <token>

{
  "lastSyncTimestamp": 1704067200000,
  "changes": {
    "documents": [
      { "id": "doc-123", "titulo": "Updated" }
    ],
    "transactions": [],
    "properties": []
  }
}
```

**Response**
```json
{
  "data": {
    "documents": [...],
    "transactions": [...],
    "properties": [...]
  },
  "timestamp": 1704153600000,
  "hasMore": false
}
```

## Dashboard Endpoints

### Get Dashboard Stats

**Request**
```
GET /api/dashboard/stats
Authorization: Bearer <token>
```

**Response**
```json
{
  "totalDocuments": 45,
  "totalValue": 500000.00,
  "recentDocuments": [...],
  "recentTransactions": [...],
  "summary": {
    "byType": {
      "recibo": 20,
      "notafiscal": 15,
      "contrato": 10
    },
    "byMonth": [
      {
        "month": "2024-01",
        "count": 15,
        "value": 75000.00
      }
    ]
  }
}
```

## Error Responses

All error responses follow this format:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "statusCode": 400,
  "details": {}
}
```

### Common HTTP Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created
- `400 Bad Request` - Invalid request format
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict (e.g., duplicate)
- `422 Unprocessable Entity` - Validation error
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Server temporarily unavailable

## Rate Limiting

- Default: 100 requests per minute per user
- Retry-After header included in 429 responses

## Headers

All requests should include:

```
Content-Type: application/json
Authorization: Bearer <token>
Accept: application/json
```

## Implementation Example

```typescript
import { documentsApi } from '@/api';

// Get list of documents
try {
  const response = await documentsApi.list({
    page: 1,
    limit: 20,
    search: 'contrato',
  });
  console.log(response.data); // Document[]
} catch (error) {
  console.error('Failed to fetch documents:', error);
}

// Create document
try {
  const newDoc = await documentsApi.create({
    tipo: 'contrato',
    arquivo_nome: 'contract.pdf',
    valor: 50000,
    data_documento: '2024-01-15',
  });
  console.log('Document created:', newDoc.id);
} catch (error) {
  console.error('Failed to create document:', error);
}

// Process with OCR
try {
  const result = await documentsApi.processOCR({
    arquivo_path: '/documents/doc-123.pdf',
    documentoId: 'doc-123',
  });
  console.log('OCR status:', result.status);
} catch (error) {
  console.error('Failed to process OCR:', error);
}
```

## API Deployment Considerations

For the mobile app to work with the desktop API:

1. **Network Accessibility**: Ensure the API is accessible from the mobile device's network
2. **CORS**: If needed, configure CORS headers for cross-origin requests
3. **SSL/HTTPS**: Use HTTPS in production
4. **Timeout**: API calls timeout after 30 seconds
5. **Retry Logic**: Failed requests automatically retry 3 times with exponential backoff

## Testing the API

Use the setup wizard to test connectivity:

1. Enter the API endpoint URL
2. Click "Test Connection"
3. If successful, proceed to login
4. If failed, verify the desktop API is running and accessible
