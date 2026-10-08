# CRMT Mobile App - API Reference

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Base URL and Headers](#base-url-and-headers)
4. [Authentication Endpoints](#authentication-endpoints)
5. [Document Endpoints](#document-endpoints)
6. [Transaction Endpoints](#transaction-endpoints)
7. [User Endpoints](#user-endpoints)
8. [Notification Endpoints](#notification-endpoints)
9. [Error Handling](#error-handling)
10. [Rate Limiting](#rate-limiting)
11. [Best Practices](#best-practices)
12. [Code Examples](#code-examples)

---

## Overview

The CRMT Mobile App API is a RESTful API that provides endpoints for managing documents, transactions, user accounts, and notifications. The API is designed to support offline-first mobile applications with sync capabilities.

### Key Features

- **RESTful Design**: Standard HTTP methods (GET, POST, PUT, DELETE)
- **JWT Authentication**: Secure token-based authentication
- **JSON Responses**: All responses use JSON format
- **Pagination**: Large datasets are paginated
- **Versioning**: API versioning through URL path
- **CORS**: Cross-origin requests supported
- **Rate Limiting**: Requests throttled to prevent abuse

### API Version

Current API Version: **v1**

All endpoints use: `https://api.accounting-legal.com/v1/`

### Base Requirements

- API Key or OAuth 2.0 token for authentication
- Accept header set to `application/json`
- Content-Type header set to `application/json` (for POST/PUT requests)

---

## Authentication

### Authentication Methods

#### 1. JWT Token (Recommended)

Most endpoints require a Bearer token obtained during login.

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 2. API Key (Legacy)

Some legacy endpoints support API key authentication.

```http
X-API-Key: your-api-key-here
```

#### 3. OAuth 2.0

For third-party integrations:

```http
Authorization: Bearer <oauth_access_token>
```

### Token Management

**Token Lifespan**:
- Access Token: 1 hour
- Refresh Token: 30 days
- Tokens expire and must be refreshed before use

**Automatic Refresh**:
- Client automatically refreshes expiring tokens
- Failed requests due to expired tokens retry once after refresh
- Manual refresh available via `/auth/refresh` endpoint

**Secure Storage**:
- Tokens stored in device secure storage (Keychain/Keystore)
- Never transmitted in URLs
- Cleared on logout

---

## Base URL and Headers

### Base URL

```
https://api.accounting-legal.com/v1/
```

### Required Headers

All requests must include:

```http
Content-Type: application/json
Accept: application/json
Authorization: Bearer {token}
```

### Optional Headers

```http
X-Request-ID: unique-request-identifier
X-Client-Version: 1.0.0
X-Platform: android|ios
Accept-Language: en-US
```

### Example Request

```http
GET /documents HTTP/1.1
Host: api.accounting-legal.com
Content-Type: application/json
Accept: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-Client-Version: 1.0.0
```

---

## Authentication Endpoints

### 1. Login

**Endpoint**: `POST /auth/login`

**Description**: Authenticate user with email and password.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123!",
  "deviceId": "device-unique-identifier",
  "deviceName": "Samsung Galaxy S21"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600,
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "name": "John Doe",
      "organizationId": "org-456"
    }
  }
}
```

**Error Response** (401 Unauthorized):
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect",
    "timestamp": "2026-10-08T10:30:00Z"
  }
}
```

**cURL Example**:
```bash
curl -X POST https://api.accounting-legal.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123!",
    "deviceId": "device-id",
    "deviceName": "Samsung Galaxy S21"
  }'
```

### 2. Register

**Endpoint**: `POST /auth/register`

**Description**: Create a new user account.

**Request Body**:
```json
{
  "email": "newuser@example.com",
  "password": "securePassword123!",
  "confirmPassword": "securePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "organizationId": "org-456"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "user-789",
    "email": "newuser@example.com",
    "name": "John Doe",
    "message": "Account created. Please verify your email."
  }
}
```

**Validation Rules**:
- Email must be unique
- Password minimum 8 characters
- Must include uppercase, lowercase, numbers, special characters
- Name fields required

### 3. Refresh Token

**Endpoint**: `POST /auth/refresh`

**Description**: Obtain new access token using refresh token.

**Request Body**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 3600
  }
}
```

### 4. Logout

**Endpoint**: `POST /auth/logout`

**Description**: Invalidate current session.

**Headers**: Requires valid Bearer token

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

### 5. Forgot Password

**Endpoint**: `POST /auth/forgot-password`

**Description**: Request password reset email.

**Request Body**:
```json
{
  "email": "user@example.com"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Password reset email sent"
  }
}
```

### 6. Reset Password

**Endpoint**: `POST /auth/reset-password`

**Description**: Reset password using reset token.

**Request Body**:
```json
{
  "token": "reset-token-from-email",
  "password": "newSecurePassword123!",
  "confirmPassword": "newSecurePassword123!"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Password reset successfully"
  }
}
```

---

## Document Endpoints

### 1. Upload Document

**Endpoint**: `POST /documents/upload`

**Description**: Upload a document with image/file.

**Request**: Multipart form-data

```
POST /documents/upload HTTP/1.1
Content-Type: multipart/form-data; boundary=----FormBoundary

------FormBoundary
Content-Disposition: form-data; name="file"; filename="receipt.jpg"
Content-Type: image/jpeg

[binary image data]
------FormBoundary
Content-Disposition: form-data; name="category"

receipt
------FormBoundary
Content-Disposition: form-data; name="tags"

lunch, business
------FormBoundary--
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "doc-123",
    "fileName": "receipt.jpg",
    "fileSize": 245632,
    "status": "processing",
    "category": "receipt",
    "tags": ["lunch", "business"],
    "uploadedAt": "2026-10-08T10:30:00Z",
    "processingStatus": {
      "state": "processing",
      "progress": 25
    }
  }
}
```

**cURL Example**:
```bash
curl -X POST https://api.accounting-legal.com/v1/documents/upload \
  -H "Authorization: Bearer token" \
  -F "file=@receipt.jpg" \
  -F "category=receipt" \
  -F "tags=lunch,business"
```

### 2. Get Documents List

**Endpoint**: `GET /documents?page=1&limit=20&category=receipt&status=processed`

**Description**: Retrieve paginated list of documents.

**Query Parameters**:
- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page (default: 20, max: 100)
- `category` (string): Filter by category
- `status` (string): Filter by status (processing, processed, failed)
- `startDate` (string): ISO 8601 date filter
- `endDate` (string): ISO 8601 date filter
- `sortBy` (string): Sort field (createdAt, updatedAt, fileName)
- `sortOrder` (string): asc or desc

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "id": "doc-123",
        "fileName": "receipt.jpg",
        "category": "receipt",
        "status": "processed",
        "extractedData": {
          "vendor": "Starbucks",
          "amount": 5.45,
          "date": "2026-10-08"
        },
        "uploadedAt": "2026-10-08T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 245,
      "pages": 13,
      "hasNext": true
    }
  }
}
```

### 3. Get Document Details

**Endpoint**: `GET /documents/{documentId}`

**Description**: Retrieve full details for a specific document.

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "doc-123",
    "fileName": "receipt.jpg",
    "fileUrl": "https://cdn.accounting-legal.com/doc-123.jpg",
    "thumbnailUrl": "https://cdn.accounting-legal.com/doc-123-thumb.jpg",
    "category": "receipt",
    "status": "processed",
    "tags": ["lunch", "business"],
    "uploadedAt": "2026-10-08T10:30:00Z",
    "processedAt": "2026-10-08T10:35:00Z",
    "extractedData": {
      "fullText": "Starbucks\n1234 Main St\n...",
      "vendor": "Starbucks",
      "amount": 5.45,
      "currency": "USD",
      "date": "2026-10-08",
      "items": [
        {
          "name": "Latte",
          "quantity": 1,
          "price": 5.45
        }
      ]
    },
    "confidence": 0.95,
    "processingErrors": [],
    "associatedTransactionId": "txn-456"
  }
}
```

### 4. Update Document

**Endpoint**: `PUT /documents/{documentId}`

**Description**: Update document metadata and extracted data.

**Request Body**:
```json
{
  "category": "receipt",
  "tags": ["lunch", "business", "client-meeting"],
  "extractedData": {
    "vendor": "Starbucks",
    "amount": 5.45,
    "date": "2026-10-08"
  },
  "notes": "Team lunch meeting"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "doc-123",
    "updated": true,
    "updatedAt": "2026-10-08T10:40:00Z"
  }
}
```

### 5. Delete Document

**Endpoint**: `DELETE /documents/{documentId}`

**Description**: Delete a document permanently.

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Document deleted successfully"
  }
}
```

### 6. Get Processing Status

**Endpoint**: `GET /documents/{documentId}/processing-status`

**Description**: Get detailed processing status and progress.

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "status": "processing",
    "progress": 65,
    "steps": [
      {
        "name": "image_enhancement",
        "status": "completed"
      },
      {
        "name": "ocr_extraction",
        "status": "in_progress",
        "progress": 75
      },
      {
        "name": "field_detection",
        "status": "pending"
      }
    ],
    "estimatedTimeRemaining": 45
  }
}
```

---

## Transaction Endpoints

### 1. Create Transaction

**Endpoint**: `POST /transactions`

**Description**: Create a new transaction.

**Request Body**:
```json
{
  "type": "expense",
  "amount": 125.50,
  "currency": "USD",
  "date": "2026-10-08",
  "category": "Office Supplies",
  "description": "Monthly office supplies purchase",
  "payee": "Staples",
  "documentId": "doc-123",
  "tags": ["office", "monthly"],
  "metadata": {
    "projectId": "proj-789",
    "costCenter": "CC-001"
  }
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "txn-123",
    "type": "expense",
    "amount": 125.50,
    "currency": "USD",
    "date": "2026-10-08",
    "category": "Office Supplies",
    "status": "active",
    "createdAt": "2026-10-08T10:30:00Z"
  }
}
```

### 2. Get Transactions List

**Endpoint**: `GET /transactions?page=1&limit=20&type=expense&category=Office%20Supplies`

**Description**: Retrieve paginated transactions with filters.

**Query Parameters**:
- `page` (integer): Page number
- `limit` (integer): Items per page
- `type` (string): expense or income
- `category` (string): Transaction category
- `startDate` (string): ISO 8601 start date
- `endDate` (string): ISO 8601 end date
- `minAmount` (number): Minimum amount
- `maxAmount` (number): Maximum amount
- `status` (string): active, pending, cancelled
- `sortBy` (string): date, amount, category
- `sortOrder` (string): asc or desc

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "txn-123",
        "type": "expense",
        "amount": 125.50,
        "currency": "USD",
        "date": "2026-10-08",
        "category": "Office Supplies",
        "description": "Monthly office supplies purchase",
        "payee": "Staples",
        "status": "active",
        "createdAt": "2026-10-08T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 542,
      "pages": 28,
      "hasNext": true
    },
    "summary": {
      "totalExpenses": 15420.75,
      "totalIncome": 25000.00,
      "net": 9579.25,
      "count": 542
    }
  }
}
```

### 3. Get Transaction Details

**Endpoint**: `GET /transactions/{transactionId}`

**Description**: Retrieve complete transaction details.

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "txn-123",
    "type": "expense",
    "amount": 125.50,
    "currency": "USD",
    "date": "2026-10-08",
    "category": "Office Supplies",
    "description": "Monthly office supplies purchase",
    "payee": "Staples",
    "tags": ["office", "monthly"],
    "status": "active",
    "documentId": "doc-123",
    "metadata": {
      "projectId": "proj-789",
      "costCenter": "CC-001"
    },
    "createdAt": "2026-10-08T10:30:00Z",
    "updatedAt": "2026-10-08T10:30:00Z"
  }
}
```

### 4. Update Transaction

**Endpoint**: `PUT /transactions/{transactionId}`

**Description**: Update transaction details.

**Request Body**:
```json
{
  "category": "Office Equipment",
  "amount": 130.00,
  "description": "Office supplies and equipment"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "txn-123",
    "updated": true,
    "updatedAt": "2026-10-08T10:40:00Z"
  }
}
```

### 5. Delete Transaction

**Endpoint**: `DELETE /transactions/{transactionId}`

**Description**: Delete a transaction.

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Transaction deleted successfully"
  }
}
```

### 6. Get Analytics

**Endpoint**: `GET /transactions/analytics?startDate=2026-01-01&endDate=2026-12-31&groupBy=category`

**Description**: Get transaction analytics and summaries.

**Query Parameters**:
- `startDate` (string): ISO 8601 start date
- `endDate` (string): ISO 8601 end date
- `groupBy` (string): category, type, month
- `type` (string): expense, income or all

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalIncome": 75000.00,
      "totalExpenses": 45200.75,
      "net": 29799.25,
      "transactionCount": 287
    },
    "byCategory": [
      {
        "category": "Office Supplies",
        "total": 12450.50,
        "count": 45,
        "percentage": 27.5
      },
      {
        "category": "Travel",
        "total": 8920.25,
        "count": 23,
        "percentage": 19.7
      }
    ],
    "byMonth": [
      {
        "month": "2026-01",
        "income": 6250.00,
        "expenses": 3200.50,
        "net": 3049.50
      }
    ]
  }
}
```

---

## User Endpoints

### 1. Get Current User

**Endpoint**: `GET /users/me`

**Description**: Retrieve authenticated user profile.

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "user-123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "fullName": "John Doe",
    "profilePicture": "https://cdn.accounting-legal.com/user-123.jpg",
    "organizationId": "org-456",
    "organizationName": "Accounting & Legal Solutions",
    "role": "user",
    "permissions": ["read:documents", "write:transactions"],
    "createdAt": "2026-01-15T10:30:00Z",
    "lastLogin": "2026-10-08T09:45:00Z"
  }
}
```

### 2. Update User Profile

**Endpoint**: `PUT /users/me`

**Description**: Update user profile information.

**Request Body**:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "profilePicture": "base64-encoded-image"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "user-123",
    "fullName": "John Doe",
    "updatedAt": "2026-10-08T10:40:00Z"
  }
}
```

### 3. Change Password

**Endpoint**: `POST /users/me/change-password`

**Description**: Change user password.

**Request Body**:
```json
{
  "currentPassword": "oldPassword123!",
  "newPassword": "newPassword456!",
  "confirmPassword": "newPassword456!"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Password changed successfully"
  }
}
```

### 4. Get User Sessions

**Endpoint**: `GET /users/me/sessions`

**Description**: Get list of active sessions/devices.

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "sess-123",
        "deviceName": "Samsung Galaxy S21",
        "platform": "android",
        "appVersion": "1.0.0",
        "lastActivity": "2026-10-08T10:30:00Z",
        "ipAddress": "192.168.1.100",
        "isCurrent": true
      },
      {
        "id": "sess-124",
        "deviceName": "iPhone 13",
        "platform": "ios",
        "appVersion": "1.0.0",
        "lastActivity": "2026-10-07T14:20:00Z",
        "ipAddress": "192.168.1.101",
        "isCurrent": false
      }
    ]
  }
}
```

### 5. Revoke Session

**Endpoint**: `POST /users/me/sessions/{sessionId}/revoke`

**Description**: End a specific session/device.

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Session revoked successfully"
  }
}
```

---

## Notification Endpoints

### 1. Get Notifications

**Endpoint**: `GET /notifications?page=1&limit=20&read=false`

**Description**: Retrieve user notifications.

**Query Parameters**:
- `page` (integer): Page number
- `limit` (integer): Items per page
- `read` (boolean): Filter by read status
- `type` (string): Filter by notification type

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notif-123",
        "type": "document_processed",
        "title": "Document Processing Complete",
        "message": "Your receipt (receipt.jpg) has been processed successfully",
        "data": {
          "documentId": "doc-123",
          "status": "processed"
        },
        "read": false,
        "createdAt": "2026-10-08T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 47,
      "hasNext": true
    }
  }
}
```

### 2. Mark Notification as Read

**Endpoint**: `POST /notifications/{notificationId}/read`

**Description**: Mark a notification as read.

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Notification marked as read"
  }
}
```

### 3. Delete Notification

**Endpoint**: `DELETE /notifications/{notificationId}`

**Description**: Delete a notification.

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "message": "Notification deleted successfully"
  }
}
```

---

## Error Handling

### Error Response Format

All errors follow this standard format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "fieldName",
      "reason": "Specific reason for failure"
    },
    "timestamp": "2026-10-08T10:30:00Z",
    "requestId": "req-12345"
  }
}
```

### HTTP Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | OK | Successful GET, PUT |
| 201 | Created | Successful POST creating resource |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Validation error, invalid JSON |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource, sync conflict |
| 422 | Unprocessable Entity | Validation error with details |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Internal server error |
| 503 | Service Unavailable | Server under maintenance |

### Common Error Codes

```
INVALID_CREDENTIALS       - Login failed (wrong email/password)
INVALID_TOKEN             - Token expired or invalid
INSUFFICIENT_PERMISSIONS  - User lacks required permissions
RESOURCE_NOT_FOUND        - Requested resource doesn't exist
VALIDATION_ERROR          - Input validation failed
DUPLICATE_RESOURCE        - Resource already exists (email, etc)
RATE_LIMIT_EXCEEDED       - Too many requests
SERVER_ERROR              - Unexpected server error
SERVICE_UNAVAILABLE       - Server under maintenance
FILE_TOO_LARGE            - Uploaded file exceeds limit
UNSUPPORTED_FILE_TYPE     - File type not supported
NETWORK_ERROR             - Network connectivity issue
SYNC_CONFLICT             - Data conflict during sync
```

### Error Response Examples

**Validation Error (400)**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      },
      {
        "field": "password",
        "message": "Password must be at least 8 characters"
      }
    ],
    "timestamp": "2026-10-08T10:30:00Z"
  }
}
```

**Unauthorized (401)**:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Authentication token is invalid or expired",
    "timestamp": "2026-10-08T10:30:00Z"
  }
}
```

**Not Found (404)**:
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Document with ID 'doc-123' not found",
    "timestamp": "2026-10-08T10:30:00Z"
  }
}
```

---

## Rate Limiting

### Limits

- **Standard Users**: 1000 requests per hour
- **Premium Users**: 5000 requests per hour
- **API Keys**: 10000 requests per hour

### Rate Limit Headers

Every response includes rate limit information:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1633686000
```

### Handling Rate Limits

When you hit the rate limit, you'll receive:

```http
HTTP/1.1 429 Too Many Requests

X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1633686000
Retry-After: 3600
```

Response body:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Reset at 2026-10-08T11:30:00Z",
    "retryAfter": 3600
  }
}
```

### Retry Strategy

Recommended exponential backoff:

```typescript
async function makeRequestWithRetry(endpoint: string, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint)
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        const delay = parseInt(retryAfter || '60') * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      return response
    } catch (error) {
      const delay = Math.pow(2, attempt) * 1000
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}
```

---

## Best Practices

### 1. Token Management

- Store tokens securely (never in localStorage)
- Refresh tokens automatically before expiry
- Clear tokens on logout
- Use HTTPS always

```typescript
// Good
const token = await secureStorage.getToken('authToken')
if (isTokenExpiringSoon(token)) {
  const newToken = await refreshToken()
  await secureStorage.setToken('authToken', newToken)
}

// Bad
const token = localStorage.getItem('token')  // Not secure
```

### 2. Request Optimization

- Use pagination for large result sets
- Filter data server-side rather than client-side
- Cache responses where appropriate
- Compress large payloads

```typescript
// Good - paginated request
GET /documents?page=1&limit=50

// Bad - requesting all documents
GET /documents

// Good - filter server-side
GET /transactions?category=Office&startDate=2026-01-01

// Bad - fetch all then filter
GET /transactions
```

### 3. Error Handling

- Always check error codes
- Implement retry logic for transient errors
- Log errors for debugging
- Show user-friendly messages

```typescript
try {
  const response = await api.get('/documents')
} catch (error) {
  if (error.code === 'INVALID_TOKEN') {
    // Handle auth error
    await logout()
  } else if (error.code === 'RATE_LIMIT_EXCEEDED') {
    // Implement backoff
    await delay(error.retryAfter * 1000)
  } else {
    // Show generic error
    showErrorMessage('Something went wrong')
    logger.error(error)
  }
}
```

### 4. Network Efficiency

- Minimize number of requests
- Batch operations when possible
- Use conditional requests (If-Modified-Since)
- Implement offline-first strategy

```typescript
// Good - batch upload
POST /documents/batch
{
  "documents": [
    { "file": "doc1" },
    { "file": "doc2" },
    { "file": "doc3" }
  ]
}

// Less efficient - individual uploads
POST /documents (×3)
```

### 5. Data Validation

- Validate all input on client-side first
- Handle server-side validation errors
- Use type definitions for type safety
- Sanitize user input

```typescript
interface TransactionInput {
  amount: number
  category: string
  date: string
}

function validateTransaction(data: any): TransactionInput {
  if (!data.amount || data.amount <= 0) {
    throw new Error('Amount must be positive')
  }
  if (!data.category || data.category.trim() === '') {
    throw new Error('Category is required')
  }
  // ... more validations
  
  return data as TransactionInput
}
```

---

## Code Examples

### Example 1: Authenticate and Fetch Documents

```typescript
import axios, { AxiosInstance } from 'axios'

class APIClient {
  private client: AxiosInstance
  private accessToken: string | null = null

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      timeout: 10000,
    })

    this.client.interceptors.request.use(config => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`
      }
      return config
    })
  }

  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', {
      email,
      password,
      deviceId: 'device-123'
    })
    
    this.accessToken = response.data.data.accessToken
    return response.data.data
  }

  async getDocuments(page = 1, limit = 20) {
    const response = await this.client.get('/documents', {
      params: { page, limit }
    })
    return response.data.data
  }
}

// Usage
const api = new APIClient('https://api.accounting-legal.com/v1')

try {
  await api.login('user@example.com', 'password123')
  const documents = await api.getDocuments(1, 50)
  console.log('Documents:', documents)
} catch (error) {
  console.error('Error:', error)
}
```

### Example 2: Upload Document with Progress

```typescript
async function uploadDocument(
  fileUri: string,
  category: string,
  onProgress?: (progress: number) => void
) {
  const formData = new FormData()
  
  formData.append('file', {
    uri: fileUri,
    name: 'document.jpg',
    type: 'image/jpeg'
  })
  formData.append('category', category)

  const response = await fetch(
    'https://api.accounting-legal.com/v1/documents/upload',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    }
  )

  return await response.json()
}

// Usage with progress
uploadDocument(fileUri, 'receipt', (progress) => {
  console.log(`Upload progress: ${progress}%`)
})
```

### Example 3: Handling Sync Conflicts

```typescript
async function syncTransactions() {
  try {
    const pending = await db.transactions.getPending()
    
    for (const transaction of pending) {
      try {
        await api.post('/transactions', transaction)
        await db.transactions.markSynced(transaction.id)
      } catch (error) {
        if (error.code === 'SYNC_CONFLICT') {
          // Server version is newer
          const serverVersion = await api.get(
            `/transactions/${transaction.id}`
          )
          
          // Store for user review
          await db.conflicts.create({
            id: transaction.id,
            local: transaction,
            server: serverVersion,
            type: 'transaction'
          })
        } else {
          throw error
        }
      }
    }
  } catch (error) {
    logger.error('Sync failed', error)
  }
}
```

---

**API Version**: 1.0  
**Last Updated**: October 2026  
**Base URL**: https://api.accounting-legal.com/v1/

For the latest API documentation, visit: [api.accounting-legal.com/docs](https://api.accounting-legal.com/docs)
