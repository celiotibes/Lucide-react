# System Architecture - Rental Listing Sync

Complete technical architecture documentation for the Rental Listing Sync platform.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React 18)                      │
│  - Property Calendar (180-day rolling window)              │
│  - Booking Form (guest information collection)             │
│  - Admin Dashboard (property management)                   │
└────────────────────────────────────────────────────────────┘
                            ↓ (HTTPS)
┌─────────────────────────────────────────────────────────────┐
│                  API GATEWAY & Load Balancing                │
│  - Rate Limiting (100 req/min per IP)                      │
│  - CORS Middleware                                          │
│  - Request Validation                                       │
└────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                 BACKEND (Node.js + Express)                │
│                                                             │
│  ┌──────────────────────────────────────────────────┐     │
│  │         Authentication Layer (JWT)                │     │
│  │  - Login/Signup Endpoints                         │     │
│  │  - Token Generation & Validation                  │     │
│  │  - Password Hashing (Bcrypt 12 rounds)           │     │
│  └──────────────────────────────────────────────────┘     │
│                            ↓                                │
│  ┌──────────────────────────────────────────────────┐     │
│  │         Application Logic Layer                   │     │
│  │  - Booking Management                            │     │
│  │  - Calendar Synchronization                      │     │
│  │  - Dynamic Pricing                               │     │
│  │  - AI Task Processing                            │     │
│  └──────────────────────────────────────────────────┘     │
│                            ↓                                │
│  ┌──────────────────────────────────────────────────┐     │
│  │         OTA Integration Layer                     │     │
│  │  - Booking.com (XML-RPC)                         │     │
│  │  - VRBO (REST API)                               │     │
│  │  - Expedia (SFTP)                                │     │
│  │  - Webhook Listeners                             │     │
│  └──────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────┘
          ↓              ↓              ↓
     ┌────────┐    ┌──────────┐    ┌──────┐
     │PostgreSQL   │  Redis   │    │Gemini│
     │(Database)   │(Cache)   │    │(AI)  │
     └────────┘    └──────────┘    └──────┘
```

## Component Architecture

### Frontend (React 18 + TypeScript)

```
src/
├── App.tsx
│   ├── Login Page (public)
│   └── Home Page (protected)
├── components/
│   ├── PropertyCalendar.tsx
│   │   ├── Date Range Selection
│   │   ├── Availability Display (available/booked/blocked)
│   │   └── Night Count Calculation
│   └── BookingForm.tsx
│       ├── Guest Information
│       ├── Form Validation (React Hook Form)
│       ├── Pricing Display
│       └── Booking Submission
├── store/
│   └── auth.ts (Zustand)
│       ├── User State
│       ├── Token Management
│       └── Auth Methods
├── api.ts
│   ├── Axios Client Configuration
│   ├── Request/Response Interceptors
│   └── API Endpoint Definitions
└── index.css (Tailwind CSS)
```

### Backend (Express.js + Node.js)

```
src/
├── index.ts (Main Server)
│   ├── Express Setup
│   ├── Middleware Stack
│   ├── Route Registration
│   └── WebSocket/Event Handlers
│
├── middleware/
│   ├── auth.ts (JWT Verification)
│   ├── rate-limit.ts (IP-based limiting)
│   └── webhook-verification.ts (HMAC-SHA256)
│
├── routes/
│   ├── auth.ts (signup, login, me)
│   ├── ai.ts (inquiry analysis, damage reports)
│   └── pricing.ts (dynamic pricing endpoints)
│
├── services/
│   ├── booking-xmlrpc.ts (Booking.com client)
│   ├── vrbo-api.ts (VRBO REST client)
│   ├── gemini-ai.ts (AI services)
│   └── pricing-engine.ts (Dynamic pricing)
│
├── workers/
│   ├── booking-calendar-sync.ts (1hr polling)
│   ├── vrbo-calendar-sync.ts (1hr polling)
│   └── ai-task-processor.ts (async AI tasks)
│
├── db.ts (Database Connection & Transactions)
├── redis.ts (Redis Client)
├── auth/
│   └── crypto.ts (JWT, Bcrypt, Webhooks)
│
└── migrations/
    └── 001_initial_schema.sql
        ├── 11 Tables
        ├── 12 Indexes
        ├── 2 Triggers
        └── Foreign Keys & Constraints
```

## Database Schema

### Core Tables

```sql
users
├── id (UUID) PRIMARY KEY
├── email UNIQUE
├── password_hash
├── full_name
└── created_at, updated_at

properties
├── id (UUID) PRIMARY KEY
├── user_id FOREIGN KEY
├── name
├── address, city, country
├── bedrooms, bathrooms, max_guests
└── created_at, updated_at

ota_listings
├── id (UUID) PRIMARY KEY
├── property_id FOREIGN KEY
├── ota_name (booking, vrbo, expedia)
├── external_property_id
├── sync_enabled BOOLEAN
└── last_sync_at

calendar_slots
├── id (UUID) PRIMARY KEY
├── property_id FOREIGN KEY
├── slot_date DATE
├── status (available/booked/blocked)
├── booking_id FOREIGN KEY
├── sync_hash (idempotency)
└── source (ota_name)

bookings
├── id (UUID) PRIMARY KEY
├── property_id FOREIGN KEY
├── ota_listing_id FOREIGN KEY
├── external_booking_id (idempotency)
├── guest_name, guest_email, guest_phone
├── check_in, check_out (DATE)
├── total_price, currency
├── status (confirmed/cancelled)
└── source (ota_name)
```

### Supporting Tables

```sql
pricing_rules
├── id (UUID) PRIMARY KEY
├── property_id FOREIGN KEY
├── rule_type (base/seasonal/promotion)
├── start_date, end_date
├── price_per_night, minimum_stay, maximum_stay
└── active BOOLEAN

inquiries
├── id (UUID) PRIMARY KEY
├── property_id FOREIGN KEY
├── guest_name, guest_email, guest_phone
├── message TEXT
├── status (new/replied/archived)
└── response TEXT

ai_tasks
├── id (UUID) PRIMARY KEY
├── property_id FOREIGN KEY
├── task_type (categorize_inquiry/analyze_damage/generate_checkin)
├── input JSON
├── output JSON
├── status (pending/completed/failed)
├── error_message

ota_sync_log
├── id (UUID) PRIMARY KEY
├── property_id FOREIGN KEY
├── ota_name
├── sync_type (pull/push)
├── status (success/failed)
├── items_processed, conflicts_detected
└── error_message

revenue_transactions
├── id (UUID) PRIMARY KEY
├── property_id FOREIGN KEY
├── booking_id FOREIGN KEY
├── transaction_type (booking_confirmed/refund)
├── amount, platform_fee
├── net_amount (GENERATED ALWAYS)
└── status (completed/pending)
```

### Indexes

```sql
-- Query Optimization
├── calendar_slots(property_id, slot_date)  -- Calendar queries
├── calendar_slots(status)  -- Availability filtering
├── bookings(property_id)  -- Property bookings
├── bookings(status)  -- Status filtering
├── ota_listings(ota_name)  -- OTA filtering
├── ota_sync_log(property_id, ota_name)  -- Sync history
├── pricing_rules(property_id)  -- Pricing lookup
├── inquiries(property_id)  -- Inquiry listing
├── ai_tasks(status)  -- Task queue
└── revenue_transactions(property_id)  -- Financial queries
```

### Triggers

```sql
-- Automatic date blocking on confirmed booking
block_dates_on_booking()
├── Trigger: AFTER INSERT/UPDATE on bookings
├── Action: Inserts calendar_slots for check_in to check_out
└── Status: Automatically set to 'blocked'

-- Real-time event notifications
notify_booking_change()
├── Trigger: AFTER INSERT/UPDATE on bookings
├── Action: pg_notify('booking_change', JSON payload)
└── Listener: Backend can listen for changes
```

## Data Flow

### Booking Creation Flow

```
1. Guest submits booking via website
   └─ POST /api/properties/:id/bookings
   └─ Validation: email, dates, guests
   └─ Create booking record (status='pending')

2. Payment processing (Stripe)
   └─ Generate payment intent
   └─ Webhook: payment_intent.succeeded
   └─ Update booking status='confirmed'

3. Database trigger activates
   └─ block_dates_on_booking() trigger
   └─ INSERT calendar_slots (status='blocked')
   └─ For each night from check_in to check_out

4. Notification emitted
   └─ notify_booking_change() trigger
   └─ pg_notify event published
   └─ Backend listening clients notified

5. OTA synchronization
   └─ Bull queue job: sync_booking_to_ota
   └─ PUSH update to all enabled OTAs
   └─ Mark blocked dates in Booking.com, VRBO, etc.

6. Revenue tracking
   └─ INSERT revenue_transactions
   └─ Calculate platform fees (10-20%)
   └─ Track net revenue (gross - fees)

7. Guest communication
   └─ Trigger AI task: generate_confirmation
   └─ Gemini API: generate welcome message
   └─ SendGrid: send confirmation + checkin instructions
```

### Calendar Synchronization Flow

```
1. Polling (every 1 hour)
   └─ Bull queue job: fetch_calendar_from_ota
   └─ For each OTA (Booking.com, VRBO)
   └─ Rate limited: 2 req/sec (Booking), 10 req/sec (VRBO)

2. Fetch availability
   └─ Booking.com: XML-RPC getAvailability
   └─ VRBO: REST GET /availability
   └─ Period: today + 180 days
   └─ Response: availability blocks per date

3. Transform to daily slots
   └─ Parse OTA response
   └─ Convert to calendar_slots format
   └─ Generate sync_hash (idempotency)

4. Conflict detection
   └─ Check for overlaps with existing bookings
   └─ Flag if dates already blocked
   └─ Log conflicts in ota_sync_log

5. Database upsert
   └─ UPSERT calendar_slots (ON CONFLICT DO UPDATE)
   └─ Update status based on OTA data
   └─ Mark source = 'booking'/'vrbo'

6. Audit logging
   └─ INSERT ota_sync_log
   └─ Status: success/failed
   └─ Items processed: count
   └─ Conflicts detected: count
```

## Security Architecture

### Authentication Flow

```
1. User submits credentials
   └─ POST /auth/signup or POST /auth/login
   └─ Password validation (Bcrypt)

2. JWT token generation
   └─ Payload: { userId, email }
   └─ Secret: HS256 signature
   └─ TTL: 7 days

3. Token storage
   └─ Frontend: localStorage (secure HTTP-only in production)
   └─ Backend: verify on each request

4. Protected endpoints
   └─ authMiddleware checks Bearer token
   └─ Returns 401 if invalid/expired
   └─ Attaches userId to req.userId
```

### Webhook Security

```
1. OTA sends webhook
   └─ POST /webhooks/booking-com
   └─ Includes X-Booking-Signature header

2. Signature verification
   └─ Recreate HMAC-SHA256(payload, secret)
   └─ Compare with header signature
   └─ Timing-safe comparison (prevent timing attacks)

3. Threat prevention
   └─ Rejects tampered payloads (401)
   └─ Requires valid signature (MUST match exactly)
   └─ Prevents payload injection
```

### Rate Limiting

```
1. Per-IP limiting
   └─ Redis counter: rate-limit:IP
   └─ Window: 60 seconds
   └─ Limit: 100 requests/window

2. OTA-specific limiting
   └─ Booking.com: 2 requests/second (enforced)
   └─ VRBO: 10 requests/second (enforced)
   └─ Token bucket algorithm

3. AI API limiting
   └─ Gemini free tier: 15 RPM
   └─ Implemented: 1 request/second
   └─ Fallback: template responses if quota exceeded
```

## Performance Architecture

### Caching Strategy

```
1. Database query cache (Redis)
   └─ calendar_slots (< 30 min)
   └─ pricing_rules (< 1 hour)
   └─ property details (< 1 hour)
   └─ user auth (session)

2. Session management
   └─ Redis: key = user_id
   └─ Value: auth token + metadata
   └─ TTL: 7 days (matches JWT)

3. Queue processing
   └─ Bull queue on Redis
   └─ Jobs: sync_booking, process_ai_task
   └─ Retry: exponential backoff (3 attempts)
```

### Query Optimization

```
1. Index strategy
   └─ Composite indexes for common filters
   └─ GIST index for date range (tsrange)
   └─ Single-column indexes for status/flags

2. Pagination
   └─ LIMIT 50 on list endpoints
   └─ Cursor-based pagination for large datasets
   └─ Avoid OFFSET (expensive on large tables)

3. Denormalization
   └─ Store OTA name in calendar_slots (avoid JOIN)
   └─ Store property_id in sync_log (avoid JOIN)
   └─ Calculated columns for revenue (net_amount GENERATED)
```

## Integration Points

### OTA APIs

```
Booking.com
├── Protocol: XML-RPC
├── Auth: Username/Password
├── Methods: getProperties, getAvailability, updateAvailability
├── Rate limit: 2 req/sec (critical: violation = ban)
└── Sync: Bi-directional (pull + push)

VRBO
├── Protocol: REST (JSON)
├── Auth: Bearer token
├── Methods: GET/PUT availability, GET bookings
├── Rate limit: 10 req/sec
└── Sync: Bi-directional (pull + push)

Expedia
├── Protocol: SFTP (XML feeds)
├── Auth: Credentials
├── Feeds: availability.xml, bookings.xml
├── Frequency: Daily full + 4h incremental
└── Sync: PULL only (one-way)

Website
├── Protocol: Internal API
├── Auth: JWT
├── Methods: All CRUD operations
├── Rate limit: 100 req/min
└── Sync: Direct (no external dependency)
```

### External Services

```
Stripe
├── Purpose: Payment processing
├── Integration: Webhook + REST API
└── Security: Webhook signature verification

SendGrid
├── Purpose: Email notifications
├── Integration: REST API
└── Use: Booking confirmation, checkin/checkout

Twilio
├── Purpose: SMS notifications
├── Integration: REST API
└── Use: Booking reminders, checkin codes

Gemini API
├── Purpose: AI task processing
├── Integration: REST API (async)
└── Features: Categorization, reply generation, analysis

Google Analytics
├── Purpose: Usage tracking
├── Integration: Client-side SDK
└── Metrics: User behavior, conversion funnels
```

---

## Deployment Architecture

### Infrastructure Layers

```
Tier 1: Edge/CDN
└─ CloudFlare (optional)
└─ Caches static assets
└─ DDoS protection

Tier 2: Application
├─ Render.com (Backend)
│  └─ Deployed via Docker
│  └─ Auto-scaling enabled
│  └─ Health checks every 30s
└─ Vercel (Frontend)
   └─ Deployed via Git
   └─ Edge functions
   └─ Auto-scaling enabled

Tier 3: Data
├─ Neon.tech (PostgreSQL)
│  └─ Multi-AZ replication
│  └─ Automated backups (daily)
│  └─ Connection pooling enabled
└─ Upstash (Redis)
   └─ High availability
   └─ Automatic failover
   └─ TLS encryption
```

### Monitoring Stack

```
Metrics
├─ Render: Built-in (CPU, Memory, Requests)
├─ Vercel: Built-in (Function duration, Error rate)
└─ Custom: CloudWatch (database, Redis)

Logging
├─ Render: Stdout → CloudWatch
├─ Vercel: Function logs
└─ Custom: Application logs to CloudWatch

Alerting
├─ CloudWatch: High error rate, High latency
├─ PagerDuty: Critical alerts (opt-in)
└─ Slack: Notifications via webhooks
```

---

**Architecture Version:** 1.0  
**Last Updated:** July 2026  
**Status:** Production Ready  
**Scalability:** Supports 200+ properties with current design
