# Lucide React API Reference

## Overview

The Lucide React API provides REST endpoints for document management, OCR processing, synchronization, and user account management. All endpoints require authentication and use HTTPS.

## Base URL

```
https://api.lucide.app/v1
```

## Authentication

### Bearer Token

All requests require an Authorization header with a Bearer token:

```
Authorization: Bearer {access_token}
```

### Obtaining Tokens

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

### Token Refresh

```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": [
      {
        "field": "title",
        "message": "Title is required"
      }
    ]
  }
}
```

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | OK | Request succeeded |
| 201 | Created | Resource created successfully |
| 204 | No Content | Request succeeded with no response body |
| 400 | Bad Request | Invalid parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Resource conflict (e.g., duplicate) |
| 422 | Unprocessable Entity | Validation error |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |

## Documents API

### List Documents

```http
GET /documents?page=1&limit=20&category=financial&status=complete
Authorization: Bearer {token}
```

**Query Parameters:**
- `page` (integer): Page number, default 1
- `limit` (integer): Items per page, default 20, max 100
- `category` (string): Filter by category
- `status` (string): Filter by status (draft, processing, complete, error)
- `sort` (string): Sort field (created_at, updated_at, title)
- `order` (string): Sort order (asc, desc)

**Response:**
```json
{
  "data": [
    {
      "id": "doc-123",
      "title": "Invoice January 2024",
      "category": "financial",
      "status": "complete",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "file_size": 1024000,
      "ocr_confidence": 0.95
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

### Get Document

```http
GET /documents/{id}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "id": "doc-123",
  "title": "Invoice January 2024",
  "category": "financial",
  "status": "complete",
  "content": {
    "text": "Invoice number: INV-2024-001",
    "extracted_data": {
      "invoice_number": "INV-2024-001",
      "date": "2024-01-15",
      "amount": 1500.00
    }
  },
  "metadata": {
    "tags": ["invoice", "2024"],
    "source": "email",
    "notes": "Important invoice"
  },
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "ocr_confidence": 0.95
}
```

### Upload Document

```http
POST /documents
Content-Type: multipart/form-data
Authorization: Bearer {token}

--boundary
Content-Disposition: form-data; name="file"; filename="invoice.pdf"
Content-Type: application/pdf

[file binary content]
--boundary
Content-Disposition: form-data; name="title"

Invoice January 2024
--boundary
Content-Disposition: form-data; name="category"

financial
--boundary--
```

**Response:** `201 Created`
```json
{
  "id": "doc-123",
  "title": "Invoice January 2024",
  "status": "processing",
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Update Document

```http
PATCH /documents/{id}
Content-Type: application/json
Authorization: Bearer {token}

{
  "title": "Updated Title",
  "category": "legal",
  "metadata": {
    "tags": ["important"],
    "notes": "Updated notes"
  }
}
```

**Response:** `200 OK`
```json
{
  "id": "doc-123",
  "title": "Updated Title",
  "updated_at": "2024-01-15T11:00:00Z"
}
```

### Delete Document

```http
DELETE /documents/{id}
Authorization: Bearer {token}
```

**Response:** `204 No Content`

## OCR API

### Process Document

```http
POST /documents/{id}/process
Content-Type: application/json
Authorization: Bearer {token}

{
  "language": "en",
  "quality": "high"
}
```

**Response:** `202 Accepted`
```json
{
  "job_id": "ocr-job-456",
  "status": "processing",
  "progress": 0
}
```

### Get Processing Status

```http
GET /documents/{id}/process/{job_id}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "job_id": "ocr-job-456",
  "status": "completed",
  "progress": 100,
  "results": {
    "text": "Extracted text content",
    "confidence": 0.95,
    "pages": 1,
    "words": 150
  }
}
```

### Correct OCR Results

```http
POST /documents/{id}/corrections
Content-Type: application/json
Authorization: Bearer {token}

{
  "original": "Incorrect text",
  "correction": "Correct text",
  "confidence": 0.95
}
```

## Sync API

### Get Sync Status

```http
GET /sync/status
Authorization: Bearer {token}
```

**Response:**
```json
{
  "last_sync": "2024-01-15T10:30:00Z",
  "next_sync": "2024-01-15T10:35:00Z",
  "pending_changes": 3,
  "conflicts": 0,
  "status": "idle"
}
```

### Sync Documents

```http
POST /sync/documents
Content-Type: application/json
Authorization: Bearer {token}

{
  "last_sync": "2024-01-15T10:00:00Z",
  "changes": [
    {
      "id": "doc-123",
      "action": "create",
      "data": {
        "title": "New Document"
      }
    }
  ]
}
```

**Response:** `200 OK`
```json
{
  "synced": 3,
  "failed": 0,
  "conflicts": [
    {
      "id": "doc-456",
      "local": { "version": 1 },
      "remote": { "version": 2 }
    }
  ]
}
```

### Resolve Conflict

```http
POST /sync/conflicts/{id}/resolve
Content-Type: application/json
Authorization: Bearer {token}

{
  "resolution": "keep_remote",
  "local_version": 1,
  "remote_version": 2
}
```

**Response:** `200 OK`

## Backup API

### Create Backup

```http
POST /backups
Content-Type: application/json
Authorization: Bearer {token}

{
  "name": "Backup Jan 15",
  "scope": "all"
}
```

**Response:** `201 Created`
```json
{
  "id": "backup-789",
  "name": "Backup Jan 15",
  "scope": "all",
  "size": 5242880,
  "created_at": "2024-01-15T10:30:00Z"
}
```

### List Backups

```http
GET /backups?limit=10
Authorization: Bearer {token}
```

**Response:**
```json
{
  "data": [
    {
      "id": "backup-789",
      "name": "Backup Jan 15",
      "size": 5242880,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Restore Backup

```http
POST /backups/{id}/restore
Content-Type: application/json
Authorization: Bearer {token}

{
  "mode": "merge"
}
```

**Response:** `202 Accepted`
```json
{
  "job_id": "restore-123",
  "status": "in_progress",
  "progress": 45
}
```

## User API

### Get Profile

```http
GET /users/me
Authorization: Bearer {token}
```

**Response:**
```json
{
  "id": "user-123",
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "created_at": "2023-01-01T00:00:00Z"
}
```

### Update Profile

```http
PATCH /users/me
Content-Type: application/json
Authorization: Bearer {token}

{
  "first_name": "Jane",
  "last_name": "Smith"
}
```

### Change Password

```http
POST /users/me/change-password
Content-Type: application/json
Authorization: Bearer {token}

{
  "current_password": "old_password",
  "new_password": "new_password"
}
```

**Response:** `200 OK`

## Rate Limiting

### Rate Limit Headers

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1610695200
```

### Limits

- **Standard**: 1000 requests per hour per token
- **Upload**: 100 MB per day
- **Batch**: 1000 documents per batch operation

## Webhooks

### Configure Webhook

```http
POST /webhooks
Content-Type: application/json
Authorization: Bearer {token}

{
  "url": "https://example.com/webhook",
  "events": ["document.completed", "sync.failed"]
}
```

### Webhook Events

| Event | Payload | Description |
|-------|---------|-------------|
| document.created | {id, title, status} | Document uploaded |
| document.completed | {id, confidence} | OCR processing complete |
| document.failed | {id, error} | Processing failed |
| sync.started | {timestamp} | Sync operation started |
| sync.completed | {count, timestamp} | Sync completed |
| sync.failed | {error} | Sync operation failed |

## Examples

### Upload and Process Document

```bash
# 1. Upload document
curl -X POST https://api.lucide.app/v1/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@invoice.pdf" \
  -F "title=Invoice January 2024"

# 2. Check processing status
curl https://api.lucide.app/v1/documents/doc-123 \
  -H "Authorization: Bearer $TOKEN"

# 3. Get extracted text
curl https://api.lucide.app/v1/documents/doc-123 \
  -H "Authorization: Bearer $TOKEN" | jq '.content.text'
```

### Implement Offline Sync

```typescript
async function syncDocuments() {
  const lastSync = await storage.getLastSyncTime();
  const localChanges = await storage.getPendingChanges();
  
  const response = await api.post('/sync/documents', {
    last_sync: lastSync,
    changes: localChanges
  });
  
  const { synced, conflicts } = response;
  
  for (const conflict of conflicts) {
    await api.post(`/sync/conflicts/${conflict.id}/resolve`, {
      resolution: 'keep_remote'
    });
  }
  
  await storage.setLastSyncTime(new Date());
}
```

---

*Last Updated: October 2024*
*Version: 1.0*
*API Documentation for Lucide React*
