# WebSocket Real-Time Updates

## Overview

The Legal Automation Platform includes real-time bidirectional communication via WebSocket, enabling instant notifications, live updates, and real-time collaboration features.

## Architecture

### Components

1. **WebSocketManager** (`src/services/WebSocketManager.ts`)
   - Connection management
   - Per-user and per-client messaging
   - Broadcast capabilities
   - Connection statistics

2. **WebSocketEventService** (`src/services/WebSocketEventService.ts`)
   - Application event integration
   - Domain-specific notifications
   - Real-time update broadcasting
   - Connection statistics

3. **WebSocket Router** (`src/api/routes/webSocketRouter.ts`)
   - REST API for WebSocket operations
   - Broadcasting and notifications
   - Connection management

## Connection Setup

### Client-Side Connection

```javascript
// Establish WebSocket connection
const userId = 'user-123';
const token = 'jwt-token-here';

const ws = new WebSocket(
  `ws://localhost:3000?userId=${userId}&token=${token}`
);

ws.onopen = () => {
  console.log('Connected to real-time updates');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected from real-time updates');
};
```

### Connection Parameters

- **userId** (required): User identifier
- **token** (required): JWT authentication token

### Message Format

```json
{
  "type": "event_type",
  "data": { /* event-specific data */ },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "userId": "user-123"
}
```

## Event Types

### System Events

#### `connection`
Sent when client successfully connects.

```json
{
  "type": "connection",
  "data": {
    "clientId": "client_1705316400123_abc123",
    "connectedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

#### `system_notification`
System-wide announcements and alerts.

```json
{
  "type": "system_notification",
  "data": {
    "title": "Maintenance Alert",
    "message": "System maintenance scheduled for tonight",
    "severity": "warning"
  }
}
```

### Business Events

#### `CASE_UPDATED`
Case status or details changed.

```json
{
  "type": "CASE_UPDATED",
  "data": {
    "caseId": "case-123",
    "updates": {
      "status": "in_progress",
      "nextHearing": "2024-02-15"
    }
  }
}
```

#### `CONTRACT_UPDATED`
Contract status changed.

```json
{
  "type": "CONTRACT_UPDATED",
  "data": {
    "contractId": "contract-456",
    "status": "signed"
  }
}
```

#### `PAYMENT_RECEIVED`
Payment posted to invoice.

```json
{
  "type": "PAYMENT_RECEIVED",
  "data": {
    "invoiceId": "inv-789",
    "amount": 5000.00
  }
}
```

#### `DEADLINE_APPROACHING`
Deadline reminder notification.

```json
{
  "type": "DEADLINE_APPROACHING",
  "data": {
    "caseId": "case-123",
    "daysRemaining": 7
  }
}
```

#### `TASK_ASSIGNED`
New task assigned to user.

```json
{
  "type": "TASK_ASSIGNED",
  "data": {
    "taskId": "task-999",
    "taskDetails": {
      "title": "Review contract",
      "priority": "high",
      "dueDate": "2024-01-20"
    }
  }
}
```

#### `ANALYTICS_UPDATE`
Real-time analytics data.

```json
{
  "type": "ANALYTICS_UPDATE",
  "data": {
    "metrics": {
      "casesInProgress": 45,
      "avgResolutionTime": 120,
      "winRate": 0.73
    }
  }
}
```

### Event Broadcasting

All application domain events are automatically broadcast:
- `CONTRACT_SIGNED`
- `CONTRACT_EXECUTED`
- `PAYMENT_PROCESSED`
- `CASE_CLOSED`
- `DOCUMENT_CREATED`
- And more...

## REST API for WebSocket Operations

### Statistics

```
GET /api/v1/ws/stats
```

Response:
```json
{
  "statusCode": 200,
  "data": {
    "totalUsers": 42,
    "totalConnections": 127,
    "userConnectionCounts": {
      "user-123": 3,
      "user-456": 2
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### Health Check

```
GET /api/v1/ws/health
```

### Active Users

```
GET /api/v1/ws/active-users
```

Response:
```json
{
  "statusCode": 200,
  "data": {
    "activeUsers": ["user-123", "user-456", "user-789"],
    "userConnectionCounts": { /* ... */ },
    "totalUsers": 3,
    "totalConnections": 8,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### Broadcast Message

```
POST /api/v1/ws/broadcast
```

Request:
```json
{
  "title": "Important Update",
  "message": "New feature released",
  "severity": "info"
}
```

### Send User Notification

```
POST /api/v1/ws/notify/:userId
```

Request:
```json
{
  "type": "CUSTOM_EVENT",
  "data": { /* custom data */ }
}
```

### Send Case Update

```
POST /api/v1/ws/send-case-update
```

Request:
```json
{
  "userId": "user-123",
  "caseId": "case-456",
  "updates": {
    "status": "closed",
    "outcome": "favorable"
  }
}
```

### Send Contract Update

```
POST /api/v1/ws/send-contract-update
```

Request:
```json
{
  "userId": "user-123",
  "contractId": "contract-789",
  "status": "signed"
}
```

### Send Deadline Alert

```
POST /api/v1/ws/send-deadline-alert
```

Request:
```json
{
  "userId": "user-123",
  "caseId": "case-456",
  "daysRemaining": 5
}
```

### Send Payment Notification

```
POST /api/v1/ws/send-payment-notification
```

Request:
```json
{
  "userId": "user-123",
  "invoiceId": "inv-789",
  "amount": 5000.00
}
```

### Send Task Assignment

```
POST /api/v1/ws/send-task-assignment
```

Request:
```json
{
  "userId": "user-123",
  "taskId": "task-999",
  "taskDetails": {
    "title": "Review document",
    "priority": "high"
  }
}
```

## Implementation Examples

### Initialize WebSocket Service

```typescript
import { webSocketEventService } from '@services/WebSocketEventService';

// Initialize on server startup
webSocketEventService.initialize();
```

### Listen to Business Events

Events are automatically broadcast when:

```typescript
import { eventService, EVENTS } from '@services/EventEmitterService';

// Listen to specific event
eventService.on(EVENTS.CONTRACT_SIGNED, (payload) => {
  // Automatically broadcast to connected users via WebSocket
  console.log('Contract signed:', payload);
});
```

### Programmatic Notifications

```typescript
import { webSocketEventService } from '@services/WebSocketEventService';

// Notify specific user about case update
webSocketEventService.notifyCaseUpdate(
  'user-123',
  'case-456',
  { status: 'closed', outcome: 'favorable' }
);

// Notify about approaching deadline
webSocketEventService.notifyDeadlineApproaching(
  'user-123',
  'case-456',
  7 // days remaining
);

// Send payment notification
webSocketEventService.notifyPaymentReceived(
  'user-123',
  'inv-789',
  5000.00
);

// Broadcast system-wide notification
webSocketEventService.broadcastSystemNotification(
  'Maintenance Alert',
  'System will be offline from 10 PM to 11 PM',
  'warning'
);
```

## Client Libraries

### Node.js / Electron

```bash
npm install ws
```

### Browser

```javascript
// Use native WebSocket API
const ws = new WebSocket('ws://localhost:3000?userId=...&token=...');
```

### React

```bash
npm install react-use-websocket
```

```typescript
import useWebSocket from 'react-use-websocket';

export function RealtimeUpdates() {
  const { sendMessage, lastMessage } = useWebSocket(
    `ws://localhost:3000?userId=${userId}&token=${token}`
  );

  useEffect(() => {
    if (lastMessage !== null) {
      const message = JSON.parse(lastMessage.data);
      console.log('Update:', message);
    }
  }, [lastMessage]);

  return <div>Real-time updates active</div>;
}
```

## Performance Considerations

### Connection Limits

- Default pool size: 100 simultaneous connections
- Per-user limit: 10 connections (browser tabs)
- Message queue: 1000 messages per connection

### Optimization

1. **Reduce Message Frequency**
   - Batch updates instead of individual messages
   - Throttle high-frequency events

2. **Selective Broadcasting**
   - Send to specific users instead of all users
   - Use event filtering on client side

3. **Connection Pooling**
   - Reuse connections across tabs
   - Implement shared worker pattern

4. **Message Compression**
   - Use deflate compression
   - Minimize payload size

## Error Handling

### Connection Errors

```javascript
ws.onerror = (error) => {
  console.error('WebSocket error:', error);
  // Implement exponential backoff reconnection
  setTimeout(() => {
    ws = new WebSocket(`ws://localhost:3000?userId=${userId}&token=${token}`);
  }, 1000);
};
```

### Authentication Failure

```
Connection closed with code 1008
"Missing authentication parameters"
```

**Solution**: Ensure userId and token are provided in URL.

### Connection Timeout

```
Connection timeout after 5 seconds
```

**Solution**: Check network connectivity and server status.

## Security

### Authentication
- JWT token required for all connections
- Token validated on connection establishment
- Token expiration handling

### Message Validation
- All messages validated against schema
- Sanitize user-provided data
- Rate limiting on message sending

### Best Practices
1. Use WSS (WebSocket Secure) in production
2. Validate all incoming messages
3. Implement message rate limiting
4. Sanitize data before broadcasting
5. Log all WebSocket connections/disconnections

## Monitoring & Debugging

### Connection Statistics

```bash
curl http://localhost:3000/api/v1/ws/stats
```

### Active Connections

```bash
curl http://localhost:3000/api/v1/ws/active-users
```

### Enable Debug Logging

```bash
DEBUG=websocket:* npm start
```

## Client-Side Robustness (Phase 3 Enhancement)

### WebSocket Client Library

Robust TypeScript WebSocket client with enterprise-grade features:

**File**: `src/client/WebSocketClient.ts`

#### Features

1. **Auto-Reconnection**
   - Exponential backoff strategy
   - Configurable max retries
   - Random jitter to prevent thundering herd
   - Automatic reconnection on connection loss

2. **Heartbeat/Keepalive**
   - Periodic ping messages (default: every 30 seconds)
   - Automatic pong response handling
   - Timeout detection and reconnection on heartbeat failure

3. **Offline Message Queuing**
   - Queues messages when disconnected
   - Automatically drains queue on reconnection
   - Configurable queue size (default: 100 messages)

4. **Connection State Management**
   - Tracks connection state: disconnected, connecting, connected, closing, closed
   - State change events for UI updates
   - Statistics tracking (attempts, queue size, etc.)

5. **Event Subscription Pattern**
   - Type-safe event subscription
   - Automatic unsubscribe for cleanup
   - Support for custom event handlers

#### Usage

```typescript
import { createLegalAutomationWSClient } from '@client/WebSocketClient';

// Create client
const ws = createLegalAutomationWSClient(authToken);

// Subscribe to events
const unsubscribe = ws.subscribe('CASE_UPDATED', (data) => {
  console.log('Case updated:', data);
});

// Connect
await ws.connect();

// Send message
ws.send('REQUEST_UPDATE', { caseId: '123' });

// Get status
console.log(ws.getStats());
// Output: {
//   state: 'connected',
//   reconnectionAttempts: 0,
//   queuedMessages: 0,
//   isConnected: true
// }

// Disconnect
ws.disconnect();

// Cleanup
unsubscribe();
```

#### Configuration

```typescript
import { WebSocketClient } from '@client/WebSocketClient';

const ws = new WebSocketClient({
  url: 'wss://api.example.com/ws',
  token: 'jwt-token',
  
  // Reconnection strategy
  reconnection: {
    initialDelay: 1000,      // Start with 1 second
    maxDelay: 30000,         // Cap at 30 seconds
    exponentialBackoff: true, // 2^n * initialDelay
    maxRetries: 10,          // Try up to 10 times
    jitter: true,            // Add randomness
  },
  
  // Heartbeat configuration
  heartbeat: {
    interval: 30000,  // Ping every 30 seconds
    timeout: 5000,    // Expect pong within 5 seconds
  },
  
  // Message queue
  messageQueueSize: 100,      // Max 100 queued messages
  enableOfflineQueue: true,   // Queue messages when offline
  enableCompression: false,   // Future: message compression
  debug: false,               // Enable debug logging
});
```

### React Integration

**File**: `src/client/useWebSocket.ts`

React hooks for seamless WebSocket integration:

#### `useWebSocket` Hook

Main hook for WebSocket connection management:

```typescript
import { useWebSocket } from '@client/useWebSocket';

function CaseMonitor() {
  const {
    connected,
    connecting,
    reconnecting,
    error,
    stats,
    send,
    subscribe,
  } = useWebSocket(authToken);

  useEffect(() => {
    // Subscribe to case updates
    const unsubscribe = subscribe('CASE_UPDATED', (event) => {
      console.log('Case updated:', event);
    });

    return unsubscribe;
  }, [subscribe]);

  return (
    <div>
      {connected && <div>✅ Connected ({stats.state})</div>}
      {connecting && <div>🔄 Connecting...</div>}
      {reconnecting && <div>🔁 Reconnecting...</div>}
      {error && <div>❌ Error: {error.message}</div>}
    </div>
  );
}
```

#### `useWebSocketEvent` Hook

Subscribe to specific event type:

```typescript
function RecentCaseUpdates() {
  const { connected } = useWebSocket(authToken);
  const caseUpdate = useWebSocketEvent('CASE_UPDATED', wsClient);

  return (
    <div>
      {caseUpdate && (
        <div>
          Latest update: {JSON.stringify(caseUpdate, null, 2)}
        </div>
      )}
    </div>
  );
}
```

#### `useWebSocketEvents` Hook

Subscribe to multiple event types with history:

```typescript
function Dashboard() {
  const { connected } = useWebSocket(authToken);
  const events = useWebSocketEvents(wsClient, [
    'CASE_UPDATED',
    'PAYMENT_RECEIVED',
    'DEADLINE_APPROACHING',
  ], 10); // Keep last 10 of each

  return (
    <div>
      <h3>Recent Events</h3>
      {Object.entries(events).map(([type, eventList]) => (
        <div key={type}>
          <h4>{type}</h4>
          {eventList.map((event, i) => (
            <div key={i}>{JSON.stringify(event)}</div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

#### `useSendWebSocketMessage` Hook

Send messages with loading state:

```typescript
function UpdateCaseButton() {
  const { send, loading, error } = useSendWebSocketMessage(wsClient);

  const handleUpdate = async () => {
    try {
      const response = await send('UPDATE_CASE', {
        caseId: '123',
        status: 'closed',
      });
      console.log('Update response:', response);
    } catch (err) {
      console.error('Update failed:', err);
    }
  };

  return (
    <button onClick={handleUpdate} disabled={loading}>
      {loading ? 'Updating...' : 'Update Case'}
    </button>
  );
}
```

### Connection State Transitions

```
disconnected ──→ connecting ──→ connected
     ↑                                │
     └────────────────┬───────────────┘
                    (reconnection)
                    
connected ──→ closing ──→ closed
```

### Event Flow Diagram

```
User Action
    │
    ↓
send('EVENT_TYPE', data)
    │
    ├─→ Connected? 
    │   ├─ Yes: Send immediately
    │   └─ No:  Queue message
    │
    ↓
Server receives & processes
    │
    ↓
Server broadcasts event
    │
    ├─→ Broadcast event
    │   └─→ WebSocketClient receives
    │       └─→ Parse & emit event
    │           └─→ React component updates
    │
    └─→ Queue recovery on reconnect

Heartbeat (every 30s)
    │
    ├─→ Send 'ping'
    │   └─→ Wait for 'pong' (5s timeout)
    │       ├─ Received: Continue
    │       └─ Timeout: Reconnect
```

### Reconnection Strategy

**Exponential Backoff Example**:
```
Attempt 1: 1 second   (2^0 * 1000)
Attempt 2: 2 seconds  (2^1 * 1000)
Attempt 3: 4 seconds  (2^2 * 1000)
Attempt 4: 8 seconds  (2^3 * 1000)
Attempt 5: 16 seconds (2^4 * 1000)
Attempt 6: 30 seconds (capped at maxDelay)
...
Attempt 10: 30 seconds
Max retries reached → emit 'max_reconnection_attempts_reached'
```

**With Jitter** (prevents thundering herd):
```
Attempt 1: 900-1100ms (±10%)
Attempt 2: 1800-2200ms
Attempt 3: 3600-4400ms
...
```

### Error Handling Examples

#### Handle Connection Errors

```typescript
function App() {
  const { error, connected } = useWebSocket(token);

  useEffect(() => {
    if (error) {
      // Log error for debugging
      console.error('WebSocket error:', error);
      
      // Could show user notification
      showNotification('Connection error, retrying...');
    }
  }, [error]);

  return (
    <div>
      {!connected && <ConnectionStatus />}
    </div>
  );
}
```

#### Handle Offline Messages

```typescript
function ChatApp() {
  const ws = useWebSocket(token);

  const handleSendMessage = () => {
    ws.send('SEND_MESSAGE', { text: 'Hello' });
    // Message is queued if offline, sent when reconnected
  };

  useEffect(() => {
    ws.wsClient.on('message_queued', (msg) => {
      showNotification('Message queued (offline)');
    });

    ws.wsClient.on('message_sent_from_queue', (msg) => {
      showNotification('Queued message sent');
    });

    ws.wsClient.on('message_dropped', (msg) => {
      showNotification('Queue full, message dropped');
    });
  }, []);
}
```

### Performance Considerations

1. **Message Queue Size**: Default 100 messages
   - Increase for critical applications
   - Monitor queue size via `stats.queuedMessages`

2. **Heartbeat Interval**: Default 30 seconds
   - Shorter interval = faster failure detection
   - Longer interval = less bandwidth usage

3. **Reconnection Delays**: Default exponential backoff
   - Prevents overwhelming server during outages
   - Jitter prevents thundering herd

4. **Event Listeners**: Cleanup with unsubscribe
   - Memory leaks possible with many listeners
   - Always clean up in useEffect return

## Future Enhancements

- [x] Auto-reconnection with exponential backoff ✅ Phase 3
- [x] Heartbeat/keepalive mechanism ✅ Phase 3
- [x] Offline message queueing ✅ Phase 3
- [x] Connection state management ✅ Phase 3
- [x] React hooks integration ✅ Phase 3
- [ ] Message compression (deflate)
- [ ] Redis pub/sub for multi-server support
- [ ] Message replay capability
- [ ] Selective event subscriptions (rooms/channels)
- [ ] Analytics on event patterns

## References

- [WebSocket API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [ws Library Documentation](https://github.com/websockets/ws)
- [WebSocket Best Practices](https://www.ably.io/topic/websockets)
- [Real-time Architecture Patterns](https://www.ably.io/topic/real-time)
