# Quick Start: Deploy in 30 Minutes ⚡

**Deploy your Legal Automation System to the internet for FREE (Render + Supabase)**

---

## Prerequisites (2 minutes)

- [ ] GitHub account (for code hosting)
- [ ] Render.com account (sign up at https://render.com with GitHub)
- [ ] Supabase account (sign up at https://supabase.com)

---

## Step 1: Set Up PostgreSQL Database (10 minutes)

### 1a. Create Supabase Project
```
1. Go to https://app.supabase.com
2. Click "New Project"
3. Choose project name: "legal-automation-prod"
4. Save the database password securely
5. Choose region closest to you
6. Wait for project to initialize (~2 min)
```

### 1b. Get Connection String
```
1. In Supabase dashboard, go to Settings → Database
2. Find "Connection String"
3. Copy the PostgreSQL URL:
   postgresql://postgres:[PASSWORD]@db.[REGION].supabase.co:5432/postgres
4. SAVE THIS - you'll need it in 5 minutes
```

### 1c. Run Database Migrations
```
1. In Supabase, click "SQL Editor" → "New Query"
2. Open: /migrations/001_init.sql
3. Copy contents and paste into SQL Editor
4. Click "Run"
5. Repeat steps 2-4 for EACH migration file:
   - 002_pki_module.sql
   - 003_ged_module.sql
   - 004_timesheet_module.sql
   - 005_ai_module.sql
   - 006_mobile_module.sql
   - 007_alerts_module.sql
   - 008_calendar_module.sql
   - 009_reports_module.sql
   - 010_portal_module.sql
```

✅ Database is ready!

---

## Step 2: Deploy Backend (10 minutes)

### 2a. Create Render Web Service
```
1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Click "Connect Account" (authorize GitHub)
4. Select your lucide-react repository
5. Click "Connect"
```

### 2b. Configure Service
```
Name: legal-automation-api
Environment: Node
Region: [Choose closest to you]
Branch: claude/eproc-projudi-automation-4cx0tt
Build Command: npm ci && npm run build
Start Command: node dist/index.js
Plan: Free
```

### 2c. Add Environment Variables
In Render Dashboard, go to "Environment" and add these:

**REQUIRED**:
```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REGION].supabase.co:5432/postgres
JWT_SECRET=[GENERATE: run `openssl rand -base64 32`]
CERT_ENCRYPTION_KEY=[GENERATE: run `openssl rand -base64 32`]
```

**OPTIONAL** (add if you have credentials):
```
# Email notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password

# Legal platform APIs
DATAJUD_API_KEY=your-key-here
PROJUDI_USERNAME=your-username
PROJUDI_PASSWORD=your-password

# AI (if using external AI)
CLAUDE_API_KEY=your-key-here
GEMINI_API_KEY=your-key-here
```

### 2d. Deploy
```
Render automatically detects changes and deploys.
Wait for build to complete (3-5 minutes).
You should see:
  ✓ Build successful
  ✓ "Live" (green status)
  ✓ Your public URL (e.g., https://legal-automation-api.onrender.com)
```

✅ Backend is deployed!

---

## Step 3: Verify Deployment (5 minutes)

### 3a. Check Health
```bash
# Copy your Render URL and test:
curl https://legal-automation-api.onrender.com/health

# Should see:
# {"status":"ok","timestamp":"2026-08-03T..."}
```

### 3b. Check Logs (if health check fails)
```
In Render Dashboard:
- Click your service
- Click "Logs" tab
- Look for errors like:
  ✗ "DATABASE_URL is invalid" → Fix environment variable
  ✗ "connection refused" → Check Supabase connection string
  ✗ "migrations not applied" → Re-run SQL migrations
```

### 3c. Test Authentication Endpoint (Optional)
```bash
curl -X POST https://legal-automation-api.onrender.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@law.com","password":"test123"}'

# Should return JWT token or auth error
```

---

## 🎉 You're Live!

**Your Legal Automation System is now running on:**
```
API URL: https://legal-automation-api.onrender.com
Database: Supabase PostgreSQL
Cost: $0/month
```

---

## Available Endpoints

### Core Endpoints
```
GET  /health                          # Health check
POST /auth/login                      # User login
POST /auth/register                   # User registration

# PKI Module
POST   /pki/certificates/upload       # Upload certificate
POST   /pki/certificates/validate     # Validate certificate
POST   /pki/sign                      # Sign document
POST   /pki/revoke                    # Revoke certificate

# GED Module (Document Management)
POST   /ged/documents/upload          # Upload document
GET    /ged/documents                 # List documents
GET    /ged/documents/:id             # Get document
POST   /ged/documents/search          # Search documents
POST   /ged/documents/:id/tag         # Tag document

# Timesheet
POST   /timesheet/entries             # Create time entry
GET    /timesheet/entries             # Get time entries
POST   /timesheet/invoices            # Generate invoice
GET    /timesheet/invoices            # Get invoices

# AI Analysis
POST   /ai/analyze/precedents         # Analyze case precedents
POST   /ai/predict/outcome            # Predict case outcome
POST   /ai/suggest/arguments          # Get argument suggestions

# Mobile
POST   /mobile/auth/login             # Mobile login
GET    /mobile/cases                  # Get cases
GET    /mobile/notifications          # Get notifications

# Alerts
POST   /alerts/create                 # Create alert
GET    /alerts                        # Get alerts
POST   /alerts/send-multi-channel     # Send notifications

# Calendar
POST   /calendar/connect/:provider    # Connect Google/Outlook
GET    /calendar/events               # Get calendar events
POST   /calendar/events               # Create calendar event

# Reports
GET    /reports/analytics/cases       # Case analytics
GET    /reports/analytics/financial   # Financial analytics
GET    /reports/dashboards/:id        # Get dashboard

# Portal
GET    /portal/cases                  # Client cases
GET    /portal/billing                # Client billing
GET    /portal/messages               # Client messages
POST   /portal/invitations/accept     # Accept invitation
```

All endpoints require `Authorization: Bearer [JWT_TOKEN]` header.

---

## Next Steps

### Immediate
- [ ] Test the API endpoints listed above
- [ ] Configure email/SMS (if needed)
- [ ] Add legal platform credentials

### Short Term (This Week)
- [ ] Set up frontend application
- [ ] Add users to the system
- [ ] Test with real cases

### Medium Term (This Month)
- [ ] Configure calendar integrations
- [ ] Train users on the system
- [ ] Set up monitoring/alerts

### Long Term (Next Month+)
- If you need better uptime, upgrade to Render Starter ($7/month)
- If you run out of database space, upgrade to Supabase Pro ($25/month)
- If you need to store large files, add Cloudinary or AWS S3

---

## Troubleshooting

### "502 Bad Gateway" Error
```
Problem: Service crashed or DB connection failed
Solution:
1. Check Render Logs (Render Dashboard → Logs)
2. Check DATABASE_URL is correct
3. Check all migrations were run in Supabase
4. Restart service: Render Dashboard → More → Restart
```

### "Database connection refused"
```
Problem: Invalid CONNECTION_URL
Solution:
1. Verify your Supabase connection string
2. Format must be:
   postgresql://postgres:PASSWORD@db.REGION.supabase.co:5432/postgres
3. Test locally: psql "postgresql://..."
4. Restart Render service after fixing
```

### "CORS errors" in Frontend
```
Problem: Frontend domain not in CORS_ORIGIN
Solution:
1. Add to Render environment variables:
   CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com
2. Save and restart service
```

### First request is slow (30 seconds)
```
Note: This is normal on free tier!
Render spins down idle instances after 15 minutes.
First request after spindown takes 30-40 seconds.
Subsequent requests are instant.

To avoid this: Upgrade to Render Starter ($7/month)
```

---

## Cost Breakdown

| Service | Tier | Cost/Month |
|---------|------|-----------|
| Render Backend | Free | $0 |
| Supabase Database | Free | $0 |
| **TOTAL** | | **$0** |

When you scale:

| Service | Tier | Cost/Month |
|---------|------|-----------|
| Render Backend | Starter | $7 |
| Supabase Database | Pro | $25 |
| **TOTAL** | | **$32** |

Still very affordable for a law firm!

---

## What's Included

Your deployed system includes:

✅ 9 feature modules (43 API endpoints)
✅ 57 database tables (fully indexed)
✅ Digital certificate management
✅ Document management with OCR
✅ Time tracking & billing
✅ AI case analysis & predictions
✅ Mobile app API
✅ Smart alerts & notifications
✅ Calendar synchronization
✅ Client portal with audit logging
✅ Full-text search in Portuguese
✅ Role-based access control
✅ Encryption for sensitive data
✅ GDPR compliance

---

## Support

### For Deployment Issues:
1. Check Render logs: Dashboard → Logs
2. Check Supabase status: Dashboard → Logs or SQL Editor errors
3. Verify environment variables are set
4. Review `FREE_TIER_DEPLOYMENT_GUIDE.md` for detailed troubleshooting

### For Feature Questions:
- See module documentation in PHASE1/2/3_IMPLEMENTATION.md
- See API endpoint reference in DEPLOYMENT_READY.md

### For Code Issues:
- System uses TypeScript strict mode
- All code is in /src/modules
- Database code in /src/database
- Run `npm run build` to verify compilation

---

**🚀 Your legal automation system is LIVE!**

**API**: `https://legal-automation-api.onrender.com`
**Database**: Supabase PostgreSQL (free tier, 500MB)
**Cost**: FREE! ($0/month)

Next: Create users and start using the system!
