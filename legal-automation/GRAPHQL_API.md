# GraphQL API Documentation

## Overview

The GraphQL API provides a modern, efficient interface for querying and mutating data in the Legal Automation Platform. It includes support for real-time subscriptions via WebSocket.

**Base URL:** `http://localhost:3000/graphql`
**WebSocket URL:** `ws://localhost:3000/graphql/subscriptions`
**API Explorer:** `http://localhost:3000/graphql` (Apollo Sandbox)

## Authentication

All GraphQL requests require an Authorization header with a valid JWT token:

```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"query": "{ dashboard { totalClients activeCases } }"}'
```

For WebSocket subscriptions, pass the token in the connection parameters:

```javascript
const client = new WebSocketClient({
  url: 'ws://localhost:3000/graphql/subscriptions',
  token: 'YOUR_JWT_TOKEN',
});
```

## Query Examples

### Fetch Dashboard Metrics

```graphql
query {
  dashboard {
    totalClients
    totalCases
    activeCases
    closedCases
    totalInvoiced
    totalCollected
    collectionRate
    upcomingDeadlines
    overdueInvoices
    caseSuccessRate
    averageCaseDuration
  }
}
```

### Fetch Clients with Pagination

```graphql
query {
  clients(first: 10, after: null, status: CUSTOMER, search: "Acme") {
    edges {
      cursor
      node {
        id
        name
        email
        phone
        status
        caseCount
        activeContractCount
        totalInvoiced
        totalPaid
      }
    }
    pageInfo {
      hasNextPage
      hasPreviousPage
      totalCount
      startCursor
      endCursor
    }
  }
}
```

### Fetch Cases with Deadline Filter

```graphql
query {
  casesByDeadline(daysUntilDeadline: 30, first: 50) {
    id
    caseNumber
    clientId
    courtName
    status
    deadlineDate
    amountClaimed
    lawyerAssigned
  }
}
```

### Fetch Case with Related Data

```graphql
query {
  case(id: "case-123") {
    id
    caseNumber
    caseType
    courtName
    status
    outcome
    deadlineDate
    amountClaimed
    amountAwarded
    
    # Relations
    client {
      id
      name
      email
    }
    
    intimations {
      id
      documentType
      deadlineDate
      isProcessed
    }
    
    invoices {
      id
      amount
      status
      dueDate
    }
    
    analytics {
      successRate
      riskFactors
      opportunityFactors
    }
    
    predictions {
      predictedOutcome
      confidenceScore
      riskLevel
    }
  }
}
```

### Fetch Overdue Invoices

```graphql
query {
  overdueInvoices(first: 50) {
    id
    invoiceNumber
    clientId
    amount
    amountPaid
    status
    dueDate
    overdueDays
    
    client {
      id
      name
      email
    }
  }
}
```

### Fetch Analytics Data

```graphql
query {
  courtAnalytics(courtName: "TJ-SP") {
    id
    courtName
    totalCases
    favorableCases
    unfavorableCases
    successRate
    avgDurationDays
    avgCaseValue
    judges
    specialization
  }
}
```

```graphql
query {
  lawyerPerformance(lawyerName: "John Doe") {
    id
    lawyerName
    totalCases
    casesWon
    casesLost
    casesSettled
    winRate
    avgCaseDuration
    specializations
    clientSatisfactionScore
  }
}
```

```graphql
query {
  financialAnalytics(periodMonth: "2026-07") {
    id
    periodMonth
    totalInvoiced
    totalReceived
    collectionRate
    overdueAmount
    overdueCount
    avgPaymentTimeDays
    invoiceCount
  }
}
```

## Mutation Examples

### Create Client

```graphql
mutation {
  createClient(input: {
    name: "Acme Corporation"
    email: "contact@acme.com"
    phone: "1199999999"
    cpf: "123.456.789-00"
    status: CUSTOMER
    caseTypes: ["Civil", "Trabalhista"]
    address: "Rua das Flores, 123"
    city: "São Paulo"
    state: "SP"
    industry: "Technology"
    notes: "New client from referral"
  }) {
    success
    errors
    client {
      id
      name
      email
      status
      createdAt
    }
  }
}
```

### Update Client

```graphql
mutation {
  updateClient(id: "client-123", input: {
    phone: "1188888888"
    status: INACTIVE
    notes: "Contract ended"
  }) {
    success
    errors
    client {
      id
      name
      phone
      status
      updatedAt
    }
  }
}
```

### Create Case

```graphql
mutation {
  createCase(input: {
    clientId: "client-123"
    caseNumber: "0000001-23.2024.1.21.0000"
    caseType: "Civil"
    courtName: "TJ-SP"
    judgeName: "Judge Silva"
    processNumber: "0000001-23.2024"
    filingDate: "2024-01-15"
    deadlineDate: "2024-03-15"
    amountClaimed: 50000.00
    lawyerAssigned: "John Doe"
    notes: "Property dispute case"
  }) {
    success
    errors
    case {
      id
      caseNumber
      status
      createdAt
    }
  }
}
```

### Update Case Status

```graphql
mutation {
  updateCaseStatus(id: "case-123", status: CLOSED) {
    success
    errors
    case {
      id
      status
      updatedAt
    }
  }
}
```

### Record Case Outcome

```graphql
mutation {
  recordCaseOutcome(id: "case-123", input: {
    outcome: FAVORABLE
    outcomeDescription: "Court ruled in favor of client"
    amountAwarded: 45000.00
  }) {
    success
    errors
    case {
      id
      outcome
      amountAwarded
      status
    }
  }
}
```

### Create Invoice

```graphql
mutation {
  createInvoice(input: {
    clientId: "client-123"
    invoiceNumber: "INV-2024-001"
    amount: 5000.00
    description: "Legal services - Case representation"
    dueDate: "2024-02-15"
    issuedDate: "2024-01-15"
    paymentMethod: PIX
    notes: "Monthly billing"
  }) {
    success
    errors
    invoice {
      id
      invoiceNumber
      amount
      status
      createdAt
    }
  }
}
```

### Record Payment

```graphql
mutation {
  recordPayment(invoiceId: "invoice-123", input: {
    amountPaid: 5000.00
    paymentMethod: PIX
    receiptUrl: "https://example.com/receipt.pdf"
    notes: "Payment received via Pix"
  }) {
    success
    errors
    invoice {
      id
      amountPaid
      status
      paidDate
    }
  }
}
```

### Create Contract

```graphql
mutation {
  createContract(input: {
    clientId: "client-123"
    title: "Service Agreement"
    description: "Annual retainer agreement"
    content: "Full contract text..."
    signatureRequired: true
  }) {
    success
    errors
    contract {
      id
      title
      status
      createdAt
    }
  }
}
```

### Sign Contract

```graphql
mutation {
  signContract(id: "contract-123", input: {
    signerName: "John Doe"
    signerEmail: "john@example.com"
    signatureData: "base64_signature_data"
  }) {
    success
    errors
    contract {
      id
      status
      signedAt
      signers {
        id
        name
        email
        signedAt
      }
    }
  }
}
```

### Create Intimation

```graphql
mutation {
  createIntimation(input: {
    caseId: "case-123"
    documentType: "Notificação"
    title: "Court Notification - Hearing Date"
    content: "You are summoned to appear in court..."
    receivedDate: "2024-01-20T10:00:00Z"
    deadlineDate: "2024-02-20T23:59:59Z"
    notificationMethod: "Email"
    senderName: "Court Clerk"
    documentUrl: "https://example.com/documents/notification.pdf"
    notes: "Hearing scheduled for March 15"
  }) {
    success
    errors
    intimation {
      id
      documentType
      deadlineDate
      isProcessed
      createdAt
    }
  }
}
```

### Mark Intimation as Processed

```graphql
mutation {
  markIntimationProcessed(id: "intimation-123") {
    success
    errors
    intimation {
      id
      isProcessed
      processedAt
    }
  }
}
```

## Subscription Examples

### Real-Time Case Updates

Subscribe to all updates for a specific case:

```graphql
subscription {
  caseUpdated(caseId: "case-123") {
    id
    status
    outcome
    updatedAt
  }
}
```

### New Cases Created

Subscribe to all newly created cases:

```graphql
subscription {
  caseCreated {
    id
    caseNumber
    clientId
    status
    createdAt
  }
}
```

### Case Status Changes

Subscribe to status changes for a specific case:

```graphql
subscription {
  caseStatusChanged(caseId: "case-123") {
    caseId
    previousStatus
    newStatus
    timestamp
  }
}
```

### Deadline Alerts

Subscribe to approaching deadline alerts:

```graphql
subscription {
  deadlineApproaching(daysUntilDeadline: 7) {
    type
    entityId
    daysRemaining
    deadline
    timestamp
  }
}
```

### Payment Events

Subscribe to payments for a specific invoice:

```graphql
subscription {
  paymentReceived(invoiceId: "invoice-123") {
    id
    amountPaid
    status
    paidDate
  }
}
```

### Contract Events

Subscribe to contract signing events:

```graphql
subscription {
  contractSigned(contractId: "contract-123") {
    id
    status
    signedAt
    signers {
      name
      email
      signedAt
    }
  }
}
```

### System Alerts

Subscribe to all system alerts:

```graphql
subscription {
  systemAlert {
    level
    message
    timestamp
  }
}
```

## Pagination

The API uses cursor-based pagination for large result sets. Each connection response includes:

- `edges`: Array of items with cursor and node
- `pageInfo`: Navigation information
  - `hasNextPage`: Boolean indicating if more results exist
  - `hasPreviousPage`: Boolean indicating if previous results exist
  - `startCursor`: Cursor of first item
  - `endCursor`: Cursor of last item
  - `totalCount`: Total number of items matching filters

### Pagination Example

```graphql
query {
  clients(first: 10) {
    edges {
      cursor
      node {
        id
        name
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

To get the next page:

```graphql
query {
  clients(first: 10, after: "cursor_value") {
    edges {
      cursor
      node {
        id
        name
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

## Error Handling

GraphQL errors are returned in the response with details:

```json
{
  "errors": [
    {
      "message": "Validation error: Invalid email format",
      "extensions": {
        "code": "VALIDATION_ERROR",
        "traceId": "req-12345678-..."
      }
    }
  ]
}
```

Common error codes:

- `VALIDATION_ERROR`: Input validation failed
- `NOT_FOUND`: Requested resource doesn't exist
- `CONFLICT_ERROR`: Resource already exists
- `UNAUTHORIZED`: Missing or invalid authentication
- `FORBIDDEN`: User lacks permission
- `INTERNAL_SERVER_ERROR`: Server error occurred

## Documentation Endpoints

Access interactive documentation at:

- **Schema:** `GET /graphql/schema` - Full GraphQL schema in SDL format
- **Query Docs:** `GET /graphql/docs/queries` - All available queries
- **Mutation Docs:** `GET /graphql/docs/mutations` - All available mutations
- **Subscription Docs:** `GET /graphql/docs/subscriptions` - All available subscriptions
- **IDE Info:** `GET /graphql/ide` - Links to documentation

## Best Practices

1. **Use Fragments** for reusable field selections
2. **Request only needed fields** to optimize response size
3. **Use aliases** to request the same field with different arguments
4. **Handle errors gracefully** with proper error boundaries
5. **Batch operations** when possible using aliases
6. **Monitor trace IDs** for debugging issues
7. **Implement exponential backoff** for retries on failures
8. **Cache results** on the client side when appropriate

## Rate Limiting

GraphQL requests are subject to the same rate limits as REST APIs:

- 100 requests per minute per user
- 1000 requests per minute per API key

See rate limit headers in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

## Support

For issues or questions:

1. Check the schema documentation at `/graphql/schema`
2. Review examples at `/graphql/docs/queries`
3. Enable debug logging with `X-Debug: true` header
4. Use trace IDs to track errors: `X-Trace-ID` header
